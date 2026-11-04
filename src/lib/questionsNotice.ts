import { persona, spokenList, type Question } from "./work";

/** What the top bar says when an agent posts questions: who asked, in the
 * order they asked, and how many. Null when there are none. */
export function questionsNoticeText(questions: Question[]): string | null {
  if (questions.length === 0) return null;
  const askers = [...new Set(questions.map((question) => question.role ?? null))];
  const names = askers.map((role, index) => {
    if (role) return persona(role).name;
    return index === 0 ? "The agent" : "the agent";
  });
  const count = questions.length === 1 ? "a question" : `${questions.length} questions`;
  return `${spokenList(names)} asked ${count}`;
}
