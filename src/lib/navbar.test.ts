import { describe, expect, it } from "vitest";
import type { PlanSummary } from "./planBase";
import {
  movePointer,
  navbarLayout,
  navbarSections,
  parseNavbarMode,
  pressNavbarKey,
  recentPlans,
  toggleSection,
  type NavbarMode,
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

function press(mode: NavbarMode, key: "toggle" | "rail") {
  return pressNavbarKey({ mode, revealed: false }, key, wide).mode;
}

describe("pressNavbarKey", () => {
  it("toggles open and hidden on cmd+b", () => {
    expect(press("open", "toggle")).toBe("hidden");
    expect(press("hidden", "toggle")).toBe("open");
  });

  it("hides the rail on cmd+b", () => {
    expect(press("rail", "toggle")).toBe("hidden");
  });

  it("toggles the rail and open on cmd+shift+b", () => {
    expect(press("open", "rail")).toBe("rail");
    expect(press("rail", "rail")).toBe("open");
  });

  it("shows the rail from hidden on cmd+shift+b", () => {
    expect(press("hidden", "rail")).toBe("rail");
  });

  it("puts away an edge reveal when the mode changes", () => {
    const next = pressNavbarKey({ mode: "hidden", revealed: true }, "toggle", wide);
    expect(next).toEqual({ mode: "open", revealed: false });
  });

  it("floats the open navbar in a narrow window and cmd+b shows or hides it", () => {
    const shown = pressNavbarKey({ mode: "hidden", revealed: false }, "toggle", narrow);
    expect(shown).toEqual({ mode: "open", revealed: true });
    expect(pressNavbarKey(shown, "toggle", narrow)).toEqual({ mode: "open", revealed: false });
  });
});

describe("navbarLayout", () => {
  it("keeps the stored mode in a wide window", () => {
    expect(navbarLayout("open", wide)).toBe("open");
    expect(navbarLayout("rail", wide)).toBe("rail");
    expect(navbarLayout("hidden", wide)).toBe("hidden");
  });

  it("gives a narrow window's main area the whole width unless the rail is on", () => {
    expect(navbarLayout("open", narrow)).toBe("hidden");
    expect(navbarLayout("rail", narrow)).toBe("rail");
  });
});

describe("movePointer", () => {
  it("shows the navbar when the pointer rests on the left edge in hidden mode", () => {
    expect(movePointer({ mode: "hidden", revealed: false }, "edge", wide).revealed).toBe(true);
  });

  it("hides it again when the pointer leaves", () => {
    expect(movePointer({ mode: "hidden", revealed: true }, "leave", wide).revealed).toBe(false);
  });

  it("ignores the edge while the navbar has a column of its own", () => {
    expect(movePointer({ mode: "open", revealed: false }, "edge", wide).revealed).toBe(false);
    expect(movePointer({ mode: "rail", revealed: false }, "edge", wide).revealed).toBe(false);
  });

  it("reveals the floating navbar of a narrow window from the edge", () => {
    expect(movePointer({ mode: "open", revealed: false }, "edge", narrow).revealed).toBe(true);
  });
});

describe("parseNavbarMode", () => {
  it("reads the three modes", () => {
    expect(parseNavbarMode("open")).toBe("open");
    expect(parseNavbarMode("rail")).toBe("rail");
    expect(parseNavbarMode("hidden")).toBe("hidden");
  });

  it("reads the old closed flag as hidden and anything else as open", () => {
    expect(parseNavbarMode("closed")).toBe("hidden");
    expect(parseNavbarMode(null)).toBe("open");
    expect(parseNavbarMode("wide")).toBe("open");
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
