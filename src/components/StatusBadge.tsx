import { STATUS_LABELS, type PlanStatus } from "@/lib/planBase";
import { cn } from "@/lib/utils";

/** Muted throughout except the two states that are asking for someone's
 * attention — a wall of colour says nothing. */
const TONE: Record<PlanStatus, string> = {
  draft: "text-muted-foreground",
  "in-review": "bg-primary text-primary-foreground",
  approved: "text-foreground",
  "in-progress": "bg-accent text-accent-foreground",
  done: "text-muted-foreground",
  archived: "text-muted-foreground/60",
};

export function StatusBadge({
  status,
  className,
}: {
  status: PlanStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium tracking-wide whitespace-nowrap",
        TONE[status],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
