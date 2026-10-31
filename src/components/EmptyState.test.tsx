import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("says no plan is open and where plans come from", () => {
    const html = renderToStaticMarkup(<EmptyState />);
    expect(html).toContain("No plan open");
    expect(html).toContain("Pick a plan from the board, or wait for an agent to file one.");
  });
});
