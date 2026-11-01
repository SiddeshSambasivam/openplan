/** A value easing toward a target, and how fast it is moving. */
export interface Follow {
  value: number;
  speed: number;
}

/**
 * One frame of a critically damped spring: the value eases in, eases out
 * and never passes the target. Close enough, it lands on the target at
 * rest, which `isSettled` reports, so a frame loop knows to stop.
 */
export function follow(now: Follow, target: number, seconds: number): Follow {
  const step = Math.min(seconds, LONGEST_STEP_S);
  const pull = RATE * RATE * (target - now.value) - 2 * RATE * now.speed;
  const speed = now.speed + pull * step;
  const value = now.value + speed * step;
  if (Math.abs(target - value) < CLOSE && Math.abs(speed) < CLOSE) return { value: target, speed: 0 };
  return { value, speed };
}

export function isSettled(now: Follow, target: number): boolean {
  return now.value === target && now.speed === 0;
}

/** Per second. Higher follows faster. */
const RATE = 5;
const LONGEST_STEP_S = 1 / 30;
const CLOSE = 0.005;
