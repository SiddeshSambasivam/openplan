import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PlanSummary } from "@/lib/planBase";
import { CARD_DISPLAY_DEFAULTS } from "@/lib/cardDisplay";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ListView } from "./ListView";

function plan(id: string, extra: Partial<PlanSummary> = {}): PlanSummary {
  return {
    id,
    title: `Plan ${id}`,
    status: "draft",
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
    ...extra,
  };
}

function list(plans: PlanSummary[]) {
  return renderToStaticMarkup(
    <TooltipProvider>
      <ListView
        plans={plans}
        summaries={[]}
        sessions={new Map()}
        progress={new Map()}
        display={CARD_DISPLAY_DEFAULTS}
        activePlanPath={null}
        onSelectPlan={() => {}}
        onSelectDocument={() => {}}
        onRenamePlan={() => {}}
        onRenameDocument={() => {}}
        items={[]}
        activeId={null}
        expanded={new Set()}
        onToggleDir={() => {}}
        onSelect={() => {}}
        onRemove={() => {}}
      />
    </TooltipProvider>,
  );
}

describe("ListView tags", () => {
  it("tags a demo plan as Demo, in place of New", () => {
    const demo = plan("d", { demo: true, created: new Date().toISOString() });

    expect(list([demo])).toContain(">Demo<");
    expect(list([demo])).not.toContain(">New<");
    expect(list([plan("e")])).not.toContain(">Demo<");
  });

  it("tags a plan filed in the last few minutes as New", () => {
    const fresh = plan("b", { created: new Date().toISOString() });

    expect(list([fresh])).toContain(">New<");
  });
});
