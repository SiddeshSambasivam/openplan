import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { shortcut as registryEntry, type ActionId } from "@/lib/shortcuts";
import { ShortcutLabel } from "./ShortcutKeys";

interface TooltipButtonProps extends ComponentProps<typeof Button> {
  /** The action this button runs. Its key shows in the tooltip, and so does
   * its label unless `tooltip` says something more specific. */
  shortcut?: ActionId;
  /** What the button does. */
  tooltip?: ReactNode;
  tooltipSide?: ComponentProps<typeof TooltipContent>["side"];
  tooltipAlign?: ComponentProps<typeof TooltipContent>["align"];
}

/** Every button in the app that explains itself on hover — the pairing is
 * common enough here to be worth naming, and shadcn ships the two halves. */
export function TooltipButton({
  shortcut,
  tooltip,
  tooltipSide = "bottom",
  tooltipAlign = "center",
  ...props
}: TooltipButtonProps) {
  const action = shortcut ? registryEntry(shortcut) : null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button {...props} />
      </TooltipTrigger>
      <TooltipContent side={tooltipSide} align={tooltipAlign} sideOffset={6}>
        <ShortcutLabel label={tooltip ?? action?.label} keys={action?.keys} />
      </TooltipContent>
    </Tooltip>
  );
}
