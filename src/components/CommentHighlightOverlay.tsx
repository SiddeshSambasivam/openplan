import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { CommentThread, PendingDraft } from "../lib/comments";
import { findQuoteRange } from "../lib/domRange";
import { cn } from "../lib/utils";

// CSS Custom Highlights (`::highlight()`) only support a handful of
// color-ish properties — no padding, no line-height, no way to control the
// painted rectangle's height, which in this engine follows the text's full
// line-height rather than the glyphs themselves (measured: a 30px-line-height
// paragraph paints a highlight ~30px tall). Real, precisely sized bars are
// the only way to match the actual text height instead, so comment
// highlighting uses plain absolutely-positioned divs instead (unlike Find,
// which stays on the Highlight API — it doesn't need custom sizing).
// `range.getClientRects()` (used below) already returns a tight box close to
// the glyphs' own height, not the inflated line-height one — this ratio is
// just a touch under 1 so the bar doesn't look perfectly flush top-to-bottom.
const HEIGHT_RATIO = 0.95;

interface Bar {
  key: string;
  /** The thread this bar belongs to ("draft" for the pending composer). */
  threadId: string;
  top: number;
  left: number;
  width: number;
  height: number;
  active: boolean;
}

// For a Range crossing inline elements, `getClientRects()` reports both the
// element's own rect AND its inner text node's (near-)identical rect — with
// a translucent fill, painting both doubles the alpha into a visibly darker
// patch over just that segment. Drop any rect already covered by a kept one.
function dedupeRects(rects: DOMRectList): DOMRect[] {
  const kept: DOMRect[] = [];
  for (const rect of rects) {
    if (rect.width === 0 || rect.height === 0) continue;
    const covered = kept.some(
      (k) =>
        rect.left >= k.left - 1 &&
        rect.right <= k.right + 1 &&
        rect.top >= k.top - 1 &&
        rect.bottom <= k.bottom + 1,
    );
    if (!covered) kept.push(rect);
  }
  return kept;
}

function collectBars(
  root: HTMLElement,
  scrollRect: DOMRect,
  scrollTop: number,
  scrollLeft: number,
  quote: string,
  lineStart: number,
  lineEnd: number,
  threadId: string,
  active: boolean,
  out: Bar[],
) {
  const range = findQuoteRange(root, quote, lineStart, lineEnd);
  if (!range) return;
  let i = 0;
  for (const rect of dedupeRects(range.getClientRects())) {
    const height = rect.height * HEIGHT_RATIO;
    out.push({
      key: `${threadId}-${i++}`,
      threadId,
      top: rect.top - scrollRect.top + scrollTop + (rect.height - height) / 2,
      left: rect.left - scrollRect.left + scrollLeft,
      width: rect.width,
      height,
      active,
    });
  }
}

interface CommentHighlightOverlayProps {
  articleRef: RefObject<HTMLElement | null>;
  scrollRef: RefObject<HTMLElement | null>;
  threads: CommentThread[];
  pendingDraft: PendingDraft | null;
  /** Rendered in the darker "active" color — either briefly, right after
   * jumping to a thread from the panel's quote button, or persistently,
   * for as long as that thread's view popover is open. */
  activeThreadId: string | null;
}

/**
 * Renders the actual visual marks for unresolved comment threads (plus the
 * in-progress draft, if any) as real DOM bars layered over the article text
 * — NOT CSS Custom Highlights (see HEIGHT_RATIO comment above for why).
 * Mounted as a sibling of the article content, inside the same scrolling
 * container, positioned in that container's own content-space; being a
 * genuine scrolling descendant, it tracks scroll for free — no scroll
 * listener or manual mirroring needed, unlike the Comments panel's cards.
 * `pointer-events: none` throughout: this is a pure visual layer, so clicks
 * and text selection pass straight through to the real text underneath —
 * click-to-open hit-testing is handled separately, directly on the article,
 * and hover feedback (darken + pointer cursor) is likewise hit-tested here
 * via a mousemove listener on the scroll container against the bars' own
 * rects, since `:hover` can never match a pointer-events-none element.
 */
