import { invoke } from "@tauri-apps/api/core";
import type { ReviewSummary } from "./board";
import type { Identity } from "./comments";
import { isTauri } from "./platform";

/** Who did something: an agent by its tool name, or the person using
 * OpenPlan. Also names whoever wrote a revision or closed a comment thread. */
export const SOURCE_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  manual: "You",
  user: "You",
  import: "Imported",
};

/** Where a plan stands. Stored in the plan, and the one field anyone sets. */
export type Status =
  | "draft"
  | "alignment"
  | "in-progress"
  | "in-review"
  | "completed"
  | "archived";

/** The order work moves through them: the board's columns and the picker. */
export const STATUS_FLOW: Status[] = [
  "draft",
  "alignment",
  "in-progress",
  "in-review",
  "completed",
  "archived",
];

/** The order lists group them in: what is moving first, what is put away
 * last. */
export const STATUS_ORDER: Status[] = [
  "in-progress",
  "alignment",
  "in-review",
  "draft",
  "completed",
  "archived",
];

export const STATUS_LABELS: Record<Status, string> = {
  draft: "Draft",
  alignment: "Alignment",
  "in-progress": "In progress",
  "in-review": "In review",
  completed: "Completed",
  archived: "Archived",
};

/** What each state means, for the one place that has room to say it. */
export const STATUS_HINTS: Record<Status, string> = {
  draft: "Filed. No session has started on it.",
  alignment: "The agent is asking you its questions. Answer them in your session.",
  "in-progress": "A session is working on it.",
  "in-review": "A pull request is open. It waits on you.",
  completed: "You marked the work done.",
  archived: "Done and put away.",
};

/** The agent moves a plan into these, and the server guards each move. The
 * person steers them through comments and alignment instead. */
const AGENT_STATUSES: Status[] = ["in-progress", "in-review"];

export function personCanSet(status: Status): boolean {
  return !AGENT_STATUSES.includes(status);
}

export interface PlanSummary {
  id: string;
  title: string;
  status: Status;
  /** What kind of work it is: feature, bug, migration, research, audit. */
  type: string | null;
  source: string;
  /** The folders the person filed it under. Empty for none. */
  folders: string[];
  /** The pull request a plan from before 0.3.0 went out in. */
  pr: string | null;
  created: string | null;
  updated: string | null;
  /** When it was marked completed. Null for any other status. */
  completed: string | null;
  /** One of the plans onboarding writes to show the app. Agents never see
   * it. */
  demo: boolean;
  path: string;
  relativePath: string;
  /** A set's documents, in reading order. Empty for a single-file plan. */
  documents: string[];
}

export interface BaseInfo {
  root: string;
}

export interface Standards {
  /** What ships with the app. */
  builtIn: string;
  /** What this person added, layered on top. */
  overrides: string | null;
}

export interface Revision {
  id: string;
  author: string;
  /** Seconds since the epoch, as git records them. */
  timestamp: number;
  message: string;
}

export interface DiffLine {
  /** ' ' context, '+' added since the revision, '-' removed since it. */
  origin: string;
  text: string;
  oldLine: number | null;
  newLine: number | null;
}

export interface SearchHit {
  path: string;
  title: string;
  line: number;
  text: string;
}

/** Who this machine's changes belong to. Null in the browser build. */
export async function getIdentity(): Promise<Identity | null> {
  if (!isTauri) return null;
  return invoke<Identity>("app_identity");
}

/** A blank field falls back to the git config. Returns the fresh identity. */
export async function setProfile(name: string, email: string): Promise<Identity> {
  return invoke<Identity>("set_profile", { name, email });
}

export async function setAvatar(path: string): Promise<Identity> {
  return invoke<Identity>("set_avatar", { path });
}

export async function clearAvatar(): Promise<Identity> {
  return invoke<Identity>("clear_avatar");
}

/** Whether the typed name or email differs from what is saved. */
export function profileChanged(identity: Identity | null, name: string, email: string): boolean {
  if (!identity) return false;
  return name.trim() !== identity.name || email.trim() !== identity.email;
}

export async function getBase(): Promise<BaseInfo | null> {
  if (!isTauri) return null;
  return invoke<BaseInfo>("get_base");
}

export async function getStandards(): Promise<Standards | null> {
  if (!isTauri) return null;
  return invoke<Standards>("get_standards");
}

export async function setStandardsOverrides(text: string): Promise<void> {
  if (!isTauri) return;
  await invoke<void>("set_standards_overrides", { text });
}

/** How agents write plan bodies. Markdown unless the person picked HTML. */
export type Authoring = "markdown" | "html";

export const AUTHORING_ORDER: Authoring[] = ["markdown", "html"];

export const AUTHORING_LABELS: Record<Authoring, string> = {
  markdown: "Markdown, compact",
  html: "HTML, richer pages",
};

export async function getAuthoring(): Promise<Authoring> {
  if (!isTauri) return "markdown";
  return invoke<Authoring>("get_authoring");
}

export async function setAuthoring(mode: Authoring): Promise<void> {
  if (!isTauri) return;
  await invoke<void>("set_authoring", { mode });
}

