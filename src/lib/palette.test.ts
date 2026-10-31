import { describe, expect, it } from "vitest";
import { matchPlans } from "./palette";
import type { PlanSummary } from "./planBase";

function plan(title: string): PlanSummary {
  const id = title.toLowerCase().replace(/\s+/g, "-");
  return {
    id,
    title,
    status: "draft",
    type: null,
    source: "claude-code",
    folders: [],
    pr: null,
    created: null,
    updated: null,
    completed: null,
    path: `/base/${id}.md`,
    relativePath: `${id}.md`,
    documents: [],
  };
}

describe("matchPlans", () => {
  const plans = [plan("Auth refactor"), plan("Billing export"), plan("Author pages")];

  it("keeps the plans whose title matches, best match first", () => {
    expect(matchPlans(plans, "auth", 10).map((p) => p.title)).toEqual([
      "Auth refactor",
      "Author pages",
    ]);
  });

  it("matches loosely, letter by letter", () => {
    expect(matchPlans(plans, "bexp", 10).map((p) => p.title)).toEqual(["Billing export"]);
  });

  it("returns at most the limit", () => {
    const many = Array.from({ length: 50 }, (_, i) => plan(`Plan ${i}`));
    expect(matchPlans(many, "plan", 20)).toHaveLength(20);
  });

  it("returns nothing for an empty query", () => {
    expect(matchPlans(plans, "  ", 10)).toEqual([]);
  });
});
