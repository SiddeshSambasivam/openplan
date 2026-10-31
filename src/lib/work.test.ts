import { describe, expect, it } from "vitest";
import {
  offersCompletion,
  answerOf,
  chosenOptions,
  mostAdvancedPr,
  PR_MARKS,
  prBadges,
  prLabel,
  prSummaryText,
  progress,
  repoLabel,
  progressText,
  questionsByAspect,
  showsWorkPanel,
  TODO_MARKS,
  type Pr,
  type Question,
  type Todo,
  type TodoState,
  type WorkRecord,
} from "./work";

const todo = (id: string, state: TodoState): Todo => ({
  id,
  text: "Write it",
  state,
  by: "claude-code",
  at: "2026-10-28T10:00:00Z",
});

const record = (todos: Todo[]): WorkRecord => ({
  version: 1,
  repos: [],
  decisions: [],
  todos,
  prs: [],
});

const question = (id: string, aspect: string, extra: Partial<Question> = {}): Question => ({
  id,
  aspect,
  question: `Question ${id}`,
  options: [
    { id: "a", label: "Unit tests" },
    { id: "b", label: "End to end" },
  ],
  recommended: "a",
  mustAnswer: false,
  ...extra,
});

const pr = (extra: Partial<Pr> = {}): Pr => ({
  url: "https://github.com/owner/repo/pull/12",
  todos: [],
  state: "open",
  checks: "pending",
  review: "waiting",
  reportedAt: "2026-10-28T10:00:00Z",
  by: "claude-code",
  ...extra,
});

describe("progress", () => {
  it("counts done todos out of every todo", () => {
    const counted = progress(
      record([todo("t1", "done"), todo("t2", "doing"), todo("t3", "open")]),
    );

    expect(counted).toEqual({ done: 1, total: 3 });
  });

  it("leaves dropped todos out of both counts", () => {
    const counted = progress(record([todo("t1", "done"), todo("t2", "dropped")]));

    expect(counted).toEqual({ done: 1, total: 1 });
  });

  it("is zero of zero with no todos", () => {
    expect(progress(record([]))).toEqual({ done: 0, total: 0 });
  });
});

describe("progressText", () => {
  it("says how many are done out of how many", () => {
    expect(progressText({ done: 4, total: 9 })).toBe("4 of 9 done");
  });

  it("reads the same with nothing done yet", () => {
    expect(progressText({ done: 0, total: 2 })).toBe("0 of 2 done");
  });
});

describe("TODO_MARKS", () => {
  it("names every state", () => {
    expect(TODO_MARKS.open.label).toBe("Open");
    expect(TODO_MARKS.doing.label).toBe("Doing");
    expect(TODO_MARKS.done.label).toBe("Done");
    expect(TODO_MARKS.dropped.label).toBe("Dropped");
  });

  it("colours a todo the way the status glyphs colour a plan", () => {
    expect(TODO_MARKS.doing.tone).toBe("text-warning");
    expect(TODO_MARKS.done.tone).toBe("text-success");
    expect(TODO_MARKS.open.tone).toBe("text-muted-foreground");
    expect(TODO_MARKS.dropped.tone).toBe("text-muted-foreground");
  });
});

describe("questionsByAspect", () => {
  it("keeps questions on one aspect together, in the order aspects first appear", () => {
    const groups = questionsByAspect([
      question("q1", "tests"),
      question("q2", "scale"),
      question("q3", "tests"),
    ]);

    expect(groups.map((g) => [g.aspect, g.questions.map((q) => q.id)])).toEqual([
      ["tests", ["q1", "q3"]],
      ["scale", ["q2"]],
    ]);
  });

  it("has no groups without questions", () => {
    expect(questionsByAspect([])).toEqual([]);
  });
});

