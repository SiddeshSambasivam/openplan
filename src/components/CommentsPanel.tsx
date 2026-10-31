import { Check, Copy, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatThreadsForAgent, type CommentThread } from "../lib/comments";
import { cn } from "../lib/utils";
import { Button } from "./Button";
import { ThreadCardBody } from "./ThreadCardBody";

function ThreadCard({
  thread,
  emphasized,
  onReply,
  onToggleResolved,
  onEditComment,
  onDeleteComment,
  onJump,
}: {
  thread: CommentThread;
  emphasized: boolean;
  onReply: (text: string) => void;
  onToggleResolved: () => void;
  onEditComment: (commentId: string, text: string) => void;
  onDeleteComment: (commentId: string) => void;
  onJump: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border p-3 transition-shadow duration-300",
        thread.resolved ? "opacity-60" : "bg-card",
        emphasized && "ring-2 ring-ring",
      )}
    >
      <div className="mb-2 flex items-start gap-1">
        <button
          onClick={onJump}
          title="Jump to this in the document"
          className="min-w-0 flex-1 cursor-default truncate rounded border-l-2 border-border bg-muted/50 px-2 py-1 text-left text-xs text-muted-foreground hover:border-ring hover:text-foreground"
        >
          “{thread.quote}”
        </button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleResolved}
          tooltip={thread.resolved ? "Unresolve" : "Resolve"}
          aria-label={thread.resolved ? "Unresolve" : "Resolve"}
          className={cn("size-6 shrink-0", thread.resolved && "text-primary")}
        >
          <Check className="size-3.5" />
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

interface CommentsPanelProps {
  open: boolean;
  threads: CommentThread[];
  /** File path (preferred) or doc name — used both in the panel header and
   * as the file reference in the "Copy for AI" export. */
  docLabel: string;
  /** Scrolled into view + briefly emphasized once, e.g. when a highlight is
   * clicked while the panel is already open. */
  focusThreadId: string | null;
  /** Narrow viewport: floats over the content instead of sharing layout
   * space with it. */
  overlay: boolean;
  onClose: () => void;
  onReply: (threadId: string, text: string) => void;
  onToggleResolved: (threadId: string, resolved: boolean) => void;
  onEditComment: (threadId: string, commentId: string, text: string) => void;
  onDeleteComment: (threadId: string, commentId: string) => void;
  onJumpToThread: (thread: CommentThread) => void;
}

/**
 * A plain "All discussions" list view — every thread, unresolved first (in
 * document order), resolved ones dimmed at the bottom. No position-mirrored
 * cards: browsing the full list is a fundamentally different mode from
 * viewing one thread right next to its highlight (that's `CommentThreadPopover`,
 * shown instead of this panel — see the mutual-exclusivity handling in App.tsx).
 */
export function CommentsPanel({
  open,
  threads,
  docLabel,
  focusThreadId,
  overlay,
  onClose,
  onReply,
  onToggleResolved,
  onEditComment,
  onDeleteComment,
  onJumpToThread,
}: CommentsPanelProps) {
  const [copied, setCopied] = useState(false);
  const [emphasizedId, setEmphasizedId] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!focusThreadId) return;
    cardRefs.current[focusThreadId]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    setEmphasizedId(focusThreadId);
    const t = setTimeout(
      () => setEmphasizedId((id) => (id === focusThreadId ? null : id)),
      1400,
    );
    return () => clearTimeout(t);
  }, [focusThreadId]);

  if (!open) return null;

  const openCount = threads.filter((t) => !t.resolved).length;
  const sortedThreads = [...threads].sort((a, b) => {
    if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
    return a.lineStart - b.lineStart;
  });

  const copyForAgent = async () => {
    try {
      await navigator.clipboard.writeText(formatThreadsForAgent(threads, docLabel));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard permission denied — nothing more to do here
    }
  };

  return (
    <div
      className={cn(
        "flex h-full w-80 max-w-[85vw] shrink-0 flex-col border-l border-border bg-background",
        overlay && "fixed inset-y-0 right-0 z-40 shadow-2xl",
      )}
    >
      <div className="flex shrink-0 items-center justify-between px-3 pt-3 pb-2">
        <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          All discussions{threads.length > 0 && ` (${openCount})`}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          tooltip="Close"
          tooltipSide="bottom-end"
          aria-label="Close comments"
          className="size-6"
        >
          <X className="size-3.5" />
        </Button>
      </div>

      <div className="shrink-0 px-3 pb-2.5">
        <Button
          variant="outline"
          onClick={() => void copyForAgent()}
          disabled={threads.length === 0}
          tooltip="Copies open comments as Markdown — file path, quotes, line numbers, and replies — ready to paste into Claude, Cursor, or Codex"
          tooltipSide="bottom-start"
          className="w-full"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy for AI"}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {threads.length === 0 ? (
          <p className="px-1 py-8 text-center text-xs leading-5 text-muted-foreground">
            Select text in the document to leave a comment.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {sortedThreads.map((thread) => (
              <div
                key={thread.id}
                ref={(el) => {
                  cardRefs.current[thread.id] = el;
                }}
              >
                <ThreadCard
                  thread={thread}
                  emphasized={emphasizedId === thread.id}
                  onReply={(text) => onReply(thread.id, text)}
                  onToggleResolved={() => onToggleResolved(thread.id, !thread.resolved)}
                  onEditComment={(commentId, text) =>
                    onEditComment(thread.id, commentId, text)
                  }
                  onDeleteComment={(commentId) => onDeleteComment(thread.id, commentId)}
                  onJump={() => onJumpToThread(thread)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
