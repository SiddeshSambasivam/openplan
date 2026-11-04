import { STORAGE_PREFIX } from "./storage";
import {
  answerFromDraft,
  questionsByRound,
  type Answer,
  type AnswerDraft,
  type Question,
  type Understanding,
  type UnderstandingDraft,
} from "./work";

/** A question's pick and note so far. Either one is an answer, which waits
 * here until the person sends it. */
export type ReplyDraft = AnswerDraft;

export type ReplyDrafts = Record<string, ReplyDraft>;

/** Confirmations and corrections not sent yet, by area. */
export type UnderstandingDrafts = Record<string, UnderstandingDraft>;

/** Everything the person has drafted on a plan's Alignment tab. It all goes
 * with one Send. */
export interface AlignmentDrafts {
  replies: ReplyDrafts;
  understanding: UnderstandingDrafts;
}

/** A plan's drafts as last saved, or none when storage has nothing it can
 * read. Drafts saved before confirmations are replies alone. Storage is
 * looked up inside the guard, since a page without it throws on the name
 * alone. */
export function loadAlignmentDrafts(planId: string, storage?: Storage): AlignmentDrafts {
  const drafts: AlignmentDrafts = { replies: {}, understanding: {} };
  try {
    const stored: unknown = JSON.parse((storage ?? localStorage).getItem(storeKey(planId)) ?? "{}");
    if (typeof stored !== "object" || stored === null) return drafts;
    const { replies, understanding } = stored as Record<string, unknown>;
    const isCurrent = typeof replies === "object" && replies !== null;
    drafts.replies = readReplies(isCurrent ? replies : stored);
    if (isCurrent) drafts.understanding = readUnderstanding(understanding);
  } catch {
    // best-effort: unreadable or blocked storage starts with no drafts
  }
  return drafts;
}

export function saveAlignmentDrafts(planId: string, drafts: AlignmentDrafts, storage?: Storage): void {
  try {
    const store = storage ?? localStorage;
    const empty = Object.keys(drafts.replies).length + Object.keys(drafts.understanding).length === 0;
    if (empty) store.removeItem(storeKey(planId));
    else store.setItem(storeKey(planId), JSON.stringify(drafts));
  } catch {
    // best-effort
  }
}

/** The confirmations and written corrections ready to send, on areas the
 * agent has stated and the person has not confirmed already. */
export function draftedUnderstanding(
  understanding: Understanding[],
  drafts: UnderstandingDrafts,
): { confirm: string[]; correct: { area: string; text: string }[] } {
  const sending: ReturnType<typeof draftedUnderstanding> = { confirm: [], correct: [] };
  for (const stated of understanding) {
    const draft = drafts[stated.area];
    if (!draft) continue;
    if ("confirm" in draft) {
      if (!stated.confirmed) sending.confirm.push(stated.area);
    } else if (draft.correct.trim()) {
      sending.correct.push({ area: stated.area, text: draft.correct.trim() });
    }
  }
  return sending;
}

/** The answers ready to send: a pick or words, on a question not answered
 * already. */
export function draftedAnswers(questions: Question[], drafts: ReplyDrafts): Record<string, Answer> {
  const answers: Record<string, Answer> = {};
  for (const question of questions) {
    if (question.answer) continue;
    const answer = answerFromDraft(question, drafts[question.id]);
    if (answer) answers[question.id] = answer;
  }
  return answers;
}

/** The choice that stands for the person's own words among a question's
 * options. */
export const WRITE_OWN = "write-my-own";

/** The choice a question's options show as picked: the drafted option, or
 * writing one's own once a draft has no pick. Empty means none yet. */
export function pickedChoice(draft: ReplyDraft | undefined): string {
  if (!draft) return "";
  return draft.option ?? WRITE_OWN;
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

/** What a send carries, against what is still open. Once every open
 * question has an answer, it says the send is next. */
export function answeredCount(questions: Question[], drafts: ReplyDrafts): string {
  const open = questions.filter((question) => !question.answer).length;
  if (open === 0) return "Nothing waits on you.";
  const ready = Object.keys(draftedAnswers(questions, drafts)).length;
  return ready < open ? `Answered ${ready}/${open}` : `Answered ${ready}/${open}. Send when ready.`;
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
  return !question.answer && !answerFromDraft(question, drafts[question.id]);
}

function storeKey(planId: string): string {
  return `${STORAGE_PREFIX}alignment-drafts:${planId}`;
}

function readReplies(stored: object): ReplyDrafts {
  const replies: ReplyDrafts = {};
  for (const [id, draft] of Object.entries(stored)) {
    if (!isReplyDraft(draft)) continue;
    replies[id] = draft.option === undefined ? { text: draft.text } : { option: draft.option, text: draft.text };
  }
  return replies;
}

function readUnderstanding(stored: unknown): UnderstandingDrafts {
  const understanding: UnderstandingDrafts = {};
  if (typeof stored !== "object" || stored === null) return understanding;
  for (const [area, draft] of Object.entries(stored)) {
    if (typeof draft !== "object" || draft === null) continue;
    const { confirm, correct } = draft as Record<string, unknown>;
    if (confirm === true) understanding[area] = { confirm: true };
    else if (typeof correct === "string") understanding[area] = { correct };
  }
  return understanding;
}

function isReplyDraft(value: unknown): value is ReplyDraft {
  if (typeof value !== "object" || value === null) return false;
  const { option, text } = value as Record<string, unknown>;
  return typeof text === "string" && (option === undefined || typeof option === "string");
}
