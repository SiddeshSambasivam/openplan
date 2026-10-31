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
  STATUS_HINTS,
  STATUS_LABELS,
  STATUS_ORDER,
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
          <StatusGlyph status={status} />
          {STATUS_LABELS[status]}
          <ChevronDown className="size-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuRadioGroup
          value={status}
          onValueChange={(next) => onChange(next as Status)}
        >
          {STATUS_ORDER.map((option) => (
            <DropdownMenuRadioItem
              key={option}
              value={option}
              // The choice is shown by highlighting the row, so the dot the
              // radio item would otherwise reserve space for is dropped.
              className="gap-2 pl-2 [&>span:first-child]:hidden data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground"
            >
              <StatusGlyph status={option} />
              {STATUS_LABELS[option]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
