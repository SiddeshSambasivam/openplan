import { Check, Copy, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  ClaudeCodeIcon,
  CodexIcon,
  CursorIcon,
} from "@/components/AgentIcons";
import { Button } from "@/components/ui/button";
import { TooltipButton } from "@/components/TooltipButton";
import {
  formatThreadsForAgent,
  type CommentThread,
} from "@/lib/comments";
import { cn } from "@/lib/utils";
import type { AnchorState } from "./CommentsLayer";

function AuthorMark({ author }: { author: string }) {
  if (author === "claude-code") return <ClaudeCodeIcon className="size-3.5" />;
  if (author === "codex") return <CodexIcon className="size-3.5" />;
  if (author === "cursor") return <CursorIcon className="size-3.5" />;
  return null;
}

function authorLabel(author: string): string {
  const names: Record<string, string> = {
    user: "You",
    "claude-code": "Claude Code",
    codex: "Codex",
    cursor: "Cursor",
  };
  return names[author] ?? author;
}

function Reply({ onReply }: { onReply: (text: string) => void }) {
  const [text, setText] = useState("");
  const submit = () => {
    if (!text.trim()) return;
    onReply(text.trim());
    setText("");
  };
  return (
    <div className="mt-1.5 flex gap-1.5">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="Reply"
        className="min-w-0 flex-1 cursor-text rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-ring"
      />
      {text.trim() && (
        <Button size="xs" onClick={submit}>
          Reply
        </Button>
      )}
    </div>
  );
}

/**
 * Every discussion on the open plan. Agents answer here too: their replies
 * arrive under their own mark when they respond through the MCP server.
 */
export function CommentsPanel({
  open,
  threads,
  anchorStates,
  docLabel,
  focusThreadId,
  onClose,
  onReply,
  onSetResolved,
  onRemoveThread,
  onJumpTo,
}: {
  open: boolean;
  threads: CommentThread[];
  anchorStates: Record<string, AnchorState>;
  docLabel: string;
  focusThreadId: string | null;
  onClose: () => void;
  onReply: (threadId: string, text: string) => void;
  onSetResolved: (threadId: string, resolved: boolean) => void;
  onRemoveThread: (threadId: string) => void;
  onJumpTo: (thread: CommentThread) => void;
}) {
  const [copied, setCopied] = useState(false);
  const focusRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (open && focusThreadId) {
      focusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [open, focusThreadId]);

  if (!open) return null;

  const openThreads = threads.filter((t) => !t.resolved);
  const resolvedThreads = threads.filter((t) => t.resolved);

  const copyForAgents = () => {
    void navigator.clipboard
      .writeText(formatThreadsForAgent(threads, docLabel))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
  };

  const renderThread = (thread: CommentThread) => (
    <li
      key={thread.id}
      ref={thread.id === focusThreadId ? focusRef : undefined}
      className={cn(
        "rounded-lg border border-border p-2.5",
        thread.id === focusThreadId && "border-ring",
        thread.resolved && "opacity-60",
      )}
    >
      <button
        onClick={() => onJumpTo(thread)}
        className="block w-full cursor-default rounded-sm border-l-2 border-border pl-2 text-left"
      >
        <span className="line-clamp-2 text-xs text-muted-foreground italic">
          {thread.quote}
        </span>
        <span className="mt-0.5 block text-[10px] text-muted-foreground/70">
          {thread.lineStart === thread.lineEnd
            ? `Line ${thread.lineStart}`
            : `Lines ${thread.lineStart}-${thread.lineEnd}`}
          {anchorStates[thread.id] === "missing" && " · reference outdated"}
        </span>
      </button>

      <div className="mt-2 flex flex-col gap-2">
        {thread.comments.map((entry) => (
          <div key={entry.id}>
            <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <AuthorMark author={entry.author} />
              {authorLabel(entry.author)}
            </p>
            <p className="mt-0.5 text-xs leading-5 text-foreground/90">
              {entry.text}
            </p>
          </div>
        ))}
      </div>

      {!thread.resolved && <Reply onReply={(text) => onReply(thread.id, text)} />}

      <div className="mt-2 flex items-center gap-1">
        <TooltipButton
          variant="ghost"
          size="icon-xs"
          onClick={() => onSetResolved(thread.id, !thread.resolved)}
          tooltip={thread.resolved ? "Reopen this discussion" : "Mark as resolved"}
          className="text-muted-foreground"
        >
          {thread.resolved ? <RotateCcw /> : <Check />}
        </TooltipButton>
        <TooltipButton
          variant="ghost"
          size="icon-xs"
          onClick={() => onRemoveThread(thread.id)}
          tooltip="Delete this discussion"
          className="text-muted-foreground"
        >
          <Trash2 />
        </TooltipButton>
      </div>
    </li>
  );

  return (
    <aside className="absolute inset-y-0 right-0 z-30 flex w-80 animate-in flex-col border-l border-border bg-background shadow-lg slide-in-from-right-4 duration-200">
      <div className="flex shrink-0 items-center justify-between px-4 pt-3.5 pb-2">
        <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          Comments
        </p>
        <div className="flex items-center gap-1">
          <TooltipButton
            variant="ghost"
            size="xs"
            onClick={copyForAgents}
            tooltip="Copy every open discussion as a review an agent can act on"
            className="gap-1 text-muted-foreground"
          >
            <Copy />
            {copied ? "Copied" : "Copy for agents"}
          </TooltipButton>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            aria-label="Close comments"
          >
            <X />
          </Button>
        </div>
      </div>

      {threads.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs leading-5 text-muted-foreground">
          No comments yet.
          <br />
          Select any text in the plan to start one.
        </p>
      ) : (
        <ol className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
          {openThreads.map(renderThread)}
          {resolvedThreads.length > 0 && (
            <p className="pt-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
              Resolved
            </p>
          )}
          {resolvedThreads.map(renderThread)}
        </ol>
      )}
    </aside>
  );
}
