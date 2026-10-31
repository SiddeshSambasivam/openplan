import { describe, expect, it } from "vitest";
import {
  ancestorDirsOf,
  findDocInItems,
  firstDocInItems,
  firstFileOfTree,
  isPathWithin,
  updateInlineDoc,
} from "./tree";
import type { FolderNode, LibraryItem } from "./types";

function file(path: string, name = path.split("/").pop()!) {
  return { id: path, name, path };
}

/** guides/ { intro.md, deep/ { nested.md } } */
const guides: FolderNode = {
  name: "guides",
  path: "/w/guides",
  files: [file("/w/guides/intro.md", "intro")],
  dirs: [
    {
      name: "deep",
      path: "/w/guides/deep",
      files: [file("/w/guides/deep/nested.md", "nested")],
      dirs: [],
    },
  ],
};

const library: LibraryItem[] = [
  { kind: "file", ...file("/w/loose.md", "loose") },
  { kind: "folder", id: "/w/guides", name: "guides", path: "/w/guides", tree: guides },
];

describe("findDocInItems", () => {
  it("finds a loose document", () => {
    expect(findDocInItems(library, "/w/loose.md")?.name).toBe("loose");
  });

  it("finds a document nested inside a folder", () => {
    expect(findDocInItems(library, "/w/guides/deep/nested.md")?.name).toBe("nested");
  });

  it("returns nothing for an unknown or absent id", () => {
    expect(findDocInItems(library, "/w/gone.md")).toBeNull();
    expect(findDocInItems(library, null)).toBeNull();
  });
});

describe("firstFileOfTree", () => {
  it("prefers a file at the top over one buried deeper", () => {
    expect(firstFileOfTree(guides)?.name).toBe("intro");
  });

  it("descends when a level holds no files of its own", () => {
    const empty: FolderNode = { name: "top", path: "/t", files: [], dirs: [guides] };

    expect(firstFileOfTree(empty)?.name).toBe("intro");
  });

  it("returns nothing for a tree with no files anywhere", () => {
    expect(firstFileOfTree({ name: "t", path: "/t", files: [], dirs: [] })).toBeNull();
  });
});

describe("ancestorDirsOf", () => {
  it("lists the folders to expand to reveal a document", () => {
    expect(ancestorDirsOf(guides, "/w/guides/deep/nested.md")).toEqual([
      "/w/guides/deep",
    ]);
  });

  it("needs no expansion for a document at the root", () => {
    expect(ancestorDirsOf(guides, "/w/guides/intro.md")).toEqual([]);
  });

  it("returns nothing when the document is not in the tree", () => {
    expect(ancestorDirsOf(guides, "/w/elsewhere.md")).toBeNull();
  });
});

describe("firstDocInItems", () => {
  it("takes the first loose document when there is one", () => {
    expect(firstDocInItems(library)?.name).toBe("loose");
  });

  it("falls through to a folder's first document", () => {
    expect(firstDocInItems(library.slice(1))?.name).toBe("intro");
  });

  it("returns nothing for an empty library", () => {
    expect(firstDocInItems([])).toBeNull();
  });
});

describe("isPathWithin", () => {
  it("counts a folder as containing itself", () => {
    expect(isPathWithin("/w/guides", "/w/guides")).toBe(true);
  });

  it("recognises children on either platform's separator", () => {
    expect(isPathWithin("/w/guides/intro.md", "/w/guides")).toBe(true);
    expect(isPathWithin("C:\\w\\guides\\intro.md", "C:\\w\\guides")).toBe(true);
  });

  it("does not treat a sibling with a shared prefix as inside", () => {
    expect(isPathWithin("/w/guides-old/intro.md", "/w/guides")).toBe(false);
  });
});

describe("updateInlineDoc", () => {
  it("replaces the text of an in-memory document", () => {
    const items: LibraryItem[] = [
      { kind: "file", id: "a", name: "a", inline: "before" },
    ];

    const updated = updateInlineDoc(items, "a", "after");

    expect(updated[0]).toMatchObject({ id: "a", inline: "after" });
  });

  it("leaves disk-backed documents alone — those are saved to their file", () => {
    const items: LibraryItem[] = [{ kind: "file", ...file("/w/loose.md") }];

    expect(updateInlineDoc(items, "/w/loose.md", "after")).toEqual(items);
  });
});
