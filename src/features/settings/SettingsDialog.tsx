import { FONT_SIZE_LABELS, FONT_SIZE_ORDER, type FontSize } from "@/lib/fontSize";
import { WIDTH_LABELS, WIDTH_ORDER, type ContentWidth } from "@/lib/width";
import type { BaseInfo } from "@/lib/planBase";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A row of choices, which is what nearly every preference here is. */
function Choice<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div className="min-w-0">
        <p className="text-sm text-foreground">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex shrink-0 gap-1 rounded-md bg-muted p-0.5">
        {options.map((option) => (
          <Button
            key={option.value}
            variant="ghost"
            size="xs"
            onClick={() => onChange(option.value)}
            aria-pressed={option.value === value}
            className={cn(
              "px-2.5",
              option.value === value && "bg-background text-foreground shadow-xs",
            )}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dark: boolean;
  onToggleTheme: () => void;
  fontSize: FontSize;
  onFontSizeChange: (value: FontSize) => void;
  contentWidth: ContentWidth;
  onContentWidthChange: (value: ContentWidth) => void;
  base: BaseInfo | null;
}

export function SettingsDialog({
  open,
  onOpenChange,
  dark,
  onToggleTheme,
  fontSize,
  onFontSizeChange,
  contentWidth,
  onContentWidthChange,
  base,
}: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            How OpenPlan reads, and where it keeps your plans.
          </DialogDescription>
        </DialogHeader>

        <div className="divide-y divide-border">
          <Choice
            label="Theme"
            value={dark ? "dark" : "light"}
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
            onChange={(next) => {
              if ((next === "dark") !== dark) onToggleTheme();
            }}
          />
          <Choice
            label="Text size"
            value={fontSize}
            options={FONT_SIZE_ORDER.map((value) => ({
              value,
              label: FONT_SIZE_LABELS[value],
            }))}
            onChange={onFontSizeChange}
          />
          <Choice
            label="Reading width"
            hint="How wide a line of text runs before it wraps."
            value={contentWidth}
            options={WIDTH_ORDER.map((value) => ({
              value,
              label: WIDTH_LABELS[value],
            }))}
            onChange={onContentWidthChange}
          />

          <div className="py-3">
            <p className="text-sm text-foreground">Plan base</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Every plan lives here, in plain Markdown, with its history.
            </p>
            <code className="mt-2 block truncate rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">
              {base?.root ?? "Not available outside the desktop app"}
            </code>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
