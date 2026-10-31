import { History, Plus, X } from "lucide-react";
import { useState } from "react";
import {
  ClaudeCodeIcon,
  CodexIcon,
  CursorIcon,
} from "@/components/AgentIcons";
import { SOURCE_LABELS, type PlanSummary } from "@/lib/planBase";
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

  const addTag = () => {
    const tag = draft.trim();
    setDraft("");
    setAdding(false);
    if (tag && !plan.tags.includes(tag)) onTagsChange([...plan.tags, tag]);
  };

  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border pb-3 text-xs text-muted-foreground">
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
        {plan.tags.map((tag) => (
          <span
            key={tag}
            className="group/tag flex items-center gap-0.5 rounded-full bg-muted py-0.5 pr-1 pl-2 text-[11px] text-foreground/80"
          >
            {tag}
            <button
              onClick={() => onTagsChange(plan.tags.filter((t) => t !== tag))}
              aria-label={`Remove tag ${tag}`}
              className="cursor-default rounded-full p-0.5 opacity-0 transition-opacity group-hover/tag:opacity-100 hover:bg-border"
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

      <span className="ml-auto">
        <Button variant="ghost" size="xs" onClick={onOpenHistory} className="gap-1.5">
          <History />
          History
        </Button>
      </span>
    </div>
  );
}
