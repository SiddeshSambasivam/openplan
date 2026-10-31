import { describe, expect, it } from "vitest";
import { outlineIndentPx, toOutlineItems, type HeadingLike } from "./outline";

function heading(tagName: string, id: string, textContent: string | null): HeadingLike {
  return { tagName, id, textContent };
}

describe("toOutlineItems", () => {
  it("reads id, text, and level from each heading", () => {
    const items = toOutlineItems([
      heading("H2", "getting-started", "Getting started"),
      heading("H3", "tips", "Tips"),
    ]);

    expect(items).toEqual([
      { id: "getting-started", text: "Getting started", level: 2 },
      { id: "tips", text: "Tips", level: 3 },
    ]);
  });

  it("collapses the whitespace a heading picks up from inline markup", () => {
    const items = toOutlineItems([heading("H2", "a", "\n  Multi   word\n  title\n")]);

    expect(items[0].text).toBe("Multi word title");
  });

  it("skips headings that cannot be linked to or labelled", () => {
    const items = toOutlineItems([
      heading("H2", "", "No anchor"),
      heading("H2", "blank", "   "),
      heading("H2", "empty", null),
      heading("H2", "keep", "Keep"),
    ]);

    expect(items).toEqual([{ id: "keep", text: "Keep", level: 2 }]);
  });

  it("returns nothing for a document without headings", () => {
    expect(toOutlineItems([])).toEqual([]);
  });
});

describe("outlineIndentPx", () => {
  it("leaves top-level headings flush", () => {
    expect(outlineIndentPx(2)).toBe(0);
  });

  it("indents each level further than the one above it", () => {
    expect(outlineIndentPx(3)).toBeGreaterThan(outlineIndentPx(2));
    expect(outlineIndentPx(4)).toBeGreaterThan(outlineIndentPx(3));
  });

  it("never indents negatively, whatever the level", () => {
    expect(outlineIndentPx(1)).toBe(0);
  });
});
