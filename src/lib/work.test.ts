import { describe, expect, it } from "vitest";
import {
  offersCompletion,
  ownerAvatarUrl,
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
  answerFromDraft,
  pendingQuestions,
  pendingQuestionsLabel,
  questionsByRound,
  showsWorkPanel,
  unusedRoles,
  unusedRolesText,
  TODO_MARKS,
  todoTitle,
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

describe("pendingQuestions", () => {
  it("lists the questions with no answer, in the order they were asked", () => {
    const pending = pendingQuestions({
      ...record([]),
      alignment: {
        askedAt: "2026-10-28T09:00:00Z",
        questions: [
          question("q1", "tests"),
          question("q2", "scale", { answer: { kind: "text", text: "Small" } }),
          question("q3", "tests"),
        ],
      },
    });

    expect(pending.map((q) => q.id)).toEqual(["q1", "q3"]);
  });

  it("has none without an alignment or a record", () => {
    expect(pendingQuestions(record([]))).toEqual([]);
    expect(pendingQuestions(null)).toEqual([]);
  });
});

describe("questionsByRound", () => {
  it("puts the newest round first and keeps the asked order within a round", () => {
    const groups = questionsByRound([
      question("q1", "tests"),
      question("q2", "scale", { round: 2 }),
      question("q3", "tests", { round: 1 }),
      question("q4", "tests", { round: 2 }),
    ]);

    expect(groups.map((g) => [g.round, g.questions.map((q) => q.id)])).toEqual([
      [2, ["q2", "q4"]],
      [1, ["q1", "q3"]],
    ]);
  });

  it("has no groups without questions", () => {
    expect(questionsByRound([])).toEqual([]);
  });
});

describe("unusedRoles", () => {
  it("names the roles no question came from, in the team's order", () => {
    const roles = unusedRoles([
      question("q1", "scope", { role: "product" }),
      question("q2", "scale", { role: "engineering" }),
    ]);

    expect(roles).toEqual(["design", "oncall"]);
  });

  it("names none for questions from before roles", () => {
    expect(unusedRoles([question("q1", "scope")])).toEqual([]);
  });
});

describe("unusedRolesText", () => {
  it("says which roles had nothing to ask", () => {
    expect(unusedRolesText(["design", "oncall"])).toBe(
      "The designer and on-call had nothing to ask on this plan.",
    );
    expect(unusedRolesText(["product", "engineering", "design"])).toBe(
      "The product owner, the tech lead and the designer had nothing to ask on this plan.",
    );
    expect(unusedRolesText(["oncall"])).toBe("On-call had nothing to ask on this plan.");
  });

  it("says nothing when every role asked", () => {
    expect(unusedRolesText([])).toBeNull();
  });
});

describe("answerFromDraft", () => {
  const asked = question("q1", "tests");

  it("answers with the picked option", () => {
    expect(answerFromDraft(asked, { option: "b", text: " " })).toEqual({
      kind: "option",
      options: ["b"],
    });
  });

  it("answers with the text alone when no option is picked", () => {
    expect(answerFromDraft(asked, { text: "  Only the parser " })).toEqual({
      kind: "text",
      text: "Only the parser",
    });
  });

  it("keeps the reasoning with a picked option by naming the option in the text", () => {
    expect(answerFromDraft(asked, { option: "b", text: "The parser is the risk." })).toEqual({
      kind: "text",
      text: "End to end. The parser is the risk.",
    });
  });

  it("gives no answer for an empty draft", () => {
    expect(answerFromDraft(asked, { text: "" })).toBeNull();
    expect(answerFromDraft(asked, undefined)).toBeNull();
  });
});

describe("pendingQuestionsLabel", () => {
  it("counts the questions waiting on the person", () => {
    expect(pendingQuestionsLabel(1, "alignment")).toBe("1 question");
    expect(pendingQuestionsLabel(3, "in-review")).toBe("3 questions");
  });

  it("says the work waits on an answer once the plan is in progress", () => {
    expect(pendingQuestionsLabel(2, "in-progress")).toBe("Needs your answer");
  });

  it("says nothing without questions", () => {
    expect(pendingQuestionsLabel(0, "in-progress")).toBeNull();
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

    expect(answer).toEqual({ kind: "agent", text: "Agent decided" });
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

describe("ownerAvatarUrl", () => {
  const avatar = (remote?: string) => ownerAvatarUrl({ path: "~/code/x", remote }, 40);

  it("points a github.com remote at its owner's avatar, whatever the URL shape", () => {
    const url = "https://github.com/acme-co.png?size=40";

    expect(avatar("github.com/acme-co/repo")).toBe(url);
    expect(avatar("https://github.com/acme-co/repo")).toBe(url);
    expect(avatar("https://github.com/acme-co/repo.git")).toBe(url);
    expect(avatar("git@github.com:acme-co/repo.git")).toBe(url);
    expect(avatar("ssh://git@github.com/acme-co/repo")).toBe(url);
  });

  it("gives none for other hosts, look-alike hosts and plain folders", () => {
    expect(avatar("gitlab.com/acme/repo")).toBeNull();
    expect(avatar("https://notgithub.com/acme/repo")).toBeNull();
    expect(avatar("https://github.com.example.com/acme/repo")).toBeNull();
    expect(avatar("github.com/acme")).toBeNull();
    expect(avatar(undefined)).toBeNull();
  });
});

describe("todoTitle", () => {
  const shown = (text: string, detail?: string) =>
    todoTitle({ ...todo("t1", "open"), text, detail });

  it("takes the title from text and the detail as written when the todo has one", () => {
    expect(shown("Add the detail field. Old ones split.", "Agents pass it.")).toEqual({
      title: "Add the detail field. Old ones split.",
      detail: "Agents pass it.",
    });
  });

  it("splits an older todo after its first sentence", () => {
    expect(shown("Add the field. Then wire it up. Then test it.")).toEqual({
      title: "Add the field.",
      detail: "Then wire it up. Then test it.",
    });
  });

  it("keeps a one-sentence todo whole, with no detail", () => {
    expect(shown("Add the field.")).toEqual({ title: "Add the field.", detail: "" });
    expect(shown("Add the field")).toEqual({ title: "Add the field", detail: "" });
  });

  it("does not split on an abbreviation or a file name", () => {
    expect(shown("Parse remotes, e.g. git@ ones, in plan.rs and work.ts. Test both.")).toEqual({
      title: "Parse remotes, e.g. git@ ones, in plan.rs and work.ts.",
      detail: "Test both.",
    });
  });
});
