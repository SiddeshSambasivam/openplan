import { describe, expect, it } from "vitest";
import { originLabel, pushOrigin, type Origin } from "./origin";

const board: Origin = { kind: "view", view: "board", scroll: [] };
const planA: Origin = { kind: "page", path: "/base/a.md", title: "Plan A" };
const planB: Origin = { kind: "page", path: "/base/b.md", title: "Plan B" };

describe("originLabel", () => {
  it("names each view the way the navbar does", () => {
    expect(originLabel(board)).toBe("Board");
    expect(originLabel({ kind: "view", view: "list", scroll: [] })).toBe("List");
    expect(originLabel({ kind: "view", view: "for-you", scroll: [] })).toBe("For you");
  });

  it("calls the palette Search", () => {
    expect(originLabel({ kind: "search", query: "auth" })).toBe("Search");
  });

  it("names the plan it came from by its title", () => {
    expect(originLabel(planA)).toBe("Plan A");
  });
});

describe("pushOrigin", () => {
  it("starts over from a view, whatever came before", () => {
    expect(pushOrigin([planA, planB], board, "/base/c.md")).toEqual([board]);
  });

  it("starts over from the palette", () => {
    const search: Origin = { kind: "search", query: "auth" };
    expect(pushOrigin([board, planA], search, "/base/c.md")).toEqual([search]);
  });

  it("stacks plans opened from plans, so back walks them in turn", () => {
    expect(pushOrigin([board, planA], planB, "/base/c.md")).toEqual([board, planA, planB]);
  });

  it("leaves the trail alone when the plan opens itself again", () => {
    const trail = [board];
    expect(pushOrigin(trail, planA, "/base/a.md")).toBe(trail);
  });

  it("has nowhere to go back to when nothing was open", () => {
    expect(pushOrigin([board], null, "/base/c.md")).toEqual([]);
  });
});
