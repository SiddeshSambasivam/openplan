import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PlanSummary, Status } from "@/lib/planBase";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BoardView } from "./BoardView";

function plan(id: string, status: Status): PlanSummary {
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
  };
}

function board(plans: PlanSummary[]) {
  return renderToStaticMarkup(
    <TooltipProvider>
      <BoardView
        plans={plans}
        summaries={[]}
        sessions={new Map()}
        progress={new Map()}
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

  it("keeps a lifted card inside the column's clip", () => {
    expect(board([plan("a", "draft")])).toContain("overflow-y-auto px-1 pt-1");
  });
});
