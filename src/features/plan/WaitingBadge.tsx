import { Badge } from "@/components/ui/badge";

/** How many questions wait on the person. */
export function WaitingBadge({ count }: { count: number }) {
  return (
    <Badge
      className="h-4.5 min-w-4.5 rounded-full px-1.25 py-0 text-xs font-semibold tabular-nums"
      aria-label={`${count} waiting`}
    >
      {count}
    </Badge>
  );
}
