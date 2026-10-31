import { STORAGE_PREFIX } from "./storage";

/** What a plan's card shows. The list's rows read the same options, except
 * the clamp: a row is always one line. */
export interface CardDisplay {
  repos: boolean;
  folders: boolean;
  progress: boolean;
  prs: boolean;
  date: boolean;
  source: boolean;
  sessions: boolean;
  clampTitle: boolean;
}

export const CARD_DISPLAY_DEFAULTS: CardDisplay = {
  repos: true,
  folders: true,
  progress: true,
  prs: true,
  date: true,
  source: true,
  sessions: true,
  clampTitle: false,
};

/** The Display menu's switches, in order. */
export const CARD_DISPLAY_OPTIONS: { key: keyof CardDisplay; label: string }[] = [
  { key: "repos", label: "Repos" },
  { key: "folders", label: "Folders" },
  { key: "progress", label: "Progress" },
  { key: "prs", label: "Pull requests" },
  { key: "date", label: "Date" },
  { key: "source", label: "Source" },
  { key: "sessions", label: "Sessions" },
  { key: "clampTitle", label: "Clamp title to two lines" },
];

const STORE_KEY = `${STORAGE_PREFIX}card-display`;

/** Only the options it knows, and only when they are on or off: a value a
 * later build wrote cannot switch an option to something else. */
export function loadCardDisplay(storage: Storage = localStorage): CardDisplay {
  const display = { ...CARD_DISPLAY_DEFAULTS };
  try {
    const stored: unknown = JSON.parse(storage.getItem(STORE_KEY) ?? "{}");
    if (typeof stored !== "object" || stored === null) return display;
    for (const key of Object.keys(display) as (keyof CardDisplay)[]) {
      const value = (stored as Record<string, unknown>)[key];
      if (typeof value === "boolean") display[key] = value;
    }
  } catch {
    // best-effort: unreadable or blocked storage shows the defaults
  }
  return display;
}

export function saveCardDisplay(
  display: CardDisplay,
  storage: Storage = localStorage,
): void {
  try {
    storage.setItem(STORE_KEY, JSON.stringify(display));
  } catch {
    // best-effort
  }
}
