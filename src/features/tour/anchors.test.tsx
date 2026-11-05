import type { ComponentProps, ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Header } from "@/components/Header";
import { Markdown } from "@/components/Markdown";
import { Sidebar } from "@/components/Sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BoardView } from "@/features/board/BoardView";
import { PeopleRail } from "@/features/plan/AlignmentQuestions";
import { AlignmentMessage } from "@/features/plan/AlignmentMessage";
import { AlignmentScoreCard } from "@/features/plan/AlignmentScoreCard";
import { ReposAndPrs } from "@/features/plan/ReposAndPrs";
import { TodoChecklist } from "@/features/plan/TodoChecklist";
import { alignmentScore } from "@/lib/alignmentScore";
import { CARD_DISPLAY_DEFAULTS } from "@/lib/cardDisplay";
import type { PlanSummary } from "@/lib/planBase";
import { TOUR_STEPS } from "@/lib/tour";
import type { Question, WorkRecord } from "@/lib/work";

const noop = () => {};

const draft: PlanSummary = {
  id: "demo-add-dark-mode",
  title: "Demo: add dark mode",
  status: "draft",
  type: null,
  source: "claude-code",
  pr: null,
  created: null,
  updated: null,
  path: "/base/demo-add-dark-mode.md",
  relativePath: "demo-add-dark-mode.md",
  demo: true,
  documents: [],
  folders: ["Demo"],
  completed: null,
};

const question: Question = {
  id: "q3",
  aspect: "Scope",
  role: "design",
  question: "Which pages get a PDF button?",
  options: [{ id: "a", label: "Every note" }],
  mustAnswer: false,
};

const record: WorkRecord = {
  version: 1,
  repos: [{ path: "notes-app" }],
  decisions: [],
  todos: [{ id: "t1", text: "Sync", state: "doing", by: "claude-code", at: "2026-10-31T00:00:00Z" }],
  prs: [],
};

function html(element: ReactElement): string {
  return renderToStaticMarkup(<TooltipProvider>{element}</TooltipProvider>);
}

function anchored(markup: string, anchor: string): boolean {
  return markup.includes(`data-tour="${anchor}"`);
}

function board(): string {
  return html(
    <BoardView
      plans={[draft]}
      folder={null}
      summaries={[]}
      sessions={new Map()}
      progress={new Map()}
      display={CARD_DISPLAY_DEFAULTS}
      folders={["Demo"]}
      onFoldersChange={noop}
      onOpen={noop}
      onComplete={noop}
    />,
  );
}

function sidebar(minimized: boolean): string {
  return html(
    <Sidebar
      minimized={minimized}
      onToggle={noop}
      onOpenPalette={noop}
      folders={["Demo"]}
      folder="Demo"
      onSelectFolder={noop}
      onCreateFolder={noop}
      onRemoveFolder={noop}
      recent={[]}
      view="board"
      onSelectView={noop}
      forYouCount={0}
      activePlanPath={null}
      onSelectPlan={noop}
      onEditProfile={noop}
      onOpenSettings={noop}
      onOpenShortcuts={noop}
      identity={null}
      dark={false}
      onToggleTheme={noop}
      windowControls={false}
    />,
  );
}

function header(overrides: Partial<ComponentProps<typeof Header>>): string {
  return html(
    <Header
      mainView="plan"
      title="Demo: add dark mode"
      back={null}
      onBack={noop}
      work={null}
      workOpen={false}
      onToggleWork={noop}
      plan={draft}
      onStatusChange={noop}
      statusOpen={false}
      onStatusOpenChange={noop}
      offerCompletion={false}
      folders={[]}
      folder={null}
      onSelectFolder={noop}
      doc={{ id: draft.path, name: "demo-add-dark-mode", path: draft.path }}
      wordCount={null}
      view="preview"
      canEdit={false}
      dirty={false}
      onToggleView={noop}
      contentWidth="spaced"
      onContentWidthChange={noop}
      fontSize="normal"
      onFontSizeChange={noop}
      outlineOpen={false}
      onToggleOutline={noop}
      canComment
      commentsOpen={false}
      onToggleComments={noop}
      openCommentCount={0}
      pendingCommentCount={0}
      onSendReview={noop}
      sendNotice={null}
      onOpenFind={noop}
      layout={{ pull: 0, lead: 16 }}
      navbarMinimized={false}
      onExpandNavbar={noop}
      {...overrides}
    />,
  );
}

