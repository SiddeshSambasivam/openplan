import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PR_STATE_NOTE, PrReadsAvailable } from "@/lib/prState";
import type { PrSummary } from "@/lib/work";
import { PrCount, PrGlyph, QuestionCount, RepoMark } from "./PlanFacts";

const summary = (states: PrSummary["reported"][number]["state"][], expected = true) => ({
  reported: states.map((state, index) => ({
    url: `https://github.com/owner/repo/pull/${index + 1}`,
    state,
  })),
  expected,
});

describe("PrGlyph", () => {
  it("draws one icon per state, in that state's colour", () => {
    const drawn = (state: Parameters<typeof PrGlyph>[0]["state"]) =>
      renderToStaticMarkup(<PrGlyph state={state} />);

    expect(drawn("open")).toContain("lucide-git-pull-request ");
    expect(drawn("open")).toContain("text-success");
    expect(drawn("draft")).toContain("lucide-git-pull-request-draft");
    expect(drawn("merged")).toContain("lucide-git-merge");
    expect(drawn("merged")).toContain("text-merged");
    expect(drawn("closed")).toContain("lucide-git-pull-request-closed");
    expect(drawn("closed")).toContain("text-destructive");
    expect(drawn("none")).toContain("lucide-git-pull-request-create ");
    expect(drawn("none")).toContain("text-muted-foreground");
  });
});

describe("PrCount", () => {
  it("shows the most advanced PR's icon, with the count past one", () => {
    const html = renderToStaticMarkup(<PrCount prs={summary(["draft", "merged", "closed"])} />);

    expect(html).toContain("lucide-git-merge");
    expect(html).not.toContain("lucide-git-pull-request-draft");
    expect(html).toContain(">3<");
    expect(html).toContain("owner/repo#1 draft");
  });

  it("shows no count for a single PR", () => {
    const html = renderToStaticMarkup(<PrCount prs={summary(["open"])} />);

    expect(html).toContain("lucide-git-pull-request ");
    expect(html).not.toContain(">1<");
  });

  it("shows a muted icon while a plan in a repo has no PR yet", () => {
    const html = renderToStaticMarkup(<PrCount prs={summary([])} />);

    expect(html).toContain("lucide-git-pull-request-create");
    expect(html).toContain("No pull request yet");
  });

  it("says the state is the agent's report while the app cannot read it", () => {
    const html = (prs: PrSummary, available: boolean) =>
      renderToStaticMarkup(
        <PrReadsAvailable.Provider value={available}>
          <PrCount prs={prs} />
        </PrReadsAvailable.Provider>,
      );
    const note = PR_STATE_NOTE.replace(/'/g, "&#x27;");

    expect(html(summary(["open"]), false)).toContain(note);
    expect(html(summary(["open"]), true)).not.toContain(note);
    expect(html(summary([]), false)).not.toContain(note);
  });

  it("shows nothing for a plan that has no repo and no PR", () => {
    expect(renderToStaticMarkup(<PrCount prs={summary([], false)} />)).toBe("");
    expect(renderToStaticMarkup(<PrCount />)).toBe("");
  });
});

describe("RepoMark", () => {
  const drawn = (remote?: string) =>
    renderToStaticMarkup(<RepoMark repo={{ path: "~/code/x", remote }} />);

  it("shows the owner's avatar for a github.com repo", () => {
    expect(drawn("git@github.com:owner/repo.git")).toContain(
      'src="https://github.com/owner.png?size=32"',
    );
  });

  it("keeps the repo icon for other hosts and the folder icon for plain folders", () => {
    expect(drawn("gitlab.com/owner/repo")).toContain("lucide-folder-git2");
    expect(drawn(undefined)).toContain("lucide-folder ");
  });
});

describe("QuestionCount", () => {
  it("counts the questions waiting, and says the work waits once it has started", () => {
    expect(renderToStaticMarkup(<QuestionCount count={2} status="alignment" />)).toContain(
      "2 questions",
    );
    expect(renderToStaticMarkup(<QuestionCount count={2} status="in-progress" />)).toContain(
      "Needs your answer",
    );
    expect(renderToStaticMarkup(<QuestionCount count={0} status="alignment" />)).toBe("");
  });
});
