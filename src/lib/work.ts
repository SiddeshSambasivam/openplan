import { invoke } from "@tauri-apps/api/core";
import { STATUS_FLOW, type Status } from "./planBase";
import { isTauri } from "./platform";

/** The work record beside a plan: what the agents recorded about the work. */
export interface WorkRecord {
  version: number;
  repos: Repo[];
  alignment?: Alignment;
  decisions: Decision[];
  todos: Todo[];
  prs: Pr[];
}

/** A repo without a `remote` is a plain folder. */
export interface Repo {
  path: string;
  remote?: string;
  branch?: string;
}

export interface Alignment {
  askedAt: string;
  recordedAt?: string;
  questions: Question[];
}

export interface Question {
  id: string;
  aspect: string;
  question: string;
  options: Choice[];
  recommended?: string;
  mustAnswer: boolean;
  answer?: Answer;
  answeredBy?: string;
}

export interface Choice {
  id: string;
  label: string;
  consequence?: string;
}

export type Answer =
  | { kind: "option"; options: string[] }
  | { kind: "text"; text: string }
  | { kind: "agent" };

export interface Decision {
  id: string;
  context: string;
  options: string[];
  decision: string;
  why: string;
  revisitWhen?: string;
  fromQuestion?: string;
  at: string;
  by: string;
}

export type TodoState = "open" | "doing" | "done" | "dropped";

/** `by` and `at` say who last moved the todo, and when. */
export interface Todo {
  id: string;
  text: string;
  state: TodoState;
  by: string;
  session?: string;
  at: string;
  reason?: string;
}

/** What the agent last reported. The app never fetches PR state. */
export interface Pr {
  url: string;
  repo?: string;
  branch?: string;
  todos: string[];
  state: "open" | "merged" | "closed";
  checks: "pending" | "passing" | "failing";
  review: "waiting" | "changes-requested" | "approved";
  reportedAt: string;
  by: string;
}

/** `null` means no work has been recorded for the plan yet, and always in
 * the browser build. */
export async function readWorkRecord(path: string): Promise<WorkRecord | null> {
  if (!isTauri) return null;
  return invoke<WorkRecord | null>("read_work_record", { path });
}

export interface TodoCount {
  done: number;
  total: number;
}

export interface PrSummary {
  total: number;
  merged: number;
}

/** What a card shows of one plan's work record, read for every card at
 * once. */
export interface PlanProgress extends TodoCount {
  path: string;
  repos: Repo[];
  prs: PrSummary;
}

/** The card facts for every plan that has a work record, in one call. Empty
 * in the browser build. */
export async function listWorkProgress(paths: string[]): Promise<PlanProgress[]> {
  if (!isTauri) return [];
  return invoke<PlanProgress[]>("list_work_progress", { paths });
}

/** Done todos out of all todos. Dropped ones count as neither. */
export function progress(record: WorkRecord): TodoCount {
  const counted = record.todos.filter((t) => t.state !== "dropped");
  return {
    done: counted.filter((t) => t.state === "done").length,
    total: counted.length,
  };
}

export function progressText({ done, total }: TodoCount): string {
  return `${done} of ${total} done`;
}

export function prSummaryText({ total, merged }: PrSummary): string {
  return `${total} pull ${total === 1 ? "request" : "requests"}, ${merged} merged`;
}

/** `owner/repo` from the remote, whatever its URL shape, or the folder's
 * name for a repo without one. */
export function repoLabel(repo: Repo): string {
  const source = (repo.remote ?? repo.path).replace(/\.git\/?$/, "");
  const parts = source.split(/[/\\:]+/).filter(Boolean);
  return parts.slice(repo.remote ? -2 : -1).join("/");
}

/** How each todo state reads. The tones match the status glyphs: doing is
 * the colour of work in progress, done the colour of completed work. */
export const TODO_MARKS: Record<TodoState, { label: string; tone: string }> = {
  open: { label: "Open", tone: "text-muted-foreground" },
  doing: { label: "Doing", tone: "text-warning" },
  done: { label: "Done", tone: "text-success" },
  dropped: { label: "Dropped", tone: "text-muted-foreground" },
};

export interface AspectGroup {
  aspect: string;
  questions: Question[];
}

/** Questions on one aspect sit together, in the order the agent first asked
 * about each aspect. */
export function questionsByAspect(questions: Question[]): AspectGroup[] {
  const groups: AspectGroup[] = [];
  for (const question of questions) {
    const group = groups.find((g) => g.aspect === question.aspect);
    if (group) group.questions.push(question);
    else groups.push({ aspect: question.aspect, questions: [question] });
  }
  return groups;
}

/** What a question's answer says, in words. */
export function answerOf(question: Question): {
  kind: Answer["kind"] | "none";
  text: string;
} {
  const answer = question.answer;
  if (!answer) return { kind: "none", text: "Not answered yet" };
  if (answer.kind === "agent") return { kind: "agent", text: "Agent decides" };
  if (answer.kind === "text") return { kind: "text", text: answer.text };
  const labels = answer.options.map(
    (id) => question.options.find((option) => option.id === id)?.label ?? id,
  );
  return { kind: "option", text: labels.join(", ") };
}

/** The answers matter while the work is being done. Once it is in review
 * they are history, and the todos and PRs are what a reader checks. */
export function alignmentStartsOpen(status: Status): boolean {
  return STATUS_FLOW.indexOf(status) <= STATUS_FLOW.indexOf("in-progress");
}

/** Completed stays the person's call. The app offers it once the agent has
 * reported every PR merged, which it never checks for itself. */
export function offersCompletion(status: Status, record: WorkRecord | null): boolean {
  const prs = record?.prs ?? [];
  return status === "in-review" && prs.length > 0 && prs.every((pr) => pr.state === "merged");
}

/** A PR link short enough for a row: `owner/repo#12` where the host's URL
 * shape is known. */
export function prLabel(url: string): string {
  const github = url.match(/^https?:\/\/[^/]+\/([^/]+\/[^/]+)\/pull\/(\d+)/);
  if (github) return `${github[1]}#${github[2]}`;
  const gitlab = url.match(/^https?:\/\/[^/]+\/(.+?)\/-\/merge_requests\/(\d+)/);
  if (gitlab) return `${gitlab[1]}!${gitlab[2]}`;
  return url.replace(/^https?:\/\//, "");
}

export interface PrBadge {
  label: string;
  variant: "default" | "outline" | "destructive";
}

const PR_STATES: Record<Pr["state"], PrBadge> = {
  open: { label: "Open", variant: "outline" },
  merged: { label: "Merged", variant: "default" },
  closed: { label: "Closed", variant: "outline" },
};

const PR_CHECKS: Record<Pr["checks"], PrBadge> = {
  pending: { label: "Checks pending", variant: "outline" },
  passing: { label: "Checks passing", variant: "outline" },
  failing: { label: "Checks failing", variant: "destructive" },
};

const PR_REVIEWS: Record<Pr["review"], PrBadge> = {
  waiting: { label: "Review waiting", variant: "outline" },
  "changes-requested": { label: "Changes requested", variant: "destructive" },
  approved: { label: "Approved", variant: "outline" },
};

/** The state, the checks and the review, as the agent last reported them.
 * Only what needs the person's attention stands out. */
export function prBadges(pr: Pr): PrBadge[] {
  return [PR_STATES[pr.state], PR_CHECKS[pr.checks], PR_REVIEWS[pr.review]];
}
