import { sameFolder, toggleFolder } from "./folders";

/** The parts of a plan the folder helpers read. */
interface PlanFolders {
  path: string;
  folders: string[];
}

/** The delete button's steps: the first press arms it, the second deletes. */
export type Arming = "ready" | "armed" | "confirmed";

/** How long an armed delete button waits for its second press. */
export const ARMED_MS = 4000;

/** How many titles the delete dialog lists before it counts the rest. */
const LISTED_TITLES = 5;

export function plansLabel(count: number): string {
  return `${count} ${count === 1 ? "plan" : "plans"}`;
}

export function selectedLabel(count: number): string {
  return `${count} selected`;
}

/** A menu item names the count only when it acts on several plans. */
export function actionLabel(action: string, count: number): string {
  return count > 1 ? `${action} ${plansLabel(count)}` : action;
}

export function deleteTitle(count: number): string {
  return `Delete ${plansLabel(count)}?`;
}

export function deleteLine(count: number): string {
  return count === 1
    ? "It leaves OpenPlan. Its history stays in the base's git log, so it can be restored."
    : "They leave OpenPlan. Their history stays in the base's git log, so they can be restored.";
}

export function listedTitles(titles: string[]): { shown: string[]; more: number } {
  return {
    shown: titles.slice(0, LISTED_TITLES),
    more: Math.max(0, titles.length - LISTED_TITLES),
  };
}

/** What a plan's menu acts on: the whole selection when it holds the plan,
 * otherwise the plan alone. */
export function targetsOf(selected: ReadonlySet<string>, path: string): string[] {
  return selected.has(path) ? [...selected] : [path];
}

/** The folders every plan is in, spelled as the first plan spells them. */
export function sharedFolders(plans: PlanFolders[]): string[] {
  const [first, ...rest] = plans;
  if (!first) return [];
  return first.folders.filter((name) =>
    rest.every((plan) => plan.folders.some((folder) => sameFolder(folder, name))),
  );
}

/** Choosing a folder for several plans adds it to those that lack it, or
 * takes it out of all of them once every one has it. Only the plans that
 * change are returned. */
export function foldersToggled(
  plans: PlanFolders[],
  name: string,
  known: string[],
): PlanFolders[] {
  const has = (plan: PlanFolders) => plan.folders.some((folder) => sameFolder(folder, name));
  const removing = plans.every(has);
  return plans
    .filter((plan) => has(plan) === removing)
    .map((plan) => ({ path: plan.path, folders: toggleFolder(plan.folders, name, known) }));
}

/** Whether a document belongs to a plan: its own file, or any document in a
 * set's folder. */
export function holdsDocument(
  plan: { path: string; documents: string[] },
  documentPath: string,
): boolean {
  if (plan.path === documentPath) return true;
  const folder = plan.path.slice(0, plan.path.lastIndexOf("/") + 1);
  return plan.documents.length > 0 && documentPath.startsWith(folder);
}

export function arming(step: Arming, event: "press" | "close" | "expire"): Arming {
  if (event !== "press") return "ready";
  return step === "ready" ? "armed" : "confirmed";
}

export function deleteLabel(step: Arming): string {
  return step === "armed" ? "Confirm delete" : "Delete";
}
