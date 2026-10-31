import { Download, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { installTooltip, noticeText, type UpdateState } from "@/lib/updates";
import { isWindows, openExternal } from "@/lib/platform";
import { TooltipButton } from "./TooltipButton";

interface UpdateNoticeProps {
  state: UpdateState;
  onUpdate: () => void;
  onLater: () => void;
}

/** The top bar's word that a new version is ready, in the style of the
 * completion prompt. Nothing downloads until the person clicks Update. */
export function UpdateNotice({ state, onUpdate, onLater }: UpdateNoticeProps) {
  const text = noticeText(state);
  if (text == null) return null;
  const working = state.kind === "downloading" || state.kind === "installing";
  const downloadUrl = state.kind === "packageInstall" ? state.downloadUrl : null;
  return (
    <>
      <span
        title={text}
        className="max-w-80 min-w-0 animate-in truncate pl-1 text-xs text-muted-foreground tabular-nums fade-in"
      >
        {text}
      </span>
      {state.kind === "downloading" && state.percent != null && (
        <Progress value={state.percent} className="h-1 w-16 shrink-0" aria-label="Download progress" />
      )}
      {state.kind === "available" && (
        <TooltipButton
          size="xs"
          variant="outline"
          onClick={onUpdate}
          tooltip={installTooltip(isWindows)}
          className="gap-1.5"
        >
          <Download />
          Update
        </TooltipButton>
      )}
      {state.kind === "installFailed" && (
        <TooltipButton
          size="xs"
          variant="outline"
          onClick={onUpdate}
          tooltip={installTooltip(isWindows)}
          className="gap-1.5"
        >
          <RotateCw />
          Try again
        </TooltipButton>
      )}
      {downloadUrl && (
        <TooltipButton
          size="xs"
          variant="outline"
          onClick={() => void openExternal(downloadUrl)}
          tooltip="Download the new version"
          className="gap-1.5"
        >
          <Download />
          Download
        </TooltipButton>
      )}
      {!working && (
        <Button size="xs" variant="ghost" onClick={onLater} className="text-muted-foreground">
          Later
        </Button>
      )}
    </>
  );
}
