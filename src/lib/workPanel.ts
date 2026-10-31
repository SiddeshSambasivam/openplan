import { STORAGE_PREFIX } from "./storage";

/** Expanded shows the todos, repos and PRs. Minimized folds them into a
 * thin rail with the todo count. */
export type WorkPanelMode = "expanded" | "minimized";

const MODE_KEY = `${STORAGE_PREFIX}work-panel`;

export function parseWorkPanelMode(stored: string | null): WorkPanelMode {
  return stored === "minimized" ? "minimized" : "expanded";
}

export function loadWorkPanelMode(): WorkPanelMode {
  try {
    return parseWorkPanelMode(localStorage.getItem(MODE_KEY));
  } catch {
    return "expanded";
  }
}

export function saveWorkPanelMode(mode: WorkPanelMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // best-effort
  }
}
