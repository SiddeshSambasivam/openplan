import { useCallback, useEffect, useState } from "react";
import { liveSessions, type LiveSession } from "./planBase";
import { isTauri } from "./platform";

/** How many sessions are working on each plan, by plan id. Plans nobody is
 * working on are left out, so a lookup that misses means none. */
export function sessionCounts(sessions: LiveSession[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const session of sessions) {
    for (const plan of new Set(session.plans)) {
      counts.set(plan, (counts.get(plan) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Who is working right now. The app tells us when this changes, so nothing
 * here runs on a timer.
 */
export function useLiveSessions(): Map<string, number> {
  const [counts, setCounts] = useState<Map<string, number>>(new Map());

  const refresh = useCallback(() => {
    void liveSessions()
      .then((sessions) => setCounts(sessionCounts(sessions)))
      .catch(() => setCounts(new Map()));
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
      const un = await listen("sessions-changed", () => refresh());
      if (cancelled) un();
      else unlisten = un;
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [refresh]);

  return counts;
}
