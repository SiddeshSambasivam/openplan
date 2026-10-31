import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Decision, Todo, TodoState, WorkRecord } from "@/lib/work";
import { AlignmentTab, WorkPanel } from "./PlanWork";

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

function panel(work: WorkRecord | null): string {
  return renderToStaticMarkup(
    <WorkPanel record={work} overlay={false} open onClose={() => {}} />,
  );
}

function alignmentTab(work: WorkRecord | null): string {
  return renderToStaticMarkup(<AlignmentTab record={work} />);
}

describe("WorkPanel", () => {
  it("counts three todos, says who moved them, and why one was dropped", () => {
    const html = panel(
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
    const html = panel(record({ todos: [todo("t1", "open")] }));

    expect(html).not.toContain('type="checkbox"');
  });

  it("shows nothing without todos, repos or PRs", () => {
    expect(panel(null)).toBe("");
    expect(panel(record({ alignment: { askedAt: "2026-10-28T09:00:00Z", questions: [] } }))).toBe(
      "",
    );
  });

  it("lists repos with their branch and PRs with their badges", () => {
    const html = panel(
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

const decision: Decision = {
  id: "D1",
  context: "Where questions are asked.",
  options: ["In the app", "In the harness"],
  decision: "Ask in the harness",
  why: "The person is already there.",
  at: "2026-10-28T10:00:00Z",
  by: "claude-code",
};

describe("AlignmentTab", () => {
  it("lists the questions with their answers, then the decisions as cards", () => {
    const html = alignmentTab(
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
        decisions: [decision],
      }),
    );

    expect(html).toContain("Which tests?");
    expect(html).toContain("Unit tests");
    expect(html).toContain("How big?");
    expect(html).toContain("Agent decides");
    expect(html).toContain("Must answer");
    expect(html).toContain('class="plan-decision"');
    expect(html).toContain("D1. Ask in the harness");
    expect(html.indexOf("Which tests?")).toBeLessThan(html.indexOf("D1. Ask in the harness"));
  });

  it("shows why a question was asked and what the chosen option costs, the rest folded", () => {
    const html = alignmentTab(
      record({
        alignment: {
          askedAt: "2026-10-28T09:00:00Z",
          questions: [
            {
              id: "q1",
              aspect: "performance",
              question: "Where does the plan cache live?",
              context: "The board reads every plan file each time it opens.",
              options: [
                {
                  id: "a",
                  label: "In memory",
                  consequence: "The board opens at once after launch.",
                  tradeoff: "Launch reads every plan once.",
                },
                {
                  id: "b",
                  label: "On disk",
                  consequence: "The board opens at once, even at launch.",
                  tradeoff: "A second copy that can go stale.",
                },
              ],
              recommended: "a",
              mustAnswer: false,
              answer: { kind: "option", options: ["a"] },
            },
          ],
        },
      }),
    );

    expect(html).toContain("The board reads every plan file each time it opens.");
    expect(html).toContain("The board opens at once after launch.");
    expect(html).toContain("Launch reads every plan once.");
    expect(html).toContain("Show the other options");
    expect(html).not.toContain("A second copy that can go stale.");
  });

  it("says alignment has not been recorded when the record has none", () => {
    expect(alignmentTab(null)).toContain("No alignment yet.");
    expect(alignmentTab(record({ decisions: [decision] }))).toContain(
      "No alignment yet.",
    );
  });
});
