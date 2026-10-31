import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Header } from "./Header";

const noop = () => {};

function bar(overrides: Partial<ComponentProps<typeof Header>> = {}): string {
  return renderToStaticMarkup(
    <TooltipProvider>
      <Header
        mainView="board"
        title={null}
        back={null}
        onBack={noop}
        work={null}
        workOpen={false}
        onToggleWork={noop}
        plan={null}
        onStatusChange={noop}
        statusOpen={false}
        onStatusOpenChange={noop}
        offerCompletion={false}
        folders={[]}
        folder={null}
        onSelectFolder={noop}
        doc={null}
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
        canComment={false}
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
      />
    </TooltipProvider>,
  );
}

function expandMark(html: string): string {
  return html.match(/<button[^>]*aria-label="Expand navbar"[^>]*>/)?.[0] ?? "";
}

describe("Header", () => {
  it("asks to complete the plan once every PR reads merged", () => {
    const plan = {
      id: "a",
      title: "Plan a",
      status: "in-review" as const,
      type: null,
      source: "claude-code" as const,
      pr: null,
      created: null,
      updated: null,
      path: "/base/a.md",
      relativePath: "a.md",
      documents: [],
      folders: [],
      completed: null,
    };

    const html = bar({ mainView: "plan", title: "Plan a", plan, offerCompletion: true });

    expect(html).toContain("All PRs merged.");
    expect(html).toContain("Mark completed?");
    expect(bar({ mainView: "plan", title: "Plan a", plan })).not.toContain("Mark completed?");
  });

  it("has no theme control, which lives in the profile menu", () => {
    expect(bar()).not.toMatch(/theme/i);
  });

  it("keeps the expand mark out of reach beside the expanded navbar", () => {
    const mark = expandMark(bar());
    expect(mark).toContain('tabindex="-1"');
    expect(mark).toContain('aria-hidden="true"');
  });

  it("offers the expand mark when the navbar is minimized", () => {
    const mark = expandMark(bar({ navbarMinimized: true, layout: { pull: 48, lead: 114 } }));
    expect(mark).not.toBe("");
    expect(mark).not.toContain("tabindex");
    expect(mark).not.toContain("aria-hidden");
  });

  it("reaches over the rail by the layout's pull", () => {
    expect(bar({ layout: { pull: 48, lead: 114 } })).toContain("margin-left:-48px");
    expect(bar({ layout: { pull: 48, lead: 114 } })).toContain("width:114px");
  });
});
