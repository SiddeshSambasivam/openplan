import { MessageSquareText } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { PlanRowFacts } from "@/components/PlanFacts";
import { StatusGlyph } from "@/components/StatusGlyph";
import { forYou, type ReviewSummary } from "@/lib/board";
import type { PlanSummary } from "@/lib/planBase";

interface ForYouViewProps {
  plans: PlanSummary[];
  summaries: ReviewSummary[];
  avatars: Map<string, string>;
  onOpen: (plan: PlanSummary) => void;
}

function Group({
  icon,
  label,
  plans,
  avatars,
  openThreads,
  onOpen,
}: {
  icon: ReactNode;
  label: string;
  plans: PlanSummary[];
  avatars: Map<string, string>;
  openThreads: Map<string, number>;
  onOpen: (plan: PlanSummary) => void;
}) {
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
        {plans.map((plan) => (
          <li key={plan.path}>
            <button
              onClick={() => onOpen(plan)}
              className="flex w-full cursor-default items-center gap-3 border-b border-border px-4 py-2 text-left text-sm transition-colors hover:bg-sidebar"
            >
              <StatusGlyph status={plan.status} />
              <span className="flex-1 truncate font-medium">{plan.title}</span>
              <span className="flex items-center gap-3 text-xs text-muted-foreground">
                <PlanRowFacts
                  plan={plan}
                  avatarUrl={(plan.project && avatars.get(plan.project)) || null}
                  open={openThreads.get(plan.path) ?? 0}
                />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The plans that are waiting on the person, and nothing else. */
export function ForYouView({
  plans,
  summaries,
  avatars,
  onOpen,
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
        <p className="p-10 text-center text-sm leading-6 text-muted-foreground">
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
            avatars={avatars}
            openThreads={openThreads}
            onOpen={onOpen}
          />
          <Group
            icon={
              <MessageSquareText className="size-3.5 text-muted-foreground" />
            }
            label="An agent replied to you"
            plans={groups.answered}
            avatars={avatars}
            openThreads={openThreads}
            onOpen={onOpen}
          />
        </>
      )}
    </div>
  );
}
