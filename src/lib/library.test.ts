import { describe, expect, it } from "vitest";
import { initialMainView, loadLibrary } from "./library";

function memoryStorage(entries: Record<string, string> = {}): Storage {
  const store = new Map(Object.entries(entries));
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => void store.delete(key),
    setItem: (key, value) => void store.set(key, value),
  };
}

describe("first launch", () => {
  it("opens on the plan page with nothing open, which is the empty state", () => {
    const storage = memoryStorage();
    const library = loadLibrary(storage, true);
    expect(library.items).toEqual([]);
    expect(library.activeId).toBeNull();
    expect(initialMainView(storage)).toBe("plan");
  });

  it("drops the welcome document a previous version stored", () => {
    const storage = memoryStorage({
      "openplan:items": JSON.stringify([{ kind: "file", id: "__welcome__", name: "Welcome" }]),
      "openplan:active": "__welcome__",
    });
    const library = loadLibrary(storage, true);
    expect(library.items).toEqual([]);
    expect(library.activeId).toBeNull();
  });
});

describe("loadLibrary", () => {
  it("restores the files a person added and the one they had open", () => {
    const storage = memoryStorage({
      "openplan:items": JSON.stringify([{ kind: "file", id: "/a.md", name: "a", path: "/a.md" }]),
      "openplan:active": "/a.md",
    });
    const library = loadLibrary(storage, true);
    expect(library.items).toEqual([{ kind: "file", id: "/a.md", name: "a", path: "/a.md" }]);
    expect(library.activeId).toBe("/a.md");
  });

  it("restores nothing path-backed outside the desktop app", () => {
    const storage = memoryStorage({
      "openplan:items": JSON.stringify([{ kind: "file", id: "/a.md", name: "a", path: "/a.md" }]),
    });
    expect(loadLibrary(storage, false).items).toEqual([]);
  });
});

describe("initialMainView", () => {
  it("comes back to the view that was open last", () => {
    expect(initialMainView(memoryStorage({ "openplan:main-view": "board" }))).toBe("board");
  });

  it("ignores a view it does not know", () => {
    expect(initialMainView(memoryStorage({ "openplan:main-view": "projects" }))).toBe("plan");
  });
});
