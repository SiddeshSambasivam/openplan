import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("says no plan is open and where plans come from", () => {
    const html = renderToStaticMarkup(<EmptyState />);
    expect(html).toContain("No plan open");
    expect(html).toContain("Pick a plan from the board, or wait for an agent to file one.");
  });

  it("draws three sheets on clocks that share no factor", () => {
    const html = renderToStaticMarkup(<EmptyState />);
    expect(html.match(/class="empty-sheet"/g)).toHaveLength(3);
    expect(html).toContain("--duration:7.3s");
    expect(html).toContain("--duration:9.7s");
    expect(html).toContain("--duration:12.1s");
  });

  it("starts paused where no window can be seen", () => {
    // A static render has no document, so the scene must not run.
    expect(renderToStaticMarkup(<EmptyState />)).toContain('data-paused="true"');
  });
});
