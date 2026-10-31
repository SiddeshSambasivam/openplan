import { useEffect, useState } from "react";
import { isTauri } from "@/lib/platform";
import { readWorkRecord, type WorkRecord } from "@/lib/work";

/**
 * A plan's work record, kept in step with its sidecar. Agents write it
 * through the MCP server, so it is read again on every base change, the way
 * comments are. Nothing polls.
 */
export function useWorkRecord(path: string | null): WorkRecord | null {
  const [record, setRecord] = useState<WorkRecord | null>(null);

  useEffect(() => {
    setRecord(null);
    if (!isTauri || !path) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    // A record that cannot be read shows as no record rather than an error
    // over the plan.
    const read = () =>
      void readWorkRecord(path)
        .then((next) => !cancelled && setRecord(next))
        .catch(() => !cancelled && setRecord(null));
    read();
    void (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const un = await listen("base-changed", read);
      if (cancelled) un();
      else unlisten = un;
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [path]);

  return record;
}
