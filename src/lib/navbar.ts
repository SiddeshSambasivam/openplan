import { allFolders } from "./folders";
import type { PlanSummary } from "./planBase";
import { RECENT_LIMIT } from "./recent";
import { STORAGE_PREFIX } from "./storage";

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

/** The top bar's own left padding. */
export const TOP_BAR_PADDING = 16;

/** Where the macOS window controls end, with a gap after them. */
const WINDOW_CONTROLS_END = 84;

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

export function navbarToggleLabel(expanded: boolean): string {
  return expanded ? "Collapse navbar" : "Expand navbar";
}

/**
 * The space the top bar keeps before its content. `windowControls` is the
 * macOS traffic lights drawn over the page. The minimized navbar is too
 * narrow to clear them, the expanded one is not.
 */
export function topBarGap(mode: NavbarMode, windowControls: boolean): number {
  if (!windowControls || mode === "expanded") return 0;
  return WINDOW_CONTROLS_END - RAIL_WIDTH - TOP_BAR_PADDING;
}

/** Reads the stored mode. Older builds stored open, rail, hidden and, before
 * those, closed. */
export function parseNavbarMode(stored: string | null): NavbarMode {
  return stored != null && ["minimized", "rail", "hidden", "closed"].includes(stored)
    ? "minimized"
    : "expanded";
}

export function navbarSections(
  plans: PlanSummary[],
  recentPaths: string[],
): { folders: string[]; recent: PlanSummary[] } {
  return { folders: allFolders(plans), recent: recentPlans(plans, recentPaths) };
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
