import { describe, expect, it } from "vitest";
import {
  KIND_NAMES,
  missingSections,
  sectionKind,
  splitDecisions,
  splitSections,
} from "./sections";

describe("sectionKind", () => {
  it("reads the kind from what the heading contains, whatever its case", () => {
    expect(sectionKind("Overview")).toBe("summary");
    expect(sectionKind("1. OVERVIEW")).toBe("summary");
    expect(sectionKind("Mission")).toBe("summary");
    expect(sectionKind("Current state (2026-09)")).toBe("current");
    expect(sectionKind("What we know")).toBe("current");
    expect(sectionKind("Architecture")).toBe("approach");
    expect(sectionKind("Phases")).toBe("approach");
    expect(sectionKind("Steps, phase 2")).toBe("steps");
    expect(sectionKind("Rollout plan")).toBe("steps");
    expect(sectionKind("Decisions to make now")).toBe("decisions");
    expect(sectionKind("Alternatives rejected")).toBe("alternatives");
    expect(sectionKind("Reproduction (verified on dev)")).toBe("reproduction");
    expect(sectionKind("Root cause")).toBe("root-cause");
    expect(sectionKind("Blast radius")).toBe("blast-radius");
    expect(sectionKind("Rollback")).toBe("rollback");
    expect(sectionKind("Glossary")).toBe("other");
  });

  it("takes the first kind that matches, so risks wins over the bare question", () => {
    expect(sectionKind("Risks and open questions")).toBe("risks");
    expect(sectionKind("Open questions")).toBe("risks");
    expect(sectionKind("Question")).toBe("question");
    expect(sectionKind("Recommendations")).toBe("recommendations");
    expect(sectionKind("Recommendation")).toBe("recommendation");
  });

  it("names every kind it can return", () => {
    for (const heading of ["Summary", "Scope", "Findings", "Options", "Anything"]) {
      expect(KIND_NAMES[sectionKind(heading)]).toBeTypeOf("string");
    }
  });
});

describe("splitSections", () => {
  it("drops the opening H1 the title comes from and keeps the lead above the first section", () => {
    const body = [
      "# Auth refactor", // 1
      "", // 2
      "The whole thing in a paragraph.", // 3
      "", // 4
      "## Summary", // 5
      "", // 6
      "Tokens move to the edge.", // 7
    ].join("\n");

    const plan = splitSections(body, "Auth refactor");

    expect(plan.lead).toEqual({ body: "The whole thing in a paragraph.", line: 3 });
    expect(plan.sections).toHaveLength(1);
    expect(plan.sections[0]).toMatchObject({
      heading: "Summary",
      kind: "summary",
      level: 2,
      line: 5,
    });
    expect(plan.sections[0].body).toBe("## Summary\n\nTokens move to the edge.");
  });

  it("treats the opening H1 as the title when the plan title starts with it", () => {
    const body = "# Hypotenuse MCP server\n\n# 1. Overview\n\nOne server.\n";

    const plan = splitSections(body, "Hypotenuse MCP server rev 3: attribute keys");

    expect(plan.lead).toBeNull();
    expect(plan.sections.map((s) => s.heading)).toEqual(["1. Overview"]);
  });

  it("treats the opening H1 as the title when it extends the plan title", () => {
    const body = "# Hypotenuse status page, implementation plan\n\n## Summary\n\nIt works.\n";

    const plan = splitSections(body, "Hypotenuse status page");

    expect(plan.sections.map((s) => s.heading)).toEqual(["Summary"]);
  });

  it("does not take a title that only cuts a word in half", () => {
    const body = "# Authentication overview\n\n# Steps\n\nDo it.\n";

    const plan = splitSections(body, "Auth");

    expect(plan.sections.map((s) => s.heading)).toEqual(["Authentication overview", "Steps"]);
  });

  it("takes a lone opening H1 as the title however it is worded", () => {
    const body = "# Something else entirely\n\n## Summary\n\nIt works.\n\n## Steps\n\nDo it.\n";

    const plan = splitSections(body, "Auth refactor");

    expect(plan.sections.map((s) => s.heading)).toEqual(["Summary", "Steps"]);
  });

  it("keeps an opening H1 that is a section of its own", () => {
    const body = "# Overview\n\nOne server.\n\n# Steps\n\nDo it.\n";

    const plan = splitSections(body, "Auth refactor");

    expect(plan.sections.map((s) => s.heading)).toEqual(["Overview", "Steps"]);
  });

  it("sections at the shallowest heading level, so H1 plans read like H2 plans", () => {
    const body = [
      "# A plan", // 1
      "", // 2
      "# 1. Overview", // 3
      "", // 4
      "## Glossary", // 5
      "", // 6
      "Words.", // 7
      "", // 8
      "# 2. Steps", // 9
      "", // 10
      "- do it", // 11
    ].join("\n");

    const plan = splitSections(body, "A plan");

    expect(plan.sections.map((s) => [s.heading, s.level, s.line])).toEqual([
      ["1. Overview", 1, 3],
      ["2. Steps", 1, 9],
    ]);
    expect(plan.sections[0].body).toContain("## Glossary");
  });

  it("ignores hashes inside a fenced code block", () => {
    const body = [
      "# A plan", // 1
      "", // 2
      "## Summary", // 3
      "", // 4
      "```python", // 5
      "# backend/app/schemas.py", // 6
      "```", // 7
      "", // 8
      "## Steps", // 9
    ].join("\n");

    const plan = splitSections(body, "A plan");

    expect(plan.sections.map((s) => s.heading)).toEqual(["Summary", "Steps"]);
  });

  it("reads a body that opens straight into its sections", () => {
    const plan = splitSections("## Scope\n\nThe API.\n", "An audit");

    expect(plan.lead).toBeNull();
    expect(plan.sections.map((s) => s.kind)).toEqual(["scope"]);
    expect(plan.sections[0].line).toBe(1);
  });

  it("gives a body with no headings one lead and nothing else", () => {
    const plan = splitSections("\nJust prose.\n", "A note");

    expect(plan.lead).toEqual({ body: "Just prose.", line: 2 });
    expect(plan.sections).toEqual([]);
  });
});