describe("answerOf", () => {
  it("names the options that were picked", () => {
    const answer = answerOf(
      question("q1", "tests", { answer: { kind: "option", options: ["a", "b"] } }),
    );

    expect(answer).toEqual({ kind: "option", text: "Unit tests, End to end" });
  });

  it("falls back to the id of an option it cannot find", () => {
    const answer = answerOf(
      question("q1", "tests", { answer: { kind: "option", options: ["z"] } }),
    );

    expect(answer.text).toBe("z");
  });

  it("gives a written answer as it was written", () => {
    const answer = answerOf(
      question("q1", "tests", { answer: { kind: "text", text: "Only the parser" } }),
    );

    expect(answer).toEqual({ kind: "text", text: "Only the parser" });
  });

  it("says when the agent was left to decide", () => {
    const answer = answerOf(question("q1", "tests", { answer: { kind: "agent" } }));

    expect(answer).toEqual({ kind: "agent", text: "Agent decides" });
  });

  it("says when a question is still open", () => {
    expect(answerOf(question("q1", "tests"))).toEqual({
      kind: "none",
      text: "Not answered yet",
    });
  });
});

describe("showsWorkPanel", () => {
  it("shows the panel once the record has a todo, a repo or a PR", () => {
    expect(showsWorkPanel(record([todo("t1", "open")]))).toBe(true);
    expect(showsWorkPanel({ ...record([]), repos: [{ path: "~/code/app" }] })).toBe(true);
    expect(
      showsWorkPanel({
        ...record([]),
        prs: [
          {
            url: "https://github.com/owner/repo/pull/1",
            todos: [],
            state: "open",
            checks: "pending",
            review: "waiting",
            reportedAt: "2026-10-28T10:00:00Z",
            by: "claude-code",
          },
        ],
      }),
    ).toBe(true);
  });

  it("has no panel for a missing record or one with only alignment and decisions", () => {
    expect(showsWorkPanel(null)).toBe(false);
    expect(
      showsWorkPanel({
        ...record([]),
        alignment: { askedAt: "2026-10-28T09:00:00Z", questions: [] },
      }),
    ).toBe(false);
  });
});

describe("prLabel", () => {
  it("shortens a GitHub pull request to owner, repo and number", () => {
    expect(prLabel("https://github.com/owner/repo/pull/12")).toBe("owner/repo#12");
  });

  it("shortens a GitLab merge request the same way", () => {
    expect(prLabel("https://gitlab.com/group/repo/-/merge_requests/7")).toBe("group/repo!7");
  });

  it("shows any other link without its scheme", () => {
    expect(prLabel("https://example.com/reviews/3")).toBe("example.com/reviews/3");
  });
});

describe("prBadges", () => {
  it("says the state, the checks and the review in that order", () => {
    expect(prBadges(pr()).map((b) => b.label)).toEqual([
      "Open",
      "Checks pending",
      "Review waiting",
    ]);
  });

  it("flags failing checks and requested changes", () => {
    const badges = prBadges(pr({ checks: "failing", review: "changes-requested" }));

    expect(badges.map((b) => [b.label, b.variant])).toEqual([
      ["Open", "outline"],
      ["Checks failing", "destructive"],
      ["Changes requested", "destructive"],
    ]);
  });

  it("says a draft is a draft", () => {
    expect(prBadges(pr({ state: "draft" }))[0]).toEqual({ label: "Draft", variant: "outline" });
  });

  it("marks a merged PR", () => {
    const badges = prBadges(pr({ state: "merged", checks: "passing", review: "approved" }));

    expect(badges.map((b) => [b.label, b.variant])).toEqual([
      ["Merged", "default"],
      ["Checks passing", "outline"],
      ["Approved", "outline"],
    ]);
  });
});

