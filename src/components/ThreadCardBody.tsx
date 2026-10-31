import { ArrowUp, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import type { CommentEntry, CommentThread } from "../lib/comments";
import { cn } from "../lib/utils";
import { Button } from "./Button";

function relativeTime(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function CommentEntryRow({
  comment,
  isRoot,
  onEdit,
  onDelete,
}: {
  comment: CommentEntry;
  isRoot: boolean;
  onEdit: (text: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.text);

  const save = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== comment.text) onEdit(trimmed);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className={cn(!isRoot && "ml-1 border-l border-border pl-2.5")}>
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setDraft(comment.text);
              setEditing(false);
            } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              save();
            }
          }}
          rows={2}
          className="w-full cursor-text resize-none rounded-md border border-border bg-background p-1.5 text-sm text-foreground outline-none focus:border-ring"
        />
        <div className="mt-1.5 flex justify-end gap-1.5">
          <Button
            variant="ghost"
            onClick={() => {
              setDraft(comment.text);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
          <Button onClick={save} disabled={!draft.trim()}>
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group/entry relative",
        !isRoot && "ml-1 border-l border-border pl-2.5",
      )}
    >
      <p className="pr-12 text-sm whitespace-pre-wrap break-words text-foreground">
        {comment.text}
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {relativeTime(comment.createdAt)}
        {comment.editedAt && " (edited)"}
      </p>
      <div className="absolute top-0 right-0 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/entry:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setEditing(true)}
          tooltip="Edit"
          aria-label="Edit comment"
          className="size-5"
        >
          <Pencil className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          tooltip="Delete"
          aria-label="Delete comment"
          className="size-5"
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
    </div>
  );
}

interface ThreadCardBodyProps {
  thread: CommentThread;
  onReply: (text: string) => void;
  onEditComment: (commentId: string, text: string) => void;
  onDeleteComment: (commentId: string) => void;
}

/**
 * The comment/reply list + persistent reply input for a thread — shared
 * between the panel's `ThreadCard` (browsing) and `CommentThreadPopover`
 * (viewing one thread right next to its highlight). Each entry (root
 * comment or reply) gets its own hover-revealed edit/delete — deleting the
 * last entry removes the whole thread (handled upstream, in
 * `useComments.deleteComment`). Resolve is deliberately NOT here — it's a
 * thread-level action that lives in each consumer's own header, alongside
 * that consumer's own quote/close affordance.
 */
export function ThreadCardBody({
  thread,
  onReply,
  onEditComment,
  onDeleteComment,
}: ThreadCardBodyProps) {
  const [replyDraft, setReplyDraft] = useState("");

  const submitReply = () => {
    const text = replyDraft.trim();
    if (!text) return;
    onReply(text);
    setReplyDraft("");
  };

  return (
    <>
      <div className="flex flex-col gap-2.5">
        {thread.comments.map((c, i) => (
          <CommentEntryRow
            key={c.id}
            comment={c}
            isRoot={i === 0}
            onEdit={(text) => onEditComment(c.id, text)}
            onDelete={() => onDeleteComment(c.id)}
          />
        ))}
      </div>

      <div className="mt-2.5 flex items-center gap-1.5">
        <input
          value={replyDraft}
          onChange={(e) => setReplyDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submitReply();
            }
          }}
          placeholder="Add a comment…"
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring"
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={submitReply}
          disabled={!replyDraft.trim()}
          tooltip="Send"
          aria-label="Send reply"
          className="size-7 shrink-0"
        >
          <ArrowUp className="size-4" />
        </Button>
      </div>
    </>
  );
}
