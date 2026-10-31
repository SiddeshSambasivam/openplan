import { documentLabel } from "./planTree";
import { STATUS_FLOW, STATUS_ORDER, type PlanSummary, type Status } from "./planBase";
import type { PlanProgress } from "./work";

/** Finished work: kept, folded away until someone opens it. */
export const FOLDED: Status[] = ["completed", "archived"];

/** What a plan's comment threads mean for the person reading it. */
export interface ReviewSummary {
  path: string;
  /** Threads nobody has resolved yet. */
  open: number;
  /** An open thread whose last word came from an agent. */
  answered: boolean;
}

export interface StatusGroup {
  status: Status;
  plans: PlanSummary[];
}

/** What Build on a demo plan opens instead of starting an agent: the In
 * progress demo plan, where the work Build starts shows. */
export function demoBuildPlan(plans: PlanSummary[]): PlanSummary | undefined {
  const building = plans.filter((plan) => plan.demo && plan.status === "in-progress");
  return building.find((plan) => plan.id === DEMO_BUILDING) ?? building[0];
}

const DEMO_BUILDING = "demo-sync-notes-across-devices";

/** Newest first; a plan with no date sorts by title at the end. */
export function sortPlans(plans: PlanSummary[]): PlanSummary[] {
  return [...plans].sort(
    (a, b) =>
      (b.updated ?? "").localeCompare(a.updated ?? "") ||
      a.title.localeCompare(b.title),
  );
}

/** Every column, empty ones included: a board with a column missing reads as
 * a different board rather than an empty one. */
export function boardColumns(plans: PlanSummary[]): StatusGroup[] {
  const sorted = sortPlans(plans);
  return STATUS_FLOW.map((status) => ({
    status,
    plans: sorted.filter((plan) => plan.status === status),
  }));
}

/** The list's groups: what is moving first, and nothing for a state nothing
 * is in. */
export function statusGroups(plans: PlanSummary[]): StatusGroup[] {
  const sorted = sortPlans(plans);
  return STATUS_ORDER.map((status) => ({
    status,
    plans: sorted.filter((plan) => plan.status === status),
  })).filter((group) => group.plans.length > 0);
}

/**
 * What waits on the person: a plan with questions an agent posted, one whose
 * pull request is open, or one where an agent answered a thread and nobody
 * has closed it. A plan appears once, under the reason that asks the most of
 * them: unanswered questions hold an agent up.
 */
export function forYou(
  plans: PlanSummary[],
  summaries: ReviewSummary[],
  progress: Map<string, Pick<PlanProgress, "pendingQuestions">> = new Map(),
): { questions: PlanSummary[]; review: PlanSummary[]; answered: PlanSummary[] } {
  const answeredPaths = new Set(
    summaries.filter((s) => s.answered).map((s) => s.path),
  );
  const asks = (plan: PlanSummary) => (progress.get(plan.path)?.pendingQuestions ?? 0) > 0;
  const sorted = sortPlans(plans);
  const questions = sorted.filter(asks);
  const rest = sorted.filter((plan) => !asks(plan));
  const review = rest.filter((plan) => plan.status === "in-review");
  const answered = rest.filter(
    (plan) => plan.status !== "in-review" && answeredPaths.has(plan.path),
  );
  return { questions, review, answered };
}

/** The plans in the order a view shows them, top to bottom and column by
 * column, which is the order `[` and `]` step through. */
export function viewOrder(
  view: "board" | "list" | "for-you",
  plans: PlanSummary[],
  summaries: ReviewSummary[],
  progress?: Map<string, Pick<PlanProgress, "pendingQuestions">>,
): PlanSummary[] {
  if (view === "for-you") {
    const { questions, review, answered } = forYou(plans, summaries, progress);
    return [...questions, ...review, ...answered];
  }
  const groups = view === "board" ? boardColumns(plans) : statusGroups(plans);
  return groups.flatMap((group) => group.plans);
}

/** The plan one step along from the open one. With none open, or one the
 * order does not hold, the step starts from the near end. */
export function steppedPlan(
  order: PlanSummary[],
  openPath: string | null,
  step: 1 | -1,
): PlanSummary | null {
  const at = order.findIndex((plan) => plan.path === openPath);
  if (at === -1) return (step === 1 ? order[0] : order[order.length - 1]) ?? null;
  return order[at + step] ?? null;
}

/** The name over whatever is open, built from the plan the scan found
 * rather than from the file's name. */
export function pageTitle(plan: PlanSummary, path: string): string {
  if (path === plan.path) return plan.title;
  return documentLabel(path.slice(path.lastIndexOf("/") + 1));
}

/** How long ago something moved, for the first week. After that the date
 * says more than the count. */
export function relativeTime(iso: string, now: Date = new Date()): string | null {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const minutes = Math.floor((now.getTime() - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return shortDate(iso, now);
}

/** A date short enough for a card: the year only when it is not this one. */
export function shortDate(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}