describe("offersCompletion", () => {
  const withPrs = (prs: Pr[]): WorkRecord => ({ ...record([]), prs });

  it("offers completion once every recorded PR on an in-review plan is merged", () => {
    const merged = withPrs([pr({ state: "merged" }), pr({ url: "b", state: "merged" })]);

    expect(offersCompletion("in-review", merged)).toBe(true);
  });

  it("waits while any PR is still open or was closed", () => {
    expect(
      offersCompletion("in-review", withPrs([pr({ state: "merged" }), pr({ state: "open" })])),
    ).toBe(false);
    expect(offersCompletion("in-review", withPrs([pr({ state: "closed" })]))).toBe(false);
  });

  it("waits while any PR is still a draft", () => {
    expect(
      offersCompletion("in-review", withPrs([pr({ state: "merged" }), pr({ state: "draft" })])),
    ).toBe(false);
  });

  it("offers nothing for a plan with no PRs or no record", () => {
    expect(offersCompletion("in-review", withPrs([]))).toBe(false);
    expect(offersCompletion("in-review", null)).toBe(false);
  });

  it("offers nothing outside in-review", () => {
    const merged = withPrs([pr({ state: "merged" })]);

    expect(offersCompletion("in-progress", merged)).toBe(false);
    expect(offersCompletion("completed", merged)).toBe(false);
  });
});

describe("repoLabel", () => {
  it("names a repo by owner and name from its remote", () => {
    const named = (remote: string) => repoLabel({ path: "~/code/x", remote });

    expect(named("github.com/owner/repo")).toBe("owner/repo");
    expect(named("https://github.com/owner/repo.git")).toBe("owner/repo");
    expect(named("git@github.com:owner/repo.git")).toBe("owner/repo");
    expect(named("gitlab.com/owner/repo/")).toBe("owner/repo");
  });

  it("names a plain folder by the last part of its path", () => {
    expect(repoLabel({ path: "~/Personal/notes" })).toBe("notes");
    expect(repoLabel({ path: "~/Personal/notes/" })).toBe("notes");
    expect(repoLabel({ path: "C:\\work\\thing" })).toBe("thing");
  });
});

describe("mostAdvancedPr", () => {
  it("picks merged over open over draft over closed", () => {
    expect(mostAdvancedPr(["closed", "draft", "open", "merged"])).toBe("merged");
    expect(mostAdvancedPr(["closed", "draft", "open"])).toBe("open");
    expect(mostAdvancedPr(["closed", "draft"])).toBe("draft");
    expect(mostAdvancedPr(["closed"])).toBe("closed");
  });

  it("has nothing to pick without a PR", () => {
    expect(mostAdvancedPr([])).toBeNull();
  });
});

describe("PR_MARKS", () => {
  it("colours each state the way GitHub does, through the theme tokens", () => {
    expect(PR_MARKS.open.tone).toBe("text-success");
    expect(PR_MARKS.draft.tone).toBe("text-muted-foreground");
    expect(PR_MARKS.merged.tone).toBe("text-merged");
    expect(PR_MARKS.closed.tone).toBe("text-destructive");
    expect(PR_MARKS.none.tone).toBe("text-muted-foreground");
  });

  it("names every state, and a plan still waiting for its first PR", () => {
    expect(Object.values(PR_MARKS).map((mark) => mark.label)).toEqual([
      "Open",
      "Draft",
      "Merged",
      "Closed",
      "No pull request yet",
    ]);
  });
});

describe("prSummaryText", () => {
  it("lists each pull request with its state", () => {
    const text = prSummaryText({
      reported: [
        { url: "https://github.com/owner/repo/pull/1", state: "merged" },
        { url: "https://github.com/owner/repo/pull/2", state: "draft" },
      ],
      expected: true,
    });

    expect(text).toBe("owner/repo#1 merged\nowner/repo#2 draft");
  });

  it("says no pull request is open yet when none is reported", () => {
    expect(prSummaryText({ reported: [], expected: true })).toBe("No pull request yet");
  });
});

describe("chosenOptions", () => {
  const asked = question("q1", "tests");

  it("is what the person picked", () => {
    const picked = chosenOptions({ ...asked, answer: { kind: "option", options: ["b"] } });

    expect(picked.map((option) => option.id)).toEqual(["b"]);
  });

  it("is the recommended option when the agent decides", () => {
    const picked = chosenOptions({ ...asked, answer: { kind: "agent" } });

    expect(picked.map((option) => option.id)).toEqual(["a"]);
  });

  it("is none for a typed answer or no answer", () => {
    expect(chosenOptions({ ...asked, answer: { kind: "text", text: "Neither" } })).toEqual([]);
    expect(chosenOptions(asked)).toEqual([]);
  });
});
