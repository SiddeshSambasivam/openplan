import type { PlanSummary } from "./planBase";

/** The folder a view is filtered to, or null for every plan. */
export type FolderFilter = string | null;

/** Every folder any plan is in, once each, in alphabetical order. */
export function allFolders(plans: PlanSummary[]): string[] {
  return uniqueFolders(plans.flatMap((plan) => plan.folders));
}

export function filterByFolder(
  plans: PlanSummary[],
  folder: FolderFilter,
): PlanSummary[] {
  if (folder == null) return plans;
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
function sameFolder(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function uniqueFolders(names: string[]): string[] {
  const seen: string[] = [];
  for (const name of names) {
    if (!seen.some((kept) => sameFolder(kept, name))) seen.push(name);
  }
  return seen.sort((a, b) => a.localeCompare(b));
}
