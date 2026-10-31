import table from "../../src-tauri/crates/openplan-core/src/person_roles.json";
import { PERSONAS, spokenList, type Role } from "./work";

/** What the person does, picked in onboarding. */
export type PersonRoleId = "engineer" | "designer" | "product" | "lead" | "founder" | "other";

/** In the field's own terms, or without jargon. */
export type Voice = "deep" | "plain";

export interface PanelMember {
  role: Role;
  voice: Voice;
}

/** One card on the role picker and the four reviewers it brings. */
export interface PersonRole {
  id: PersonRoleId;
  label: string;
  hint: string;
  /** Completes "The person is ...", for the agent. */
  who: string;
  panel: PanelMember[];
  /** The panel member who asks about each required area. */
  owners: Record<string, Role>;
}

/** In the order the cards show. The agent reads the same file. */
export const PERSON_ROLES = table.roles as PersonRole[];

export function personRole(id: PersonRoleId): PersonRole {
  return PERSON_ROLES.find((role) => role.id === id)!;
}

/** One line under the panel that says who goes into depth. */
export function panelCaption(id: PersonRoleId): string {
  const names = (voice: Voice) =>
    personRole(id)
      .panel.filter((member) => member.voice === voice)
      .map((member) => PERSONAS[member.role].name);
  const deep = names("deep");
  const plain = names("plain");
  if (deep.length === 0) return `${spokenList(plain)} ask the essentials, in plain words.`;
  if (plain.length === 0) return `${spokenList(deep)} all go into depth. You make every call.`;
  const keeps = plain.length === 1 ? "keeps" : "keep";
  return `${spokenList(deep)} go into depth. ${spokenList(plain)} ${keeps} to plain words.`;
}
