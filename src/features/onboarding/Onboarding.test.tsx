import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SetupRow } from "@/lib/onboarding";
import { AgentPicker } from "./AgentPicker";
import { AgentSetup } from "./AgentSetup";
import { Onboarding } from "./Onboarding";
import { PanelPreview } from "./PanelPreview";
import { RolePicker } from "./RolePicker";

const AGENTS = [
  { id: "claude-code", name: "Claude Code", installed: true },
  { id: "codex", name: "Codex", installed: true },
  { id: "cursor", name: "Cursor", installed: false },
];

describe("Onboarding", () => {
  const html = renderToStaticMarkup(<Onboarding onDone={() => {}} />);

  it("opens on the welcome with the lockup and its key", () => {
    expect(html).toContain("OpenPlan");
    expect(html).toContain("Every plan you and your agents write, in one place.");
    expect(html).toMatch(/Get started.*↵/);
  });

  it("shows no Back on the welcome", () => {
    expect(html).not.toContain("Esc");
  });
});

describe("RolePicker", () => {
  it("shows the six roles with their keys, and the picked one checked", () => {
    const html = renderToStaticMarkup(<RolePicker value="designer" onChange={() => {}} />);
    for (const label of ["Engineer", "Designer", "Product manager", "Engineering lead", "Founder", "Something else"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain(">6</kbd>");
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
  });

  it("drops the keys and hints in its compact form", () => {
    const html = renderToStaticMarkup(<RolePicker value={null} onChange={() => {}} compact />);
    expect(html).toContain("Engineering lead");
    expect(html).not.toContain("<kbd");
    expect(html).not.toContain("I guide a team that builds");
  });
});

describe("PanelPreview", () => {
  it("names each reviewer, what they ask about and how deep", () => {
    const html = renderToStaticMarkup(<PanelPreview role="designer" />);
    expect(html).toContain("Iris · Designer");
    expect(html).toContain("Keyboard, screen readers and contrast");
    expect(html.match(/In depth/g)).toHaveLength(3);
    expect(html.match(/Plain words/g)).toHaveLength(1);
    expect(html).toContain("Iris, Noor and Ada go into depth. Theo keeps to plain words.");
  });

  it("asks for a role before one is picked", () => {
    expect(renderToStaticMarkup(<PanelPreview role={null} />)).toContain(
      "Pick a role to meet your reviewers.",
    );
  });
});

describe("AgentPicker", () => {
  const html = renderToStaticMarkup(
    <AgentPicker agents={AGENTS} picked={["claude-code"]} onToggle={() => {}} />,
  );

  it("greys out a tool that is not installed and gives it no key", () => {
    expect(html).toContain("Not installed");
    expect(html.match(/disabled=""/g)).toHaveLength(1);
    expect(html).not.toContain(">3</kbd>");
  });

  it("checks only the picked tools", () => {
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
  });
});

describe("AgentSetup", () => {
  const rows: SetupRow[] = [
    { tool: "claude-code", status: "failed", steps: [], error: "Couldn't find the `claude` command on this machine." },
    { tool: "codex", status: "ready", steps: [{ label: "Register the MCP server", done: true, detail: "registered" }] },
    { tool: "cursor", status: "running", steps: [] },
  ];
  const html = renderToStaticMarkup(
    <AgentSetup rows={rows} agentName={(id) => AGENTS.find((a) => a.id === id)!.name} onRetry={() => {}} />,
  );

  it("offers Retry only on the row that failed, with its error", () => {
    expect(html.match(/Retry/g)).toHaveLength(1);
    expect(html).toContain("Couldn&#x27;t find the `claude` command on this machine.");
  });

  it("shows each finished tool as ready with the steps it took", () => {
    expect(html).toContain("Ready");
    expect(html).toContain("Register the MCP server");
    expect(html).toContain("Setting up");
  });
});
