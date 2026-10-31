import { invoke } from "@tauri-apps/api/core";
import type { Status } from "./planBase";
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
  role?: Role;
  question: string;
  /** Why the question matters for this plan, and what in the code or the
   * plan raised it. */
  context?: string;
  /** Markdown shown with the question, for what is easier to see than read. */
  illustration?: string;
  options: Choice[];
  recommended?: string;
  mustAnswer: boolean;
  answer?: Answer;
  answeredBy?: string;
  /** Questions posted together are one round. None counts as the first. */
  round?: number;
}

/** Who on a team would ask the question. On-call is the person paged when
 * it breaks. */
export type Role = "product" | "engineering" | "design" | "oncall";

export interface Choice {
  id: string;
  label: string;
  consequence?: string;
  /** What the option costs or gives up. */
  tradeoff?: string;
  /** Markdown that shows what the option looks like or does. */
  illustration?: string;
}

export type Answer =
  /** `note` is what the person wrote beside the pick. */
  | { kind: "option"; options: string[]; note?: string }
  | { kind: "text"; text: string }
  /** Older records only: the person let the agent decide. */
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

/** `by` and `at` say who last moved the todo, and when. `text` is the
 * one-line title. Older records have no `detail` and keep the whole todo in
 * `text`. */
export interface Todo {
  id: string;
  text: string;
  detail?: string;
  state: TodoState;
  by: string;
  session?: string;
  at: string;
  reason?: string;
}

export type PrState = "open" | "draft" | "merged" | "closed";

/** What the agent last reported, or what the app last read with the
 * person's GitHub CLI. */