describe("tour anchors", () => {
  it("covers every step", () => {
    expect(TOUR_STEPS.map((step) => step.anchor)).toEqual([
      "board",
      "card-demo-add-dark-mode",
      "folder-Demo",
      "try-comment",
      "review",
      "reviewers",
      "open-question",
      "score",
      "build",
      "todos",
      "repos-prs",
      "mark-completed",
      "palette",
    ]);
  });

  it("marks the board's columns", () => {
    expect(anchored(board(), "board")).toBe(true);
  });

  it("marks each plan card by its plan", () => {
    expect(anchored(board(), "card-demo-add-dark-mode")).toBe(true);
  });

  it("marks each navbar folder, open or minimized", () => {
    expect(anchored(sidebar(false), "folder-Demo")).toBe(true);
    expect(anchored(sidebar(true), "folder-Demo")).toBe(true);
  });

  it("marks the demo plan's Try a comment quote, and no other", () => {
    const quote = (text: string) => renderToStaticMarkup(<Markdown content={text} dark={false} />);
    expect(anchored(quote("> **Try a comment.** Select this sentence."), "try-comment")).toBe(true);
    expect(anchored(quote("> A plain quote."), "try-comment")).toBe(false);
  });

  it("marks Send review, and the comments button before there is one to send", () => {
    // The tour lights the first one in the page.
    const sending = header({ pendingCommentCount: 1 });
    expect(sending.indexOf('data-tour="review"')).toBeGreaterThan(-1);
    expect(sending.indexOf('data-tour="review"')).toBeLessThan(sending.indexOf("Send review"));
    expect(anchored(header({}), "review")).toBe(true);
  });

  it("marks the reviewer rail", () => {
    const rail = html(
      <PeopleRail tab="everyone" onTab={noop} roles={["design"]} waiting={[]} leaving={false} onLeft={noop} />,
    );
    expect(anchored(rail, "reviewers")).toBe(true);
  });

  it("marks a question still open, and not one answered or drafted", () => {
    const drafted = (
      <AlignmentMessage
        question={question}
        draft={{ text: "", option: "a" }}
        answer={{ kind: "option", options: ["a"] }}
        active={false}
        sent={false}
        onActivate={noop}
        onPick={noop}
        onWriteOwn={noop}
        onChange={noop}
        view={{ dark: false, media: false }}
      />
    );
    expect(anchored(html(drafted), "open-question")).toBe(false);
    const message = (answered: boolean) =>
      html(
        <AlignmentMessage
          question={answered ? { ...question, answer: { kind: "option", options: ["a"] } } : question}
          draft={undefined}
          answer={undefined}
          active={false}
          sent={false}
          onActivate={noop}
          onPick={noop}
          onWriteOwn={noop}
          onChange={noop}
          view={{ dark: false, media: false }}
        />,
      );
    expect(anchored(message(false), "open-question")).toBe(true);
    expect(anchored(message(true), "open-question")).toBe(false);
  });

  it("marks the score", () => {
    const score = html(<AlignmentScoreCard score={alignmentScore([question], [], { answers: {}, understanding: {} }, null)} target={80} />);
    expect(anchored(score, "score")).toBe(true);
  });

  it("marks Build", () => {
    expect(anchored(header({ onBuild: noop, buildBlocked: true }), "build")).toBe(true);
  });

  it("marks the todos", () => {
    expect(anchored(html(<TodoChecklist record={record} onOpen={noop} />), "todos")).toBe(true);
  });

  it("marks the repos and PRs", () => {
    expect(anchored(html(<ReposAndPrs repos={record.repos} prs={[]} />), "repos-prs")).toBe(true);
  });

  it("marks the offer to complete a plan", () => {
    expect(anchored(header({ offerCompletion: true }), "mark-completed")).toBe(true);
  });

  it("marks the search row that opens the command palette", () => {
    expect(anchored(sidebar(false), "palette")).toBe(true);
  });
});
