import { describe, expect, it } from "vitest";
import { isNew, NEW_FOR_MS, nextExpiry } from "./newPlans";

const NOW = Date.parse("2026-10-29T12:00:00Z");
const minutesAgo = (minutes: number) =>
  new Date(NOW - minutes * 60_000).toISOString();

describe("isNew", () => {
  it("is new for ten minutes after it was filed", () => {
    expect(NEW_FOR_MS).toBe(10 * 60_000);
    expect(isNew(minutesAgo(0), NOW)).toBe(true);
    expect(isNew(minutesAgo(9.9), NOW)).toBe(true);
  });

  it("is no longer new at ten minutes", () => {
    expect(isNew(minutesAgo(10), NOW)).toBe(false);
    expect(isNew(minutesAgo(60), NOW)).toBe(false);
  });

  it("is not new without a readable date, or with one in the future", () => {
    expect(isNew(null, NOW)).toBe(false);
    expect(isNew("not a date", NOW)).toBe(false);
    expect(isNew(minutesAgo(-5), NOW)).toBe(false);
  });
});

describe("nextExpiry", () => {
  it("is when the first new plan stops being new", () => {
    const plans = [
      { created: minutesAgo(2) },
      { created: minutesAgo(7) },
      { created: minutesAgo(30) },
      { created: null },
    ];

    expect(nextExpiry(plans, NOW)).toBe(NOW + 3 * 60_000);
  });

  it("is null when no plan is new", () => {
    expect(nextExpiry([{ created: minutesAgo(30) }, { created: null }], NOW)).toBeNull();
    expect(nextExpiry([], NOW)).toBeNull();
  });
});
