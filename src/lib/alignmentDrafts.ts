import { STORAGE_PREFIX } from "./storage";
import { answerFromDraft, questionsByRound, type Answer, type AnswerDraft, type Question } from "./work";

/** A question's pick and note so far. `replied` turns it into a reply that
 * waits to be sent. */
export interface ReplyDraft extends AnswerDraft {
  replied: boolean;
}

export type ReplyDrafts = Record<string, ReplyDraft>;

/** A plan's drafts as last saved, or none when storage has nothing it can
 * read. Storage is looked up inside the guard, since a page without it
 * throws on the name alone. */
export function loadReplyDrafts(planId: string, storage?: Storage): ReplyDrafts {
  const drafts: ReplyDrafts = {};
  try {
    const stored: unknown = JSON.parse((storage ?? localStorage).getItem(storeKey(planId)) ?? "{}");
    if (typeof stored !== "object" || stored === null) return drafts;
    for (const [id, draft] of Object.entries(stored)) {
      if (isReplyDraft(draft)) drafts[id] = draft;
    }
  } catch {
    // best-effort: unreadable or blocked storage starts with no drafts
  }
  return drafts;
}

export function saveReplyDrafts(planId: string, drafts: ReplyDrafts, storage?: Storage): void {
  try {
    const store = storage ?? localStorage;
    if (Object.keys(drafts).length === 0) store.removeItem(storeKey(planId));
    else store.setItem(storeKey(planId), JSON.stringify(drafts));
  } catch {
    // best-effort
  }
}

/** The replies ready to send: replied to, and not answered already. */
export function repliedAnswers(questions: Question[], drafts: ReplyDrafts): Record<string, Answer> {
  const answers: Record<string, Answer> = {};
  for (const question of questions) {
    const draft = drafts[question.id];
    if (question.answer || !draft?.replied) continue;
    const answer = answerFromDraft(question, draft);
    if (answer) answers[question.id] = answer;
  }
  return answers;
}

/** The question to reply to after `current`: the next one waiting below it
 * in the thread, else the first one waiting above. With no `current`, the
 * first one waiting. */
export function nextWaiting(
  questions: Question[],
  drafts: ReplyDrafts,
  current?: string,
): Question | undefined {
  const thread = threadOrder(questions);
  const after = thread.findIndex((question) => question.id === current) + 1;
  const waiting = (question: Question) => isWaiting(question, drafts);
  return thread.slice(after).find(waiting) ?? thread.slice(0, after).find(waiting);
}

/** The last question in the thread still waiting for a reply. */
export function newestWaiting(questions: Question[], drafts: ReplyDrafts): Question | undefined {
  return threadOrder(questions)
    .reverse()
    .find((question) => isWaiting(question, drafts));
}

/** The drafts with this question's reply queued, or null when its draft
 * has neither a pick nor words. */
export function queueReply(id: string, drafts: ReplyDrafts): ReplyDrafts | null {
  const draft = drafts[id];
  if (!draft?.option && !draft?.text.trim()) return null;
  return { ...drafts, [id]: { ...draft, replied: true } };
}

/** What a send carries, against what is still open. */
export function answeredCount(questions: Question[], drafts: ReplyDrafts): string {
  const open = questions.filter((question) => !question.answer).length;
  if (open === 0) return "Nothing waits on you.";
  const ready = Object.keys(repliedAnswers(questions, drafts)).length;
  return `${ready} of ${open} waiting ${open === 1 ? "question" : "questions"} answered`;
}

/** Whether this viewer last showed the people rail. Hidden by default. */
export function loadRailShown(storage?: Storage): boolean {
  try {
    return (storage ?? localStorage).getItem(RAIL_KEY) === "shown";
  } catch {
    return false;
  }
}

export function saveRailShown(shown: boolean, storage?: Storage): void {
  try {
    const store = storage ?? localStorage;
    if (shown) store.setItem(RAIL_KEY, "shown");
    else store.removeItem(RAIL_KEY);
  } catch {
    // best-effort
  }
}

const RAIL_KEY = `${STORAGE_PREFIX}alignment-people-rail`;

function threadOrder(questions: Question[]): Question[] {
  return questionsByRound(questions).flatMap((group) => group.questions);
}

function isWaiting(question: Question, drafts: ReplyDrafts): boolean {
  return !question.answer && !drafts[question.id]?.replied;
}

function storeKey(planId: string): string {
  return `${STORAGE_PREFIX}alignment-drafts:${planId}`;
}

function isReplyDraft(value: unknown): value is ReplyDraft {
  if (typeof value !== "object" || value === null) return false;
  const { option, text, replied } = value as Record<string, unknown>;
  return (
    typeof text === "string" &&
    typeof replied === "boolean" &&
    (option === undefined || typeof option === "string")
  );
}
