export interface OutlineItem {
  id: string;
  text: string;
  level: number;
}

/** The parts of a heading element this module reads, so it stays DOM-free. */
export interface HeadingLike {
  id: string;
  textContent: string | null;
  tagName: string;
}

/** Only anchored headings can be jumped to, so unanchored ones are skipped. */
export const OUTLINE_HEADING_SELECTOR = "h2[id], h3[id], h4[id]";

/** A single entry describes the whole document, so it earns nothing. */
export const MIN_OUTLINE_ITEMS = 2;

/** Headings deeper than this are nested far enough to stop indenting. */
const TOP_LEVEL = 2;
const INDENT_PER_LEVEL_PX = 12;

export function toOutlineItems(headings: HeadingLike[]): OutlineItem[] {
  const items: OutlineItem[] = [];
  for (const heading of headings) {
    const text = (heading.textContent ?? "").replace(/\s+/g, " ").trim();
    const level = Number(heading.tagName[1]);
    if (!heading.id || !text || !Number.isFinite(level)) continue;
    items.push({ id: heading.id, text, level });
  }
  return items;
}

export function outlineIndentPx(level: number): number {
  return Math.max(0, level - TOP_LEVEL) * INDENT_PER_LEVEL_PX;
}
