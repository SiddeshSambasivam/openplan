import { allFolders, sameFolder, type FolderFilter } from "./folders";
import type { PlanSummary } from "./planBase";
import { RECENT_LIMIT } from "./recent";
import { STORAGE_PREFIX } from "./storage";
import type { MainView } from "./types";

/** A navbar row the keyboard can land on: a view, filtered or not. */
export interface NavbarItem {
  view: Exclude<MainView, "plan">;
  folder: FolderFilter;
}

const LIST_VIEWS = ["board", "list", "for-you"] as const;

/** Expanded shows icons and labels, minimized shows icons only. */
export type NavbarMode = "expanded" | "minimized";

/** `revealed` is the expanded navbar floating over the main area of a
 * window too narrow to give it a column. */
export interface NavbarState {
  mode: NavbarMode;
  revealed: boolean;
}

export type SectionId = "views" | "folders" | "recent";

/** Below this window width an expanded navbar would squeeze the main area,
 * so it floats over it instead. */
export const NAVBAR_OVERLAY_BREAKPOINT = 900;

/** The minimized navbar's width: one icon button and its padding. */
export const RAIL_WIDTH = 48;

/** The top bar's own left padding beside the expanded navbar. */
const TOP_BAR_PADDING = 16;

/** Where the macOS window controls end, with a gap after them. */
const WINDOW_CONTROLS_END = 84;

/** The mark's control, and the gap the top bar keeps after it. */
const MARK_SIZE = 24;
const TOP_BAR_GAP = 6;

const MODE_KEY = `${STORAGE_PREFIX}sidebar`;
const COLLAPSED_KEY = `${STORAGE_PREFIX}nav-collapsed`;

/** The column the navbar takes beside the main area at this window width. */
export function navbarLayout(mode: NavbarMode, narrow: boolean): NavbarMode {
  return narrow ? "minimized" : mode;
}

/**
 * cmd+b. A narrow window keeps the stored mode and shows or hides the
 * floating navbar instead, so a preference set on a wide screen survives a
 * small one.
 */
export function pressNavbarKey(state: NavbarState, narrow: boolean): NavbarState {
  if (narrow) return { ...state, revealed: !state.revealed };
  return { mode: state.mode === "expanded" ? "minimized" : "expanded", revealed: false };
}

/** Whether a navbar row has anything to say in a tooltip: its label when
 * the rail hides it, or its key. A row with nothing to say must never open
 * one, since an empty tooltip has no content to close it. */
export function rowHasTooltip(minimized: boolean, shortcut: string | undefined): boolean {
  return minimized || shortcut != null;
}

export function navbarToggleLabel(expanded: boolean): string {
  return expanded ? "Collapse navbar" : "Expand navbar";
}

/**
 * Where the OpenPlan mark's control starts, from the window's left edge. The
 * same in both modes, so the mark holds still when the mode changes.
 * `windowControls` is the macOS traffic lights drawn over the page.
 */
export function markStart(windowControls: boolean): number {
  return windowControls ? WINDOW_CONTROLS_END : (RAIL_WIDTH - MARK_SIZE) / 2;
}

/**
 * How the top bar sits in the window. `pull` is how far it reaches left over
 * the navbar's column, `lead` where its title starts from its own left edge.
 * Minimized, it spans the window and carries the mark before the title.
 */
export function topBarLayout(
  mode: NavbarMode,
  windowControls: boolean,
): { pull: number; lead: number } {
  if (mode === "expanded") return { pull: 0, lead: TOP_BAR_PADDING };
  return { pull: RAIL_WIDTH, lead: markStart(windowControls) + MARK_SIZE + TOP_BAR_GAP };
}

/** Reads the stored mode. Older builds stored open, rail, hidden and, before
 * those, closed. */
export function parseNavbarMode(stored: string | null): NavbarMode {
  return stored != null && ["minimized", "rail", "hidden", "closed"].includes(stored)
    ? "minimized"
    : "expanded";
}

/** `savedFolders` are the folders the base keeps, which may hold no plan. */
export function navbarSections(
  plans: PlanSummary[],
  recentPaths: string[],
  savedFolders: string[],
): { folders: string[]; recent: PlanSummary[] } {
  return {
    folders: allFolders(plans, savedFolders),
    recent: recentPlans(plans, recentPaths),
  };
}

/** The rows cmd+shift+[ and cmd+shift+] step through, in the navbar's order:
 * the views, then each folder as a filter on the board. */
export function navbarItems(folders: string[]): NavbarItem[] {
  return [
    ...LIST_VIEWS.map((view) => ({ view, folder: null })),
    ...folders.map((folder) => ({ view: "board" as const, folder })),
  ];
}

/** The row before or after the current one, wrapping at the ends. With no
 * current row, as on the plan page, it starts from the first or the last. */
export function stepNavbarItem(
  items: NavbarItem[],
  view: MainView,
  folder: FolderFilter,
  step: 1 | -1,
): NavbarItem {
  const at = items.findIndex((item) =>
    view === "board" && folder != null
      ? item.folder != null && sameFolder(item.folder, folder)
      : item.view === view && item.folder == null,
  );
  const next = at === -1 ? (step === 1 ? 0 : items.length - 1) : at + step;
  return items[(next + items.length) % items.length];
}

/** The plans behind the recent paths, newest first, skipping any that are gone. */
export function recentPlans(plans: PlanSummary[], paths: string[]): PlanSummary[] {
  const byPath = new Map(plans.map((plan) => [plan.path, plan]));
  return paths
    .map((path) => byPath.get(path))
    .filter((plan): plan is PlanSummary => plan != null)
    .slice(0, RECENT_LIMIT);
}

export function toggleSection(collapsed: SectionId[], id: SectionId): SectionId[] {
  return collapsed.includes(id) ? collapsed.filter((s) => s !== id) : [...collapsed, id];
}

export function loadNavbarMode(): NavbarMode {
  try {
    return parseNavbarMode(localStorage.getItem(MODE_KEY));
  } catch {
    return "expanded";
  }
}

export function saveNavbarMode(mode: NavbarMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // best-effort
  }
}

export function loadCollapsedSections(): SectionId[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]");
    if (!Array.isArray(stored)) return [];
    return stored.filter((id): id is SectionId =>
      ["views", "folders", "recent"].includes(id as string),
    );
  } catch {
    return [];
  }
}

export function saveCollapsedSections(collapsed: SectionId[]): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsed));
  } catch {
    // best-effort
  }
}
