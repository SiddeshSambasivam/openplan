import { describe, expect, it } from "vitest";
import { migrateLegacyStorageKeys } from "./storage";

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

describe("migrateLegacyStorageKeys", () => {
  it("moves values from the legacy prefix to the current one", () => {
    const storage = fakeStorage({
      "openmarkdown:theme": "dark",
      "openmarkdown:sidebar-width": "300",
    });

    migrateLegacyStorageKeys(storage);

    expect(storage.getItem("openplan:theme")).toBe("dark");
    expect(storage.getItem("openplan:sidebar-width")).toBe("300");
    expect(storage.getItem("openmarkdown:theme")).toBeNull();
    expect(storage.getItem("openmarkdown:sidebar-width")).toBeNull();
  });

  it("keeps an already-migrated value instead of overwriting it", () => {
    const storage = fakeStorage({
      "openmarkdown:theme": "dark",
      "openplan:theme": "light",
    });

    migrateLegacyStorageKeys(storage);

    expect(storage.getItem("openplan:theme")).toBe("light");
    expect(storage.getItem("openmarkdown:theme")).toBeNull();
  });

  it("leaves unrelated keys untouched", () => {
    const storage = fakeStorage({ "other-app:theme": "dark" });

    migrateLegacyStorageKeys(storage);

    expect(storage.getItem("other-app:theme")).toBe("dark");
  });

  it("is a no-op when run again", () => {
    const storage = fakeStorage({ "openmarkdown:theme": "dark" });

    migrateLegacyStorageKeys(storage);
    migrateLegacyStorageKeys(storage);

    expect(storage.getItem("openplan:theme")).toBe("dark");
    expect(storage.length).toBe(1);
  });

  it("gives up quietly when storage is unavailable", () => {
    const unavailable = {
      get length(): number {
        throw new Error("localStorage is disabled");
      },
    } as Storage;

    expect(() => migrateLegacyStorageKeys(unavailable)).not.toThrow();
  });
});
