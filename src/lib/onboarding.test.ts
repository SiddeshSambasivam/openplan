import { describe, expect, it } from "vitest";
import {
  canContinue,
  DEMO_FOLDER,
  detectAgents,
  finishOnboarding,
  installTools,
  litBars,
  onboardingKey,
  pickedByDefault,
  setupSettled,
  setupStep,
  startOnboarding,
  step,
  togglePick,
  waitingRows,
  type InstallEvent,
  type OnboardingEvent,
  type OnboardingState,
} from "./onboarding";

const AGENTS = [
  { id: "claude-code", name: "Claude Code", installed: true },
  { id: "codex", name: "Codex", installed: true },
  { id: "cursor", name: "Cursor", installed: false },
];

function run(state: OnboardingState, ...events: OnboardingEvent[]): OnboardingState {
  return events.reduce(step, state);
}

const next: OnboardingEvent = { type: "next" };
const back: OnboardingEvent = { type: "back" };
const skip: OnboardingEvent = { type: "skip" };

/** On the agents screen, with the tools detected. */
function atAgents(): OnboardingState {
  return run(
    startOnboarding(),
    { type: "detected", agents: AGENTS },
    next,
    next,
    { type: "pickRole", role: "designer" },
    next,
  );
}

describe("step", () => {
  it("walks welcome, name, role, agents, setup and finish in order", () => {
    const seen: string[] = [];
    let state = run(startOnboarding(), { type: "detected", agents: AGENTS });
    seen.push(state.step);
    for (const event of [next, next, { type: "pickRole", role: "engineer" }, next, next] as OnboardingEvent[]) {
      state = step(state, event);
      if (seen[seen.length - 1] !== state.step) seen.push(state.step);
    }
    state = run(
      state,
      { type: "installed", tool: "claude-code", steps: [] },
      { type: "installed", tool: "codex", steps: [] },
      next,
    );
    seen.push(state.step);
    expect(seen).toEqual(["welcome", "name", "role", "agents", "setup", "finish"]);
  });

  it("starts with the detected tools picked and the missing ones not", () => {
    expect(atAgents().picked).toEqual(["claude-code", "codex"]);
  });

  it("keeps Continue locked on the role screen until a role is picked", () => {
    const atRole = run(startOnboarding(), next, next);
    expect(atRole.step).toBe("role");
    expect(canContinue(atRole)).toBe(false);
    expect(step(atRole, next).step).toBe("role");

    const picked = step(atRole, { type: "pickRole", role: "founder" });
    expect(canContinue(picked)).toBe(true);
    expect(step(picked, next).step).toBe("agents");
  });

  it("skips a step and leaves its answer out", () => {
    const named = run(startOnboarding(), next, { type: "name", name: "Sid" });
    const skippedName = step(named, skip);
    expect(skippedName).toMatchObject({ step: "role", name: "" });

    const picked = step(skippedName, { type: "pickRole", role: "lead" });
    expect(step(picked, skip)).toMatchObject({ step: "agents", role: null });

    expect(step(atAgents(), skip).step).toBe("finish");
  });

  it("goes straight to the end when no agent is picked", () => {
    const none = run(atAgents(), { type: "toggleAgent", id: "claude-code" }, { type: "toggleAgent", id: "codex" });
    expect(none.picked).toEqual([]);
    expect(step(none, next).step).toBe("finish");
  });

  it("never picks a tool that is not installed", () => {
    expect(step(atAgents(), { type: "toggleAgent", id: "cursor" }).picked).toEqual(["claude-code", "codex"]);
  });

  it("goes back one screen, but not from the welcome or the last screen", () => {
    expect(step(startOnboarding(), back).step).toBe("welcome");
    expect(step(atAgents(), back).step).toBe("role");
    const finished = step(atAgents(), skip);
    expect(step(finished, back).step).toBe("finish");
  });

  it("holds Continue on setup until every tool has finished, failed or not", () => {
    const setup = step(atAgents(), next);
    expect(setup.step).toBe("setup");
    expect(setup.setup.map((row) => [row.tool, row.status])).toEqual([
      ["claude-code", "waiting"],
      ["codex", "waiting"],
    ]);
    expect(canContinue(setup)).toBe(false);

    const running = step(setup, { type: "installing", tool: "claude-code" });
    expect(step(running, back).step).toBe("setup");
    expect(step(running, next).step).toBe("setup");

    const settled = run(
      running,
      { type: "failed", tool: "claude-code", error: "Couldn't find the `claude` command." },
      { type: "installed", tool: "codex", steps: [{ label: "Register", done: true, detail: "registered" }] },
    );
    expect(settled.setup.map((row) => row.status)).toEqual(["failed", "ready"]);
    expect(canContinue(settled)).toBe(true);
    expect(step(settled, next).step).toBe("finish");
  });

  it("retries a failed row and clears its error", () => {
    const failed = run(
      atAgents(),
      next,
      { type: "failed", tool: "claude-code", error: "No luck" },
      { type: "installing", tool: "claude-code" },
    );
    expect(failed.setup[0]).toMatchObject({ status: "running", error: undefined });
  });

  it("lights one more bar per screen after the welcome", () => {
    expect(litBars("welcome")).toBe(0);
    expect(litBars("name")).toBe(1);
    expect(litBars("agents")).toBe(3);
    expect(litBars("setup")).toBe(4);
    expect(litBars("finish")).toBe(4);
  });
});

