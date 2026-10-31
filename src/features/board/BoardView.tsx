import { ChevronLeft, Folder } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { FolderPicker } from "@/components/FolderPicker";
import { StatusGlyph } from "@/components/StatusGlyph";
import { FolderBadges, HandledBy, LiveMark, ThreadCount } from "@/components/PlanFacts";
import { TooltipButton } from "@/components/TooltipButton";
import { Button } from "@/components/ui/button";
import {
  boardColumns,
  FOLDED,
  shortDate,
  type ReviewSummary,
  type StatusGroup,
} from "@/lib/board";
import { entrance, useMountedKeys } from "@/lib/motion";
import { STATUS_HINTS, STATUS_LABELS, type PlanSummary, type Status } from "@/lib/planBase";
import { cn } from "@/lib/utils";

interface BoardViewProps {
  plans: PlanSummary[];
  summaries: ReviewSummary[];
  /** Live agent sessions by plan id. */
  sessions: Map<string, number>;
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
  index,
  mountedWith,
  actions,
}: {
  plan: PlanSummary;
  open: number;
  sessions: number;
  /** Where the card sits in its column, which sets its entrance delay. */
  index: number;
  /** False for a card filed after the column was drawn: it fades in place. */
  mountedWith: boolean;
  actions: CardActions;
}) {
  const enter = entrance(index, mountedWith);
  return (
    // The menu sits beside the card's button rather than inside it: a
    // button cannot hold another one.
    <div style={enter.style} className={cn("group relative", enter.className)}>
      <button
        onClick={() => actions.onOpen(plan)}
        className="motion-card flex w-full cursor-default flex-col gap-2 rounded-lg border border-border bg-card p-3 text-left hover:border-ring"
      >
        <span className="pr-6 text-sm leading-snug font-medium text-balance text-foreground">
          {plan.title}
        </span>
        <FolderBadges folders={plan.folders} />
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <LiveMark sessions={sessions} />
          <HandledBy source={plan.source} />
          <ThreadCount open={open} />
          <span className="ml-auto shrink-0 tabular-nums">
            {shortDate(plan.updated ?? plan.created)}
          </span>
        </span>
      </button>
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
  );
}

function Column({
  group,
  summaries,
  sessions,
  actions,
  onFold,
}: {
  group: StatusGroup;
  summaries: Map<string, ReviewSummary>;
  sessions: Map<string, number>;
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
          without taking the others with it. */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5 pb-2">
        {group.plans.map((plan, index) => (
          <Card
            key={plan.path}
            plan={plan}
            open={summaries.get(plan.path)?.open ?? 0}
            sessions={sessions.get(plan.id) ?? 0}
            index={index}
            mountedWith={mounted.has(plan.path)}
            actions={actions}
          />
        ))}
      </div>
    </section>
  );
}

/** Finished work, folded to a narrow strip at the end of the board. */
function FoldedColumn({ group, onOpen }: { group: StatusGroup; onOpen: () => void }) {
  const label = STATUS_LABELS[group.status];
  return (
    <TooltipButton
      variant="outline"
      onClick={onOpen}
      tooltip={`Show ${label}`}
      aria-label={`Show ${label}, ${group.plans.length} plans`}
      className="h-auto w-10 flex-col justify-start gap-2 py-3 font-normal"
    >
      <StatusGlyph status={group.status} />
      <span className="text-xs tabular-nums text-muted-foreground">
        {group.plans.length}
      </span>
    </TooltipButton>
  );
}

/** Every plan, in the column its status puts it in. */
export function BoardView({
  plans,
  summaries,
  sessions,
  folders,
  onFoldersChange,
  onOpen,
}: BoardViewProps) {
  const columns = useMemo(() => boardColumns(plans), [plans]);
  const byPath = useMemo(
    () => new Map(summaries.map((summary) => [summary.path, summary])),
    [summaries],
  );
  // Finished work starts folded; opening a column is for this visit only.
  const [unfolded, setUnfolded] = useState<Status[]>([]);
  const actions = { folders, onFoldersChange, onOpen };

  if (plans.length === 0) {
    return (
      <p className="animate-in fade-in-0 p-10 text-center text-sm leading-6 text-muted-foreground duration-200">
        No plans yet.
        <br />
        Your agents will file them here.
      </p>
    );
  }

  // Folded columns next to each other share one narrow rail, so finished
  // work costs the board one strip of width rather than one per status.
  const pieces: ReactNode[] = [];
  let rail: StatusGroup[] = [];
  const closeRail = () => {
    if (rail.length === 0) return;
    pieces.push(
      <div key={`rail-${rail[0].status}`} className="flex shrink-0 flex-col gap-2">
        {rail.map((group) => (
          <FoldedColumn
            key={group.status}
            group={group}
            onOpen={() => setUnfolded((open) => [...open, group.status])}
          />
        ))}
      </div>,
    );
    rail = [];
  };
  for (const group of columns) {
    const foldable = FOLDED.includes(group.status);
    if (foldable && !unfolded.includes(group.status)) {
      rail.push(group);
      continue;
    }
    closeRail();
    pieces.push(
      <Column
        key={group.status}
        group={group}
        summaries={byPath}
        sessions={sessions}
        actions={actions}
        onFold={
          foldable
            ? () => setUnfolded((open) => open.filter((s) => s !== group.status))
            : undefined
        }
      />,
    );
  }
  closeRail();

  return (
    // Below the width the columns need, the board scrolls sideways rather
    // than squeezing the cards.
    <div className="h-full overflow-x-auto">
      <div className="flex h-full gap-3 p-4">{pieces}</div>
    </div>
  );
}
