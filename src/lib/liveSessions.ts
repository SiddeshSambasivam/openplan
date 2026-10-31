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

/** The plans that had a session in `before` and have none in `after`. */
export function plansLeft(before: Map<string, number>, after: Map<string, number>): string[] {
  return [...before.keys()].filter((plan) => !after.has(plan));
}

/** What the top bar says after a review or Build went out. With no session
 * on the plan, the next session to take it hears it. */
export function deliveryLine(sessions: number): string {
  if (sessions === 0) return "Waiting for the session. Type anything in it to deliver.";
  return `Delivered to ${sessions} ${sessions === 1 ? "session" : "sessions"}.`;
}

/** What the top bar says once a session tried to start its agent's turn.
 * A failed wake still delivers, through the hooks. */
export function wakeLine(ok: boolean): string {
  return ok ? "Agent woken." : "Couldn't wake the session. It will hear on your next message.";
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
