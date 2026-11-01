import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BoardEmptyState } from "./BoardEmptyState";

describe("BoardEmptyState", () => {
  it("says what a session with an agent leads to", () => {
    const html = renderToStaticMarkup(<BoardEmptyState />);
    expect(html).toContain("Start a session with your agent");
    expect(html).toContain(
      "Ask Claude Code, Codex or Cursor to plan a change. The plan lands here as a Draft, and your reviewers ask what it leaves open before anyone builds.",
    );
    expect(html).toContain("Plan dark mode for the notes app");
  });

  it("offers no setup before it knows no agent is there", () => {
    expect(renderToStaticMarkup(<BoardEmptyState />)).not.toContain("Set up an agent");
  });

  it("takes its own title and keeps its action", () => {
    const html = renderToStaticMarkup(
      <BoardEmptyState title="Nothing in progress">
        <button>Show</button>
      </BoardEmptyState>,
    );
    expect(html).toContain("Nothing in progress");
    expect(html).toContain("<button>Show</button>");
    expect(html).not.toContain("Start a session with your agent");
  });

  it("starts paused where no window can be seen", () => {
    // A static render has no document, so the scene must not run.
    expect(renderToStaticMarkup(<BoardEmptyState />)).toContain('data-paused="true"');
  });
});
