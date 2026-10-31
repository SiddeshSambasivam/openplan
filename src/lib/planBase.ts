import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./platform";

/** Where a plan came from — an agent's name, or the person using OpenPlan. */
export const SOURCE_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  manual: "You",
  import: "Imported",
};

/** The one tag with an opinion attached: the sidebar tucks these away. */
export const ARCHIVED_TAG = "archived";

export function isArchived(plan: PlanSummary): boolean {
  return plan.tags.includes(ARCHIVED_TAG);
}

export interface PlanSummary {
  id: string;
  title: string;
  /** Free labels, shared by the user and their agents. */
  tags: string[];
  source: string;
  project: string | null;
  created: string | null;
  updated: string | null;
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

export interface SearchHit {
  path: string;
  title: string;
  line: number;
  text: string;
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

export async function setPlanTags(path: string, tags: string[]): Promise<void> {
  return invoke<void>("set_plan_tags", { path, tags });
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
