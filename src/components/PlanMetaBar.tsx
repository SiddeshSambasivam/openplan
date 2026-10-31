import { Archive, ArchiveRestore, History, Plus, X } from "lucide-react";
import { useState } from "react";
import {
  ClaudeCodeIcon,
  CodexIcon,
  CursorIcon,
} from "@/components/AgentIcons";
import {
  ARCHIVED_TAG,
  LIFECYCLE_HINTS,
  LIFECYCLE_LABELS,
  isArchived,
  SOURCE_LABELS,
  type PlanSummary,
} from "@/lib/planBase";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TooltipButton } from "./TooltipButton";

/** Absolute dates: a plan is a record, and "3 days ago" stops being useful the
 * moment you compare two of them. */
function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface PlanMetaBarProps {
  plan: PlanSummary;
  onTagsChange: (tags: string[]) => void;
  onOpenHistory: () => void;
}

/** What the app knows about a plan, above the plan itself: where it came
 * from, when, and the tags anyone has put on it. */
export function PlanMetaBar({
  plan,
  onTagsChange,
  onOpenHistory,
}: PlanMetaBarProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const updated = formatDate(plan.updated ?? plan.created);

  const archived = isArchived(plan);
  const toggleArchive = () => {
    onTagsChange(
      archived
        ? plan.tags.filter((t) => t !== ARCHIVED_TAG)
        : [...plan.tags, ARCHIVED_TAG],
    );
  };

  const addTag = () => {
    const tag = draft.trim();
    setDraft("");
    setAdding(false);
    if (tag && !plan.tags.includes(tag)) onTagsChange([...plan.tags, tag]);
  };

  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border pb-3 text-xs text-muted-foreground">
      <span
        title={LIFECYCLE_HINTS[plan.lifecycle]}
        className={cn(
          "rounded-full px-2 py-0.5 text-[11px] font-medium",
          plan.lifecycle === "active" && "bg-success/15 text-success",
          plan.lifecycle === "draft" && "bg-muted text-muted-foreground",
          plan.lifecycle === "archived" && "bg-muted text-muted-foreground",
        )}
      >
        {LIFECYCLE_LABELS[plan.lifecycle]}
      </span>
      <span aria-hidden>·</span>
      <span className="flex items-center gap-1.5">
        {plan.source === "claude-code" && <ClaudeCodeIcon className="size-3.5" />}
        {plan.source === "codex" && <CodexIcon className="size-3.5" />}
        {plan.source === "cursor" && <CursorIcon className="size-3.5" />}
        {SOURCE_LABELS[plan.source] ?? plan.source}
      </span>
      {plan.project && (
        <>
          <span aria-hidden>·</span>
          <span className="truncate">{plan.project}</span>
        </>
      )}
      {updated && (
        <>
          <span aria-hidden>·</span>
          <span>{updated}</span>
        </>
      )}

      <span className="flex flex-wrap items-center gap-1">
        {plan.tags
          .filter((tag) => tag !== ARCHIVED_TAG)
          .map((tag) => (
          <span
            key={tag}
            className="group/tag flex items-center gap-0.5 rounded-full bg-muted py-0.5 pr-1 pl-2 text-[11px] text-foreground/80"
          >
            {tag}
            <button
              onClick={() => onTagsChange(plan.tags.filter((t) => t !== tag))}
              aria-label={`Remove tag ${tag}`}
              className="cursor-default rounded-full p-0.5 opacity-40 transition-opacity group-hover/tag:opacity-100 hover:bg-border"
            >
              <X className="size-2.5" />
            </button>
            </span>
          ))}
        {adding ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={addTag}
            onKeyDown={(e) => {
              if (e.key === "Enter") addTag();
              if (e.key === "Escape") {
                setDraft("");
                setAdding(false);
              }
            }}
            placeholder="tag"
            className="w-20 cursor-text rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-foreground outline-none focus:border-ring"
          />
        ) : (
          <TooltipButton
            variant="ghost"
            size="icon-xs"
            onClick={() => setAdding(true)}
            tooltip="Add a tag"
            aria-label="Add a tag"
            className="size-5 rounded-full text-muted-foreground"
          >
            <Plus className="size-3" />
          </TooltipButton>
        )}
      </span>

      <span className="ml-auto flex items-center gap-1">
        <TooltipButton
          variant="ghost"
          size="xs"
          onClick={toggleArchive}
          tooltip={
            archived
              ? "Bring this plan back into the list"
              : "Move this plan into the archived group"
          }
          className="gap-1.5"
        >
          {archived ? <ArchiveRestore /> : <Archive />}
          {archived ? "Unarchive" : "Archive"}
        </TooltipButton>
        <Button variant="ghost" size="xs" onClick={onOpenHistory} className="gap-1.5">
          <History />
          History
        </Button>
      </span>
    </div>
  );
}
