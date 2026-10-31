import { useCallback, useEffect, useRef, useState } from "react";
import { plansLeft } from "./liveSessions";
import type { PlanSummary } from "./planBase";
import { hasUnmergedPrs, refreshPrState, runFewAtATime } from "./prState";
import type { PlanProgress } from "./work";

/** Board refreshes read this many plans at once. */
const AT_ONCE = 3;

/**
 * Keeps PR state current without a timer. A plan's PRs are read again when
 * the plan opens, when its last session leaves, and on the board's Refresh.
 * What the reads write reaches the cards through the base watcher.
 */
export function usePrStateRefresh({
  plans,
  progress,
  sessions,
  openPlanPath,
}: {
  plans: PlanSummary[];
  progress: Map<string, PlanProgress>;
  /** Live sessions by plan id. */
  sessions: Map<string, number>;
  openPlanPath: string | null;
}): { available: boolean; refreshing: boolean; refreshAll: () => void } {
  const [available, setAvailable] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Read when a trigger fires, so a new card fact does not fire one.
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const plansRef = useRef(plans);
  plansRef.current = plans;

  const refreshPlan = useCallback(async (path: string) => {
    if (!hasUnmergedPrs(progressRef.current.get(path)?.prs)) return;
    const result = await refreshPrState(path).catch(() => null);
    if (result) setAvailable(result.available);
  }, []);

  useEffect(() => {
    if (openPlanPath) void refreshPlan(openPlanPath);
  }, [openPlanPath, refreshPlan]);

  const before = useRef(sessions);
  useEffect(() => {
    const left = plansLeft(before.current, sessions);
    before.current = sessions;
    for (const id of left) {
      const plan = plansRef.current.find((p) => p.id === id);
      if (plan) void refreshPlan(plan.path);
    }
  }, [sessions, refreshPlan]);

  const refreshAll = useCallback(() => {
    setRefreshing(true);
    const paths = [...progressRef.current.keys()];
    void runFewAtATime(paths, AT_ONCE, refreshPlan).finally(() => setRefreshing(false));
  }, [refreshPlan]);

  return { available, refreshing, refreshAll };
}
