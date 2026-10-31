import { describe, expect, it } from "vitest";
import { stripFrontmatter } from "./frontmatter";

describe("stripFrontmatter", () => {
  it("removes the metadata block so it is not read as the opening paragraph", () => {
    const text = "---\nid: a\ntitle: Alpha\n---\n# Alpha\n\nbody\n";

    expect(stripFrontmatter(text)).toBe("# Alpha\n\nbody\n");
  });

  it("leaves a plan that has no metadata alone", () => {
    expect(stripFrontmatter("# Alpha\n\nbody\n")).toBe("# Alpha\n\nbody\n");
  });

  it("treats an unclosed fence as the rule someone wrote, not metadata", () => {
    const text = "---\n\n# Alpha\n";

    expect(stripFrontmatter(text)).toBe(text);
  });

  it("keeps a fence that appears later in the document", () => {
    const text = "---\ntitle: A\n---\n# A\n\n---\n\nafter the rule\n";

    expect(stripFrontmatter(text)).toBe("# A\n\n---\n\nafter the rule\n");
  });
});
