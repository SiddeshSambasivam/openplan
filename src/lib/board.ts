import { documentLabel } from "./planTree";
import { STATUS_FLOW, STATUS_ORDER, type PlanSummary, type Status } from "./planBase";

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
 * What waits on the person: a plan whose pull request is open, or one where
 * an agent answered a thread and nobody has closed it. A plan appears once,
 * under the reason that asks the most of them.
 */
export function forYou(
  plans: PlanSummary[],
  summaries: ReviewSummary[],
): { review: PlanSummary[]; answered: PlanSummary[] } {
  const answeredPaths = new Set(
    summaries.filter((s) => s.answered).map((s) => s.path),
  );
  const sorted = sortPlans(plans);
  const review = sorted.filter((plan) => plan.status === "in-review");
  const answered = sorted.filter(
    (plan) => plan.status !== "in-review" && answeredPaths.has(plan.path),
  );
  return { review, answered };
}

export interface Crumb {
  /** The plan a document belongs to. Null for the plan itself. */
  lead: string | null;
  title: string;
}

/** The trail above whatever is open, built from the plan the scan found
 * rather than from the file's name. */
export function planCrumb(plan: PlanSummary, path: string): Crumb {
  if (path === plan.path) return { lead: null, title: plan.title };
  const name = path.slice(path.lastIndexOf("/") + 1);
  return { lead: plan.title, title: documentLabel(name) };
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
