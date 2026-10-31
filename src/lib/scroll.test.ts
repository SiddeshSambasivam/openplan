import { describe, expect, it } from "vitest";
import { restoreScroll, scrollMarks } from "./scroll";

/** Just enough of an element for the two helpers: scroll offsets and a
 * flat list of descendants in document order. */
function tree(offsets: [number, number][]) {
  const elements = offsets.map(([top, left]) => ({ scrollTop: top, scrollLeft: left }));
  const root = { querySelectorAll: () => elements } as unknown as Element;
  return { root, elements };
}

describe("scrollMarks", () => {
  it("keeps only the elements that were scrolled, by their place in the tree", () => {
    const { root } = tree([
      [0, 0],
      [120, 0],
      [0, 0],
      [0, 40],
    ]);
    expect(scrollMarks(root)).toEqual([
      { index: 1, top: 120, left: 0 },
      { index: 3, top: 0, left: 40 },
    ]);
  });
});

describe("restoreScroll", () => {
  it("puts each offset back on the element at the same place", () => {
    const { root, elements } = tree([
      [0, 0],
      [0, 0],
      [0, 0],
    ]);
    restoreScroll(root, [{ index: 1, top: 80, left: 0 }]);
    expect(elements[1]).toEqual({ scrollTop: 80, scrollLeft: 0 });
    expect(elements[0]).toEqual({ scrollTop: 0, scrollLeft: 0 });
  });

  it("skips a mark whose element is gone", () => {
    const { root } = tree([[0, 0]]);
    expect(() => restoreScroll(root, [{ index: 5, top: 80, left: 0 }])).not.toThrow();
  });
});
