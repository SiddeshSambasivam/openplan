import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./platform";

/** The work record beside a plan: what the agents recorded about the work. */
export interface WorkRecord {
  version: number;
  repos: Repo[];
  alignment?: Alignment;
  decisions: Decision[];
  todos: Todo[];
  prs: Pr[];
}

/** A repo without a `remote` is a plain folder. */
export interface Repo {
  path: string;
  remote?: string;
  branch?: string;
}

export interface Alignment {
  askedAt: string;
  recordedAt?: string;
  questions: Question[];
}

export interface Question {
  id: string;
  aspect: string;
  question: string;
  options: Choice[];
  recommended?: string;
  mustAnswer: boolean;
  answer?: Answer;
  answeredBy?: string;
}

export interface Choice {
  id: string;
  label: string;
  consequence?: string;
}

export type Answer =
  | { kind: "option"; options: string[] }
  | { kind: "text"; text: string }
  | { kind: "agent" };

export interface Decision {
  id: string;
  context: string;
  options: string[];
  decision: string;
  why: string;
  revisitWhen?: string;
  fromQuestion?: string;
  at: string;
  by: string;
}

export type TodoState = "open" | "doing" | "done" | "dropped";

/** `by` and `at` say who last moved the todo, and when. */
export interface Todo {
  id: string;
  text: string;
  state: TodoState;
  by: string;
  session?: string;
  at: string;
  reason?: string;
}

/** What the agent last reported. The app never fetches PR state. */
export interface Pr {
  url: string;
  repo?: string;
  branch?: string;
  todos: string[];
  state: "open" | "merged" | "closed";
  checks: "pending" | "passing" | "failing";
  review: "waiting" | "changes-requested" | "approved";
  reportedAt: string;
  by: string;
}

/** `null` means no work has been recorded for the plan yet, and always in
 * the browser build. */
export async function readWorkRecord(path: string): Promise<WorkRecord | null> {
  if (!isTauri) return null;
  return invoke<WorkRecord | null>("read_work_record", { path });
}

/** Done todos out of all todos. Dropped ones count as neither. */
export function progress(record: WorkRecord): { done: number; total: number } {
  const counted = record.todos.filter((t) => t.state !== "dropped");
  return {
    done: counted.filter((t) => t.state === "done").length,
    total: counted.length,
  };
}