export function CommentHighlightOverlay({
  articleRef,
  scrollRef,
  threads,
  pendingDraft,
  activeThreadId,
}: CommentHighlightOverlayProps) {
  const [bars, setBars] = useState<Bar[]>([]);
  const [hoverThreadId, setHoverThreadId] = useState<string | null>(null);
  const barsRef = useRef<Bar[]>([]);
  barsRef.current = bars;

  const threadsKey = threads
    .filter((t) => !t.resolved)
    .map((t) => t.id)
    .join(",");
  const draftKey = pendingDraft
    ? `${pendingDraft.quote} ${pendingDraft.lineStart} ${pendingDraft.lineEnd}`
    : "";

  useLayoutEffect(() => {
    const root = articleRef.current;
    const scrollEl = scrollRef.current;
    if (!root || !scrollEl) {
      setBars([]);
      return;
    }

    const recompute = () => {
      const scrollRect = scrollEl.getBoundingClientRect();
      const scrollTop = scrollEl.scrollTop;
      const scrollLeft = scrollEl.scrollLeft;
      const next: Bar[] = [];
      for (const t of threads) {
        if (t.resolved) continue;
        collectBars(
          root,
          scrollRect,
          scrollTop,
          scrollLeft,
          t.quote,
          t.lineStart,
          t.lineEnd,
          t.id,
          t.id === activeThreadId,
          next,
        );
      }
      if (pendingDraft) {
        collectBars(
          root,
          scrollRect,
          scrollTop,
          scrollLeft,
          pendingDraft.quote,
          pendingDraft.lineStart,
          pendingDraft.lineEnd,
          "draft",
          true,
          next,
        );
      }
      setBars(next);
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    // Observing the article catches content reflow (font size, width,
    // wrapping); observing the scroll container catches layout shifts that
    // DON'T resize the article — the sidebar, Comments panel, or TOC panel
    // opening/closing/resizing moves a max-width-clamped article sideways
    // without changing its own box, which the first observer never sees.
    ro.observe(root);
    ro.observe(scrollEl);
    return () => ro.disconnect();
    // `threads`/`pendingDraft` aren't listed directly: `threadsKey`/
    // `draftKey` are the real triggers for "the set of highlighted anchors
    // changed" — content reflow (font size, width, wrapping) is instead
    // caught by the ResizeObservers above.
  }, [articleRef, scrollRef, threadsKey, draftKey, activeThreadId]);

  // Hover feedback. The bars are pointer-events-none, so hit-test the
  // pointer against their (content-space) rects on mousemove instead —
  // a handful of rectangle comparisons per event, no DOM reads.
  useLayoutEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const hitTest = (e: MouseEvent): string | null => {
      const scrollRect = scrollEl.getBoundingClientRect();
      const x = e.clientX - scrollRect.left + scrollEl.scrollLeft;
      const y = e.clientY - scrollRect.top + scrollEl.scrollTop;
      for (const bar of barsRef.current) {
        if (
          bar.threadId !== "draft" &&
          x >= bar.left &&
          x <= bar.left + bar.width &&
          y >= bar.top &&
          y <= bar.top + bar.height
        ) {
          return bar.threadId;
        }
      }
      return null;
    };

    const onMouseMove = (e: MouseEvent) => {
      const hit = hitTest(e);
      setHoverThreadId((prev) => (prev === hit ? prev : hit));
      scrollEl.style.cursor = hit ? "pointer" : "";
    };
    const onMouseLeave = () => {
      setHoverThreadId(null);
      scrollEl.style.cursor = "";
    };

    scrollEl.addEventListener("mousemove", onMouseMove, { passive: true });
    scrollEl.addEventListener("mouseleave", onMouseLeave);
    return () => {
      scrollEl.removeEventListener("mousemove", onMouseMove);
      scrollEl.removeEventListener("mouseleave", onMouseLeave);
      scrollEl.style.cursor = "";
    };
  }, [scrollRef]);

  if (bars.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {bars.map((bar) => (
        <div
          key={bar.key}
          className={cn(
            "absolute rounded-[3px] transition-colors duration-100",
            bar.active || bar.threadId === hoverThreadId
              ? "bg-[var(--comment-highlight-active)]"
              : "bg-[var(--comment-highlight)]",
          )}
          style={{ top: bar.top, left: bar.left, width: bar.width, height: bar.height }}
        />
      ))}
    </div>
  );
}
