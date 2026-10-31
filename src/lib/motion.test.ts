import { describe, expect, it } from "vitest";
import { STAGGER_CAP, STAGGER_STEP_MS, entrance } from "./motion";

/** The delay an entrance asks for, in ms, or null when it asks for none. */
function delayOf(index: number, mountedWith = true): number | null {
  const style = entrance(index, mountedWith).style;
  if (!style?.animationDelay) return null;
  return Number.parseInt(String(style.animationDelay), 10);
}

describe("entrance", () => {
  it("brings the first item in with no delay", () => {
    expect(delayOf(0)).toBeNull();
  });

  it("steps each following item by one interval", () => {
    expect(delayOf(1)).toBe(STAGGER_STEP_MS);
    expect(delayOf(5)).toBe(5 * STAGGER_STEP_MS);
  });

  it("holds every item past the cap at the last delay", () => {
    const last = (STAGGER_CAP - 1) * STAGGER_STEP_MS;
    expect(delayOf(STAGGER_CAP - 1)).toBe(last);
    expect(delayOf(STAGGER_CAP)).toBe(last);
    expect(delayOf(500)).toBe(last);
  });

  it("keeps the whole group within a fifth of a second of the first", () => {
    expect((STAGGER_CAP - 1) * STAGGER_STEP_MS).toBeLessThanOrEqual(500);
  });

  it("gives an item that arrived later no delay and no move", () => {
    const late = entrance(7, false);
    expect(late.style).toBeUndefined();
    expect(late.className).not.toContain("motion-item");
  });

  it("moves the items the group mounted with", () => {
    expect(entrance(7, true).className).toContain("motion-item");
  });

  it("reads a negative index as the first item", () => {
    expect(delayOf(-3)).toBeNull();
  });
});
