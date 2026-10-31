import { Inbox } from "lucide-react";

/** The plan page with no plan open. */
export function EmptyState() {
  return (
    <div className="flex h-full animate-in flex-col items-center justify-center gap-3 p-8 text-center fade-in duration-200">
      <Inbox strokeWidth={1.25} className="size-14 text-muted-foreground/60" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">No plan open</p>
        <p className="text-xs text-muted-foreground/80">
          Pick a plan from the board, or wait for an agent to file one.
        </p>
      </div>
    </div>
  );
}
