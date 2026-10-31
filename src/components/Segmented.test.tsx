import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Segmented } from "./Segmented";

function buttons(value: "plan" | "alignment"): { pressed: string; other: string } {
  const html = renderToStaticMarkup(
    <Segmented
      value={value}
      options={[
        { value: "plan", label: "Plan" },
        { value: "alignment", label: "Alignment" },
      ]}
      onChange={() => {}}
    />,
  );
  const tags = html.match(/<button[^>]*>/g) ?? [];
  return {
    pressed: tags.find((tag) => tag.includes('aria-pressed="true"')) ?? "",
    other: tags.find((tag) => tag.includes('aria-pressed="false"')) ?? "",
  };
}

describe("Segmented", () => {
  it("marks one item pressed and the other not", () => {
    const { pressed, other } = buttons("alignment");
    expect(pressed).not.toBe("");
    expect(other).not.toBe("");
  });

  // Hover tints the chosen item in dark mode unless both themes' hover
  // classes say its own background.
  it("keeps the chosen item's background on hover in both themes", () => {
    const { pressed } = buttons("plan");
    expect(pressed).toContain("hover:bg-background");
    expect(pressed).toContain("dark:hover:bg-background");
    expect(pressed).not.toContain("hover:bg-accent");
  });

  it("tints only the items that are not chosen", () => {
    expect(buttons("plan").other).toContain("hover:bg-accent");
  });
});
