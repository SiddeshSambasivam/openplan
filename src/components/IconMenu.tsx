import { Check, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";
import { Button } from "./Button";
import type { TooltipSide } from "./Tooltip";

interface IconMenuOption<T extends string> {
  value: T;
  label: string;
}

interface IconMenuProps<T extends string> {
  icon: LucideIcon;
  tooltip: string;
  tooltipSide?: TooltipSide;
  ariaLabel: string;
  value: T;
  options: IconMenuOption<T>[];
  onChange: (value: T) => void;
}

/** A header icon button that opens a small single-select dropdown. */
export function IconMenu<T extends string>({
  icon: Icon,
  tooltip,
  tooltipSide,
  ariaLabel,
  value,
  options,
  onChange,
}: IconMenuProps<T>) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!container.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={container} className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((o) => !o)}
        tooltip={tooltip}
        tooltipSide={tooltipSide}
        aria-label={ariaLabel}
        aria-expanded={open}
      >
        <Icon className="size-4" />
      </Button>
      {open && (
        <div className="absolute top-full right-0 z-50 mt-1.5 w-40 rounded-lg border border-border bg-popover p-1 shadow-md">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={cn(
                "flex w-full cursor-default items-center justify-between rounded-md px-2 py-1.5 text-left text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground",
                opt.value === value && "font-medium",
              )}
            >
              {opt.label}
              {opt.value === value && <Check className="size-3.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
