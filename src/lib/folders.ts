import type { PlanSummary } from "./planBase";

/** The folder a view shows, or null for the plans in no folder. */
export type FolderFilter = string | null;

/** Every folder any plan is in or the base keeps, once each, in alphabetical
 * order. The base keeps the folders made before any plan was put in them. */
export function allFolders(plans: PlanSummary[], saved: string[] = []): string[] {
  return uniqueFolders([...plans.flatMap((plan) => plan.folders), ...saved]);
}

/** The saved folders with one more, its name cleaned as a plan file stores it. */
export function addFolder(saved: string[], typed: string): string[] {
  const name = folderName(typed);
  if (!name || saved.some((folder) => sameFolder(folder, name))) return saved;
  return uniqueFolders([...saved, name]);
}

export function removeFolder(saved: string[], name: string): string[] {
  return saved.filter((folder) => !sameFolder(folder, name));
}

export function filterByFolder(
  plans: PlanSummary[],
  folder: FolderFilter,
): PlanSummary[] {
  if (folder == null) return plans.filter((plan) => plan.folders.length === 0);
  return plans.filter((plan) => plan.folders.some((name) => sameFolder(name, folder)));
}

/**
 * A folder name as the plan file stores it: one line of plain words, without
 * the characters that would end or split a list item there.
 */
export function folderName(text: string): string {
  return text.replace(/[,[\]{}"':#]/g, "").trim().replace(/\s+/g, " ");
}

/**
 * Puts a plan in a folder it is not in, or takes it out of one it is in.
 * A name typed in another case than one the base already has takes the
 * base's spelling.
 */
export function toggleFolder(
  folders: string[],
  typed: string,
  known: string[] = [],
): string[] {
  const name = folderName(typed);
  if (!name) return folders;
  if (folders.some((folder) => sameFolder(folder, name))) {
    return folders.filter((folder) => !sameFolder(folder, name));
  }
  return [...folders, known.find((folder) => sameFolder(folder, name)) ?? name];
}

/**
 * What the folder picker offers: the folders that match what was typed, the
 * plan's own included, and the typed name when it would be a new folder.
 */
export function folderChoices(
  known: string[],
  folders: string[],
  typed: string,
): { names: string[]; addable: string | null } {
  const name = folderName(typed);
  const names = uniqueFolders([...known, ...folders]).filter((folder) =>
    folder.toLowerCase().includes(name.toLowerCase()),
  );
  const exists = names.some((folder) => sameFolder(folder, name));
  return { names, addable: name && !exists ? name : null };
}

/** Folders are one name whatever the case, so "Search" and "search" are
 * the same folder. */
export function sameFolder(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function uniqueFolders(names: string[]): string[] {
  const seen: string[] = [];
  for (const name of names) {
    if (!seen.some((kept) => sameFolder(kept, name))) seen.push(name);
  }
  return seen.sort((a, b) => a.localeCompare(b));
}
