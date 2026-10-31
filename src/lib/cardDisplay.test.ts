import { describe, expect, it } from "vitest";
import {
  CARD_DISPLAY_DEFAULTS,
  CARD_DISPLAY_OPTIONS,
  loadCardDisplay,
  saveCardDisplay,
} from "./cardDisplay";

/** Minimal in-memory stand-in for the browser's Storage. */
function fakeStorage(initial: Record<string, string> = {}): Storage {
  const entries = new Map(Object.entries(initial));
  return {
    get length() {
      return entries.size;
    },
    key: (index: number) => [...entries.keys()][index] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, value),
    removeItem: (key: string) => void entries.delete(key),
    clear: () => entries.clear(),
  };
}

describe("loadCardDisplay", () => {
  it("shows everything but the title clamp when nothing is stored", () => {
    const display = loadCardDisplay(fakeStorage());

    expect(display).toEqual(CARD_DISPLAY_DEFAULTS);
    expect(display.clampTitle).toBe(false);
    const { clampTitle: _, ...shown } = display;
    expect(Object.values(shown).every(Boolean)).toBe(true);
  });

  it("keeps the defaults for options a stored value does not name", () => {
    const storage = fakeStorage({
      "openplan:card-display": JSON.stringify({ repos: false, clampTitle: true }),
    });

    expect(loadCardDisplay(storage)).toEqual({
      ...CARD_DISPLAY_DEFAULTS,
      repos: false,
      clampTitle: true,
    });
  });

  it("ignores values that are not on or off, and keys it does not know", () => {
    const storage = fakeStorage({
      "openplan:card-display": JSON.stringify({ date: "no", extra: false }),
    });

    expect(loadCardDisplay(storage)).toEqual(CARD_DISPLAY_DEFAULTS);
  });

  it("falls back to the defaults when the stored value is not JSON", () => {
    const storage = fakeStorage({ "openplan:card-display": "{broken" });

    expect(loadCardDisplay(storage)).toEqual(CARD_DISPLAY_DEFAULTS);
  });

  it("falls back to the defaults when storage throws", () => {
    const storage = {
      getItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;

    expect(loadCardDisplay(storage)).toEqual(CARD_DISPLAY_DEFAULTS);
  });
});

describe("saveCardDisplay", () => {
  it("stores the options under one key and reads them back", () => {
    const storage = fakeStorage();
    const display = { ...CARD_DISPLAY_DEFAULTS, sessions: false, clampTitle: true };

    saveCardDisplay(display, storage);

    expect(storage.length).toBe(1);
    expect(loadCardDisplay(storage)).toEqual(display);
  });
});

describe("CARD_DISPLAY_OPTIONS", () => {
  it("lists every option once, in the menu's order", () => {
    expect(CARD_DISPLAY_OPTIONS.map((option) => option.key)).toEqual([
      "repos",
      "folders",
      "progress",
      "prs",
      "date",
      "source",
      "sessions",
      "clampTitle",
    ]);
    expect(CARD_DISPLAY_OPTIONS.map((option) => option.label)).toEqual([
      "Repos",
      "Folders",
      "Progress",
      "Pull requests",
      "Date",
      "Source",
      "Sessions",
      "Clamp title to two lines",
    ]);
  });
});
