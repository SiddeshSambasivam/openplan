import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./platform";

export const PLAN_STATUSES = [
  "draft",
  "in-review",
  "approved",
  "in-progress",
  "done",
  "archived",
] as const;

export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const STATUS_LABELS: Record<PlanStatus, string> = {
  draft: "Draft",
  "in-review": "In review",
  approved: "Approved",
  "in-progress": "In progress",
  done: "Done",
  archived: "Archived",
};

/** Where a plan came from — an agent's name, or the person using OpenPlan. */
export const SOURCE_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  manual: "You",
  import: "Imported",
};

export interface PlanSummary {
  id: string;
  title: string;
  status: PlanStatus;
  source: string;
  project: string | null;
  created: string | null;
  updated: string | null;
  path: string;
  relativePath: string;
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

export interface SearchHit {
  path: string;
  title: string;
  line: number;
  text: string;
}

export function isPlanStatus(value: string): value is PlanStatus {
  return (PLAN_STATUSES as readonly string[]).includes(value);
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

export async function scanPlans(): Promise<PlanSummary[]> {
  if (!isTauri) return [];
  return invoke<PlanSummary[]>("scan_plans");
}

export async function searchPlans(query: string): Promise<SearchHit[]> {
  if (!isTauri) return [];
  return invoke<SearchHit[]>("search_plans", { query });
}

export async function setPlanStatus(path: string, status: PlanStatus): Promise<void> {
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

export async function restorePlanRevision(
  path: string,
  revision: string,
): Promise<string> {
  return invoke<string>("restore_plan_revision", { path, revision });
}
