import { describe, expect, it } from "vitest";
import {
  boxBetween,
  boxSelection,
  isDrag,
  overlap,
  rangeBetween,
  sameSelection,
  toggled,
} from "./selection";

const box = (left: number, top: number, right: number, bottom: number) => ({
  left,
  top,
  right,
  bottom,
});

describe("boxBetween", () => {
  it("spans two points in either drag direction", () => {
    expect(boxBetween({ x: 10, y: 20 }, { x: 40, y: 5 })).toEqual(box(10, 5, 40, 20));
    expect(boxBetween({ x: 40, y: 5 }, { x: 10, y: 20 })).toEqual(box(10, 5, 40, 20));
  });
});

describe("isDrag", () => {
  it("needs the pointer to travel at least 4px", () => {
    expect(isDrag({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(false);
    expect(isDrag({ x: 0, y: 0 }, { x: 2, y: 2 })).toBe(false);
    expect(isDrag({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);
    expect(isDrag({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(true);
  });
});

describe("overlap", () => {
  it("is the shared area of two rectangles", () => {
    expect(overlap(box(0, 0, 10, 10), box(5, 5, 20, 20))).toEqual(box(5, 5, 10, 10));
  });

  it("is null for rectangles that only touch or sit apart", () => {
    expect(overlap(box(0, 0, 10, 10), box(10, 0, 20, 10))).toBeNull();
    expect(overlap(box(0, 0, 10, 10), box(30, 30, 40, 40))).toBeNull();
  });

  it("catches a box drawn wholly inside a card", () => {
    expect(overlap(box(2, 2, 4, 4), box(0, 0, 10, 10))).toEqual(box(2, 2, 4, 4));
  });
});

describe("toggled", () => {
  it("adds a plan that was not selected and removes one that was", () => {
    const start = new Set(["a"]);
    expect([...toggled(start, "b")]).toEqual(["a", "b"]);
    expect([...toggled(start, "a")]).toEqual([]);
    expect([...start]).toEqual(["a"]);
  });
});

describe("rangeBetween", () => {
  const order = ["a", "b", "c", "d", "e"];

  it("covers the plans between the anchor and the target, both included", () => {
    expect(rangeBetween(order, "b", "d")).toEqual(["b", "c", "d"]);
    expect(rangeBetween(order, "d", "b")).toEqual(["b", "c", "d"]);
  });

  it("is the target alone without an anchor in the view", () => {
    expect(rangeBetween(order, null, "c")).toEqual(["c"]);
    expect(rangeBetween(order, "gone", "c")).toEqual(["c"]);
  });
});

describe("boxSelection", () => {
  const before = new Set(["a", "b"]);

  it("replaces the selection with what the box covers", () => {
    expect([...boxSelection(["c", "d"], before, false)]).toEqual(["c", "d"]);
  });

  it("adds what the box covers while cmd is held", () => {
    expect([...boxSelection(["b", "c"], before, true)]).toEqual(["a", "b", "c"]);
  });
});

describe("sameSelection", () => {
  it("compares members, not order or identity", () => {
    expect(sameSelection(new Set(["a", "b"]), new Set(["b", "a"]))).toBe(true);
    expect(sameSelection(new Set(["a"]), new Set(["a", "b"]))).toBe(false);
  });
});
