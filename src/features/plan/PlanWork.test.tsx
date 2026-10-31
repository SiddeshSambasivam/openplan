import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Decision, Question, Todo, TodoState, WorkRecord } from "@/lib/work";
import { alignmentScore } from "@/lib/alignmentScore";
import { ScoreDetails } from "./AlignmentScoreCard";
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

function panel(work: WorkRecord | null, minimized = false): string {
  return renderToStaticMarkup(
    <TooltipProvider>
      <WorkPanel
        record={work}
        overlay={false}
        open
        minimized={minimized}
        onClose={() => {}}
        onToggleMinimized={() => {}}
      />
    </TooltipProvider>,
  );
}

function alignmentTab(work: WorkRecord | null): string {
  return renderToStaticMarkup(
    <TooltipProvider>
      <AlignmentTab record={work} plan={{ path: "/base/p.md", id: "p", dark: false, media: false }} />
    </TooltipProvider>,
  );
}

describe("WorkPanel", () => {
  it("counts three todos and leaves the dropped one out", () => {
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
  });

  it("shows each todo's title on its row and keeps the detail for its own view", () => {
    const html = panel(
      record({
        todos: [
          todo("t1", "open", { text: "Split the title. The rest is detail." }),
          todo("t2", "open", { text: "Short title", detail: "Written apart." }),
        ],
      }),
    );

    expect(html).toContain('title="Split the title."');
    expect(html).toContain('title="Short title"');
    expect(html).not.toContain("The rest is detail.");
    expect(html).not.toContain("Written apart.");
  });

  it("folds into one floating icon button when minimized, its progress in the label", () => {
    const html = panel(record({ todos: [todo("t1", "done"), todo("t2", "open")] }), true);

    expect(html).toContain('aria-label="Show the work panel. 1 of 2 todos done"');
    expect(html).not.toContain("1/2");
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
            {
              id: "q3",
              aspect: "scope",
              question: "Which plans?",
              options: [{ id: "a", label: "Every plan" }],
              mustAnswer: true,
            },
          ],
        },
        decisions: [decision],
      }),
    );

    expect(html).toContain("Which tests?");
    expect(html).toContain("Unit tests");
    expect(html).toContain("How big?");
    expect(html).toContain("Agent decided");
    expect(html).toContain("Must answer");
    expect(html).toContain('class="plan-decision"');
    expect(html).toContain("D1. Ask in the harness");
    expect(html.indexOf("Which tests?")).toBeLessThan(html.indexOf("D1. Ask in the harness"));
  });

  it("shows why a waiting question was asked and what each option does and costs", () => {
    const html = alignmentTab(
      record({
        alignment: {
          askedAt: "2026-10-28T09:00:00Z",
          questions: [
            {
              id: "q1",
              aspect: "performance",
              role: "engineering",
              question: "Where does the plan cache live?",
              context: "The board reads every plan file each time it opens.",
              illustration: "| Option | Launch |\n| --- | --- |\n| Memory | Slow |",
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
            },
          ],
        },
      }),
    );

    expect(html).toContain("Theo");
    expect(html).toContain("Tech lead");
    expect(html).toContain("The board reads every plan file each time it opens.");
    expect(html).toContain("<table");
    expect(html).toContain("The board opens at once after launch.");
    expect(html).toContain("Trade-off: A second copy that can go stale.");
    expect(html).toContain("Recommended");
    expect(html).not.toContain("Replying to");
    expect(html).toContain('placeholder="Reply to Theo"');
    expect(html).toContain("Answered 0/1");
    expect(html).not.toContain(">Reply</button>");
  });

  it("reads oldest round first, and says who had nothing to ask in the latest round", () => {
    const html = alignmentTab(
      record({
        alignment: {
          askedAt: "2026-10-28T09:00:00Z",
          questions: [
            {
              id: "q1",
              aspect: "scope",
              role: "product",
              question: "Which plans get it?",
              options: [{ id: "a", label: "Every plan" }],
              mustAnswer: false,
              answer: { kind: "option", options: ["a"] },
            },
            {
              id: "q2",
              aspect: "errors",
              role: "oncall",
              question: "What happens when the write fails?",
              options: [
                { id: "a", label: "Retry once", consequence: "One more try." },
                { id: "b", label: "Show the error" },
              ],
              recommended: "a",
              mustAnswer: false,
              round: 2,
            },
          ],
        },
      }),
    );

    expect(html).toContain("Round 1");
    expect(html).toContain("Round 2 · after your second review");
    expect(html).toContain("Mila");
    expect(html).toContain("On-call");
    expect(html.indexOf("Which plans get it?")).toBeLessThan(
      html.indexOf("What happens when the write fails?"),
    );
    expect(html).not.toContain("Theo, Iris and Kai had nothing to ask this round.");
    expect(html).toContain("Mila, Theo and Iris had nothing to ask this round.");
    expect(html).toContain('aria-label="1 waiting"');
  });

  it("scores the areas settled, and names the required ones nobody asked about", () => {
    const questions: Question[] = [
      {
        id: "q1",
        aspect: "scale",
        role: "engineering",
        question: "How many plans?",
        options: [{ id: "a", label: "Fifty" }],
        mustAnswer: false,
        answer: { kind: "option", options: ["a"], note: "The largest base we know." },
      },
      {
        id: "q2",
        aspect: "UX",
        role: "design",
        question: "Where does it sit?",
        options: [{ id: "a", label: "Top bar" }],
        mustAnswer: false,
      },
    ];
    const html = alignmentTab(record({ alignment: { askedAt: "2026-10-28T09:00:00Z", questions } }));
    const details = renderToStaticMarkup(
      <TooltipProvider>
        <ScoreDetails score={alignmentScore(questions, {})} />
      </TooltipProvider>,
    );

    expect(html).toContain("Alignment score 60 out of 100");
    expect(html).toContain("1 of 2 areas settled");
    expect(html.indexOf("Alignment score")).toBeLessThan(html.indexOf("Where does it sit?"));
    expect(details).toContain("1 of 2 areas settled · 40 of 80");
    expect(details).toContain("1 of 1 answer explains why · 20 of 20");
    expect(details).toContain("Not asked yet: edge cases");
    expect(details).toContain("Not asked yet: error handling");
    expect(details).not.toContain("Not asked yet: scale");
  });

  it("shows the note written beside a picked option under it", () => {
    const html = alignmentTab(
      record({
        alignment: {
          askedAt: "2026-10-28T09:00:00Z",
          questions: [
            {
              id: "q1",
              aspect: "scope",
              question: "Which plans get it?",
              options: [
                { id: "a", label: "Every plan" },
                { id: "b", label: "New plans" },
              ],
              mustAnswer: false,
              answer: { kind: "option", options: ["a"], note: "Old plans too, they are few." },
            },
          ],
        },
      }),
    );

    expect(html).toContain("Old plans too, they are few.");
    expect(html.indexOf("Every plan")).toBeLessThan(html.indexOf("Old plans too"));
    expect(html).not.toContain("New plans");
  });

  it("says alignment has not been recorded when the record has none", () => {
    expect(alignmentTab(null)).toContain("No alignment yet.");
    expect(alignmentTab(record({ decisions: [decision] }))).toContain(
      "No alignment yet.",
    );
  });

  it("hides the people rail until shown, and names the view with a waiting count", () => {
    const html = alignmentTab(
      record({
        alignment: {
          askedAt: "2026-10-28T09:00:00Z",
          questions: [
            {
              id: "q1",
              aspect: "scale",
              role: "engineering",
              question: "How many plans?",
              options: [{ id: "a", label: "Fifty" }],
              mustAnswer: false,
            },
          ],
        },
      }),
    );

    expect(html).not.toContain('role="tablist"');
    expect(html).toContain("Everyone</h2>");
    expect(html).toContain('aria-label="1 waiting"');
    expect(html).not.toMatch(/>Build<\/button>/);
  });
});
