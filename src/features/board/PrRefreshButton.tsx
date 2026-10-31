import { RefreshCw } from "lucide-react";
import { TooltipButton } from "@/components/TooltipButton";
import { PR_STATE_NOTE } from "@/lib/prState";
import { cn } from "@/lib/utils";

/** Reads every unmerged PR on the board again. The icon turns while it
 * runs. */
export function PrRefreshButton({
  refreshing,
  available,
  onRefresh,
}: {
  refreshing: boolean;
  /** False once a read found the GitHub CLI missing or signed out. */
  available: boolean;
  onRefresh: () => void;
}) {
  return (
    <TooltipButton
      variant="outline"
      size="xs"
      onClick={onRefresh}
      disabled={refreshing}
      tooltip={available ? "Check every open pull request for its latest state" : PR_STATE_NOTE}
      tooltipAlign="end"
      className="gap-1.5 font-normal text-muted-foreground"
    >
      <RefreshCw className={cn(refreshing && "animate-spin")} />
      Refresh
    </TooltipButton>
  );
}
