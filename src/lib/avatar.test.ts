import { describe, expect, it } from "vitest";
import { MARBLE_SIZE, marble } from "./avatar";

describe("marble", () => {
  it("draws the same shapes for the same person", () => {
    expect(marble("sid@hypotenuse.ai")).toEqual(marble("sid@hypotenuse.ai"));
  });

  it("draws different shapes for different people", () => {
    const seen = new Set(
      ["a@x.dev", "b@x.dev", "sid@hypotenuse.ai", "Sid", "Ada Lovelace"].map((seed) =>
        JSON.stringify(marble(seed)),
      ),
    );
    expect(seen.size).toBe(5);
  });

  it("ignores case and surrounding space, as an email does", () => {
    expect(marble(" Sid@Hypotenuse.ai ")).toEqual(marble("sid@hypotenuse.ai"));
  });

  it("colours from the five chart tokens, with three blobs over a background", () => {
    for (const seed of ["", "a", "sid@hypotenuse.ai", "x".repeat(200)]) {
      const { background, blobs, rotate } = marble(seed);
      expect(blobs).toHaveLength(3);
      for (const color of [background, ...blobs.map((blob) => blob.color)]) {
        expect([1, 2, 3, 4, 5]).toContain(color);
      }
      expect(blobs.map((blob) => blob.color)).not.toContain(background);
      for (const blob of blobs) {
        expect(blob.cx).toBeGreaterThanOrEqual(0);
        expect(blob.cx).toBeLessThanOrEqual(MARBLE_SIZE);
        expect(blob.cy).toBeGreaterThanOrEqual(0);
        expect(blob.cy).toBeLessThanOrEqual(MARBLE_SIZE);
        expect(blob.r).toBeGreaterThan(0);
      }
      expect(rotate).toBeGreaterThanOrEqual(0);
      expect(rotate).toBeLessThan(360);
    }
  });
});
