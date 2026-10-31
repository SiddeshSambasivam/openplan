import { cn } from "../lib/utils";

export type TooltipSide =
  | "top"
  | "bottom"
  | "left"
  | "right"
  // Edge-aligned instead of centered — for triggers that sit right at the
  // window edge (e.g. the last icon in the header, or a floating widget
  // near a corner), where a centered label would run past the edge instead
  // of just growing away from it.
  | "bottom-start"
  | "bottom-end"
  | "top-start"
  | "top-end";

const SIDE_CLASSES: Record<TooltipSide, string> = {
  bottom: "top-full left-1/2 mt-1.5 -translate-x-1/2",
  top: "bottom-full left-1/2 mb-1.5 -translate-x-1/2",
  left: "right-full top-1/2 mr-1.5 -translate-y-1/2",
  right: "left-full top-1/2 ml-1.5 -translate-y-1/2",
  "bottom-start": "top-full left-0 mt-1.5",
  "bottom-end": "top-full right-0 mt-1.5",
  "top-start": "bottom-full left-0 mb-1.5",
  "top-end": "bottom-full right-0 mb-1.5",
};

interface TooltipLabelProps {
  label: string;
  side?: TooltipSide;
}

/**
 * A hover label, CSS-only (no portal, no JS timers). Render as the last
 * child of a trigger that already has `group/tip` and establishes a
 * positioning context (`relative` or `absolute`) — Button's `tooltip` prop
 * covers the common case; hand-rolled buttons add those two classes and
 * drop this in directly.
 */
export function TooltipLabel({ label, side = "bottom" }: TooltipLabelProps) {
  return (
    <span
      role="tooltip"
      className={cn(
        "pointer-events-none absolute z-50 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[11px] font-medium text-popover-foreground opacity-0 shadow-md transition-opacity delay-0 duration-100 group-hover/tip:opacity-100 group-hover/tip:delay-300",
        SIDE_CLASSES[side],
      )}
    >
      {label}
    </span>
  );
}
