import { MessageSquareText } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { PlanRowFacts } from "@/components/PlanFacts";
import type { TodoCount } from "@/lib/work";
import { StatusGlyph } from "@/components/StatusGlyph";
import { forYou, type ReviewSummary } from "@/lib/board";
import { entrance, useMountedKeys } from "@/lib/motion";
import type { PlanSummary } from "@/lib/planBase";

interface ForYouViewProps {
  plans: PlanSummary[];
  summaries: ReviewSummary[];
  /** Live agent sessions by plan id. */
  sessions: Map<string, number>;
  /** Todo progress by plan path, for the plans with a work record. */
  progress: Map<string, TodoCount>;
  onOpen: (plan: PlanSummary) => void;
}

function Group({
  icon,
  label,
  plans,
  openThreads,
  sessions,
  onOpen,
}: {
  icon: ReactNode;
  label: string;
  plans: PlanSummary[];
  openThreads: Map<string, number>;
  sessions: Map<string, number>;
  onOpen: (plan: PlanSummary) => void;
}) {
  const mounted = useMountedKeys(plans.map((plan) => plan.path));
  if (plans.length === 0) return null;
  return (
    <section>
      <p className="flex items-center gap-2 border-b border-border bg-sidebar px-4 py-2 text-xs font-medium">
        {icon}
        {label}
        <span className="font-normal tabular-nums text-muted-foreground">
          {plans.length}
        </span>
      </p>
      <ul className="flex flex-col">
        {plans.map((plan, index) => {
          const enter = entrance(index, mounted.has(plan.path));
          return (
            <li key={plan.path} style={enter.style} className={enter.className}>
              <button
                onClick={() => onOpen(plan)}
                className="flex w-full cursor-default items-center gap-3 border-b border-border px-4 py-2 text-left text-sm transition-colors hover:bg-sidebar"
              >
                <StatusGlyph status={plan.status} />
                <span className="flex-1 truncate font-medium">{plan.title}</span>
                <span className="flex items-center gap-3 text-xs text-muted-foreground">
                  <PlanRowFacts
                    plan={plan}
                    open={openThreads.get(plan.path) ?? 0}
                    sessions={sessions.get(plan.id) ?? 0}
                    progress={progress.get(plan.path)}
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The plans that are waiting on the person, and nothing else. */
export function ForYouView({
  plans,
  summaries,
  sessions,
  onOpen,
  progress,
}: ForYouViewProps) {
  const groups = useMemo(() => forYou(plans, summaries), [plans, summaries]);
  const openThreads = useMemo(
    () => new Map(summaries.map((summary) => [summary.path, summary.open])),
    [summaries],
  );
  const nothingWaiting =
    groups.review.length === 0 && groups.answered.length === 0;

  return (
    <div className="h-full overflow-y-auto pb-8">
      <p className="border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
        Plans waiting on you: in review, or an agent answered your comment and
        the thread is still open.
      </p>
      {nothingWaiting ? (
        <p className="animate-in fade-in-0 p-10 text-center text-sm leading-6 text-muted-foreground duration-200">
          Nothing is waiting on you.
          <br />
          Plans land here when a review opens or an agent replies.
        </p>
      ) : (
        <>
          <Group
            icon={<StatusGlyph status="in-review" />}
            label="Waiting for your review"
            plans={groups.review}
            openThreads={openThreads}
            sessions={sessions}
            onOpen={onOpen}
          />
          <Group
            icon={
              <MessageSquareText className="size-3.5 text-muted-foreground" />
            }
            label="An agent replied to you"
            plans={groups.answered}
            openThreads={openThreads}
            sessions={sessions}
            onOpen={onOpen}
          />
        </>
      )}
    </div>
  );
}
