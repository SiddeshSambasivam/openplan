import { MessageSquarePlus } from "lucide-react";
import { useEffect, useState, type RefObject } from "react";
import { lineRangeForSelection } from "../lib/domRange";

interface PendingSelection {
  quote: string;
  lineStart: number;
  lineEnd: number;
  rect: DOMRect;
}

const MARGIN = 8;
const BUTTON_HALF_WIDTH = 74;
const TOP_FLIP_THRESHOLD = 96; // roughly the header height + a little breathing room

interface CommentComposerProps {
  /** The rendered preview's root — where selections are captured from. */
  articleRef: RefObject<HTMLElement | null>;
  /** The scroll container — scrolling invalidates the selection's on-screen position. */
  scrollRef: RefObject<HTMLElement | null>;
  /** Preview mode, a real (commentable) doc loaded. */
  enabled: boolean;
  /** True while a draft is already pending in the panel — hides the trigger
   * so a fresh selection can't silently discard unsaved draft text. */
  suppressed: boolean;
  /** Captures the current selection's quote + source line range and hands
   * off to the (always right-docked) CommentsPanel to compose in. */
  onBegin: (quote: string, lineStart: number, lineEnd: number) => void;
}

/** A small floating "+ Comment" trigger that appears on text selection.
 * Deliberately minimal — the actual composing UI lives in CommentsPanel,
 * anchored to this selection's document position, once clicked. Keeping
 * this button dumb (no popover state, no textarea, no width-dependent
 * clamping) is what makes it robust instead of fiddly. */
export function CommentComposer({
  articleRef,
  scrollRef,
  enabled,
  suppressed,
  onBegin,
}: CommentComposerProps) {
  const [pending, setPending] = useState<PendingSelection | null>(null);

  useEffect(() => {
    if (!enabled || suppressed) {
      setPending(null);
      return;
    }
    const onMouseUp = (e: MouseEvent) => {
      const root = articleRef.current;
      const sel = window.getSelection();
      if (
        !root ||
        !sel ||
        sel.isCollapsed ||
        sel.rangeCount === 0 ||
        // e.target is a real Element for genuine mouse input, but guard the
        // type regardless — synthetic dispatch can hand back the Document.
        !(e.target instanceof Node) ||
        !root.contains(sel.getRangeAt(0).commonAncestorContainer)
      ) {
        setPending(null);
        return;
      }
      const quote = sel.toString().trim();
      const lines = lineRangeForSelection(sel, root);
      if (!quote || !lines) {
        setPending(null);
        return;
      }
      setPending({ quote, ...lines, rect: sel.getRangeAt(0).getBoundingClientRect() });
    };
    // A selection's on-screen position goes stale the moment the container
    // scrolls — dismiss rather than show a floating button over the wrong text.
    const onScroll = () => setPending(null);
    document.addEventListener("mouseup", onMouseUp);
    const scrollEl = scrollRef.current;
    scrollEl?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      scrollEl?.removeEventListener("scroll", onScroll);
    };
  }, [enabled, suppressed, articleRef, scrollRef]);

  if (!pending) return null;

  const left = Math.min(
    Math.max(pending.rect.left + pending.rect.width / 2, BUTTON_HALF_WIDTH + MARGIN),
    window.innerWidth - BUTTON_HALF_WIDTH - MARGIN,
  );
  const showBelow = pending.rect.top < TOP_FLIP_THRESHOLD;
  const top = showBelow ? pending.rect.bottom + MARGIN : pending.rect.top - MARGIN;

  return (
    <button
      onClick={() => {
        onBegin(pending.quote, pending.lineStart, pending.lineEnd);
        setPending(null);
        window.getSelection()?.removeAllRanges();
      }}
      style={{
        left,
        top,
        transform: showBelow ? "translate(-50%, 0)" : "translate(-50%, -100%)",
      }}
      className="fixed z-50 flex cursor-default items-center gap-1.5 rounded-full border border-border bg-popover px-3 py-1.5 text-xs font-medium text-popover-foreground shadow-lg hover:bg-accent"
    >
      <MessageSquarePlus className="size-3.5" />
      Comment
    </button>
  );
}