export interface Pr {
  url: string;
  repo?: string;
  branch?: string;
  todos: string[];
  state: PrState;
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

/** Writes the person's answers and returns the record as written. Nothing
 * is written when an id names no question on the plan. */
export async function answerQuestions(
  path: string,
  answers: { id: string; answer: Answer }[],
): Promise<WorkRecord> {
  return invoke<WorkRecord>("answer_questions", { path, answers });
}

/** Tells the plan's agent sessions the answers are in. Returns how many got
 * it: none means the agent sees them on its next message. */
export async function sendAnswers(planId: string): Promise<number> {
  return invoke<number>("send_answers", { plan: planId });
}

export interface TodoCount {
  done: number;
  total: number;
}

export interface PrSummary {
  /** In the order the agent first reported them. */
  reported: { url: string; state: PrState }[];
  /** The plan works in a repo with a remote, so a PR is to come while none
   * is reported. */
  expected: boolean;
}

/** What a card shows of one plan's work record, read for every card at
 * once. */
export interface PlanProgress extends TodoCount {
  path: string;
  repos: Repo[];
  prs: PrSummary;
  /** Posted questions still waiting for the person. */
  pendingQuestions: number;
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

/** Each PR on its own line with its state. */
export function prSummaryText({ reported }: PrSummary): string {
  if (reported.length === 0) return PR_MARKS.none.label;
  return reported
    .map((pr) => `${prLabel(pr.url)} ${PR_MARKS[pr.state].label.toLowerCase()}`)
    .join("\n");
}

/** The state that says most about how far the work got: merged over open
 * over draft over closed. */
export function mostAdvancedPr(states: PrState[]): PrState | null {
  return PR_ORDER.find((state) => states.includes(state)) ?? null;
}

const PR_ORDER: PrState[] = ["merged", "open", "draft", "closed"];

/** How each PR state reads, in GitHub's colours, and how a plan that works in
 * a repo reads before its first PR. */
export const PR_MARKS: Record<PrState | "none", { label: string; tone: string }> = {
  open: { label: "Open", tone: "text-success" },
  draft: { label: "Draft", tone: "text-muted-foreground" },
  merged: { label: "Merged", tone: "text-merged" },
  closed: { label: "Closed", tone: "text-destructive" },
  none: { label: "No pull request yet", tone: "text-muted-foreground" },
};

/** `owner/repo` from the remote, whatever its URL shape, or the folder's
 * name for a repo without one. */
export function repoLabel(repo: Repo): string {
  const source = (repo.remote ?? repo.path).replace(/\.git\/?$/, "");
  const parts = source.split(/[/\\:]+/).filter(Boolean);
  return parts.slice(repo.remote ? -2 : -1).join("/");
}

/** The owner's avatar for a repo on github.com, which the webview loads and
 * caches. Other hosts serve no per-owner image, so they get none. `size` is
 * in pixels. */
export function ownerAvatarUrl(repo: Repo, size: number): string | null {
  const owner = repo.remote?.match(
    /^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?github\.com[:/]([A-Za-z0-9-]+)\/[^/]+/i,
  )?.[1];
  return owner ? `https://github.com/${owner}.png?size=${size}` : null;
}

/** What a todo row and its detail show. A todo from before `detail` splits
 * after its first sentence: a full stop, a space, then a capital. */
export function todoTitle(todo: Todo): { title: string; detail: string } {
  if (todo.detail != null) return { title: todo.text, detail: todo.detail };
  const text = todo.text.trim();
  const end = text.search(/[.!?]\s+[A-Z]/) + 1;
  if (end === 0) return { title: text, detail: "" };
  return { title: text.slice(0, end), detail: text.slice(end).trim() };
}

/** How each todo state reads. The tones match the status glyphs: doing is
 * the colour of work in progress, done the colour of completed work. */
export const TODO_MARKS: Record<TodoState, { label: string; tone: string }> = {
  open: { label: "Open", tone: "text-muted-foreground" },
  doing: { label: "Doing", tone: "text-warning" },
  done: { label: "Done", tone: "text-success" },
  dropped: { label: "Dropped", tone: "text-muted-foreground" },
};

/** The questions an agent posted that wait for the person, in the order
 * they were asked. */
export function pendingQuestions(record: WorkRecord | null): Question[] {
  return record?.alignment?.questions.filter((question) => !question.answer) ?? [];
}

export interface RoundGroup {
  round: number;
  questions: Question[];
}

/** The newest round first, the way the page reads from the latest down.
 * Within a round, questions keep the order they were asked. */
export function questionsByRound(questions: Question[]): RoundGroup[] {
  const groups: RoundGroup[] = [];
  for (const question of questions) {
    const round = question.round ?? 1;
    const group = groups.find((g) => g.round === round);
    if (group) group.questions.push(question);
    else groups.push({ round, questions: [question] });
  }
  return groups.sort((a, b) => b.round - a.round);
}

/** Each role as the person on the team who asks. `inSentence` is the name
 * mid-sentence. */
export const PERSONAS: Record<Role, { name: string; inSentence: string }> = {
  product: { name: "Product owner", inSentence: "the product owner" },
  engineering: { name: "Tech lead", inSentence: "the tech lead" },
  design: { name: "Designer", inSentence: "the designer" },
  oncall: { name: "On-call", inSentence: "on-call" },
};

const ROLES = Object.keys(PERSONAS) as Role[];

/** The roles no question came from. Questions from before roles name none,
 * so nothing counts as left out for them. */
export function unusedRoles(questions: Question[]): Role[] {
  const asked = new Set(questions.map((question) => question.role).filter(Boolean));
  if (asked.size === 0) return [];
  return ROLES.filter((role) => !asked.has(role));
}

export function unusedRolesText(roles: Role[]): string | null {
  if (roles.length === 0) return null;
  const names = roles.map((role) => PERSONAS[role].inSentence);
  const list =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${list.charAt(0).toUpperCase()}${list.slice(1)} had nothing to ask on this plan.`;
}

/** What the person has picked and written for one question so far. */
export interface AnswerDraft {
  option?: string;
  text: string;
}

/** The answer a draft gives. Reasoning written beside a pick is its note. */
export function answerFromDraft(
  question: Question,
  draft: AnswerDraft | undefined,
): Answer | null {
  const text = draft?.text.trim() ?? "";
  const option = question.options.find((choice) => choice.id === draft?.option);
  if (option && text) return { kind: "option", options: [option.id], note: text };
  if (option) return { kind: "option", options: [option.id] };
  if (text) return { kind: "text", text };
  return null;
}

/** What a card says about questions waiting on the person. Once the work
 * has started, a question holds it up. */
export function pendingQuestionsLabel(count: number, status: Status): string | null {
  if (count <= 0) return null;
  if (status === "in-progress") return "Needs your answer";
  return `${count} ${count === 1 ? "question" : "questions"}`;
}

/** What a question's answer says, in words, with the note written beside a
 * pick. */
export function answerOf(question: Question): {
  kind: Answer["kind"] | "none";
  text: string;
  note?: string;
} {
  const answer = question.answer;
  if (!answer) return { kind: "none", text: "Not answered yet" };
  if (answer.kind === "agent") return { kind: "agent", text: "Agent decided" };
  if (answer.kind === "text") return { kind: "text", text: answer.text };
  const labels = answer.options.map(
    (id) => question.options.find((option) => option.id === id)?.label ?? id,
  );
  const text = labels.join(", ");
  return answer.note ? { kind: "option", text, note: answer.note } : { kind: "option", text };
}

/** The options the answer settled on: the person's picks, or the
 * recommended option when the agent decides. A typed answer picks none. */
export function chosenOptions(question: Question): Choice[] {
  const answer = question.answer;
  const ids =
    answer?.kind === "option"
      ? answer.options
      : answer?.kind === "agent" && question.recommended
        ? [question.recommended]
        : [];
  return question.options.filter((option) => ids.includes(option.id));
}

/** The panel beside the plan holds the todos, repos and PRs, so it shows
 * once any of them is recorded. */
export function showsWorkPanel(record: WorkRecord | null): boolean {
  if (!record) return false;
  return record.todos.length + record.repos.length + record.prs.length > 0;
}

/** Completed stays the person's call. The app offers it once every PR on
 * the plan reads merged, and never completes the plan itself. Takes a
 * record's PRs or a card's summary of them. */
export function offersCompletion(
  status: Status,
  prs: { state: PrState }[] | undefined,
): boolean {
  return (
    status === "in-review" && prs != null && prs.length > 0 && prs.every((pr) => pr.state === "merged")
  );
}

/** What the top bar and a card ask once every PR reads merged. */
export const COMPLETION_PROMPT = { said: "All PRs merged.", asked: "Mark completed?" };

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

const PR_STATES: Record<PrState, PrBadge> = {
  open: { label: "Open", variant: "outline" },
  draft: { label: "Draft", variant: "outline" },
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
