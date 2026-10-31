import type { DocFile, FolderNode, LibraryItem } from "./types";

export function findDocInTree(node: FolderNode, id: string): DocFile | null {
  for (const file of node.files) {
    if (file.id === id) return file;
  }
  for (const dir of node.dirs) {
    const hit = findDocInTree(dir, id);
    if (hit) return hit;
  }
  return null;
}

/** Resolve a document id against loose files and every folder tree. */
export function findDocInItems(
  items: LibraryItem[],
  id: string | null,
): DocFile | null {
  if (!id) return null;
  for (const item of items) {
    if (item.kind === "file") {
      if (item.id === id) return item;
    } else if (item.tree) {
      const hit = findDocInTree(item.tree, id);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * The natural doc to open for a folder: the shallowest file (a root-level
 * readme beats one buried in subfolders), recursing only when a level has
 * no files of its own.
 */
export function firstFileOfTree(node: FolderNode): DocFile | null {
  if (node.files.length > 0) return node.files[0];
  for (const dir of node.dirs) {
    const hit = firstFileOfTree(dir);
    if (hit) return hit;
  }
  return null;
}

/** Paths of the dirs between the tree root (exclusive) and the doc. */
export function ancestorDirsOf(
  node: FolderNode,
  id: string,
  acc: string[] = [],
): string[] | null {
  for (const file of node.files) {
    if (file.id === id) return acc;
  }
  for (const dir of node.dirs) {
    const hit = ancestorDirsOf(dir, id, [...acc, dir.path]);
    if (hit) return hit;
  }
  return null;
}

export function firstDocInItems(items: LibraryItem[]): DocFile | null {
  for (const item of items) {
    if (item.kind === "file") return item;
    if (item.tree) {
      const hit = firstFileOfTree(item.tree);
      if (hit) return hit;
    }
  }
  return null;
}

/** Does `prefix` contain `path` (or equal it), separator-aware? */
export function isPathWithin(path: string, prefix: string): boolean {
  return (
    path === prefix ||
    path.startsWith(`${prefix}/`) ||
    path.startsWith(`${prefix}\\`)
  );
}

/**
 * Replace the in-memory content of an inline doc (loose or inside an
 * in-memory folder tree). Used by the browser demo; disk-backed docs
 * save through the write_markdown command instead.
 */
export function updateInlineDoc(
  items: LibraryItem[],
  id: string,
  text: string,
): LibraryItem[] {
  const updateNode = (node: FolderNode): FolderNode => ({
    ...node,
    dirs: node.dirs.map(updateNode),
    files: node.files.map((f) =>
      f.id === id ? { ...f, inline: text } : f,
    ),
  });
  return items.map((it) => {
    if (it.kind === "file") {
      return it.id === id && it.inline != null ? { ...it, inline: text } : it;
    }
    if (it.tree && it.path.startsWith("mem:")) {
      return { ...it, tree: updateNode(it.tree) };
    }
    return it;
  });
}
