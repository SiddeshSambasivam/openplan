// Shared DOM text-search helpers used by both Find (FindBar.tsx) and
// Comments (line-anchored quotes) — searching rendered markdown for plain
// text and resolving Ranges from it.

// Wide but not universal yet (notably lagging in some WebKitGTK builds, which
// matters since Tauri on Linux uses it) — callers should degrade gracefully
// (count/scroll without the visual highlight) rather than break entirely.
export const HAS_HIGHLIGHT_API =
  typeof CSS !== "undefined" &&
  "highlights" in CSS &&
  typeof Highlight !== "undefined";

export function collectTextNodes(root: HTMLElement): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      // Skip mermaid SVGs (their <style> text would produce false matches)
      // and any other embedded style/script text.
      return node.parentElement?.closest("svg, style, script")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  return nodes;
}

/** Every occurrence of `query` (plain substring, not regex) within `root`. */
export function findTextRanges(
  root: HTMLElement,
  query: string,
  caseSensitive: boolean,
): Range[] {
  if (!query) return [];
  const needle = caseSensitive ? query : query.toLowerCase();
  const ranges: Range[] = [];
  for (const node of collectTextNodes(root)) {
    const haystack = caseSensitive ? node.data : node.data.toLowerCase();
    let from = 0;
    for (;;) {
      const idx = haystack.indexOf(needle, from);
      if (idx === -1) break;
      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + needle.length);
      ranges.push(range);
      from = idx + needle.length;
    }
  }
  return ranges;
}

/**
 * The first occurrence of `query` within `container`, matched ACROSS text
 * node boundaries — a quote captured from a live selection routinely spans
 * inline markup (`**bold**`, `` `code` ``, links) or even whole paragraphs,
 * so per-node `indexOf` can never re-find it. Whitespace is normalized on
 * both sides before matching (runs collapse to a single space): the DOM's
 * raw text and `Selection.toString()` disagree about newlines/indentation
 * around block boundaries, and the stored quote must match either way. A
 * position map from normalized indices back to raw ones turns the match
 * into exact (node, offset) endpoints for the returned Range.
 */
function findTextRangeAcrossNodes(
  container: HTMLElement,
  query: string,
): Range | null {
  const q = query.replace(/\s+/g, " ").trim();
  if (!q) return null;

  const nodes = collectTextNodes(container);
  if (nodes.length === 0) return null;
  let raw = "";
  const nodeStarts: number[] = [];
  for (const n of nodes) {
    nodeStarts.push(raw.length);
    raw += n.data;
  }

  let norm = "";
  const map: number[] = []; // norm index -> raw index
  for (let i = 0; i < raw.length; i++) {
    if (/\s/.test(raw[i])) {
      if (norm === "" || norm.endsWith(" ")) continue;
      norm += " ";
    } else {
      norm += raw[i];
    }
    map.push(i);
  }

  const idx = norm.indexOf(q);
  if (idx === -1) return null;
  const rawStart = map[idx];
  const rawLast = map[idx + q.length - 1]; // raw index of the match's final char

  const locate = (pos: number): { node: Text; offset: number } => {
    let i = nodes.length - 1;
    while (i > 0 && nodeStarts[i] > pos) i--;
    return { node: nodes[i], offset: pos - nodeStarts[i] };
  };

  const start = locate(rawStart);
  const end = locate(rawLast);
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset + 1);
  return range;
}

/** Nearest ancestor (inclusive) carrying a `data-line` attribute — i.e. the
 * source-mapped block (paragraph, heading, list item, ...) containing
 * `node`. Tagged by the `rehypeSourceLines` plugin in Markdown.tsx. */
export function nearestLineElement(
  node: Node,
  root: HTMLElement,
): HTMLElement | null {
  let el: HTMLElement | null =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : node.parentElement;
  while (el && el !== root.parentElement) {
    if (el.dataset.line) return el;
    el = el.parentElement;
  }
  return null;
}

export interface LineRange {
  lineStart: number;
  lineEnd: number;
}

/** Maps a DOM Selection to the source line range of the block(s) it spans. */
export function lineRangeForSelection(
  selection: Selection,
  root: HTMLElement,
): LineRange | null {
  if (selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const startEl = nearestLineElement(range.startContainer, root);
  const endEl = nearestLineElement(range.endContainer, root);
  if (!startEl || !endEl) return null;
  const lineStart = Number(startEl.dataset.line);
  const lineEnd = Number(endEl.dataset.lineEnd ?? endEl.dataset.line);
  if (!Number.isFinite(lineStart) || !Number.isFinite(lineEnd)) return null;
  return { lineStart, lineEnd: Math.max(lineStart, lineEnd) };
}

/**
 * Re-derives a comment thread's highlight Range on the current DOM: search
 * for its exact quote scoped to the elements covering its stored line
 * range first (fast, and disambiguates repeated text elsewhere in the
 * doc), falling back to a full-document search (handles minor line drift
 * from small edits above the quote). Returns null if the quote can no
 * longer be found verbatim — the surrounding text changed enough that the
 * comment just doesn't visually highlight anymore (it's still listed in
 * the panel either way).
 */
export function findQuoteRange(
  root: HTMLElement,
  quote: string,
  lineStart: number,
  lineEnd: number,
): Range | null {
  const scoped = [...root.querySelectorAll<HTMLElement>("[data-line]")].filter(
    (el) => {
      const start = Number(el.dataset.line);
      const end = Number(el.dataset.lineEnd ?? el.dataset.line);
      return start <= lineEnd && end >= lineStart;
    },
  );
  for (const el of scoped) {
    const hit = findTextRangeAcrossNodes(el, quote);
    if (hit) return hit;
  }
  return findTextRangeAcrossNodes(root, quote);
}
