import { FileText } from "lucide-react";
import { useMemo } from "react";
import {
  PLAN_STATUSES,
  SOURCE_LABELS,
  STATUS_LABELS,
  type PlanStatus,
  type PlanSummary,
} from "@/lib/planBase";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { MarqueeText } from "./MarqueeText";
import { StatusBadge } from "./StatusBadge";

/** What is waiting on you comes first; what is finished sinks. */
const ORDER: PlanStatus[] = [
  "in-review",
  "in-progress",
  "approved",
  "draft",
  "done",
  "archived",
];

function groupByStatus(plans: PlanSummary[]): [PlanStatus, PlanSummary[]][] {
  const groups = new Map<PlanStatus, PlanSummary[]>();
  for (const plan of plans) {
    const status = PLAN_STATUSES.includes(plan.status) ? plan.status : "draft";
    const group = groups.get(status);
    if (group) group.push(plan);
    else groups.set(status, [plan]);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""));
  }
  return ORDER.filter((status) => groups.has(status)).map((status) => [
    status,
    groups.get(status)!,
  ]);
}

interface PlanListProps {
  plans: PlanSummary[];
  activePath: string | null;
  onSelect: (plan: PlanSummary) => void;
}

export function PlanList({ plans, activePath, onSelect }: PlanListProps) {
  const groups = useMemo(() => groupByStatus(plans), [plans]);

  if (plans.length === 0) {
    return (
      <p className="px-2 py-6 text-center text-xs leading-5 text-muted-foreground">
        No plans yet.
        <br />
        Your agents will file them here.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map(([status, group]) => (
        <div key={status}>
          <p className="px-2 pb-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
            {STATUS_LABELS[status]}
            <span className="ml-1.5 tabular-nums opacity-60">{group.length}</span>
          </p>
          <ul className="flex flex-col gap-px">
            {group.map((plan) => (
              <li key={plan.path}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onSelect(plan)}
                      className={cn(
                        "flex w-full cursor-default items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                        plan.path === activePath &&
                          "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                      )}
                    >
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <MarqueeText text={plan.title} className="flex-1" />
                      {plan.status === "in-review" && (
                        <StatusBadge status={plan.status} className="px-1" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {SOURCE_LABELS[plan.source] ?? plan.source} · {plan.relativePath}
                  </TooltipContent>
                </Tooltip>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