describe("onboardingKey", () => {
  it("reads Enter as the main button and Escape as Back", () => {
    expect(onboardingKey(atAgents(), "Enter", false)).toEqual(next);
    expect(onboardingKey(atAgents(), "Escape", false)).toEqual(back);
    expect(onboardingKey(atAgents(), "Enter", true)).toEqual(next);
  });

  it("picks a role with 1 to 6", () => {
    const atRole = run(startOnboarding(), next, next);
    expect(onboardingKey(atRole, "2", false)).toEqual({ type: "pickRole", role: "designer" });
    expect(onboardingKey(atRole, "6", false)).toEqual({ type: "pickRole", role: "other" });
    expect(onboardingKey(atRole, "7", false)).toBeNull();
  });

  it("toggles an agent with 1 to 3", () => {
    expect(onboardingKey(atAgents(), "2", false)).toEqual({ type: "toggleAgent", id: "codex" });
    expect(onboardingKey(atAgents(), "4", false)).toBeNull();
  });

  it("leaves digits alone while the person is typing or on other screens", () => {
    const atName = run(startOnboarding(), next);
    expect(onboardingKey(atName, "1", true)).toBeNull();
    expect(onboardingKey(atName, "1", false)).toBeNull();
  });
});

describe("installTools", () => {
  it("installs each tool in turn, and one failure does not stop the rest", async () => {
    const events: OnboardingEvent[] = [];
    const install = async (tool: string) => {
      if (tool === "claude-code") throw "Couldn't find the `claude` command.";
      return [{ label: `Set up ${tool}`, done: true, detail: "registered" }];
    };

    await installTools(["claude-code", "codex"], install, (event) => events.push(event));

    expect(events).toEqual([
      { type: "installing", tool: "claude-code" },
      { type: "failed", tool: "claude-code", error: "Couldn't find the `claude` command." },
      { type: "installing", tool: "codex" },
      { type: "installed", tool: "codex", steps: [{ label: "Set up codex", done: true, detail: "registered" }] },
    ]);
  });
});

describe("agent setup outside onboarding", () => {
  it("lists what discovery found, with only the installed tools picked", async () => {
    const call = async () => ({
      agents: AGENTS.map((agent) => ({ ...agent, plans: ["/plans/a.md"] })),
      folders: [],
    });

    const agents = await detectAgents(call);

    expect(agents).toEqual(AGENTS);
    expect(pickedByDefault(agents)).toEqual(["claude-code", "codex"]);
  });

  it("toggles a card in card order, and never picks a missing tool", () => {
    expect(togglePick(AGENTS, ["codex"], "claude-code")).toEqual(["claude-code", "codex"]);
    expect(togglePick(AGENTS, ["claude-code", "codex"], "codex")).toEqual(["claude-code"]);
    expect(togglePick(AGENTS, ["codex"], "cursor")).toEqual(["codex"]);
  });

  it("runs the same installs onboarding does, then a Retry on the failed row", async () => {
    let rows = waitingRows(["claude-code", "codex"]);
    let attempts = 0;
    const install = async (tool: string) => {
      if (tool === "claude-code" && attempts++ === 0) throw "Couldn't find the `claude` command.";
      return [{ label: `Set up ${tool}`, done: true, detail: "registered" }];
    };
    const report = (event: InstallEvent) => {
      rows = setupStep(rows, event);
    };

    expect(setupSettled(rows)).toBe(false);
    await installTools(["claude-code", "codex"], install, report);
    expect(rows.map((row) => [row.tool, row.status, row.error])).toEqual([
      ["claude-code", "failed", "Couldn't find the `claude` command."],
      ["codex", "ready", undefined],
    ]);
    expect(setupSettled(rows)).toBe(true);

    await installTools(["claude-code"], install, report);
    expect(rows[0]).toMatchObject({ status: "ready", error: undefined });
    expect(rows[0].steps).toEqual([{ label: "Set up claude-code", done: true, detail: "registered" }]);
  });
});

describe("finishOnboarding", () => {
  it("saves the name and role, seeds the demo and asks for the board on the Demo folder", async () => {
    const calls: [string, unknown][] = [];
    const call = async (command: string, args?: Record<string, unknown>) => {
      calls.push([command, args]);
      return [];
    };

    const result = await finishOnboarding(call, " Sid ", "designer");

    expect(calls).toEqual([
      ["complete_onboarding", { name: "Sid", role: "designer" }],
      ["seed_demo", undefined],
    ]);
    expect(result).toEqual({ name: "Sid", role: "designer", folder: DEMO_FOLDER, startTour: true });
    expect(DEMO_FOLDER).toBe("Demo");
  });

  it("sends nothing for a skipped name or role", async () => {
    const calls: [string, unknown][] = [];
    const call = async (command: string, args?: Record<string, unknown>) => {
      calls.push([command, args]);
      return [];
    };

    const result = await finishOnboarding(call, "  ", null);

    expect(calls[0]).toEqual(["complete_onboarding", { name: null, role: null }]);
    expect(result).toMatchObject({ name: null, role: null });
  });

  it("still opens the board when the demo cannot be written, without the tour", async () => {
    const call = async (command: string) => {
      if (command === "seed_demo") throw "Couldn't write the demo plans.";
      return null;
    };

    const result = await finishOnboarding(call, "Sid", null);

    expect(result).toMatchObject({ folder: null, startTour: false });
  });
});
