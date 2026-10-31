import { Bot, Folder, MessageSquareText, User } from "lucide-react";
import { ClaudeCodeIcon, CodexIcon, CursorIcon } from "./AgentIcons";
import { Badge } from "@/components/ui/badge";
import { shortDate } from "@/lib/board";
import { SOURCE_LABELS, type PlanSummary } from "@/lib/planBase";
import { cn } from "@/lib/utils";

/** The folders a plan is in, as small badges. Past `max`, the rest are
 * counted rather than shown, so a row keeps its height. */
export function FolderBadges({
  folders,
  max = folders.length,
  className,
}: {
  folders: string[];
  max?: number;
  className?: string;
}) {
  if (folders.length === 0) return null;
  const hidden = folders.length - max;
  return (
    <span
      title={folders.join(", ")}
      className={cn("flex min-w-0 flex-wrap items-center gap-1", className)}
    >
      {folders.slice(0, max).map((folder) => (
        <Badge key={folder} variant="secondary" className="max-w-32 font-normal">
          <span className="truncate">{folder}</span>
        </Badge>
      ))}
      {hidden > 0 && (
        <span className="shrink-0 tabular-nums text-muted-foreground">+{hidden}</span>
      )}
    </span>
  );
}

/** Who last handled the plan: the agent that filed it, or the person. */
export function HandledBy({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  const label = SOURCE_LABELS[source] ?? source;
  const Icon =
    source === "manual" ? User : source === "import" ? Folder : Bot;
  return (
    <span
      title={`Handled by ${label}`}
      className={cn(
        "grid size-4 shrink-0 place-items-center rounded-sm bg-muted text-foreground",
        className,
      )}
    >
      {source === "claude-code" ? (
        <ClaudeCodeIcon className="size-2.5" />
      ) : source === "codex" ? (
        <CodexIcon className="size-2.5" />
      ) : source === "cursor" ? (
        <CursorIcon className="size-2.5" />
      ) : (
        <Icon className="size-2.5" />
      )}
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** The columns every plan row ends with, so a row and a card say the same
 * things about a plan. */
export function PlanRowFacts({
  plan,
  open,
  sessions,
}: {
  plan: PlanSummary;
  open: number;
  sessions: number;
}) {
  return (
    <>
      <FolderBadges
        folders={plan.folders}
        max={1}
        className="hidden w-36 shrink-0 flex-nowrap md:flex"
      />
      <LiveMark sessions={sessions} />
      <HandledBy source={plan.source} className="hidden md:grid" />
      <ThreadCount open={open} />
      <span className="w-20 shrink-0 text-right whitespace-nowrap tabular-nums">
        {shortDate(plan.updated ?? plan.created)}
      </span>
    </>
  );
}

/** Agents working on this plan right now. Nothing is shown when nobody is.
 * The dot pulses on opacity alone; the reduced-motion guard stills it. */
export function LiveMark({
  sessions,
  className,
}: {
  sessions: number;
  className?: string;
}) {
  if (sessions <= 0) return null;
  const said = `${sessions} ${sessions === 1 ? "session" : "sessions"}`;
  return (
    <span
      title={`${said} working on this plan right now`}
      className={cn(
        "flex shrink-0 items-center gap-1.5 whitespace-nowrap text-warning",
        className,
      )}
    >
      <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-current" />
      <span className="tabular-nums">{said}</span>
    </span>
  );
}

/** How much is still open on a plan. Nothing is shown when nothing is. */
export function ThreadCount({ open }: { open: number }) {
  if (open <= 0) return null;
  return (
    <span
      className="flex shrink-0 items-center gap-1 tabular-nums"
      title={`${open} open ${open === 1 ? "thread" : "threads"}`}
    >
      <MessageSquareText className="size-3" />
      {open}
    </span>
  );
}
