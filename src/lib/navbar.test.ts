import { describe, expect, it } from "vitest";
import type { PlanSummary } from "./planBase";
import {
  navbarItems,
  navbarLayout,
  navbarSections,
  navbarToggleLabel,
  rowHasTooltip,
  parseNavbarMode,
  pressNavbarKey,
  markStart,
  RAIL_WIDTH,
  recentPlans,
  stepNavbarItem,
  toggleSection,
  topBarLayout,
} from "./navbar";

function plan(id: string, folders: string[] = []): PlanSummary {
  return {
    id,
    title: `Plan ${id}`,
    status: "draft",
    type: null,
    source: "claude-code",
    pr: null,
    created: null,
    updated: null,
    path: `/base/${id}.md`,
    relativePath: `${id}.md`,
    documents: [],
    folders,
    completed: null,
  };
}

const wide = false;
const narrow = true;

describe("pressNavbarKey", () => {
  it("toggles expanded and minimized on cmd+b", () => {
    expect(pressNavbarKey({ mode: "expanded", revealed: false }, wide)).toEqual({
      mode: "minimized",
      revealed: false,
    });
    expect(pressNavbarKey({ mode: "minimized", revealed: false }, wide)).toEqual({
      mode: "expanded",
      revealed: false,
    });
  });

  it("floats the expanded navbar in a narrow window and keeps the stored mode", () => {
    for (const mode of ["expanded", "minimized"] as const) {
      const shown = pressNavbarKey({ mode, revealed: false }, narrow);
      expect(shown).toEqual({ mode, revealed: true });
      expect(pressNavbarKey(shown, narrow)).toEqual({ mode, revealed: false });
    }
  });
});

describe("navbarLayout", () => {
  it("gives the navbar the stored mode's column in a wide window", () => {
    expect(navbarLayout("expanded", wide)).toBe("expanded");
    expect(navbarLayout("minimized", wide)).toBe("minimized");
  });

  it("keeps a narrow window's column to the icons", () => {
    expect(navbarLayout("expanded", narrow)).toBe("minimized");
    expect(navbarLayout("minimized", narrow)).toBe("minimized");
  });
});

describe("navbarToggleLabel", () => {
  it("names what a click does", () => {
    expect(navbarToggleLabel(true)).toBe("Collapse navbar");
    expect(navbarToggleLabel(false)).toBe("Expand navbar");
  });
});

describe("markStart", () => {
  it("puts the mark after the macOS window controls", () => {
    expect(markStart(true)).toBe(84);
  });

  it("lines the mark up with the rail's icons without them", () => {
    // A 24px control centred on the rail's icon column.
    expect(markStart(false) + 12).toBe(RAIL_WIDTH / 2);
  });
});

describe("topBarLayout", () => {
  for (const windowControls of [true, false]) {
    const platform = windowControls ? "with window controls" : "without them";

    it(`starts the top bar after the expanded navbar, ${platform}`, () => {
      expect(topBarLayout("expanded", windowControls)).toEqual({ pull: 0, lead: 16 });
    });

    it(`spans the minimized top bar over the rail with the mark first, ${platform}`, () => {
      const { pull, lead } = topBarLayout("minimized", windowControls);
      expect(pull).toBe(RAIL_WIDTH);
      // The title follows the 24px mark and the row's gap.
      expect(lead).toBe(markStart(windowControls) + 24 + 6);
    });
  }

  it("keeps the title clear of the macOS window controls when minimized", () => {
    expect(topBarLayout("minimized", true).lead).toBeGreaterThan(84 + 24);
  });
});

describe("parseNavbarMode", () => {
  it("reads the two modes", () => {
    expect(parseNavbarMode("expanded")).toBe("expanded");
    expect(parseNavbarMode("minimized")).toBe("minimized");
  });

  it("reads the older open as expanded, and rail, hidden and closed as minimized", () => {
    expect(parseNavbarMode("open")).toBe("expanded");
    expect(parseNavbarMode("rail")).toBe("minimized");
    expect(parseNavbarMode("hidden")).toBe("minimized");
    expect(parseNavbarMode("closed")).toBe("minimized");
  });

  it("reads nothing or anything else as expanded", () => {
    expect(parseNavbarMode(null)).toBe("expanded");
    expect(parseNavbarMode("wide")).toBe("expanded");
  });
});

describe("stepNavbarItem", () => {
  const items = navbarItems(["infra", "search"]);

  it("lists the views, then each folder as a filter on the board", () => {
    expect(items).toEqual([
      { view: "board", folder: null },
      { view: "list", folder: null },
      { view: "for-you", folder: null },
      { view: "board", folder: "infra" },
      { view: "board", folder: "search" },
    ]);
  });

  it("moves to the next and previous row in that order", () => {
    expect(stepNavbarItem(items, "board", null, 1)).toEqual(items[1]);
    expect(stepNavbarItem(items, "for-you", null, 1)).toEqual(items[3]);
    expect(stepNavbarItem(items, "board", "infra", 1)).toEqual(items[4]);
    expect(stepNavbarItem(items, "board", "infra", -1)).toEqual(items[2]);
  });

  it("reads a folder filter on another view as that view's row", () => {
    expect(stepNavbarItem(items, "list", "infra", 1)).toEqual(items[2]);
  });

  it("wraps at both ends", () => {
    expect(stepNavbarItem(items, "board", "search", 1)).toEqual(items[0]);
    expect(stepNavbarItem(items, "board", null, -1)).toEqual(items[4]);
  });

  it("starts from the ends when no row is current", () => {
    expect(stepNavbarItem(items, "plan", null, 1)).toEqual(items[0]);
    expect(stepNavbarItem(items, "plan", null, -1)).toEqual(items[4]);
  });
});

describe("navbarSections", () => {
  it("lists every folder once, sorted by name", () => {
    const plans = [plan("a", ["Search", "infra"]), plan("b", ["search"]), plan("c", ["Billing"])];
    expect(navbarSections(plans, [], []).folders).toEqual(["Billing", "infra", "Search"]);
  });

  it("adds the folders saved in the base", () => {
    expect(navbarSections([plan("a", ["infra"])], [], ["Empty"]).folders).toEqual([
      "Empty",
      "infra",
    ]);
  });

  it("caps recent at five, newest first", () => {
    const plans = Array.from({ length: 7 }, (_, i) => plan(String(i)));
    const paths = plans.map((p) => p.path).reverse();
    const recent = navbarSections(plans, paths, []).recent;
    expect(recent.map((p) => p.id)).toEqual(["6", "5", "4", "3", "2"]);
  });
});

describe("recentPlans", () => {
  it("drops paths whose plan is gone", () => {
    expect(recentPlans([plan("a")], ["/base/gone.md", "/base/a.md"]).map((p) => p.id)).toEqual([
      "a",
    ]);
  });
});

describe("toggleSection", () => {
  it("folds a section and unfolds it again", () => {
    expect(toggleSection([], "folders")).toEqual(["folders"]);
    expect(toggleSection(["folders", "recent"], "folders")).toEqual(["recent"]);
  });
});

describe("rowHasTooltip", () => {
  it("names a row only when the rail hides its label or it has a key", () => {
    expect(rowHasTooltip(true, undefined)).toBe(true);
    expect(rowHasTooltip(false, "board")).toBe(true);
    expect(rowHasTooltip(false, undefined)).toBe(false);
  });
});
