import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}

/** A row of choices where one is always picked. The picked item reads as
 * raised and stays that way under the pointer. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: SegmentedProps<T>) {
  return (
    <div className={cn("flex w-fit gap-0.5 rounded-md bg-muted p-0.5", className)}>
      {options.map((option) => (
        <Button
          key={option.value}
          variant="ghost"
          size="xs"
          onClick={() => onChange(option.value)}
          aria-pressed={option.value === value}
          className={cn(
            "px-2.5",
            // The ghost variant tints on hover, and in dark mode under its
            // own `dark:` class, so both are overridden.
            option.value === value &&
              "bg-background text-foreground shadow-xs hover:bg-background hover:text-foreground dark:hover:bg-background",
          )}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
