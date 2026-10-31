import { invoke } from "@tauri-apps/api/core";
import { createContext } from "react";
import { isTauri } from "./platform";
import type { PrSummary } from "./work";

/** What one plan's refresh found. `available` is false when the GitHub CLI
 * is missing or signed out, so nothing was read. */
export interface PrRefresh {
  checked: number;
  changed: number;
  available: boolean;
}

/** Shown on PR marks while the app cannot read PR state itself. */
export const PR_STATE_NOTE =
  "PR state is from the agent's last report. Install the GitHub CLI and sign in to keep it current.";

/** Whether the app could read PR state on its last try. True until a try
 * says otherwise. */
export const PrReadsAvailable = createContext(true);

/** Reads the plan's unmerged PRs and writes the states that moved to its
 * work record. The browser build reads nothing. */
export async function refreshPrState(path: string): Promise<PrRefresh> {
  if (!isTauri) return { checked: 0, changed: 0, available: true };
  return invoke<PrRefresh>("refresh_pr_state", { path });
}

/** A PR not yet merged can still move, so it is worth reading again. */
export function hasUnmergedPrs(prs: PrSummary | undefined): boolean {
  return prs?.reported.some((pr) => pr.state !== "merged") ?? false;
}

/** Runs `run` on every item, at most `limit` at once. One that fails does
 * not stop the rest. */
export async function runFewAtATime<T>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<unknown>,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        await run(item);
      } catch {
        // The next refresh tries it again.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
