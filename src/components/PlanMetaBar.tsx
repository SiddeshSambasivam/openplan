import { History } from "lucide-react";
import {
  PLAN_STATUSES,
  SOURCE_LABELS,
  STATUS_LABELS,
  type PlanStatus,
  type PlanSummary,
} from "@/lib/planBase";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { TooltipButton } from "./TooltipButton";
import { StatusBadge } from "./StatusBadge";

/** Absolute dates: a plan is a record, and "3 days ago" stops being useful the
 * moment you compare two of them. */
function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface PlanMetaBarProps {
  plan: PlanSummary;
  onStatusChange: (status: PlanStatus) => void;
  onOpenHistory: () => void;
}

/** What the app knows about a plan, above the plan itself. */
export function PlanMetaBar({
  plan,
  onStatusChange,
  onOpenHistory,
}: PlanMetaBarProps) {
  const updated = formatDate(plan.updated ?? plan.created);
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border pb-3 text-xs text-muted-foreground">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="xs" className="-ml-1 gap-1.5">
            <StatusBadge status={plan.status} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40">
          <DropdownMenuRadioGroup
            value={plan.status}
            onValueChange={(next) => onStatusChange(next as PlanStatus)}
          >
            {PLAN_STATUSES.map((status) => (
              <DropdownMenuRadioItem
                key={status}
                value={status}
                className="pl-2 [&>span:first-child]:hidden data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground"
              >
                {STATUS_LABELS[status]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <span>{SOURCE_LABELS[plan.source] ?? plan.source}</span>
      {plan.project && (
        <>
          <span aria-hidden>·</span>
          <span className="truncate">{plan.project}</span>
        </>
      )}
      {updated && (
        <>
          <span aria-hidden>·</span>
          <span>{updated}</span>
        </>
      )}

      <TooltipButton
        variant="ghost"
        size="xs"
        onClick={onOpenHistory}
        tooltip="Every change, and who made it"
        className="ml-auto gap-1.5"
      >
        <History />
        History
      </TooltipButton>
    </div>
  );
}
