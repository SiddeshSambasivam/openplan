/** A document in a set, or a folder holding more of them. */
export type SetNode =
  | { kind: "document"; name: string; label: string; path: string }
  | { kind: "folder"; name: string; children: SetNode[] };

/** `01-current-state.md` reads as "Current state" in a list of plans. */
export function documentLabel(name: string): string {
  const base = name.replace(/\.(mdx?|markdown|html?)$/i, "");
  const withoutNumber = base.replace(/^\d+[-_]/, "");
  return withoutNumber.replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** Whether this branch holds the document being read, so it opens to show it. */
export function branchHolds(node: SetNode, documentPath: string | null): boolean {
  if (!documentPath) return false;
  return node.kind === "document"
    ? node.path === documentPath
    : node.children.some((child) => branchHolds(child, documentPath));
}

/**
 * Turns a set's document paths into the shape they have on disk. Plan sets
 * number their documents and keep superseded ones in `archive/`, so the
 * ordering and the nesting both carry meaning worth showing.
 */
export function buildSetTree(paths: string[]): SetNode[] {
  const roots: SetNode[] = [];

  for (const path of [...paths].sort()) {
    const segments = path.split("/").filter(Boolean);
    if (segments.length === 0) continue;
    let level = roots;

    segments.forEach((segment, index) => {
      const last = index === segments.length - 1;
      if (last) {
        level.push({
          kind: "document",
          name: segment,
          label: documentLabel(segment),
          path,
        });
        return;
      }
      let folder = level.find(
        (node): node is Extract<SetNode, { kind: "folder" }> =>
          node.kind === "folder" && node.name === segment,
      );
      if (!folder) {
        folder = { kind: "folder", name: segment, children: [] };
        level.push(folder);
      }
      level = folder.children;
    });
  }

  // Folders after the documents they sit beside: an archive is a footnote.
  const order = (nodes: SetNode[]): SetNode[] =>
    [...nodes]
      .sort((a, b) =>
        a.kind === b.kind ? 0 : a.kind === "document" ? -1 : 1,
      )
      .map((node) =>
        node.kind === "folder" ? { ...node, children: order(node.children) } : node,
      );
  return order(roots);
}
