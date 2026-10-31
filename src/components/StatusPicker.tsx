import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  personCanSet,
  STATUS_FLOW,
  STATUS_HINTS,
  STATUS_LABELS,
  type Status,
} from "@/lib/planBase";
import { StatusGlyph } from "./StatusGlyph";

interface StatusPickerProps {
  status: Status;
  onChange: (status: Status) => void;
}

/** Where the plan stands, and the one control that moves it. */
export function StatusPicker({ status, onChange }: StatusPickerProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          title={STATUS_HINTS[status]}
          aria-label={`Status: ${STATUS_LABELS[status]}`}
          className="-ml-1.5 gap-1.5 text-foreground"
        >
          <StatusGlyph status={status} tick />
          {STATUS_LABELS[status]}
          <ChevronDown className="size-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuRadioGroup
          value={status}
          onValueChange={(next) => onChange(next as Status)}
        >
          {STATUS_FLOW.map((option) => (
            <DropdownMenuRadioItem
              key={option}
              value={option}
              disabled={!personCanSet(option)}
              // The choice is shown by highlighting the row, so the dot the
              // radio item would otherwise reserve space for is dropped.
              className="items-start gap-2 pl-2 [&>span:first-child]:hidden data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground"
            >
              <StatusGlyph status={option} className="mt-0.5" />
              <span className="min-w-0">
                <span className="block">{STATUS_LABELS[option]}</span>
                <span className="block text-xs text-muted-foreground">
                  {personCanSet(option) ? STATUS_HINTS[option] : "The agent moves it here."}
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
