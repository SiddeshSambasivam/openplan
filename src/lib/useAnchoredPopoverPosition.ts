import { useLayoutEffect, useState, type RefObject } from "react";
import { findQuoteRange } from "./domRange";

const GAP = 8;
const MARGIN = 12;

export interface AnchoredPopoverPosition {
  top: number;
  left: number;
}

/**
 * Positions a `position: fixed` popover directly below the quoted text
 * (Notion-style), left-aligned to where the quote starts. Flips above when
 * there isn't room below, and clamps horizontally so it never runs off
 * either edge. Two-pass: it needs its own rendered size, via `popoverRef`,
 * before it can flip/clamp correctly.
 */
export function useAnchoredPopoverPosition(
  quote: string,
  lineStart: number,
  lineEnd: number,
  articleRef: RefObject<HTMLElement | null>,
  scrollRef: RefObject<HTMLElement | null>,
  popoverRef: RefObject<HTMLElement | null>,
): AnchoredPopoverPosition | null {
  const [pos, setPos] = useState<AnchoredPopoverPosition | null>(null);

  useLayoutEffect(() => {
    const root = articleRef.current;
    const scrollEl = scrollRef.current;
    if (!root || !scrollEl) return;

    const recompute = () => {
      const range = findQuoteRange(root, quote, lineStart, lineEnd);
      if (!range) return;
      // The bounding rect of the whole range already unions every line the
      // quote wraps across (top of the first line, bottom of the last) —
      // exactly the box we want to sit just below of.
      const anchorRect = range.getBoundingClientRect();
      const width = popoverRef.current?.offsetWidth ?? 0;
      const height = popoverRef.current?.offsetHeight ?? 0;

      const fitsBelow = anchorRect.bottom + GAP + height <= window.innerHeight - MARGIN;
      const top = fitsBelow
        ? anchorRect.bottom + GAP
        : Math.max(MARGIN, anchorRect.top - GAP - height);

      const maxLeft = Math.max(MARGIN, window.innerWidth - MARGIN - width);
      const left = Math.min(Math.max(anchorRect.left, MARGIN), maxLeft);

      setPos({ top, left });
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    if (popoverRef.current) ro.observe(popoverRef.current);
    // The article reflowing (font size, width) or shifting sideways without
    // resizing (sidebar / Comments panel / TOC panel toggling around a
    // max-width-clamped column) both move the anchor without any scroll or
    // window-resize event — watch both boxes so the popover tracks along.
    ro.observe(root);
    ro.observe(scrollEl);
    scrollEl.addEventListener("scroll", recompute, { passive: true });
    window.addEventListener("resize", recompute);
    return () => {
      ro.disconnect();
      scrollEl.removeEventListener("scroll", recompute);
      window.removeEventListener("resize", recompute);
    };
  }, [articleRef, scrollRef, popoverRef, quote, lineStart, lineEnd]);

  return pos;
}
