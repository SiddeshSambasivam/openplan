import { ChevronLeft, ChevronRight, Folder } from "lucide-react";
import { memo, useMemo, useState, type ReactNode } from "react";
import { EmptyState } from "@/components/EmptyState";
import { FolderPicker } from "@/components/FolderPicker";
import { StatusGlyph } from "@/components/StatusGlyph";
import {
  FolderBadges,
  HandledBy,
  LiveMark,
  NewBadge,
  PrCount,
  RepoLine,
  QuestionCount,
  ThreadCount,
  TodoProgress,
} from "@/components/PlanFacts";
import { TooltipButton } from "@/components/TooltipButton";
import { Button } from "@/components/ui/button";
import {
  boardColumns,
  FOLDED,
  shortDate,
  type ReviewSummary,
  type StatusGroup,
} from "@/lib/board";
import type { CardDisplay } from "@/lib/cardDisplay";
import { entrance, useMountedKeys } from "@/lib/motion";
import { useNewPlans } from "@/lib/newPlans";
import { STATUS_HINTS, STATUS_LABELS, type PlanSummary, type Status } from "@/lib/planBase";
import { cn } from "@/lib/utils";
import type { PlanProgress } from "@/lib/work";
import { PlanContextMenu, SELECTED_CARD, useSelectedMark } from "./PlanActions";

interface BoardViewProps {
  plans: PlanSummary[];
  summaries: ReviewSummary[];
  /** Live agent sessions by plan id. */
  sessions: Map<string, number>;
  /** What the work record says, by plan path, for the plans with one. */
  progress: Map<string, PlanProgress>;
  /** Which facts a card shows. */
  display: CardDisplay;
  /** Every folder in the base, for the card menu. */
  folders: string[];
  onFoldersChange: (plan: PlanSummary, folders: string[]) => void;
  onOpen: (plan: PlanSummary) => void;
}

interface CardActions {
  folders: string[];
  onFoldersChange: (plan: PlanSummary, folders: string[]) => void;
  onOpen: (plan: PlanSummary) => void;
}

function Card({
  plan,
  open,
  sessions,
  work,
  display,
  fresh,
  index,
  mountedWith,
  actions,
}: {
  plan: PlanSummary;
  open: number;
  sessions: number;
  work?: PlanProgress;
  display: CardDisplay;
  /** Filed in the last few minutes: the card carries a New tag. */
  fresh: boolean;
  /** Where the card sits in its column, which sets its entrance delay. */
  index: number;
  /** False for a card filed after the column was drawn: it fades in place. */
  mountedWith: boolean;
  actions: CardActions;
}) {
  const enter = entrance(index, mountedWith);
  const selected = useSelectedMark(plan.path);
  return (
    // The menu sits beside the card's button rather than inside it: a
    // button cannot hold another one.
    <PlanContextMenu plan={plan}>
      <div style={enter.style} className={cn("group relative", enter.className)}>
        <button
          onClick={() => actions.onOpen(plan)}
          title={display.clampTitle ? plan.title : undefined}
          data-plan-path={plan.path}
          data-selected={selected}
          className={cn(
            "motion-card flex w-full cursor-pointer flex-col gap-2 rounded-lg border border-border bg-card p-3 text-left hover:border-ring",
            SELECTED_CARD,
          )}
        >
          <span
            className={cn(
              "text-sm leading-snug font-medium text-balance text-foreground",
              fresh ? "pr-11" : "pr-6",
              display.clampTitle && "line-clamp-2",
            )}
          >
            {plan.title}
          </span>
          {display.repos && <RepoLine repos={work?.repos ?? []} className="text-xs" />}
          {display.folders && <FolderBadges folders={plan.folders} />}
          {/* Wraps rather than clips once a narrow column runs out of room. */}
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {display.sessions && <LiveMark sessions={sessions} />}
            {display.source && <HandledBy source={plan.source} />}
            <QuestionCount count={work?.pendingQuestions ?? 0} status={plan.status} />
            <ThreadCount open={open} />
            {display.progress && <TodoProgress progress={work} />}
            {display.prs && <PrCount prs={work?.prs} />}
            {display.date && (
              <span className="ml-auto shrink-0 tabular-nums">
                {shortDate(plan.updated ?? plan.created)}
              </span>
            )}
          </span>
        </button>
        {/* The tag gives way to the folder menu, which opens in its place. */}
        {fresh && (
          <NewBadge className="pointer-events-none absolute top-2.5 right-2 transition-opacity group-focus-within:opacity-0 group-hover:opacity-0" />
        )}
        <FolderPicker
          folders={plan.folders}
          known={actions.folders}
          onChange={(next) => actions.onFoldersChange(plan, next)}
          tooltip="Folders"
          trigger={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Folders"
              className="absolute top-2 right-2 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
            >
              <Folder />
            </Button>
          }
        />
      </div>
    </PlanContextMenu>
  );
}

