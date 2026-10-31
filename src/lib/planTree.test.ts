import { describe, expect, it } from "vitest";
import { buildSetTree, documentLabel } from "./planTree";

describe("documentLabel", () => {
  it("reads a numbered document as what it is about", () => {
    expect(documentLabel("01-current-state.md")).toBe("Current state");
    expect(documentLabel("09-verification-rollback-cleanup.md")).toBe(
      "Verification rollback cleanup",
    );
  });

  it("leaves a document that is not numbered alone", () => {
    expect(documentLabel("README.md")).toBe("README");
  });
});

describe("buildSetTree", () => {
  it("keeps documents in reading order", () => {
    const tree = buildSetTree(["02-decisions.md", "01-current-state.md"]);

    expect(tree.map((n) => n.name)).toEqual([
      "01-current-state.md",
      "02-decisions.md",
    ]);
  });

  it("nests a folder rather than flattening it away", () => {
    const tree = buildSetTree(["01-a.md", "archive/old.md", "archive/older.md"]);

    const archive = tree.find((n) => n.name === "archive");
    expect(archive?.kind).toBe("folder");
    expect(archive?.kind === "folder" && archive.children.map((c) => c.name)).toEqual([
      "old.md",
      "older.md",
    ]);
  });

  it("puts folders after the documents beside them", () => {
    const tree = buildSetTree(["archive/old.md", "01-a.md"]);

    expect(tree.map((n) => n.kind)).toEqual(["document", "folder"]);
  });

  it("handles nesting more than one deep", () => {
    const tree = buildSetTree(["archive/2025/old.md"]);

    const archive = tree[0];
    expect(archive.kind === "folder" && archive.children[0].name).toBe("2025");
  });

  it("has nothing to show for a plan that is one file", () => {
    expect(buildSetTree([])).toEqual([]);
  });
});
