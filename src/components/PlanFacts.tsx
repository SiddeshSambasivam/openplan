import { Bot, Folder, MessageSquareText, User } from "lucide-react";
import { ClaudeCodeIcon, CodexIcon, CursorIcon } from "./AgentIcons";
import { shortDate } from "@/lib/board";
import { SOURCE_LABELS, type PlanSummary } from "@/lib/planBase";
import { projectName } from "@/lib/projects";
import { cn } from "@/lib/utils";

/** The repository a plan belongs to: its owner's avatar when we have one,
 * and the name people call it. */
export function ProjectTag({
  project,
  avatarUrl,
  className,
}: {
  project: string | null;
  avatarUrl?: string | null;
  className?: string;
}) {
  const name = projectName(project);
  if (!name) return null;
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5", className)}>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="size-3.5 shrink-0 rounded-sm object-cover"
        />
      ) : (
        <Folder className="size-3.5 shrink-0 text-muted-foreground" />
      )}
      <span className="truncate">{name}</span>
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
  avatarUrl,
  open,
}: {
  plan: PlanSummary;
  avatarUrl: string | null;
  open: number;
}) {
  return (
    <>
      <ProjectTag
        project={plan.project}
        avatarUrl={avatarUrl}
        className="hidden w-36 shrink-0 md:flex"
      />
      <HandledBy source={plan.source} className="hidden md:grid" />
      <ThreadCount open={open} />
      <span className="w-20 shrink-0 text-right whitespace-nowrap tabular-nums">
        {shortDate(plan.updated ?? plan.created)}
      </span>
    </>
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
