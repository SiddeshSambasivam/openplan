import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PlanSummary, Status } from "@/lib/planBase";
import { CARD_DISPLAY_DEFAULTS, type CardDisplay } from "@/lib/cardDisplay";
import type { PlanProgress } from "@/lib/work";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BoardView } from "./BoardView";

function plan(id: string, status: Status, extra: Partial<PlanSummary> = {}): PlanSummary {
  return {
    id,
    title: `Plan ${id}`,
    status,
    type: null,
    source: "claude-code",
    pr: null,
    created: null,
    updated: null,
    path: `/base/${id}.md`,
    relativePath: `${id}.md`,
    documents: [],
    folders: [],
    completed: null,
    ...extra,
  };
}

function board(
  plans: PlanSummary[],
  display: CardDisplay = CARD_DISPLAY_DEFAULTS,
  progress: Map<string, PlanProgress> = new Map(),
) {
  return renderToStaticMarkup(
    <TooltipProvider>
      <BoardView
        plans={plans}
        summaries={[]}
        sessions={new Map()}
        progress={progress}
        display={display}
        folders={[]}
        onFoldersChange={() => {}}
        onOpen={() => {}}
      />
    </TooltipProvider>,
  );
}

describe("BoardView hidden columns", () => {
  it("keeps finished work behind one Hidden control, closed by default", () => {
    const html = board([plan("a", "draft"), plan("b", "completed"), plan("c", "archived")]);
    expect(html).toContain("Hidden");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Fold away");
    expect(html).not.toContain("Plan b");
    expect(html).not.toContain("Plan c");
    expect(html).toContain("Plan a");
  });

  it("lists the folded columns even when they are empty", () => {
    const html = board([plan("a", "draft")]);
    expect(html).toContain("Hidden");
    expect(html).toContain('tabular-nums">0<');
  });

  it("shows the animated empty state when the base has no plans", () => {
    const html = board([]);
    expect(html).toContain("empty-scene");
    expect(html).toContain("No plans yet");
    expect(html).not.toContain("Hidden");
  });

  it("shows the empty state, with a way to the finished plans, when every plan is finished", () => {
    const html = board([plan("b", "completed"), plan("c", "archived")]);
    expect(html).toContain("empty-scene");
    expect(html).toContain("Nothing in progress");
    expect(html).toContain("Show 2 finished plans");
    expect(html).not.toContain("Plan b");
  });

  it("keeps a lifted card inside the column's clip", () => {
    expect(board([plan("a", "draft")])).toContain("overflow-y-auto px-1 pt-1 pb-16");
  });
});

describe("BoardView card display", () => {
  const long = plan("a", "draft", { title: "A long plan title that wraps" });

  it("clamps the title to two lines and puts the full title in the tooltip", () => {
    const html = board([long], { ...CARD_DISPLAY_DEFAULTS, clampTitle: true });

    expect(html).toContain("line-clamp-2");
    expect(html).toContain('title="A long plan title that wraps"');
  });

  it("shows the whole title without a tooltip when the clamp is off", () => {
    const html = board([long]);

    expect(html).not.toContain("line-clamp-2");
    expect(html).not.toContain('title="A long plan title that wraps"');
  });

  it("shows the plan's repos with their branch and its PRs, unless switched off", () => {
    const work: PlanProgress = {
      path: long.path,
      done: 0,
      total: 0,
      repos: [{ path: "~/code/openplan", remote: "github.com/owner/openplan", branch: "feat/x" }],
      prs: { reported: [{ url: "https://github.com/owner/openplan/pull/3", state: "open" }], expected: true },
    };
    const progress = new Map([[long.path, work]]);

    const shown = board([long], CARD_DISPLAY_DEFAULTS, progress);
    expect(shown).toContain("owner/openplan");
    expect(shown).toContain("feat/x");
    expect(shown).toContain("owner/openplan#3 open");

    const hidden = board([long], { ...CARD_DISPLAY_DEFAULTS, repos: false, prs: false }, progress);
    expect(hidden).not.toContain("owner/openplan");
    expect(hidden).not.toContain("owner/openplan#3");
  });

  it("tags a plan filed in the last few minutes as New", () => {
    const fresh = plan("b", "draft", { created: new Date().toISOString() });
    const old = plan("c", "draft", { created: "2020-01-01T00:00:00Z" });

    expect(board([fresh])).toContain(">New<");
    expect(board([old])).not.toContain(">New<");
  });
});
