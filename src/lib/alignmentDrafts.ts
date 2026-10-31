import { STORAGE_PREFIX } from "./storage";
import { answerFromDraft, type Answer, type AnswerDraft, type Question } from "./work";

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
