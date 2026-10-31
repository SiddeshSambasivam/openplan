import { describe, expect, it } from "vitest";
import { hasUnmergedPrs, runFewAtATime } from "./prState";

describe("hasUnmergedPrs", () => {
  const summary = (...states: ("open" | "draft" | "merged" | "closed")[]) => ({
    reported: states.map((state, n) => ({ url: `https://github.com/o/r/pull/${n}`, state })),
    expected: true,
  });

  it("is true while any PR can still move", () => {
    expect(hasUnmergedPrs(summary("merged", "open"))).toBe(true);
    expect(hasUnmergedPrs(summary("closed"))).toBe(true);
  });

  it("is false once every PR is merged, or with none", () => {
    expect(hasUnmergedPrs(summary("merged", "merged"))).toBe(false);
    expect(hasUnmergedPrs(summary())).toBe(false);
    expect(hasUnmergedPrs(undefined)).toBe(false);
  });
});

describe("runFewAtATime", () => {
  it("runs every item with no more than the limit at once", async () => {
    let running = 0;
    let most = 0;
    const done: number[] = [];

    await runFewAtATime([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running += 1;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      done.push(n);
      running -= 1;
    });

    expect(done.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(most).toBe(3);
  });

  it("keeps going past an item that fails", async () => {
    const done: number[] = [];

    await runFewAtATime([1, 2, 3], 2, async (n) => {
      if (n === 1) throw new Error("no");
      done.push(n);
    });

    expect(done.sort()).toEqual([2, 3]);
  });
});
