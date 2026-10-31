import { useEffect, useState } from "react";
import type { PlanSummary } from "./planBase";

/** How long a plan carries its New tag after it was filed. */
export const NEW_FOR_MS = 10 * 60_000;

export function isNew(created: string | null, now: number): boolean {
  if (!created) return false;
  const age = now - Date.parse(created);
  return age >= 0 && age < NEW_FOR_MS;
}

/** When the first New tag among these plans should go, or null if none has
 * one. */
export function nextExpiry(
  plans: Pick<PlanSummary, "created">[],
  now: number,
): number | null {
  let next: number | null = null;
  for (const plan of plans) {
    if (!isNew(plan.created, now)) continue;
    const expiry = Date.parse(plan.created!) + NEW_FOR_MS;
    if (next === null || expiry < next) next = expiry;
  }
  return next;
}

/**
 * The paths of the plans that carry a New tag. One timeout waits for the
 * first tag to go and re-renders then. It is re-armed when the plans change,
 * and nothing runs while no plan is new.
 */
export function useNewPlans(plans: PlanSummary[]): Set<string> {
  // Counted so a timeout that fires a little early arms the next one.
  const [expired, setExpired] = useState(0);
  const now = Date.now();
  const expiry = nextExpiry(plans, now);
  useEffect(() => {
    if (expiry === null) return;
    const timer = setTimeout(
      () => setExpired((count) => count + 1),
      expiry - Date.now(),
    );
    return () => clearTimeout(timer);
  }, [expiry, expired]);
  return new Set(
    plans.filter((plan) => isNew(plan.created, now)).map((plan) => plan.path),
  );
}
