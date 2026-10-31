import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "./platform";
import { getBase, scanPlans, type BaseInfo, type PlanSummary } from "./planBase";

/**
 * The plans in the base, kept current. The base watches itself, so a plan an
 * agent files while you are reading appears without anything being clicked.
 */
export function usePlanBase(): {
  base: BaseInfo | null;
  plans: PlanSummary[];
  refresh: () => void;
  /** Plans that appeared since the last refresh, for announcing new arrivals. */
  arrivals: PlanSummary[];
} {
  const [base, setBase] = useState<BaseInfo | null>(null);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [arrivals, setArrivals] = useState<PlanSummary[]>([]);
  const known = useRef<Set<string> | null>(null);

  const refresh = useCallback(() => {
    void scanPlans().then((next) => {
      setPlans(next);
      const paths = new Set(next.map((p) => p.path));
      // The first scan is not an arrival — everything is already there.
      if (known.current) {
        const fresh = next.filter((p) => !known.current!.has(p.path));
        if (fresh.length > 0) setArrivals(fresh);
      }
      known.current = paths;
    });
  }, []);

  useEffect(() => {
    if (!isTauri) return;
    void getBase().then(setBase);
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isTauri) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const un = await listen("base-changed", () => refresh());
      if (cancelled) un();
      else unlisten = un;
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [refresh]);

  return { base, plans, refresh, arrivals };
}
