import { STORAGE_PREFIX } from "./storage";

/** The Linux package a copy that cannot update itself was installed from. */
export type PackageKind = "deb" | "rpm";

/** Where finding and installing a new version stands. */
export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "upToDate" }
  | { kind: "available"; version: string }
  /** `percent` is null while the size of the download is unknown. */
  | { kind: "downloading"; version: string; percent: number | null }
  | { kind: "installing"; version: string }
  | { kind: "checkFailed" }
  | { kind: "installFailed"; version: string }
  /** `downloadUrl` is null when the manifest names no Linux download. */
  | { kind: "packageInstall"; version: string; downloadUrl: string | null };

/** What a check needs from a found update. */
export interface FoundUpdate {
  version: string;
  rawJson: Record<string, unknown>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** At launch, and on focus once a day has passed, so no timer runs. */
export function shouldAutoCheck({
  enabled,
  inApp,
  isDebug,
  lastCheckedAt,
  now,
  reason,
}: {
  enabled: boolean;
  inApp: boolean;
  isDebug: boolean;
  lastCheckedAt: number | null;
  now: number;
  reason: "launch" | "focus";
}): boolean {
  if (!enabled || !inApp || isDebug) return false;
  if (reason === "launch") return true;
  return lastCheckedAt == null || now - lastCheckedAt > DAY_MS;
}

export function updateMessage(state: UpdateState): string | null {
  switch (state.kind) {
    case "idle":
      return null;
    case "checking":
      return "Checking…";
    case "upToDate":
      return "You have the latest version.";
    case "available":
      return `Version ${state.version} is ready.`;
    case "downloading":
      return state.percent == null ? "Downloading…" : `Downloading ${state.percent}%`;
    case "installing":
      return "Installing…";
    case "checkFailed":
      return "Couldn't check for updates. Try again later.";
    case "installFailed":
      return "Couldn't install the update. Try again.";
    case "packageInstall":
      return "This copy can't update itself. Download the new version.";
  }
}

/** What the top bar says. Null for the states only Settings shows. */
export function noticeText(state: UpdateState): string | null {
  switch (state.kind) {
    case "available":
      return `OpenPlan ${state.version} is ready`;
    case "packageInstall":
      return `OpenPlan ${state.version} is ready. This copy can't update itself.`;
    case "downloading":
    case "installing":
    case "installFailed":
      return updateMessage(state);
    default:
      return null;
  }
}

/** Windows runs the installer with the app closed. */
export function installTooltip(windows: boolean): string {
  return windows
    ? "OpenPlan closes and reopens to install."
    : "OpenPlan restarts to install.";
}

export function downloadPercent(received: number, total: number | undefined): number | null {
  if (!total) return null;
  return Math.min(100, Math.floor((received / total) * 100));
}

/** The package sits beside the AppImage the manifest names for Linux. */
export function packageDownloadUrl(
  manifest: Record<string, unknown>,
  version: string,
  kind: PackageKind,
): string | null {
  const platforms = manifest.platforms as Record<string, { url?: unknown }> | undefined;
  const appImage = platforms?.["linux-x86_64"]?.url;
  if (typeof appImage !== "string") return null;
  const file =
    kind === "rpm" ? `OpenPlan-${version}-1.x86_64.rpm` : `OpenPlan_${version}_amd64.deb`;
  try {
    return new URL(file, appImage).href;
  } catch {
    return null;
  }
}

/** The state a check ends in. Any error from the check reads as a failed check. */
export async function checkOutcome(
  check: () => Promise<FoundUpdate | null>,
  packageKind: PackageKind | null,
): Promise<UpdateState> {
  let found: FoundUpdate | null;
  try {
    found = await check();
  } catch {
    return { kind: "checkFailed" };
  }
  if (!found) return { kind: "upToDate" };
  if (!packageKind) return { kind: "available", version: found.version };
  return {
    kind: "packageInstall",
    version: found.version,
    downloadUrl: packageDownloadUrl(found.rawJson, found.version, packageKind),
  };
}

const LAST_CHECKED_KEY = `${STORAGE_PREFIX}updates-last-checked`;

/** A per-machine convenience: losing it only means one extra check. */
export function loadLastCheckedAt(storage: Storage = localStorage): number | null {
  try {
    const value = Number(storage.getItem(LAST_CHECKED_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function saveLastCheckedAt(time: number, storage: Storage = localStorage): void {
  try {
    storage.setItem(LAST_CHECKED_KEY, String(time));
  } catch {
    // best-effort
  }
}
