import { StatusGlyph } from "@/components/StatusGlyph";
import { HandledBy, LiveMark, ProjectTag, ThreadCount } from "@/components/PlanFacts";
import {
  boardColumns,
  shortDate,
  type ReviewSummary,
  type StatusGroup,
} from "@/lib/board";
import { STATUS_HINTS, STATUS_LABELS, type PlanSummary } from "@/lib/planBase";
import { useMemo } from "react";

interface BoardViewProps {
  plans: PlanSummary[];
  summaries: ReviewSummary[];
  /** Owner avatars by project, for the plans that have one. */
  avatars: Map<string, string>;
  /** Live agent sessions by plan id. */
  sessions: Map<string, number>;
  hideCompleted: boolean;
  onOpen: (plan: PlanSummary) => void;
}

function Card({
  plan,
  avatarUrl,
  open,
  sessions,
  onOpen,
}: {
  plan: PlanSummary;
  avatarUrl: string | null;
  open: number;
  sessions: number;
  onOpen: (plan: PlanSummary) => void;
}) {
  return (
    <button
      onClick={() => onOpen(plan)}
      className="flex w-full cursor-default flex-col gap-2 rounded-lg border border-border bg-card p-3 text-left transition-[transform,border-color] duration-150 hover:-translate-y-px hover:border-ring active:translate-y-0"
    >
      <span className="text-sm leading-snug font-medium text-balance text-foreground">
        {plan.title}
      </span>
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <ProjectTag project={plan.project} avatarUrl={avatarUrl} />
        <LiveMark sessions={sessions} />
        <HandledBy source={plan.source} />
        <ThreadCount open={open} />
        <span className="ml-auto shrink-0 tabular-nums">
          {shortDate(plan.updated ?? plan.created)}
        </span>
      </span>
    </button>
  );
}

function Column({
  group,
  summaries,
  avatars,
  sessions,
  onOpen,
}: {
  group: StatusGroup;
  summaries: Map<string, ReviewSummary>;
  avatars: Map<string, string>;
  sessions: Map<string, number>;
  onOpen: (plan: PlanSummary) => void;
}) {
  return (
    <section className="flex min-w-60 flex-1 flex-col">
      <h3
        title={STATUS_HINTS[group.status]}
        className="flex shrink-0 items-center gap-2 px-1 pb-2 text-sm font-medium"
      >
        <StatusGlyph status={group.status} />
        {STATUS_LABELS[group.status]}
        <span className="font-normal tabular-nums text-muted-foreground">
          {group.plans.length}
        </span>
      </h3>
      {/* Each column carries its own overflow, so a long one scrolls
          without taking the others with it. */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5 pb-2">
        {group.plans.map((plan) => (
          <Card
            key={plan.path}
            plan={plan}
            avatarUrl={(plan.project && avatars.get(plan.project)) || null}
            open={summaries.get(plan.path)?.open ?? 0}
            sessions={sessions.get(plan.id) ?? 0}
            onOpen={onOpen}
          />
        ))}
      </div>
    </section>
  );
}

/** Every plan, in the column its status puts it in. */
export function BoardView({
  plans,
  summaries,
  avatars,
  sessions,
  hideCompleted,
  onOpen,
}: BoardViewProps) {
  const columns = useMemo(() => boardColumns(plans), [plans]);
  const byPath = useMemo(
    () => new Map(summaries.map((summary) => [summary.path, summary])),
    [summaries],
  );
  const shown = hideCompleted
    ? columns.filter((column) => column.status !== "completed")
    : columns;

  if (plans.length === 0) {
    return (
      <p className="p-10 text-center text-sm leading-6 text-muted-foreground">
        No plans yet.
        <br />
        Your agents will file them here.
      </p>
    );
  }

  return (
    // Below the width the columns need, the board scrolls sideways rather
    // than squeezing the cards.
    <div className="h-full overflow-x-auto">
      <div className="flex h-full gap-3 p-4">
        {shown.map((group) => (
          <Column
            key={group.status}
            group={group}
            summaries={byPath}
            avatars={avatars}
            sessions={sessions}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  );
}
