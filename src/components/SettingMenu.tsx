import type { LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TooltipButton } from "./TooltipButton";

interface SettingMenuProps<T extends string> {
  icon: LucideIcon;
  tooltip: string;
  ariaLabel: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

/** A header icon that opens a single-choice reading preference. */
export function SettingMenu<T extends string>({
  icon: Icon,
  tooltip,
  ariaLabel,
  value,
  options,
  onChange,
}: SettingMenuProps<T>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <TooltipButton
          variant="ghost"
          size="icon-sm"
          tooltip={tooltip}
          tooltipAlign="end"
          aria-label={ariaLabel}
        >
          <Icon />
        </TooltipButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => onChange(next as T)}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
