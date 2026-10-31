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
