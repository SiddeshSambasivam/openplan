import { invoke } from "@tauri-apps/api/core";
import table from "../../src-tauri/crates/openplan-core/src/person_roles.json";
import type { Invoke } from "./onboarding";
import { isTauri } from "./platform";
import { DEFAULT_PANEL, PERSONAS, spokenList, type Role } from "./work";

/** What the person does, picked in onboarding. */
export type PersonRoleId = "engineer" | "designer" | "product" | "lead" | "founder" | "other";

/** One card on the role picker and the four reviewers it brings. */
export interface PersonRole {
  id: PersonRoleId;
  label: string;
  hint: string;
  /** Completes "The person is ...", for the agent. */
  who: string;
  /** The question roles that ask this person, in the order they show. */
  panel: Role[];
  /** The panel member who asks about each required area. */
  owners: Record<string, Role>;
}

/** In the order the cards show. The agent reads the same file. */
export const PERSON_ROLES = table.roles as PersonRole[];

export function personRole(id: PersonRoleId): PersonRole {
  return PERSON_ROLES.find((role) => role.id === id)!;
}

/** The question roles that ask this person, in the panel's order. No role,
 * or one from a newer version, gets the default panel. */
export function panelFor(id: string | null | undefined): Role[] {
  const role = PERSON_ROLES.find((known) => known.id === id);
  return role ? role.panel : DEFAULT_PANEL;
}

/** The role in the person's settings, null for none, or undefined when it
 * cannot be read. */
export async function readRole(): Promise<string | null | undefined> {
  if (!isTauri) return undefined;
  const settings = await invoke<{ role?: string | null }>("app_settings").catch(() => null);
  return settings ? (settings.role ?? null) : undefined;
}

/** The person's panel, from their settings. */
export async function readPanel(): Promise<Role[]> {
  return panelFor(await readRole());
}

/** Saves the person's role. None puts back the panel people had before
 * roles. */
export async function saveRole(call: Invoke, role: PersonRoleId | null): Promise<void> {
  await call("set_role", { role });
}

/** Only a person known to have no role is asked to pick one. */
export function showsRoleHint(role: string | null | undefined): boolean {
  return role === null;
}

/** One line under the panel that names it. */
export function panelCaption(id: PersonRoleId): string {
  const names = personRole(id).panel.map((role) => PERSONAS[role].name);
  return `${spokenList(names)} review every plan you write.`;
}
