import { describe, expect, it } from "vitest";
import {
  boardColumns,
  filterByProject,
  forYou,
  planCrumb,
  shortDate,
  sortPlans,
  statusGroups,
} from "./board";
import type { PlanSummary, Status } from "./planBase";

function plan(overrides: Partial<PlanSummary> & { id: string }): PlanSummary {
  return {
    title: overrides.id,
    status: "draft" as Status,
    type: null,
    source: "claude-code",
    project: null,
    pr: null,
    created: null,
    updated: null,
    path: `/base/${overrides.id}.md`,
    relativePath: `${overrides.id}.md`,
    documents: [],
    ...overrides,
  };
}

describe("sortPlans", () => {
  it("puts the newest first and undated plans last", () => {
    const sorted = sortPlans([
      plan({ id: "older", updated: "2026-09-01" }),
      plan({ id: "undated" }),
      plan({ id: "newer", updated: "2026-09-20" }),
    ]);

    expect(sorted.map((p) => p.id)).toEqual(["newer", "older", "undated"]);
  });

  it("leaves the plans it was given alone", () => {
    const plans = [plan({ id: "a", updated: "2026-09-01" }), plan({ id: "b" })];
    sortPlans(plans);

    expect(plans.map((p) => p.id)).toEqual(["a", "b"]);
  });
});

describe("filterByProject", () => {
  const plans = [
    plan({ id: "one", project: "github.com/acme/tools" }),
    plan({ id: "two", project: "github.com/acme/site" }),
    plan({ id: "loose" }),
  ];

  it("keeps every plan when no project is chosen", () => {
    expect(filterByProject(plans, null)).toHaveLength(3);
  });

  it("keeps the plans of one project", () => {
    expect(filterByProject(plans, "github.com/acme/tools").map((p) => p.id)).toEqual([
      "one",
    ]);
  });

  it("can ask for the plans that name no project", () => {
    expect(filterByProject(plans, "").map((p) => p.id)).toEqual(["loose"]);
  });
});

describe("boardColumns", () => {
  it("shows all four columns, in board order, even when empty", () => {
    const columns = boardColumns([plan({ id: "a", status: "in-review" })]);

    expect(columns.map((c) => c.status)).toEqual([
      "draft",
      "in-progress",
      "in-review",
      "completed",
    ]);
    expect(columns.map((c) => c.plans.length)).toEqual([0, 0, 1, 0]);
  });

  it("sorts each column newest first", () => {
    const columns = boardColumns([
      plan({ id: "older", status: "draft", updated: "2026-09-01" }),
      plan({ id: "newer", status: "draft", updated: "2026-09-20" }),
    ]);

    expect(columns[0].plans.map((p) => p.id)).toEqual(["newer", "older"]);
  });
});

describe("statusGroups", () => {
  it("shows what is moving first and drops the empty states", () => {
    const groups = statusGroups([
      plan({ id: "a", status: "completed" }),
      plan({ id: "b", status: "in-review" }),
    ]);

    expect(groups.map((g) => g.status)).toEqual(["in-review", "completed"]);
  });
});

describe("forYou", () => {
  const review = plan({ id: "review", status: "in-review" });
  const replied = plan({ id: "replied", status: "in-progress" });
  const quiet = plan({ id: "quiet", status: "in-progress" });

  it("lists the plans waiting for a review", () => {
    const groups = forYou([review, quiet], []);

    expect(groups.review.map((p) => p.id)).toEqual(["review"]);
    expect(groups.answered).toEqual([]);
  });

  it("lists the plans where an agent answered an open thread", () => {
    const groups = forYou(
      [replied, quiet],
      [
        { path: replied.path, open: 1, answered: true },
        { path: quiet.path, open: 2, answered: false },
      ],
    );

    expect(groups.answered.map((p) => p.id)).toEqual(["replied"]);
  });

  it("shows a plan once: waiting for a review comes first", () => {
    const groups = forYou([review], [{ path: review.path, open: 1, answered: true }]);

    expect(groups.review.map((p) => p.id)).toEqual(["review"]);
    expect(groups.answered).toEqual([]);
  });
});

describe("planCrumb", () => {
  const set = plan({
    id: "set",
    title: "Move search to OpenSearch",
    project: "github.com/acme/tools",
    path: "/base/move-search/README.md",
    documents: ["README.md", "01-current-state.md"],
  });

  it("reads a plan as its project and its title", () => {
    expect(planCrumb(set, set.path)).toEqual({
      lead: { kind: "project", label: "acme/tools" },
      title: "Move search to OpenSearch",
    });
  });

  it("reads a document as its plan and what the document is about", () => {
    expect(planCrumb(set, "/base/move-search/01-current-state.md")).toEqual({
      lead: { kind: "plan", label: "Move search to OpenSearch" },
      title: "Current state",
    });
  });

  it("leaves out the project a plan does not have", () => {
    const loose = plan({ id: "loose", title: "Land September under 70k" });

    expect(planCrumb(loose, loose.path)).toEqual({
      lead: null,
      title: "Land September under 70k",
    });
  });
});

describe("shortDate", () => {
  const now = new Date("2026-09-22T10:00:00Z");

  it("leaves out the year of a plan from this year", () => {
    expect(shortDate("2026-09-20T09:00:00Z", now)).not.toMatch(/2026/);
  });

  it("says the year when the plan is from another one", () => {
    expect(shortDate("2025-08-30T09:00:00Z", now)).toMatch(/2025/);
  });

  it("has nothing to show without a date", () => {
    expect(shortDate(null, now)).toBe(null);
    expect(shortDate("whenever", now)).toBe(null);
  });
});
