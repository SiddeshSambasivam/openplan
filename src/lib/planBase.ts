import { invoke } from "@tauri-apps/api/core";
import type { ReviewSummary } from "./board";
import type { Identity } from "./comments";
import { isTauri } from "./platform";

/** Where a plan came from — an agent's name, or the person using OpenPlan. */
export const SOURCE_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  manual: "You",
  import: "Imported",
};

/** Where a plan stands. Stored in the plan, and the one field anyone sets. */
export type Status = "draft" | "in-progress" | "in-review" | "completed";

/** The order groups and columns show them in: what is moving first. */
export const STATUS_ORDER: Status[] = ["in-progress", "in-review", "draft", "completed"];

export const STATUS_LABELS: Record<Status, string> = {
  draft: "Draft",
  "in-progress": "In progress",
  "in-review": "In review",
  completed: "Completed",
};

/** What each state means, for the one place that has room to say it. */
export const STATUS_HINTS: Record<Status, string> = {
  draft: "Filed. No session has started on it.",
  "in-progress": "A session is working on it.",
  "in-review": "A pull request is open. It waits on you.",
  completed: "You marked the work done.",
};

export interface PlanSummary {
  id: string;
  title: string;
  status: Status;
  /** What kind of work it is: feature, bug, migration, research, audit. */
  type: string | null;
  source: string;
  project: string | null;
  /** The pull request the work went out in. */
  pr: string | null;
  created: string | null;
  updated: string | null;
  path: string;
  relativePath: string;
  /** A set's documents, in reading order. Empty for a single-file plan. */
  documents: string[];
}

export interface ProjectInfo {
  /** The normalised remote, or null for the plans that name no project. */
  project: string | null;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  plans: number;
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

export async function scanPlans(): Promise<PlanSummary[]> {
  if (!isTauri) return [];
  return invoke<PlanSummary[]>("scan_plans");
}

export async function listProjects(): Promise<ProjectInfo[]> {
  if (!isTauri) return [];
  return invoke<ProjectInfo[]>("list_projects");
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

export async function renamePlan(path: string, newTitle: string): Promise<string> {
  return invoke<string>("rename_plan", { path, newTitle });
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
