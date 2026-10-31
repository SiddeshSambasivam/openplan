import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TooltipButtonProps extends ComponentProps<typeof Button> {
  /** What the button does, and its shortcut. */
  tooltip: ReactNode;
  tooltipSide?: ComponentProps<typeof TooltipContent>["side"];
  tooltipAlign?: ComponentProps<typeof TooltipContent>["align"];
}

/** Every button in the app that explains itself on hover — the pairing is
 * common enough here to be worth naming, and shadcn ships the two halves. */
export function TooltipButton({
  tooltip,
  tooltipSide = "bottom",
  tooltipAlign = "center",
  ...props
}: TooltipButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button {...props} />
      </TooltipTrigger>
      <TooltipContent side={tooltipSide} align={tooltipAlign} sideOffset={6}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}
