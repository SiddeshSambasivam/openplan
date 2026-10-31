import { STORAGE_PREFIX } from "./storage";

/** Long enough to get back to what you were reading, short enough to scan. */
export const RECENT_LIMIT = 5;

const KEY = `${STORAGE_PREFIX}recent`;

/** The plans last opened, newest first. */
export function pushRecent(
  paths: string[],
  path: string,
  limit: number = RECENT_LIMIT,
): string[] {
  return [path, ...paths.filter((p) => p !== path)].slice(0, limit);
}

export function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const stored: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(stored)) return [];
    return stored.filter((p): p is string => typeof p === "string");
  } catch {
    return [];
  }
}

export function saveRecent(paths: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(paths));
  } catch {
    // best-effort
  }
}
