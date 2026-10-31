import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Status } from "@/lib/planBase";
import type { Todo, TodoState, WorkRecord } from "@/lib/work";
import { PlanWork } from "./PlanWork";

const todo = (id: string, state: TodoState, extra: Partial<Todo> = {}): Todo => ({
  id,
  text: `Todo ${id}`,
  state,
  by: "claude-code",
  at: "2026-10-28T10:00:00Z",
  ...extra,
});

const record = (extra: Partial<WorkRecord> = {}): WorkRecord => ({
  version: 1,
  repos: [],
  decisions: [],
  todos: [],
  prs: [],
  ...extra,
});

function render(work: WorkRecord | null, status: Status = "in-progress"): string {
  return renderToStaticMarkup(<PlanWork record={work} status={status} />);
}

describe("PlanWork", () => {
  it("counts three todos, says who moved them, and why one was dropped", () => {
    const html = render(
      record({
        todos: [
          todo("t1", "done"),
          todo("t2", "doing"),
          todo("t3", "open"),
          todo("t4", "dropped", { reason: "Covered by the parser change" }),
        ],
      }),
    );

    expect(html).toContain("1 of 3 done");
    expect(html).toContain("Covered by the parser change");
    expect(html).toContain("Claude Code");
  });

  it("has no checkboxes, since agents move the todos", () => {
    const html = render(record({ todos: [todo("t1", "open")] }));

    expect(html).not.toContain('type="checkbox"');
  });

  it("shows nothing for a draft with no record", () => {
    expect(render(null, "draft")).toBe("");
  });

  it("says alignment has not been recorded while the plan is in alignment", () => {
    expect(render(null, "alignment")).toContain("No alignment yet.");
  });

  it("says todos come after alignment while none exist", () => {
    expect(render(record(), "in-progress")).toContain(
      "No todos yet. The agent adds them after alignment.",
    );
  });

  it("marks an answer left to the agent and a question that must be answered", () => {
    const html = render(
      record({
        alignment: {
          askedAt: "2026-10-28T09:00:00Z",
          questions: [
            {
              id: "q1",
              aspect: "tests",
              question: "Which tests?",
              options: [{ id: "a", label: "Unit tests" }],
              mustAnswer: true,
              answer: { kind: "option", options: ["a"] },
            },
            {
              id: "q2",
              aspect: "scale",
              question: "How big?",
              options: [],
              mustAnswer: false,
              answer: { kind: "agent" },
            },
          ],
        },
      }),
      "alignment",
    );

    expect(html).toContain("Unit tests");
    expect(html).toContain("Agent decides");
    expect(html).toContain("Must answer");
  });

  it("renders a recorded decision as a decision card", () => {
    const html = render(
      record({
        decisions: [
          {
            id: "D1",
            context: "Where questions are asked.",
            options: ["In the app", "In the harness"],
            decision: "Ask in the harness",
            why: "The person is already there.",
            at: "2026-10-28T10:00:00Z",
            by: "claude-code",
          },
        ],
      }),
    );

    expect(html).toContain('class="plan-decision"');
    expect(html).toContain("D1. Ask in the harness");
  });

  it("lists repos with their branch and PRs with their badges", () => {
    const html = render(
      record({
        repos: [{ path: "~/Personal/openplan", branch: "feat/alignment" }],
        prs: [
          {
            url: "https://github.com/owner/repo/pull/12",
            todos: [],
            state: "open",
            checks: "failing",
            review: "waiting",
            reportedAt: "2026-10-28T10:00:00Z",
            by: "claude-code",
          },
        ],
      }),
    );

    expect(html).toContain("~/Personal/openplan");
    expect(html).toContain("feat/alignment");
    expect(html).toContain("owner/repo#12");
    expect(html).toContain("Checks failing");
  });
});