describe("slice line numbers", () => {
  // Each slice renders on its own, and the renderer stamps its blocks with
  // the slice's line plus the line inside it. Comments anchor to those
  // stamps, so a slice that reports the wrong line moves every thread in it.
  const body = [
    "# A plan", // 1
    "", // 2
    "The lead.", // 3
    "", // 4
    "## Summary", // 5
    "", // 6
    "It works.", // 7
    "", // 8
    "## Decisions", // 9
    "", // 10
    "**D1 Keys.** Context: names collide.", // 11
    "", // 12
    "**D2 Renames.** Decision: explicit.", // 13
  ].join("\n");
  const lines = body.split("\n");

  function agrees(slice: { body: string; line: number }) {
    return slice.body
      .split("\n")
      .every((line, i) => lines[slice.line - 1 + i] === line);
  }

  it("places every slice where its text really is in the body", () => {
    const plan = splitSections(body, "A plan");

    expect(agrees(plan.lead!)).toBe(true);
    for (const section of plan.sections) expect(agrees(section)).toBe(true);
  });

  it("keeps decision cards in body lines, not section lines", () => {
    const decisions = splitSections(body, "A plan").sections[1];

    const cards = splitDecisions(decisions.body, decisions.line);

    expect(cards.map((c) => c.line)).toEqual([9, 11, 13]);
    for (const card of cards) expect(agrees(card)).toBe(true);
  });
});

describe("splitDecisions", () => {
  it("cards a paragraph whose bold lead names a decision", () => {
    const body = [
      "## Decisions", // 1
      "", // 2
      "Taken with Sid.", // 3
      "", // 4
      "**D1 Build vs adopt.** Context: nothing mature matches.", // 5
      "", // 6
      "**D2. Entries in code.** Decision: a Python registry.", // 7
    ].join("\n");

    expect(splitDecisions(body, 1)).toEqual([
      { body: "## Decisions\n\nTaken with Sid.", line: 1, card: false },
      { body: "**D1 Build vs adopt.** Context: nothing mature matches.", line: 5, card: true },
      { body: "**D2. Entries in code.** Decision: a Python registry.", line: 7, card: true },
    ]);
  });

  it("cards a D-headed subsection down to the next heading at its level", () => {
    const body = [
      "## Decisions", // 1
      "", // 2
      "### D1 — Keys identify an attribute", // 3
      "", // 4
      "**Context.** Display names are not unique.", // 5
      "", // 6
      "#### A note", // 7
      "", // 8
      "Still D1.", // 9
      "", // 10
      "### D2 — Renaming is deliberate", // 11
      "", // 12
      "Done.", // 13
    ].join("\n");

    const cards = splitDecisions(body, 1).filter((slice) => slice.card);

    expect(cards.map((c) => c.line)).toEqual([3, 11]);
    expect(cards[0].body).toContain("#### A note");
    expect(cards[0].body).toContain("Still D1.");
    expect(cards[1].body).toBe("### D2 — Renaming is deliberate\n\nDone.");
  });

  it("cards a list item that opens with a decision", () => {
    const body = "- **D-1 — Rebuild as slices.** Rejected: refactor in place.\n";

    expect(splitDecisions(body, 4)).toEqual([
      { body: "- **D-1 — Rebuild as slices.** Rejected: refactor in place.", line: 4, card: true },
    ]);
  });

  it("leaves a section with no decision leads as one plain slice", () => {
    const body = "## Decisions\n\nNone yet.\n";

    expect(splitDecisions(body, 1)).toEqual([
      { body: "## Decisions\n\nNone yet.", line: 1, card: false },
    ]);
  });
});

describe("missingSections", () => {
  it("lists what the type asks for and the headings do not carry", () => {
    expect(missingSections("feature", ["Summary", "Approach", "Steps"])).toEqual([
      "Current state",
      "Risks and open questions",
    ]);
    expect(missingSections("bug", ["Summary", "Reproduction (on dev)", "Root cause"])).toEqual([
      "Blast radius",
      "Steps",
    ]);
  });

  it("counts a heading that contains the section name, whatever its case", () => {
    expect(missingSections("audit", ["1. SCOPE", "Findings", "Recommendations"])).toEqual([]);
  });

  it("asks nothing of a plan with no type, or a type it does not know", () => {
    expect(missingSections(null, [])).toEqual([]);
    expect(missingSections("sketch", [])).toEqual([]);
  });
});
