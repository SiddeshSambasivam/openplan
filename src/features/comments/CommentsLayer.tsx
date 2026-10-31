import { useCallback, useEffect, useState, type RefObject } from "react";
import { blocksForRange } from "@/lib/anchors";
import type { CommentThread } from "@/lib/comments";
import { findTextRanges } from "@/lib/domRange";
import { cn } from "@/lib/utils";

/** How well a thread's anchor still fits the document. */
export type AnchorState = "exact" | "block" | "missing";

interface Box {
  threadId: string;
  top: number;
  left: number;
  width: number;
  height: number;
  /** Block markers draw as a gutter bar, exact matches as text highlight. */
  kind: "text" | "gutter";
  active: boolean;
  /** Written but not sent: drawn dashed, so it reads as still being worked on. */
  pending: boolean;
}

/**
 * Draws comment anchors as elements, the way find highlights are drawn.
 * A quote that still matches its block uniquely lights the text itself; an
 * ambiguous or moved quote degrades to a bar beside the block. Nothing is
 * ever highlighted on a guess.
 */
export function CommentsLayer({
  threads,
  articleRef,
  containerRef,
  lineOffset,
  activeThreadId,
  onAnchorStates,
  onOpenThread,
}: {
  threads: CommentThread[];
  articleRef: RefObject<HTMLElement | null>;
  containerRef: RefObject<HTMLElement | null>;
  lineOffset: number;
  activeThreadId: string | null;
  onAnchorStates: (states: Record<string, AnchorState>) => void;
  onOpenThread: (threadId: string) => void;
}) {
  const [boxes, setBoxes] = useState<Box[]>([]);

  const measure = useCallback(() => {
    const article = articleRef.current;
    const container = containerRef.current;
    if (!article || !container) {
      setBoxes([]);
      return;
    }
    const base = container.getBoundingClientRect();
    const toBox = (rect: DOMRect) => ({
      top: rect.top - base.top + container.scrollTop,
      left: rect.left - base.left + container.scrollLeft,
      width: rect.width,
      height: rect.height,
    });

    const next: Box[] = [];
    const states: Record<string, AnchorState> = {};
    for (const thread of threads) {
      if (thread.resolved) continue;
      const blocks = blocksForRange(article, thread, lineOffset);
      if (blocks.length === 0) {
        states[thread.id] = "missing";
        continue;
      }
      // Refine to the text only when the quote matches exactly once across
      // the anchored blocks; two matches means guessing, so the block bar
      // speaks instead.
      const matches = blocks.flatMap((block) =>
        findTextRanges(block, thread.quote, true),
      );
      const active = thread.id === activeThreadId;
      const pending = thread.pending;
      if (matches.length === 1) {
        states[thread.id] = "exact";
        for (const rect of matches[0].getClientRects()) {
          if (rect.width === 0 || rect.height === 0) continue;
          next.push({
            threadId: thread.id,
            kind: "text",
            active,
            pending,
            ...toBox(rect),
          });
        }
      } else {
        states[thread.id] = "block";
        for (const block of blocks) {
          next.push({
            threadId: thread.id,
            kind: "gutter",
            active,
            pending,
            ...toBox(block.getBoundingClientRect()),
          });
        }
      }
    }
    setBoxes(next);
    onAnchorStates(states);
  }, [threads, articleRef, containerRef, lineOffset, activeThreadId, onAnchorStates]);

  useEffect(measure, [measure]);

  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    const observer = new ResizeObserver(measure);
    observer.observe(article);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [articleRef, measure]);

  return (
    // The wrapper must let the article underneath keep receiving the mouse;
    // only the drawn boxes themselves are clickable.
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10">
      {boxes.map((box, i) =>
        box.kind === "text" ? (
          <button
            key={i}
            onClick={() => onOpenThread(box.threadId)}
            tabIndex={-1}
            className={cn(
              "pointer-events-auto absolute cursor-pointer rounded-[2px]",
              // Not sent yet: outlined rather than filled in.
              box.pending && "outline-1 outline-dashed",
            )}
            style={{
              top: box.top,
              left: box.left,
              width: box.width,
              height: box.height,
              backgroundColor: box.pending
                ? "transparent"
                : box.active
                  ? "var(--comment-highlight-active)"
                  : "var(--comment-highlight)",
              outlineColor: "var(--comment-highlight-active)",
            }}
          />
        ) : (
          <button
            key={i}
            onClick={() => onOpenThread(box.threadId)}
            tabIndex={-1}
            aria-hidden
            className={cn(
              "pointer-events-auto absolute w-[3px] cursor-pointer rounded-full",
              box.pending && "opacity-50 outline-1 outline-dashed",
            )}
            style={{
              top: box.top,
              left: Math.max(0, box.left - 14),
              height: box.height,
              backgroundColor: box.active
                ? "var(--comment-highlight-active)"
                : "var(--comment-highlight)",
              outlineColor: "var(--comment-highlight-active)",
            }}
          />
        ),
      )}
    </div>
  );
}
