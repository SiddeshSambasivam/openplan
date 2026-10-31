import { useCallback, useEffect, useState } from "react";
import { attentionGate } from "@/lib/attention";
import { isTauri } from "@/lib/platform";

/**
 * A function that bounces the Dock icon, or flashes the taskbar, when the
 * window is in the background. It asks once, then not again until the
 * window has been focused. It never takes focus. In a browser it does
 * nothing.
 */
export function useAttentionRequest(): () => void {
  const [gate] = useState(attentionGate);

  useEffect(() => {
    if (!isTauri) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const un = await getCurrentWindow().onFocusChanged(({ payload }) => {
        if (payload) gate.focused();
      });
      if (cancelled) un();
      else unlisten = un;
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [gate]);

  // A request that fails only means the Dock icon stays still.
  return useCallback(() => {
    if (isTauri) void requestOnce(gate).catch(() => {});
  }, [gate]);
}

async function requestOnce(gate: ReturnType<typeof attentionGate>): Promise<void> {
  const { getCurrentWindow, UserAttentionType } = await import("@tauri-apps/api/window");
  const window = getCurrentWindow();
  if (gate.take(await window.isFocused())) {
    await window.requestUserAttention(UserAttentionType.Informational);
  }
}
