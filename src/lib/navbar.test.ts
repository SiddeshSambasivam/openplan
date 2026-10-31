import { describe, expect, it } from "vitest";
import type { PlanSummary } from "./planBase";
import {
  navbarLayout,
  navbarSections,
  navbarToggleLabel,
  parseNavbarMode,
  pressNavbarKey,
  RAIL_WIDTH,
  recentPlans,
  toggleSection,
  TOP_BAR_PADDING,
  topBarGap,
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

describe("topBarGap", () => {
  it("starts the top bar's content clear of the macOS window controls when minimized", () => {
    const start = RAIL_WIDTH + TOP_BAR_PADDING + topBarGap("minimized", true);
    expect(start).toBeGreaterThanOrEqual(84);
    expect(start).toBeLessThan(96);
  });

  it("adds nothing when expanded, where the navbar already clears them", () => {
    expect(topBarGap("expanded", true)).toBe(0);
  });

  it("adds nothing without window controls over the page", () => {
    expect(topBarGap("minimized", false)).toBe(0);
    expect(topBarGap("expanded", false)).toBe(0);
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

describe("navbarSections", () => {
  it("lists every folder once, sorted by name", () => {
    const plans = [plan("a", ["Search", "infra"]), plan("b", ["search"]), plan("c", ["Billing"])];
    expect(navbarSections(plans, []).folders).toEqual(["Billing", "infra", "Search"]);
  });

  it("caps recent at five, newest first", () => {
    const plans = Array.from({ length: 7 }, (_, i) => plan(String(i)));
    const paths = plans.map((p) => p.path).reverse();
    const recent = navbarSections(plans, paths).recent;
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
