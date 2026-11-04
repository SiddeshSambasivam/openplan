/** What a key does to a title being edited. An empty save still goes
 * through: the rename refuses it and says why. */
export type TitleEdit = { save: string } | "cancel" | null;

export function titleEditKey(key: string, draft: string): TitleEdit {
  if (key === "Enter") return { save: draft.trim() };
  if (key === "Escape") return "cancel";
  return null;
}
