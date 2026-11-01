import { describe, expect, it } from "vitest";
import { follow, isSettled, type Follow } from "./follow";

const FRAME = 1 / 60;
const AT_REST: Follow = { value: 0, speed: 0 };

function run(target: number, seconds = FRAME): Follow[] {
  const steps: Follow[] = [];
  let now = AT_REST;
  while (!isSettled(now, target) && steps.length < 1000) {
    now = follow(now, target, seconds);
    steps.push(now);
  }
  return steps;
}

describe("follow", () => {
  it("settles on the target within a few seconds and stops there", () => {
    const steps = run(1);
    expect(steps.length).toBeLessThan(3 * 60);
    expect(steps[steps.length - 1]).toEqual({ value: 1, speed: 0 });
  });

  it("starts slowly and never passes the target", () => {
    const steps = run(-1);
    expect(Math.abs(steps[0].value)).toBeLessThan(0.01);
    for (const [index, step] of steps.entries()) {
      expect(step.value).toBeGreaterThanOrEqual(-1);
      if (index > 0) expect(step.value).toBeLessThanOrEqual(steps[index - 1].value);
    }
  });

  it("takes a long frame as a short one, so a stall never makes it jump", () => {
    expect(follow(AT_REST, 1, 2).value).toBe(follow(AT_REST, 1, 1 / 30).value);
  });

  it("is settled only at rest on the target", () => {
    expect(isSettled({ value: 1, speed: 0 }, 1)).toBe(true);
    expect(isSettled({ value: 1, speed: 0.5 }, 1)).toBe(false);
    expect(isSettled({ value: 0.5, speed: 0 }, 1)).toBe(false);
  });
});
