import {
  Bot,
  Folder,
  FolderGit2,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestCreate,
  GitPullRequestDraft,
  MessageCircleQuestionMark,
  MessageSquareText,
  User,
  type LucideIcon,
} from "lucide-react";
import { Fragment, useContext, useState } from "react";
import { ClaudeCodeIcon, CodexIcon, CursorIcon } from "./AgentIcons";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { shortDate } from "@/lib/board";
import type { CardDisplay } from "@/lib/cardDisplay";
import { SOURCE_LABELS, type PlanSummary, type Status } from "@/lib/planBase";
import { PR_STATE_NOTE, PrReadsAvailable } from "@/lib/prState";
import { cn } from "@/lib/utils";
import {
  mostAdvancedPr,
  ownerAvatarUrl,
  pendingQuestionsLabel,
  PR_MARKS,
  progressText,
  prSummaryText,
  repoLabel,
  type PlanProgress,
  type PrState,
  type PrSummary,
  type Repo,
  type TodoCount,
} from "@/lib/work";

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
  work,
  display,
}: {
  plan: PlanSummary;
  open: number;
  sessions: number;
  work?: PlanProgress;
  display: CardDisplay;
}) {
  return (
    <>
      {/* Fixed columns, held open when empty, so the rows line up. */}
      {display.repos && (
        <span className="hidden w-40 shrink-0 lg:flex">
          <RepoLine repos={work?.repos ?? []} />
        </span>
      )}
      {display.folders && (
        <span className="hidden w-36 shrink-0 md:flex">
          <FolderBadges folders={plan.folders} max={1} className="flex-nowrap" />
        </span>
      )}
      {display.sessions && <LiveMark sessions={sessions} />}
      {display.source && <HandledBy source={plan.source} className="hidden md:grid" />}
      <QuestionCount count={work?.pendingQuestions ?? 0} status={plan.status} />
      <ThreadCount open={open} />
      {display.progress && <TodoProgress progress={work} />}
      {display.prs && <PrCount prs={work?.prs} />}
      {display.date && (
        <span className="w-20 shrink-0 text-right whitespace-nowrap tabular-nums">
          {shortDate(plan.updated ?? plan.created)}
        </span>
      )}
    </>
  );
}

/** The repos the plan works in, on one line: `owner/repo` with the branch
 * muted beside it. */
export function RepoLine({
  repos,
  className,
}: {
  repos: Repo[];
  className?: string;
}) {
  if (repos.length === 0) return null;
  const said = repos
    .map((repo) => [repoLabel(repo), repo.branch].filter(Boolean).join(" on "))
    .join(", ");
  return (
    <span
      title={said}
      className={cn("flex min-w-0 items-center gap-1.5 text-muted-foreground", className)}
    >
      <RepoMark repo={repos[0]} className="size-3" />
      <span className="truncate">
        {repos.map((repo, index) => (
          <Fragment key={repo.path}>
            {index > 0 && ", "}
            <span className="text-foreground">{repoLabel(repo)}</span>
            {repo.branch && ` ${repo.branch}`}
          </Fragment>
        ))}
      </span>
    </span>
  );
}

/** A repo's owner avatar where its host has one, and the repo or folder icon
 * otherwise, or when the avatar fails to load. */
export function RepoMark({ repo, className }: { repo: Repo; className?: string }) {
  const avatar = ownerAvatarUrl(repo, AVATAR_PX);
  const [failed, setFailed] = useState<string | null>(null);
  if (avatar && failed !== avatar) {
    return (
      <img
        src={avatar}
        alt=""
        onError={() => setFailed(avatar)}
        className={cn("shrink-0 rounded-sm bg-muted object-cover", className)}
      />
    );
  }
  const Icon = repo.remote ? FolderGit2 : Folder;
  return <Icon aria-hidden className={cn("shrink-0 text-muted-foreground", className)} />;
}

/** One size for every mark, so the webview fetches and caches each owner
 * once. Twice the largest mark, for sharp edges on high-density screens. */
const AVATAR_PX = 32;

/** The plan's PRs as the icon of the most advanced one, counted past one.
 * A plan in a repo with no PR yet shows a muted icon, and a plan with no
 * repo shows nothing. */
export function PrCount({ prs }: { prs?: PrSummary }) {
  const readsAvailable = useContext(PrReadsAvailable);
  if (!prs) return null;
  const state = mostAdvancedPr(prs.reported.map((pr) => pr.state));
  if (!state && !prs.expected) return null;
  const count = prs.reported.length;
  const summary = prSummaryText(prs);
  return (
    <span
      title={readsAvailable || count === 0 ? summary : `${summary}\n\n${PR_STATE_NOTE}`}
      className="flex shrink-0 items-center gap-1 tabular-nums"
    >
      <PrGlyph state={state ?? "none"} className="size-3" />
      {count > 1 && count}
    </span>
  );
}

const PR_GLYPHS: Record<PrState | "none", LucideIcon> = {
  open: GitPullRequest,
  draft: GitPullRequestDraft,
  merged: GitMerge,
  closed: GitPullRequestClosed,
  none: GitPullRequestCreate,
};

/** One PR state's icon in its colour. */
export function PrGlyph({
  state,
  className,
}: {
  state: PrState | "none";
  className?: string;
}) {
  const Icon = PR_GLYPHS[state];
  return <Icon aria-hidden className={cn("shrink-0", PR_MARKS[state].tone, className)} />;
}

/** A plan filed in the last few minutes. */
export function NewBadge({ className }: { className?: string }) {
  return <Badge className={cn("px-1.5 py-0", className)}>New</Badge>;
}

/** One of the plans onboarding writes to show the app. */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge variant="outline" className={cn("bg-card px-1.5 py-0", className)}>
      Demo
    </Badge>
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

/** How far the plan's todos are, as `4/9` with a bar. Nothing is shown for a
 * plan without todos. */
export function TodoProgress({ progress }: { progress?: TodoCount }) {
  if (!progress || progress.total <= 0) return null;
  return (
    <span
      title={progressText(progress)}
      className="flex shrink-0 items-center gap-1.5 tabular-nums"
    >
      <Progress
        value={(progress.done / progress.total) * 100}
        aria-label={progressText(progress)}
        className="h-1 w-8"
      />
      {progress.done}/{progress.total}
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

/** Questions an agent posted that wait for the person. Nothing is shown when
 * none do. Once the work has started, a question holds it up, and the mark
 * says so in the foreground colour. */
export function QuestionCount({ count, status }: { count: number; status: Status }) {
  const label = pendingQuestionsLabel(count, status);
  if (!label) return null;
  return (
    <span
      title={`${count} ${count === 1 ? "question waits" : "questions wait"} for your answer`}
      className={cn(
        "flex shrink-0 items-center gap-1 whitespace-nowrap tabular-nums",
        status === "in-progress" && "font-medium text-foreground",
      )}
    >
      <MessageCircleQuestionMark className="size-3" />
      {label}
    </span>
  );
}
