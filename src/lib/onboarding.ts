import { setOpenAtLogin } from "./openAtLogin";
import { PERSON_ROLES, type PersonRoleId } from "./personRoles";

export const ONBOARDING_STEPS = ["welcome", "name", "role", "agents", "setup", "finish"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** The folder the demo plans are filed in. */
export const DEMO_FOLDER = "Demo";

/** An agent tool OpenPlan can connect. */
export interface AgentOption {
  id: string;
  name: string;
  installed: boolean;
}

/** One thing an install did, as `install_tool` reports it. */
export interface InstallStep {
  label: string;
  done: boolean;
  detail: string;
}

export type SetupStatus = "waiting" | "running" | "ready" | "failed";

/** One picked tool on the setup screen. */
export interface SetupRow {
  tool: string;
  status: SetupStatus;
  steps: InstallStep[];
  error?: string;
}

export interface OnboardingState {
  step: OnboardingStep;
  name: string;
  role: PersonRoleId | null;
  agents: AgentOption[];
  /** The tools to set up, in the order the cards show. */
  picked: string[];
  setup: SetupRow[];
}

/** What an install reports about one tool. */
export type InstallEvent =
  | { type: "installing"; tool: string }
  | { type: "installed"; tool: string; steps: InstallStep[] }
  | { type: "failed"; tool: string; error: string };

export type OnboardingEvent =
  | InstallEvent
  | { type: "next" }
  | { type: "skip" }
  | { type: "back" }
  | { type: "name"; name: string }
  | { type: "pickRole"; role: PersonRoleId }
  | { type: "toggleAgent"; id: string }
  | { type: "detected"; agents: AgentOption[] };

/** What onboarding hands the app when the person opens their board. */
export interface OnboardingResult {
  name: string | null;
  role: PersonRoleId | null;
  /** The folder the board opens on, or none when the demo could not be written. */
  folder: string | null;
  /** The tour reads this once the board is up. */
  startTour: boolean;
}

export type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

export function startOnboarding(): OnboardingState {
  return { step: "welcome", name: "", role: null, agents: [], picked: [], setup: [] };
}

/** Where one event leaves onboarding. An event the screen does not take
 * changes nothing. */
export function step(state: OnboardingState, event: OnboardingEvent): OnboardingState {
  switch (event.type) {
    case "next":
      return canContinue(state) ? forward(state) : state;
    case "skip":
      return skipped(state);
    case "back":
      return backward(state);
    case "name":
      return { ...state, name: event.name };
    case "pickRole":
      return { ...state, role: event.role };
    case "toggleAgent":
      return { ...state, picked: togglePick(state.agents, state.picked, event.id) };
    case "detected":
      return { ...state, agents: event.agents, picked: pickedByDefault(event.agents) };
    case "installing":
    case "installed":
    case "failed":
      return { ...state, setup: setupStep(state.setup, event) };
  }
}

/** Whether the main button does anything yet. */
export function canContinue(state: OnboardingState): boolean {
  if (state.step === "role") return state.role != null;
  if (state.step === "setup") return setupSettled(state.setup);
  return true;
}

/** Bars lit in the four-bar progress line. */
export function litBars(at: OnboardingStep): number {
  return Math.min(ONBOARDING_STEPS.indexOf(at), 4);
}

/** The event a key press means on the current screen, if any. Digits are
 * left to a text field while the person types in it. */
export function onboardingKey(
  state: OnboardingState,
  key: string,
  typing: boolean,
): OnboardingEvent | null {
  if (key === "Enter") return { type: "next" };
  if (key === "Escape") return { type: "back" };
  if (typing || !/^[1-9]$/.test(key)) return null;
  const index = Number(key) - 1;
  if (state.step === "role" && index < PERSON_ROLES.length) {
    return { type: "pickRole", role: PERSON_ROLES[index].id };
  }
  if (state.step === "agents" && index < state.agents.length) {
    return { type: "toggleAgent", id: state.agents[index].id };
  }
  return null;
}

/** The agent tools OpenPlan can connect, and whether each is on this machine. */
export async function detectAgents(call: Invoke): Promise<AgentOption[]> {
  return (await call("detect_agents")) as AgentOption[];
}

/** Every tool on this machine starts picked. */
export function pickedByDefault(agents: AgentOption[]): string[] {
  return agents.filter((agent) => agent.installed).map((agent) => agent.id);
}

/** The picks after one card is pressed, in the order the cards show. A tool
 * that is not installed cannot be picked. */
export function togglePick(agents: AgentOption[], picked: string[], id: string): string[] {
  if (!agents.some((agent) => agent.id === id && agent.installed)) return picked;
  const on = !picked.includes(id);
  return agents.map((agent) => agent.id).filter((each) => (each === id ? on : picked.includes(each)));
}

/** One row per tool, each waiting its turn. */
export function waitingRows(tools: string[]): SetupRow[] {
  return tools.map((tool) => ({ tool, status: "waiting", steps: [] }));
}

/** Where one install event leaves the setup rows. A retry clears the
 * row's error. */
export function setupStep(rows: SetupRow[], event: InstallEvent): SetupRow[] {
  const change: Partial<SetupRow> =
    event.type === "installing"
      ? { status: "running", error: undefined }
      : event.type === "installed"
        ? { status: "ready", steps: event.steps }
        : { status: "failed", error: event.error };
  return rows.map((row) => (row.tool === event.tool ? { ...row, ...change } : row));
}

/** Whether every tool has finished, ready or failed. */
export function setupSettled(rows: SetupRow[]): boolean {
  return rows.every((row) => row.status === "ready" || row.status === "failed");
}

/** Sets up each tool in turn. A tool that fails is reported and the next
 * one still runs. */
export async function installTools(
  tools: string[],
  install: (tool: string) => Promise<InstallStep[]>,
  report: (event: InstallEvent) => void,
): Promise<void> {
  for (const tool of tools) {
    report({ type: "installing", tool });
    try {
      report({ type: "installed", tool, steps: await install(tool) });
    } catch (error) {
      report({ type: "failed", tool, error: String(error) });
    }
  }
}

/** Saves who the person is and writes the demo plans. A demo that cannot
 * be written still opens the board, on every plan and with no tour. Opening
 * at login that fails is left for Settings, where its switch shows it off. */
export async function finishOnboarding(
  call: Invoke,
  name: string,
  role: PersonRoleId | null,
  openAtLogin: boolean,
): Promise<OnboardingResult> {
  const kept = name.trim() || null;
  await call("complete_onboarding", { name: kept, role });
  if (openAtLogin) await setOpenAtLogin(true).catch(() => false);
  const seeded = await call("seed_demo").then(
    () => true,
    () => false,
  );
  return { name: kept, role, folder: seeded ? DEMO_FOLDER : null, startTour: seeded };
}

function forward(state: OnboardingState): OnboardingState {
  if (state.step === "agents") {
    if (state.picked.length === 0) return { ...state, step: "finish" };
    return { ...state, step: "setup", setup: waitingRows(state.picked) };
  }
  const at = ONBOARDING_STEPS.indexOf(state.step);
  return { ...state, step: ONBOARDING_STEPS[Math.min(at + 1, ONBOARDING_STEPS.length - 1)] };
}

function skipped(state: OnboardingState): OnboardingState {
  if (state.step === "name") return { ...state, step: "role", name: "" };
  if (state.step === "role") return { ...state, step: "agents", role: null };
  if (state.step === "agents") return { ...state, step: "finish" };
  return state;
}

/** Back stops at the welcome, at the last screen, and while a tool is being
 * set up. */
function backward(state: OnboardingState): OnboardingState {
  if (state.step === "welcome" || state.step === "finish") return state;
  if (state.step === "setup" && !setupSettled(state.setup)) return state;
  return { ...state, step: ONBOARDING_STEPS[ONBOARDING_STEPS.indexOf(state.step) - 1] };
}
