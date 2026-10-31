/** Mapping between rendered blocks and markdown source lines, using the
 * data-line stamps the renderer writes. Anchors live in source space; the
 * DOM is only ever a projection of it. */

export interface LineRange {
  lineStart: number;
  lineEnd: number;
}

/** The stamped element that contains `node`, or null outside the article. */
export function stampedAncestor(node: Node | null): HTMLElement | null {
  let el: HTMLElement | null =
    node instanceof HTMLElement ? node : (node?.parentElement ?? null);
  while (el && !el.dataset.line) el = el.parentElement;
  return el;
}

/** The source lines a selection covers, in rendered-body coordinates.
 * `offset` shifts them into file coordinates when a header was stripped. */
export function selectionRange(
  selection: Selection,
  root: HTMLElement,
  offset: number,
): (LineRange & { quote: string }) | null {
  if (selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const startEl = stampedAncestor(range.startContainer);
  const endEl = stampedAncestor(range.endContainer);
  if (!startEl || !endEl) return null;
  const quote = selection.toString().trim();
  if (!quote) return null;
  return {
    lineStart: Number(startEl.dataset.line) + offset,
    lineEnd: Number(endEl.dataset.lineEnd ?? endEl.dataset.line) + offset,
    quote,
  };
}

/** The rendered blocks whose source range intersects the thread's, in file
 * coordinates. Empty means the lines no longer exist: the anchor is stale. */
export function blocksForRange(
  root: HTMLElement,
  lines: LineRange,
  offset: number,
): HTMLElement[] {
  const blocks: HTMLElement[] = [];
  for (const el of root.querySelectorAll<HTMLElement>("[data-line]")) {
    // Only the outermost stamped blocks; children repeat their parents.
    if (el.parentElement?.closest("[data-line]")) continue;
    const start = Number(el.dataset.line) + offset;
    const end = Number(el.dataset.lineEnd ?? el.dataset.line) + offset;
    if (start <= lines.lineEnd && end >= lines.lineStart) blocks.push(el);
  }
  return blocks;
}
