import { describe, expect, it } from "vitest";
import { importSources, preselected } from "./importSources";

const found = {
  agents: [
    { id: "claude-code", name: "Claude Code", installed: true, plans: ["/h/.claude/plans/a.md", "/h/.claude/plans/b.md"] },
    { id: "codex", name: "Codex", installed: true, plans: [] },
    { id: "cursor", name: "Cursor", installed: false, plans: ["/h/.cursor/plans/c.md"] },
  ],
  folders: [{ path: "/h/work/repo/plans", documents: 12, namedForPlans: true }],
};

describe("importSources", () => {
  it("lists each agent that has plans, then each folder", () => {
    expect(importSources(found).map((s) => s.key)).toEqual([
      "agent:claude-code",
      "agent:cursor",
      "/h/work/repo/plans",
    ]);
  });

  it("files an agent's plans under that agent and a folder as an import", () => {
    const [claude, , folder] = importSources(found);
    expect(claude).toMatchObject({
      kind: "agent",
      label: "Claude Code plans",
      detail: "2 plans",
      paths: found.agents[0].plans,
      source: "claude-code",
    });
    expect(folder).toMatchObject({
      kind: "folder",
      label: "repo/plans",
      detail: "12 documents",
      paths: ["/h/work/repo/plans"],
      source: "import",
      namedForPlans: true,
    });
  });

  it("counts a single plan in the singular", () => {
    expect(importSources(found)[1].detail).toBe("1 plan");
  });

  it("preselects agent plans and leaves suggested folders for the person", () => {
    expect([...preselected(importSources(found))]).toEqual([
      "agent:claude-code",
      "agent:cursor",
    ]);
  });
});
