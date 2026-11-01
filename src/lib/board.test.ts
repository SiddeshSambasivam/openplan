import { describe, expect, it } from "vitest";
import {
  boardColumns,
  demoBuildPlan,
  FOLDED,
  folderChips,
  forYou,
  needsAgentSetup,
  pageTitle,
  relativeTime,
  sessionAgent,
  sessionHint,
  shortDate,
  sortPlans,
  statusGroups,
  steppedPlan,
  viewOrder,
} from "./board";
import type { AgentOption } from "./onboarding";
import { STATUS_FLOW, STATUS_ORDER, type PlanSummary, type Status } from "./planBase";

function plan(overrides: Partial<PlanSummary> & { id: string }): PlanSummary {
  return {
    title: overrides.id,
    status: "draft" as Status,
    type: null,
    source: "claude-code",
    folders: [],
    pr: null,
    created: null,
    updated: null,
    completed: null,
    path: `/base/${overrides.id}.md`,
    relativePath: `${overrides.id}.md`,
    demo: false,
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

describe("status order", () => {
  it("runs the way work moves", () => {
    expect(STATUS_FLOW).toEqual([
      "draft",
      "alignment",
      "in-progress",
      "in-review",
      "completed",
      "archived",
    ]);
  });

  it("lists what is moving first and what is put away last", () => {
    expect(STATUS_ORDER).toEqual([
      "in-progress",
      "alignment",
      "in-review",
      "draft",
      "completed",
      "archived",
    ]);
  });
});

describe("boardColumns", () => {
  it("shows all six columns, in the order work moves, even when empty", () => {
    const columns = boardColumns([
      plan({ id: "a", status: "in-review" }),
      plan({ id: "b", status: "alignment" }),
      plan({ id: "c", status: "archived" }),
    ]);

    expect(columns.map((c) => c.status)).toEqual(STATUS_FLOW);
    expect(columns.map((c) => c.plans.length)).toEqual([0, 1, 0, 1, 0, 1]);
  });

  it("folds finished work away and keeps the four working columns open", () => {
    const open = boardColumns([]).filter((c) => !FOLDED.includes(c.status));

    expect(open.map((c) => c.status)).toEqual([
      "draft",
      "alignment",
      "in-progress",
      "in-review",
    ]);
    expect(FOLDED).toEqual(["completed", "archived"]);
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
      plan({ id: "c", status: "archived" }),
      plan({ id: "d", status: "alignment" }),
    ]);

    expect(groups.map((g) => g.status)).toEqual([
      "alignment",
      "in-review",
      "completed",
      "archived",
    ]);
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

  it("lists the plans with questions waiting first, above a review", () => {
    const waiting = (path: string, pendingQuestions: number) =>
      [path, { path, pendingQuestions }] as const;
    const groups = forYou(
      [review, quiet, replied],
      [{ path: replied.path, open: 1, answered: true }],
      new Map([waiting(review.path, 2), waiting(quiet.path, 0)]),
    );

    expect(groups.questions.map((p) => p.id)).toEqual(["review"]);
    expect(groups.review).toEqual([]);
    expect(groups.answered.map((p) => p.id)).toEqual(["replied"]);
  });
});

describe("pageTitle", () => {
  const set = plan({
    id: "set",
    title: "Move search to OpenSearch",
    folders: ["Search"],
    path: "/base/move-search/README.md",
    documents: ["README.md", "01-current-state.md"],
  });

  it("reads a plan as its title", () => {
    expect(pageTitle(set, set.path)).toBe("Move search to OpenSearch");
  });

  it("reads a document as what the document is about", () => {
    expect(pageTitle(set, "/base/move-search/01-current-state.md")).toBe("Current state");
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

describe("relativeTime", () => {
  const now = new Date("2026-10-28T12:00:00Z");

  it("says just now for the last minute", () => {
    expect(relativeTime("2026-10-28T11:59:30Z", now)).toBe("just now");
  });

  it("counts minutes, then hours", () => {
    expect(relativeTime("2026-10-28T11:55:00Z", now)).toBe("5 min ago");
    expect(relativeTime("2026-10-28T09:00:00Z", now)).toBe("3 h ago");
  });

  it("counts days up to a week", () => {
    expect(relativeTime("2026-10-27T10:00:00Z", now)).toBe("yesterday");
    expect(relativeTime("2026-10-25T10:00:00Z", now)).toBe("3 days ago");
  });

  it("gives the date for anything older", () => {
    expect(relativeTime("2026-10-01T10:00:00Z", now)).toBe(
      shortDate("2026-10-01T10:00:00Z", now),
    );
  });

  it("treats a time ahead of the clock as just now", () => {
    expect(relativeTime("2026-10-28T12:05:00Z", now)).toBe("just now");
  });

  it("has nothing to show without a readable time", () => {
    expect(relativeTime("whenever", now)).toBe(null);
  });
});

describe("viewOrder", () => {
  const plans = [
    plan({ id: "review", status: "in-review", updated: "2026-09-03" }),
    plan({ id: "draft-new", updated: "2026-09-02" }),
    plan({ id: "draft-old", updated: "2026-09-01" }),
    plan({ id: "doing", status: "in-progress", updated: "2026-09-04" }),
  ];
  const summaries = [{ path: "/base/doing.md", open: 1, answered: true }];

  it("reads the board column by column", () => {
    expect(viewOrder("board", plans, summaries).map((p) => p.id)).toEqual(
      boardColumns(plans).flatMap((group) => group.plans.map((p) => p.id)),
    );
  });

  it("reads the list group by group", () => {
    expect(viewOrder("list", plans, summaries).map((p) => p.id)).toEqual(
      statusGroups(plans).flatMap((group) => group.plans.map((p) => p.id)),
    );
  });

  it("reads For you as questions, then reviews, then answered threads", () => {
    const progress = new Map([["/base/draft-old.md", { pendingQuestions: 1 }]]);
    expect(viewOrder("for-you", plans, summaries, progress).map((p) => p.id)).toEqual([
      "draft-old",
      "review",
      "doing",
    ]);
  });
});

describe("steppedPlan", () => {
  const order = [plan({ id: "a" }), plan({ id: "b" }), plan({ id: "c" })];

  it("moves one plan along", () => {
    expect(steppedPlan(order, "/base/b.md", 1)?.id).toBe("c");
    expect(steppedPlan(order, "/base/b.md", -1)?.id).toBe("a");
  });

  it("stops at either end", () => {
    expect(steppedPlan(order, "/base/c.md", 1)).toBeNull();
    expect(steppedPlan(order, "/base/a.md", -1)).toBeNull();
  });

  it("starts at the near end when the open plan is not in the order", () => {
    expect(steppedPlan(order, null, 1)?.id).toBe("a");
    expect(steppedPlan(order, "/elsewhere.md", -1)?.id).toBe("c");
    expect(steppedPlan([], null, 1)).toBeNull();
  });
});

describe("folderChips", () => {
  it("leaves the Demo folder off a demo plan, which already carries a Demo tag", () => {
    const demo = plan({ id: "demo-faster-search", demo: true, folders: ["Demo", "Search"] });

    expect(folderChips(demo)).toEqual(["Search"]);
  });

  it("keeps a Demo folder on a plan of the person's own", () => {
    expect(folderChips(plan({ id: "mine", folders: ["Demo", "Search"] }))).toEqual(["Demo", "Search"]);
  });
});

describe("demoBuildPlan", () => {
  it("is the In progress demo plan, which shows what Build leads to", () => {
    const building = plan({ id: "demo-sync-notes-across-devices", status: "in-progress", demo: true });
    const plans = [
      plan({ id: "demo-export-notes-as-pdf", status: "alignment", demo: true }),
      plan({ id: "mine", status: "in-progress" }),
      building,
    ];

    expect(demoBuildPlan(plans)).toBe(building);
  });

  it("is any demo plan in progress once the usual one is gone", () => {
    const moved = plan({ id: "demo-faster-search", status: "in-progress", demo: true });

    expect(demoBuildPlan([plan({ id: "mine", status: "in-progress" }), moved])).toBe(moved);
  });

  it("is none when no demo plan is in progress", () => {
    const plans = [
      plan({ id: "demo-sync-notes-across-devices", status: "in-review", demo: true }),
      plan({ id: "mine", status: "in-progress" }),
    ];

    expect(demoBuildPlan(plans)).toBeUndefined();
  });
});

function agents(installed: string[]): AgentOption[] {
  return [
    { id: "claude-code", name: "Claude Code", installed: installed.includes("claude-code") },
    { id: "codex", name: "Codex", installed: installed.includes("codex") },
    { id: "cursor", name: "Cursor", installed: installed.includes("cursor") },
  ];
}

describe("sessionHint", () => {
  it("names only the agents on this computer", () => {
    expect(sessionHint(agents(["codex"]))).toBe(
      "Ask Codex to plan a change. The plan lands here as a Draft, and your reviewers ask what it leaves open before anyone builds.",
    );
    expect(sessionHint(agents(["claude-code", "cursor"]))).toMatch(/^Ask Claude Code or Cursor to plan/);
  });

  it("names all three when none are found, or before the search ends", () => {
    expect(sessionHint(agents([]))).toMatch(/^Ask Claude Code, Codex or Cursor to plan a change\./);
    expect(sessionHint(null)).toMatch(/^Ask Claude Code, Codex or Cursor to plan a change\./);
  });
});

describe("needsAgentSetup", () => {
  it("is true only once the search found no agent", () => {
    expect(needsAgentSetup(agents([]))).toBe(true);
    expect(needsAgentSetup(agents(["cursor"]))).toBe(false);
    expect(needsAgentSetup(null)).toBe(false);
  });
});

describe("sessionAgent", () => {
  it("is Claude Code when it is there, or when no agent is", () => {
    expect(sessionAgent(agents(["codex", "claude-code"]))).toBe("claude-code");
    expect(sessionAgent(agents([]))).toBe("claude-code");
    expect(sessionAgent(null)).toBe("claude-code");
  });

  it("is the one found otherwise", () => {
    expect(sessionAgent(agents(["cursor", "codex"]))).toBe("codex");
  });
});
