import { useCallback, useEffect, useRef, useState } from "react";
import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";
import { isTauri } from "./platform";
import {
  checkOutcome,
  downloadPercent,
  loadLastCheckedAt,
  saveLastCheckedAt,
  shouldAutoCheck,
  type PackageKind,
  type UpdateState,
} from "./updates";

/** Debug builds and the browser never reach the updater. */
export const UPDATES_WORK = isTauri && !import.meta.env.DEV;

export interface Updates {
  state: UpdateState;
  /** An automatic check found a version and nobody said Later yet. */
  noticeShown: boolean;
  check: () => void;
  /** Downloads, installs and relaunches. Callers guard unsaved edits first. */
  install: () => void;
  later: () => void;
}

/**
 * Checks at launch and on focus once a day has passed. `save` runs after the
 * download and before the install, and returns false when edits stay
 * unsaved, which stops the install.
 */
export function useUpdates({
  enabled,
  save,
}: {
  enabled: boolean;
  save: () => Promise<boolean>;
}): Updates {
  const [state, setState] = useState<UpdateState>({ kind: "idle" });
  const [noticeShown, setNoticeShown] = useState(false);
  const found = useRef<Update | null>(null);
  const busy = useRef(false);
  const launched = useRef(false);
  const dismissed = useRef(false);

  const runCheck = useCallback(async (automatic: boolean) => {
    if (!UPDATES_WORK || busy.current) return;
    busy.current = true;
    saveLastCheckedAt(Date.now());
    if (!automatic) setState({ kind: "checking" });
    const next = await checkOutcome(() => findUpdate(found), await packageKind());
    busy.current = false;
    const foundVersion = next.kind === "available" || next.kind === "packageInstall";
    // An automatic check speaks only when it finds something.
    if (automatic && !foundVersion) return;
    setState(next);
    if (automatic && !dismissed.current) setNoticeShown(true);
  }, []);

  const check = useCallback(() => void runCheck(false), [runCheck]);

  const install = useCallback(() => {
    const update = found.current;
    if (!update || busy.current) return;
    busy.current = true;
    void installOrFail(update, save, setState).then((installed) => {
      busy.current = false;
      if (!installed) setState({ kind: "installFailed", version: update.version });
    });
  }, [save]);

  const later = useCallback(() => {
    dismissed.current = true;
    setNoticeShown(false);
  }, []);

  // Preferences arrive after the first render, so the launch check waits for
  // them. Turning the setting on later checks once, too.
  useEffect(() => {
    if (launched.current || !autoCheckAllowed(enabled, "launch")) return;
    launched.current = true;
    void runCheck(true);
  }, [enabled, runCheck]);

  useEffect(() => {
    if (!UPDATES_WORK || !enabled) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const un = await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
        if (focused && autoCheckAllowed(enabled, "focus")) void runCheck(true);
      });
      if (cancelled) un();
      else unlisten = un;
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [enabled, runCheck]);

  return { state, noticeShown, check, install, later };
}

function autoCheckAllowed(enabled: boolean, reason: "launch" | "focus"): boolean {
  return shouldAutoCheck({
    enabled,
    inApp: isTauri,
    isDebug: import.meta.env.DEV,
    lastCheckedAt: loadLastCheckedAt(),
    now: Date.now(),
    reason,
  });
}

async function findUpdate(found: { current: Update | null }): Promise<Update | null> {
  const { check } = await import("@tauri-apps/plugin-updater");
  found.current = await check();
  return found.current;
}

let packageKindAnswer: Promise<PackageKind | null> | null = null;

/** Asked once: how the app was installed does not change while it runs. */
function packageKind(): Promise<PackageKind | null> {
  packageKindAnswer ??= import("@tauri-apps/api/core")
    .then(({ invoke }) => invoke<PackageKind | null>("package_install_kind"))
    .catch(() => null);
  return packageKindAnswer;
}

/** False when any step fails, so the app keeps running this version. */
async function installOrFail(
  update: Update,
  save: () => Promise<boolean>,
  setState: (state: UpdateState) => void,
): Promise<boolean> {
  try {
    return await downloadInstallRelaunch(update, save, setState);
  } catch {
    return false;
  }
}

async function downloadInstallRelaunch(
  update: Update,
  save: () => Promise<boolean>,
  setState: (state: UpdateState) => void,
): Promise<boolean> {
  const { version } = update;
  setState({ kind: "downloading", version, percent: null });
  await update.download(progressReporter(version, setState));
  // Edits made during the download are written before anything closes.
  if (!(await save())) return false;
  setState({ kind: "installing", version });
  // Windows exits here, and its installer reopens the app.
  await update.install();
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
  return true;
}

/** Re-renders only when the whole percent changes, not on every chunk. */
function progressReporter(version: string, setState: (state: UpdateState) => void) {
  let received = 0;
  let total: number | undefined;
  let shown: number | null = null;
  return (event: DownloadEvent) => {
    if (event.event === "Started") total = event.data.contentLength;
    if (event.event === "Progress") received += event.data.chunkLength;
    const percent = downloadPercent(received, total);
    if (percent === shown) return;
    shown = percent;
    setState({ kind: "downloading", version, percent });
  };
}
