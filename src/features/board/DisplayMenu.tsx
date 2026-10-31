import { SlidersHorizontal } from "lucide-react";
import { Fragment } from "react";
import { TooltipButton } from "@/components/TooltipButton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { CARD_DISPLAY_OPTIONS, type CardDisplay } from "@/lib/cardDisplay";

/** The switches for what a plan's card shows. */
export function DisplayMenu({
  display,
  onChange,
}: {
  display: CardDisplay;
  onChange: (display: CardDisplay) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <TooltipButton
          variant="outline"
          size="xs"
          tooltip="Choose what each card shows"
          tooltipAlign="end"
          className="gap-1.5 font-normal text-muted-foreground"
        >
          <SlidersHorizontal />
          Display
        </TooltipButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-60 flex-col gap-0.5 p-2">
        <p className="px-2 pt-1 pb-1.5 text-xs text-muted-foreground">
          Cards and rows show
        </p>
        {CARD_DISPLAY_OPTIONS.map(({ key, label }) => (
          <Fragment key={key}>
            {/* The clamp shapes the card rather than adding a fact to it. */}
            {key === "clampTitle" && <div className="mx-2 my-1 h-px bg-border" />}
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
              {label}
              <Switch
                checked={display[key]}
                onCheckedChange={(on) => onChange({ ...display, [key]: on })}
              />
            </label>
          </Fragment>
        ))}
      </PopoverContent>
    </Popover>
  );
}