function Column({
  group,
  summaries,
  sessions,
  progress,
  display,
  fresh,
  actions,
  onFold,
}: {
  group: StatusGroup;
  summaries: Map<string, ReviewSummary>;
  sessions: Map<string, number>;
  progress: Map<string, PlanProgress>;
  display: CardDisplay;
  /** The paths of the plans that carry a New tag. */
  fresh: Set<string>;
  actions: CardActions;
  /** Set for a column that folds away. */
  onFold?: () => void;
}) {
  const mounted = useMountedKeys(group.plans.map((plan) => plan.path));
  return (
    <section className="flex min-w-52 flex-1 flex-col">
      <h3
        title={STATUS_HINTS[group.status]}
        className="flex shrink-0 items-center gap-2 px-1 pb-2 text-sm font-medium"
      >
        <StatusGlyph status={group.status} />
        {STATUS_LABELS[group.status]}
        <span className="font-normal tabular-nums text-muted-foreground">
          {group.plans.length}
        </span>
        {onFold && (
          <TooltipButton
            variant="ghost"
            size="icon-xs"
            onClick={onFold}
            tooltip="Fold away"
            aria-label={`Fold ${STATUS_LABELS[group.status]} away`}
            className="ml-auto text-muted-foreground"
          >
            <ChevronLeft />
          </TooltipButton>
        )}
      </h3>
      {/* Each column carries its own overflow, so a long one scrolls
          without taking the others with it. The padding keeps a lifted or
          focused card inside the clip. */}
      <div
        data-scroll-clip
        className="-mx-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1 pt-1 pb-16"
      >
        {group.plans.map((plan, index) => (
          <Card
            key={plan.path}
            plan={plan}
            open={summaries.get(plan.path)?.open ?? 0}
            sessions={sessions.get(plan.id) ?? 0}
            work={progress.get(plan.path)}
            display={display}
            fresh={fresh.has(plan.path)}
            index={index}
            mountedWith={mounted.has(plan.path)}
            actions={actions}
          />
        ))}
      </div>
    </section>
  );
}

/** The folded columns, behind one collapsible at the end of the board.
 * Opening it lists them, and picking one brings that column back. */
function HiddenColumns({
  groups,
  onShow,
}: {
  groups: StatusGroup[];
  onShow: (status: Status) => void;
}) {
  const [open, setOpen] = useState(false);
  const count = groups.reduce((sum, group) => sum + group.plans.length, 0);
  return (
    <section className="flex w-36 shrink-0 flex-col">
      <TooltipButton
        variant="ghost"
        size="sm"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        tooltip="Completed and archived plans"
        className="justify-start gap-2 px-1 font-medium text-muted-foreground"
      >
        <ChevronRight
          className={cn("transition-transform duration-150", open && "rotate-90")}
        />
        Hidden
        <span className="font-normal tabular-nums">{count}</span>
      </TooltipButton>
      {open && (
        <ul className="animate-in fade-in-0 mt-1 flex flex-col gap-1 duration-150">
          {groups.map((group) => (
            <li key={group.status}>
              <TooltipButton
                variant="ghost"
                size="sm"
                onClick={() => onShow(group.status)}
                tooltip={`Show the ${STATUS_LABELS[group.status]} column`}
                tooltipSide="left"
                className="w-full justify-start gap-2 px-1 font-normal"
              >
                <StatusGlyph status={group.status} />
                {STATUS_LABELS[group.status]}
                <span className="ml-auto tabular-nums text-muted-foreground">
                  {group.plans.length}
                </span>
              </TooltipButton>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Every plan, in the column its status puts it in. Memoized: the shell
 * re-renders when the navbar or the theme changes, and none of that
 * concerns the cards. */
export const BoardView = memo(function BoardView({
  plans,
  summaries,
  sessions,
  progress,
  display,
  folders,
  onFoldersChange,
  onOpen,
}: BoardViewProps) {
  const columns = useMemo(() => boardColumns(plans), [plans]);
  const fresh = useNewPlans(plans);
  const byPath = useMemo(
    () => new Map(summaries.map((summary) => [summary.path, summary])),
    [summaries],
  );
  // Finished work starts folded; opening a column is for this visit only.
  const [unfolded, setUnfolded] = useState<Status[]>([]);
  const actions = { folders, onFoldersChange, onOpen };

  if (plans.length === 0) {
    return <EmptyState title="No plans yet" hint="Your agents will file them here." />;
  }

  // Finished work sits behind one Hidden control at the end of the board,
  // so it costs the open columns nothing until someone asks for it.
  const hidden = columns.filter(
    (group) => FOLDED.includes(group.status) && !unfolded.includes(group.status),
  );
  const shownCount = columns
    .filter((group) => !hidden.includes(group))
    .reduce((sum, group) => sum + group.plans.length, 0);
  if (shownCount === 0) {
    const finished = plans.length;
    return (
      <EmptyState title="Nothing in progress" hint="Your agents will file new plans here.">
        <Button variant="outline" size="sm" onClick={() => setUnfolded(FOLDED)}>
          Show {finished} finished {finished === 1 ? "plan" : "plans"}
        </Button>
      </EmptyState>
    );
  }
  const pieces: ReactNode[] = columns
    .filter((group) => !hidden.includes(group))
    .map((group) => (
      <Column
        key={group.status}
        group={group}
        summaries={byPath}
        sessions={sessions}
        progress={progress}
        display={display}
        fresh={fresh}
        actions={actions}
        onFold={
          FOLDED.includes(group.status)
            ? () => setUnfolded((open) => open.filter((s) => s !== group.status))
            : undefined
        }
      />
    ));
  if (hidden.length > 0) {
    pieces.push(
      <HiddenColumns
        key="hidden"
        groups={hidden}
        onShow={(status) => setUnfolded((open) => [...open, status])}
      />,
    );
  }

  return (
    // Below the width the columns need, the board scrolls sideways rather
    // than squeezing the cards.
    <div className="h-full overflow-x-auto">
      <div className="flex h-full gap-3 p-4">{pieces}</div>
    </div>
  );
});
