import { Check, X } from "lucide-react";
import { useEffect, useRef, type RefObject } from "react";
import type { CommentThread } from "../lib/comments";
import { useAnchoredPopoverPosition } from "../lib/useAnchoredPopoverPosition";
import { cn } from "../lib/utils";
import { Button } from "./Button";
import { ThreadCardBody } from "./ThreadCardBody";

interface CommentThreadPopoverProps {
  thread: CommentThread;
  articleRef: RefObject<HTMLElement | null>;
  scrollRef: RefObject<HTMLElement | null>;
  onReply: (text: string) => void;
  onToggleResolved: () => void;
  onEditComment: (commentId: string, text: string) => void;
  onDeleteComment: (commentId: string) => void;
  onClose: () => void;
}

/**
 * Floating bubble for a single already-saved thread, shown directly below
 * its highlighted text when clicked — you're already looking at the
 * anchor, so unlike the panel's cards there's no "jump to it" affordance
 * here. Deliberately independent of the Comments panel (browsing) — the
 * two are mutually exclusive, handled by the caller.
 */
export function CommentThreadPopover({
  thread,
  articleRef,
  scrollRef,
  onReply,
  onToggleResolved,
  onEditComment,
  onDeleteComment,
  onClose,
}: CommentThreadPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const pos = useAnchoredPopoverPosition(
    thread.quote,
    thread.lineStart,
    thread.lineEnd,
    articleRef,
    scrollRef,
    popoverRef,
  );

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!(e.target instanceof Node)) return;
      if (popoverRef.current && !popoverRef.current.contains(e.target)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

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
      <div className="mb-2 flex items-start gap-1">
        <p
          className={cn(
            "line-clamp-2 flex-1 break-words border-l-2 pl-2 text-xs text-muted-foreground",
            thread.resolved ? "border-border" : "border-ring",
          )}
        >
          “{thread.quote}”
        </p>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleResolved}
          tooltip={thread.resolved ? "Unresolve" : "Resolve"}
          aria-label={thread.resolved ? "Unresolve" : "Resolve"}
          className={cn("size-5 shrink-0", thread.resolved && "text-primary")}
        >
          <Check className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          tooltip="Close"
          aria-label="Close"
          className="size-5 shrink-0"
        >
          <X className="size-3.5" />
        </Button>
      </div>

      <ThreadCardBody
        thread={thread}
        onReply={onReply}
        onEditComment={onEditComment}
        onDeleteComment={onDeleteComment}
      />
    </div>
  );
}
