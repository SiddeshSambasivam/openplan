import { describe, expect, it } from "vitest";
import {
  actionLabel,
  foldersToggled,
  holdsDocument,
  sharedFolders,
  arming,
  deleteLabel,
  deleteLine,
  deleteTitle,
  listedTitles,
  plansLabel,
  selectedLabel,
  targetsOf,
} from "./planActions";

describe("labels", () => {
  it("counts plans in English", () => {
    expect(plansLabel(1)).toBe("1 plan");
    expect(plansLabel(3)).toBe("3 plans");
  });

  it("says how many are selected on the bar", () => {
    expect(selectedLabel(1)).toBe("1 selected");
    expect(selectedLabel(3)).toBe("3 selected");
  });

  it("names the count on a menu item only when it acts on several", () => {
    expect(actionLabel("Archive", 1)).toBe("Archive");
    expect(actionLabel("Archive", 3)).toBe("Archive 3 plans");
  });

  it("asks about the plans being deleted", () => {
    expect(deleteTitle(1)).toBe("Delete 1 plan?");
    expect(deleteTitle(3)).toBe("Delete 3 plans?");
  });

  it("says where deleted plans can still be found", () => {
    expect(deleteLine(3)).toBe(
      "They leave OpenPlan. Their history stays in the base's git log, so they can be restored.",
    );
    expect(deleteLine(1)).toBe(
      "It leaves OpenPlan. Its history stays in the base's git log, so it can be restored.",
    );
  });
});

describe("listedTitles", () => {
  it("lists up to five titles", () => {
    expect(listedTitles(["a", "b"])).toEqual({ shown: ["a", "b"], more: 0 });
  });

  it("counts the rest beyond five", () => {
    const titles = ["a", "b", "c", "d", "e", "f", "g"];
    expect(listedTitles(titles)).toEqual({ shown: ["a", "b", "c", "d", "e"], more: 2 });
  });
});

describe("targetsOf", () => {
  it("acts on the whole selection when it holds the plan", () => {
    expect(targetsOf(new Set(["a", "b"]), "b")).toEqual(["a", "b"]);
  });

  it("acts on the plan alone when it is outside the selection", () => {
    expect(targetsOf(new Set(["a", "b"]), "c")).toEqual(["c"]);
    expect(targetsOf(new Set(), "c")).toEqual(["c"]);
  });
});

describe("arming", () => {
  it("arms on the first press and deletes on the second", () => {
    expect(arming("ready", "press")).toBe("armed");
    expect(arming("armed", "press")).toBe("confirmed");
  });

  it("disarms when the dialog closes or the time runs out", () => {
    expect(arming("armed", "close")).toBe("ready");
    expect(arming("armed", "expire")).toBe("ready");
  });

  it("labels the button by step", () => {
    expect(deleteLabel("ready")).toBe("Delete");
    expect(deleteLabel("armed")).toBe("Confirm delete");
  });
});

const plan = (path: string, folders: string[], documents: string[] = []) => ({
  path,
  folders,
  documents,
});

describe("sharedFolders", () => {
  it("is the folders every plan is in, whatever the case", () => {
    const plans = [plan("/a.md", ["Infra", "Q3"]), plan("/b.md", ["q3", "Search"])];
    expect(sharedFolders(plans)).toEqual(["Q3"]);
    expect(sharedFolders([])).toEqual([]);
  });
});

describe("foldersToggled", () => {
  it("adds the folder to the plans that lack it", () => {
    const plans = [plan("/a.md", ["Infra"]), plan("/b.md", [])];
    expect(foldersToggled(plans, "infra", ["Infra"])).toEqual([
      { path: "/b.md", folders: ["Infra"] },
    ]);
  });

  it("takes it out of every plan once they all have it", () => {
    const plans = [plan("/a.md", ["Infra", "Q3"]), plan("/b.md", ["infra"])];
    expect(foldersToggled(plans, "Infra", ["Infra"])).toEqual([
      { path: "/a.md", folders: ["Q3"] },
      { path: "/b.md", folders: [] },
    ]);
  });
});

describe("holdsDocument", () => {
  it("holds its own file", () => {
    expect(holdsDocument(plan("/base/a.md", []), "/base/a.md")).toBe(true);
    expect(holdsDocument(plan("/base/a.md", []), "/base/ab.md")).toBe(false);
  });

  it("holds every document in a set's folder", () => {
    const set = plan("/base/set/README.md", [], ["README.md", "01-part.md"]);
    expect(holdsDocument(set, "/base/set/01-part.md")).toBe(true);
    expect(holdsDocument(set, "/base/settings.md")).toBe(false);
  });
});
