import { useState, type CSSProperties } from "react";

/** The gap between one item's entrance and the next. */
export const STAGGER_STEP_MS = 40;
/** How many items are stepped before they all share the last delay, so a
 * long column is not a long queue. */
export const STAGGER_CAP = 12;

export interface Entrance {
  className: string;
  style?: CSSProperties;
}

/**
 * How one item of a group enters. The items the group mounted with rise
 * together in order; one that arrives afterwards only fades, in place, so the
 * items around it stay still.
 */
export function entrance(index: number, mountedWith: boolean): Entrance {
  if (!mountedWith) return { className: "animate-in fade-in-0 duration-200" };
  const step = Math.min(Math.max(index, 0), STAGGER_CAP - 1);
  const delay = step * STAGGER_STEP_MS;
  return {
    className: "motion-item",
    style: delay ? { animationDelay: `${delay}ms` } : undefined,
  };
}

/**
 * The keys a group mounted with, fixed at its first render. Anything that
 * turns up later is new, and enters on its own: a write by an agent must not
 * replay the entrance of everything already on screen.
 */
export function useMountedKeys(keys: Iterable<string>): ReadonlySet<string> {
  const [mounted] = useState(() => new Set(keys));
  return mounted;
}
