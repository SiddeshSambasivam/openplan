import { describe, expect, it } from "vitest";
import { tabFor, withTab } from "./planTab";

describe("plan tabs", () => {
  it("opens a plan on its Plan tab", () => {
    expect(tabFor({}, "/base/a.md")).toBe("plan");
    expect(tabFor({}, null)).toBe("plan");
  });

  it("remembers the tab per plan", () => {
    const tabs = withTab({}, "/base/a.md", "alignment");
    expect(tabFor(tabs, "/base/a.md")).toBe("alignment");
    expect(tabFor(tabs, "/base/b.md")).toBe("plan");
  });

  it("leaves the other plans' tabs as they were", () => {
    const tabs = withTab(withTab({}, "/base/a.md", "alignment"), "/base/b.md", "alignment");
    expect(tabFor(withTab(tabs, "/base/b.md", "plan"), "/base/a.md")).toBe("alignment");
  });
});