/** Settings the app reads once at startup and again after a change. */
export interface Preferences {
  /** Whether agents may add videos and interactive pieces. */
  media: boolean;
  /** Whether a send starts the agent's turn in an idle session. */
  wake: boolean;
  /** Days a completed plan waits before it is archived. 0 means never. */
  archiveAfterDays: number;
  /** The alignment score, as a percentage, the person aims for before
   * Build. Build waits for it. 0 means none. */
  alignmentTarget: number;
  /** Whether the app looks for a new version at launch and on focus. */
  checkUpdates: boolean;
}

const BROWSER_PREFERENCES: Preferences = {
  media: true,
  wake: true,
  archiveAfterDays: 7,
  alignmentTarget: 80,
  checkUpdates: true,
};

export async function getPreferences(): Promise<Preferences> {
  if (!isTauri) return BROWSER_PREFERENCES;
  return invoke<Preferences>("preferences");
}

export async function setMedia(on: boolean): Promise<void> {
  if (!isTauri) return;
  await invoke<void>("set_media", { on });
}

export async function setArchiveAfterDays(days: number): Promise<void> {
  if (!isTauri) return;
  await invoke<void>("set_archive_after_days", { days });
}

export async function setAlignmentTarget(percent: number): Promise<void> {
  if (!isTauri) return;
  await invoke<void>("set_alignment_target", { percent });
}

export async function setCheckUpdates(on: boolean): Promise<void> {
  if (!isTauri) return;
  await invoke<void>("set_check_updates", { on });
}

/** Archives plans completed longer ago than the setting, and says how many. */
export async function archiveStale(): Promise<number> {
  if (!isTauri) return 0;
  return invoke<number>("archive_stale");
}

export async function setWake(on: boolean): Promise<void> {
  if (!isTauri) return;
  await invoke<void>("set_wake", { on });
}

/** Sends the plan's unsent comments and tells its sessions to start the
 * work. Returns how many heard, which is zero when nobody is on the plan. */
export async function sendBuild(path: string): Promise<number> {
  if (!isTauri) return 0;
  return invoke<number>("send_build", { path });
}

export async function scanPlans(): Promise<PlanSummary[]> {
  if (!isTauri) return [];
  return invoke<PlanSummary[]>("scan_plans");
}

/** What is open and what is waiting, per plan, in one read of the base. */
export async function reviewSummaries(): Promise<ReviewSummary[]> {
  if (!isTauri) return [];
  return invoke<ReviewSummary[]>("review_summaries");
}

/** An agent session working right now, and the plans it said it is on. */
export interface LiveSession {
  id: string;
  /** The agent that connected: claude-code, codex, cursor. */
  client: string;
  /** Plan ids, not paths. */
  plans: string[];
  since: string;
}

export async function liveSessions(): Promise<LiveSession[]> {
  if (!isTauri) return [];
  return invoke<LiveSession[]>("live_sessions");
}

/** Sends named threads to the sessions working on that plan. Returns how many
 * got them, which is zero when nobody is working on it. */
export async function sendComments(
  path: string,
  threadIds: string[],
): Promise<number> {
  if (!isTauri) return 0;
  return invoke<number>("send_comments", { path, threadIds });
}

export async function searchPlans(query: string): Promise<SearchHit[]> {
  if (!isTauri) return [];
  return invoke<SearchHit[]>("search_plans", { query });
}

export async function setPlanStatus(path: string, status: Status): Promise<void> {
  return invoke<void>("set_plan_status", { path, status });
}

/** One status for several plans, recorded as one change. */
export async function setStatuses(paths: string[], status: Status): Promise<void> {
  return invoke<void>("set_statuses", { paths, status });
}

/** Removes plans with their comments and work records, as one change. */
export async function deletePlans(paths: string[]): Promise<void> {
  return invoke<void>("delete_plans", { paths });
}

/** Replaces the folders a plan is filed under. */
export async function setFolders(path: string, folders: string[]): Promise<void> {
  return invoke<void>("set_folders", { path, folders });
}

/** The folders the person made, including ones no plan is in yet. */
export async function getBaseFolders(): Promise<string[]> {
  if (!isTauri) return [];
  return invoke<string[]>("base_folders");
}

/** Replaces the folders the person made and returns them as stored. */
export async function setBaseFolders(folders: string[]): Promise<string[]> {
  if (!isTauri) return folders;
  return invoke<string[]>("set_base_folders", { folders });
}

export async function commitBase(message: string): Promise<void> {
  if (!isTauri) return;
  await invoke<string | null>("commit_base", { message });
}

export async function planHistory(path: string): Promise<Revision[]> {
  if (!isTauri) return [];
  return invoke<Revision[]>("plan_history", { path });
}

export async function planAtRevision(path: string, revision: string): Promise<string> {
  return invoke<string>("plan_at_revision", { path, revision });
}

export async function planDiff(path: string, revision: string): Promise<DiffLine[]> {
  return invoke<DiffLine[]>("plan_diff", { path, revision });
}

/** Rewrites a plan's title. Its id, file and folder stay as they are. */
export async function renamePlan(path: string, newTitle: string): Promise<void> {
  await invoke<null>("rename_plan", { path, newTitle });
}

/** Renames one document inside a set; returns the file's new path. */
export async function renameDocument(path: string, newName: string): Promise<string> {
  return invoke<string>("rename_document", { path, newName });
}

export async function restorePlanRevision(
  path: string,
  revision: string,
): Promise<string> {
  return invoke<string>("restore_plan_revision", { path, revision });
}
