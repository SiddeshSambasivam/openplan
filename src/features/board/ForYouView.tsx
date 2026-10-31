import { MessageSquareText } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { NewBadge, PlanRowFacts } from "@/components/PlanFacts";
import type { CardDisplay } from "@/lib/cardDisplay";
import { useNewPlans } from "@/lib/newPlans";
import type { PlanProgress } from "@/lib/work";
import { StatusGlyph } from "@/components/StatusGlyph";
import { forYou, type ReviewSummary } from "@/lib/board";
import { entrance, useMountedKeys } from "@/lib/motion";
import type { PlanSummary } from "@/lib/planBase";

interface ForYouViewProps {
  plans: PlanSummary[];
  summaries: ReviewSummary[];
  /** Live agent sessions by plan id. */
  sessions: Map<string, number>;
  /** What the work record says, by plan path, for the plans with one. */
  progress: Map<string, PlanProgress>;
  /** Which facts a row shows. */
  display: CardDisplay;
  onOpen: (plan: PlanSummary) => void;
}

function Group({
  icon,
  label,
  plans,
  openThreads,
  sessions,
  progress,
  display,
  onOpen,
}: {
  icon: ReactNode;
  label: string;
  plans: PlanSummary[];
  openThreads: Map<string, number>;
  sessions: Map<string, number>;
  progress: Map<string, PlanProgress>;
  display: CardDisplay;
  onOpen: (plan: PlanSummary) => void;
}) {
  const mounted = useMountedKeys(plans.map((plan) => plan.path));
  const fresh = useNewPlans(plans);
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
                className="flex w-full cursor-pointer items-center gap-3 border-b border-border px-4 py-2 text-left text-sm transition-colors hover:bg-sidebar"
              >
                <StatusGlyph status={plan.status} />
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate font-medium">{plan.title}</span>
                  {fresh.has(plan.path) && <NewBadge />}
                </span>
                <span className="flex items-center gap-3 text-xs text-muted-foreground">
                  <PlanRowFacts
                    plan={plan}
                    open={openThreads.get(plan.path) ?? 0}
                    sessions={sessions.get(plan.id) ?? 0}
                    work={progress.get(plan.path)}
                    display={display}
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
  display,
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
            progress={progress}
            display={display}
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
            progress={progress}
            display={display}
            onOpen={onOpen}
          />
        </>
      )}
    </div>
  );
}
