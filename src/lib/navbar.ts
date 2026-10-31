import { allFolders } from "./folders";
import type { PlanSummary } from "./planBase";
import { RECENT_LIMIT } from "./recent";
import { STORAGE_PREFIX } from "./storage";

/** Open shows icons and labels, rail shows icons only, hidden gives the
 * main area the whole window. */
export type NavbarMode = "open" | "rail" | "hidden";

/** `toggle` is cmd+b, `rail` is cmd+shift+b. */
export type NavbarKey = "toggle" | "rail";

/** The pointer came to rest on the window's left edge, or left the navbar. */
export type NavbarPointer = "edge" | "leave";

/** `revealed` is the navbar floating over the main area while it has no
 * column of its own. */
export interface NavbarState {
  mode: NavbarMode;
  revealed: boolean;
}

export type SectionId = "views" | "folders" | "recent";

/** Below this window width an open navbar would squeeze the main area, so it
 * floats over it instead. */
export const NAVBAR_OVERLAY_BREAKPOINT = 900;

const MODE_KEY = `${STORAGE_PREFIX}sidebar`;
const COLLAPSED_KEY = `${STORAGE_PREFIX}nav-collapsed`;

/** How the navbar sits beside the main area at this window width. */
export function navbarLayout(mode: NavbarMode, narrow: boolean): NavbarMode {
  return mode === "open" && narrow ? "hidden" : mode;
}

/**
 * A narrow window keeps the stored mode and shows or hides the floating
 * navbar instead, so a preference set on a wide screen survives a small one.
 */
export function pressNavbarKey(
  state: NavbarState,
  key: NavbarKey,
  narrow: boolean,
): NavbarState {
  if (key === "toggle" && narrow && state.mode === "open") {
    return { mode: "open", revealed: !state.revealed };
  }
  const mode = nextMode(state.mode, key);
  return { mode, revealed: narrow && mode === "open" };
}

export function movePointer(
  state: NavbarState,
  pointer: NavbarPointer,
  narrow: boolean,
): NavbarState {
  if (pointer === "leave") return { ...state, revealed: false };
  return { ...state, revealed: navbarLayout(state.mode, narrow) === "hidden" };
}

/** Reads the stored mode. The flag it replaced stored "closed" for hidden. */
export function parseNavbarMode(stored: string | null): NavbarMode {
  if (stored === "rail" || stored === "hidden") return stored;
  return stored === "closed" ? "hidden" : "open";
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
    return "open";
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

function nextMode(mode: NavbarMode, key: NavbarKey): NavbarMode {
  if (key === "rail") return mode === "rail" ? "open" : "rail";
  return mode === "hidden" ? "open" : "hidden";
}
