import { ExternalLink, Folder, History } from "lucide-react";
import {
  ClaudeCodeIcon,
  CodexIcon,
  CursorIcon,
} from "@/components/AgentIcons";
import { FolderBadges, LiveMark } from "@/components/PlanFacts";
import { SOURCE_LABELS, type PlanSummary, type Status } from "@/lib/planBase";
import { Button } from "@/components/ui/button";
import { FolderPicker } from "./FolderPicker";
import { StatusPicker } from "./StatusPicker";

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
  /** Agent sessions working on this plan right now. */
  sessions: number;
  onStatusChange: (status: Status) => void;
  /** Every folder in the base, to choose from. */
  folders: string[];
  onFoldersChange: (folders: string[]) => void;
  onOpenHistory: () => void;
}

/** What the app knows about a plan, above the plan itself: where it stands,
 * where it came from, and when. */
export function PlanMetaBar({
  plan,
  sessions,
  onStatusChange,
  folders,
  onFoldersChange,
  onOpenHistory,
}: PlanMetaBarProps) {
  const updated = formatDate(plan.updated ?? plan.created);

  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border pb-3 text-xs text-muted-foreground">
      <StatusPicker key={plan.id} status={plan.status} onChange={onStatusChange} />
      <span aria-hidden>·</span>
      <span className="flex items-center gap-1.5">
        {plan.source === "claude-code" && <ClaudeCodeIcon className="size-3.5" />}
        {plan.source === "codex" && <CodexIcon className="size-3.5" />}
        {plan.source === "cursor" && <CursorIcon className="size-3.5" />}
        {SOURCE_LABELS[plan.source] ?? plan.source}
      </span>
      {sessions > 0 && (
        <>
          <span aria-hidden>·</span>
          <LiveMark sessions={sessions} />
        </>
      )}
      {plan.folders.length > 0 && (
        <>
          <span aria-hidden>·</span>
          <FolderBadges folders={plan.folders} />
        </>
      )}
      {updated && (
        <>
          <span aria-hidden>·</span>
          <span>{updated}</span>
        </>
      )}
      {plan.pr && (
        <>
          <span aria-hidden>·</span>
          <a
            href={plan.pr}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-foreground/80 hover:underline"
          >
            Pull request
            <ExternalLink className="size-3" />
          </a>
        </>
      )}

      <span className="ml-auto flex items-center gap-1">
        <FolderPicker
          folders={plan.folders}
          known={folders}
          onChange={onFoldersChange}
          trigger={
            <Button variant="ghost" size="xs" className="gap-1.5">
              <Folder />
              Folders
            </Button>
          }
        />
        <Button variant="ghost" size="xs" onClick={onOpenHistory} className="gap-1.5">
          <History />
          History
        </Button>
      </span>
    </div>
  );
}
