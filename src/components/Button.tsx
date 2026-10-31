import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../lib/utils";
import { TooltipLabel, type TooltipSide } from "./Tooltip";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "icon";
  /** Hover label shown near the button — use instead of `title`, not with it. */
  tooltip?: string;
  tooltipSide?: TooltipSide;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "sm",
      tooltip,
      tooltipSide,
      children,
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      className={cn(
        "group/tip relative inline-flex cursor-default items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        variant === "default" &&
          "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
        variant === "outline" &&
          "border border-border bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        variant === "ghost" &&
          "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        size === "sm" && "h-8 px-3",
        size === "icon" && "size-7 rounded-md",
        className,
      )}
      {...props}
    >
      {children}
      {tooltip && <TooltipLabel label={tooltip} side={tooltipSide} />}
    </button>
  ),
);
Button.displayName = "Button";
