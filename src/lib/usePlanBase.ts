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
  const baseKnown = useRef(false);

  const refresh = useCallback(() => {
    // Keep asking for the base until an answer sticks. The one-shot fetch
    // could lose a startup race and leave the base unknown all session,
    // which showed base documents as loose duplicate rows in the sidebar.
    if (!baseKnown.current) {
      void getBase()
        .then((found) => {
          if (found) {
            baseKnown.current = true;
            setBase(found);
          }
        })
        .catch(() => {});
    }
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
