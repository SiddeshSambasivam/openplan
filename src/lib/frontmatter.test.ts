import { describe, expect, it } from "vitest";
import { splitFrontmatter, stripFrontmatter } from "./frontmatter";

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

describe("splitFrontmatter", () => {
  it("keeps the block verbatim so it can be put back unchanged", () => {
    const text = "---\nid: a\ntitle: Alpha\n---\n# Alpha\n";

    const { header, body } = splitFrontmatter(text);

    expect(header + body).toBe(text);
    expect(body).toBe("# Alpha\n");
  });

  it("keeps a folders list verbatim, in either form", () => {
    for (const folders of ["folders: [Search, Infra]\n", "folders:\n  - Search\n  - Infra\n"]) {
      const text = `---\nid: a\n${folders}status: alignment\n---\n# Alpha\n`;

      const { header, body } = splitFrontmatter(text);

      expect(header).toBe(`---\nid: a\n${folders}status: alignment\n---\n`);
      expect(body).toBe("# Alpha\n");
    }
  });

  it("has no block for a plan that carries none", () => {
    const { header, body } = splitFrontmatter("# Alpha\n");

    expect(header).toBe("");
    expect(body).toBe("# Alpha\n");
  });
});
