import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CARD_DISPLAY_DEFAULTS } from "@/lib/cardDisplay";
import type { PlanSummary, Status } from "@/lib/planBase";
import { BoardView } from "./BoardView";
import type { PlanActionsValue } from "./PlanActions";
import { SelectionArea } from "./SelectionArea";

function plan(id: string, status: Status = "draft"): PlanSummary {
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
    demo: false,
    documents: [],
    folders: [],
    completed: null,
  };
}

function actions(plans: PlanSummary[], selected: string[]): PlanActionsValue {
  return {
    selected: new Set(selected),
    select: () => {},
    plans: new Map(plans.map((p) => [p.path, p])),
    folders: [],
    open: () => {},
    archive: () => {},
    remove: () => {},
    toggleFolder: () => {},
  };
}

function render(plans: PlanSummary[], selected: string[]) {
  return renderToStaticMarkup(
    <TooltipProvider>
      <SelectionArea actions={actions(plans, selected)}>
        <BoardView
          plans={plans}
          summaries={[]}
          sessions={new Map()}
          progress={new Map()}
          display={CARD_DISPLAY_DEFAULTS}
          folders={[]}
          onFoldersChange={() => {}}
          onOpen={() => {}}
          onComplete={() => {}}
        />
      </SelectionArea>
    </TooltipProvider>,
  );
}

describe("SelectionArea", () => {
  const plans = [plan("a"), plan("b"), plan("c", "in-review")];

  it("marks every card with its plan, and the selected ones as selected", () => {
    const html = render(plans, ["/base/a.md", "/base/c.md"]);
    expect(html.match(/data-plan-path=/g)).toHaveLength(3);
    expect(html).toMatch(/data-plan-path="\/base\/a\.md" data-selected="true"/);
    expect(html).toMatch(/data-plan-path="\/base\/b\.md" class=/);
    expect(html).toMatch(/data-plan-path="\/base\/c\.md" data-selected="true"/);
  });

  it("shows the bar with the count while anything is selected", () => {
    const html = render(plans, ["/base/a.md", "/base/b.md", "/base/c.md"]);
    expect(html).toContain("3 selected");
    expect(html).toContain("Archive");
    expect(html).toContain("Move to folder");
    expect(html).toContain("Delete");
    expect(html).toContain('aria-label="Clear the selection"');
  });

  it("shows no bar with nothing selected", () => {
    expect(render(plans, [])).not.toContain('role="toolbar"');
  });
});
