import { useEffect, useRef, useState, type RefObject } from "react";
import type { PendingDraft } from "../lib/comments";
import { useAnchoredPopoverPosition } from "../lib/useAnchoredPopoverPosition";
import { Button } from "./Button";

const SCROLL_LOCK_KEYS = new Set([
  " ",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  "ArrowUp",
  "ArrowDown",
]);

interface CommentDraftPopoverProps {
  draft: PendingDraft;
  articleRef: RefObject<HTMLElement | null>;
  scrollRef: RefObject<HTMLElement | null>;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}

/**
 * A standalone floating composer for a not-yet-saved comment — anchored
 * directly below the selected text (Notion-style), independent of the
 * Comments panel: starting a new comment shouldn't force the whole thread
 * list open, and submitting one just leaves a highlight behind. While open,
 * the document can't be scrolled (wheel/touch/keyboard) — this popover's
 * position isn't scroll-synced, so letting the page move under it would
 * leave it floating over the wrong text.
 */
export function CommentDraftPopover({
  draft,
  articleRef,
  scrollRef,
  onSubmit,
  onCancel,
}: CommentDraftPopoverProps) {
  const [text, setText] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pos = useAnchoredPopoverPosition(
    draft.quote,
    draft.lineStart,
    draft.lineEnd,
    articleRef,
    scrollRef,
    popoverRef,
  );

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    const blockWheel = (e: Event) => e.preventDefault();
    const blockKeys = (e: KeyboardEvent) => {
      if (document.activeElement === textareaRef.current) return;
      if (SCROLL_LOCK_KEYS.has(e.key)) e.preventDefault();
    };
    scrollEl?.addEventListener("wheel", blockWheel, { passive: false });
    scrollEl?.addEventListener("touchmove", blockWheel, { passive: false });
    document.addEventListener("keydown", blockKeys);
    return () => {
      scrollEl?.removeEventListener("wheel", blockWheel);
      scrollEl?.removeEventListener("touchmove", blockWheel);
      document.removeEventListener("keydown", blockKeys);
    };
  }, [scrollRef]);

  // Clicking anywhere outside the composer discards the draft, same as
  // Escape (Notion does this too). Attached on mount, so it can never fire
  // from the same click that opened this popover — that click's dispatch
  // already finished before this component (and this listener) existed.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!(e.target instanceof Node)) return;
      if (popoverRef.current && !popoverRef.current.contains(e.target)) onCancel();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onCancel]);

  const submit = () => {
    const trimmed = text.trim();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <div
      ref={popoverRef}
      className="fixed z-40 w-80 max-w-[85vw] rounded-xl border border-border bg-card p-3 shadow-2xl transition-opacity duration-150"
      style={
        pos
          ? { top: pos.top, left: pos.left, opacity: 1 }
          : { top: 0, left: 0, opacity: 0 }
      }
    >
      <p className="mb-2 line-clamp-2 break-words border-l-2 border-border pl-2 text-xs text-muted-foreground">
        “{draft.quote}”
      </p>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Add a comment…"
        rows={3}
        className="w-full cursor-text resize-none rounded-md border border-border bg-background p-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">⌘↵ to comment</span>
        <div className="flex gap-1.5">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!text.trim()}>
            Comment
          </Button>
        </div>
      </div>
    </div>
  );
}
