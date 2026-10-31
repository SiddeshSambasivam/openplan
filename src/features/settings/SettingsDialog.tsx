import { FileText, Folder, SlidersHorizontal } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { FONT_SIZE_LABELS, FONT_SIZE_ORDER, type FontSize } from "@/lib/fontSize";
import { WIDTH_LABELS, WIDTH_ORDER, type ContentWidth } from "@/lib/width";
import {
  getStandards,
  setStandardsOverrides,
  type BaseInfo,
  type Standards,
} from "@/lib/planBase";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "standards", label: "Standards", icon: FileText },
  { id: "base", label: "Plan base", icon: Folder },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div className="min-w-0">
        <p className="text-sm text-foreground">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex gap-0.5 rounded-md bg-muted p-0.5">
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
  const [section, setSection] = useState<SectionId>("general");
  const [standards, setStandards] = useState<Standards | null>(null);
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    void getStandards().then((next) => {
      setStandards(next);
      setDraft(next?.overrides ?? "");
    });
  }, [open]);

  const saveStandards = async () => {
    await setStandardsOverrides(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="gap-0 p-0 sm:max-w-3xl"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <div className="flex h-[28rem]">
          <nav className="w-44 shrink-0 border-r border-border bg-sidebar p-2">
            <p className="px-2 pt-2 pb-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
              Settings
            </p>
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setSection(id)}
                className={cn(
                  "flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                  section === id
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60",
                )}
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                {label}
              </button>
            ))}
          </nav>

          <div className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
            {section === "general" && (
              <>
                <h2 className="pb-1 text-sm font-semibold">Appearance</h2>
                <div className="divide-y divide-border">
                  <Row label="Theme">
                    <Segmented
                      value={dark ? "dark" : "light"}
                      options={[
                        { value: "light", label: "Light" },
                        { value: "dark", label: "Dark" },
                      ]}
                      onChange={(next) => {
                        if ((next === "dark") !== dark) onToggleTheme();
                      }}
                    />
                  </Row>
                  <Row label="Text size">
                    <Segmented
                      value={fontSize}
                      options={FONT_SIZE_ORDER.map((value) => ({
                        value,
                        label: FONT_SIZE_LABELS[value],
                      }))}
                      onChange={onFontSizeChange}
                    />
                  </Row>
                  <Row
                    label="Reading width"
                    hint="How wide a line runs before it wraps."
                  >
                    <Segmented
                      value={contentWidth}
                      options={WIDTH_ORDER.map((value) => ({
                        value,
                        label: WIDTH_LABELS[value],
                      }))}
                      onChange={onContentWidthChange}
                    />
                  </Row>
                </div>
              </>
            )}

            {section === "standards" && (
              <>
                <h2 className="text-sm font-semibold">Standards</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  These rules tell your agents how to write plans. OpenPlan comes
                  with a good set built in. Anything you write here is added on
                  top of them.
                </p>

                <label
                  htmlFor="standards-overrides"
                  className="mt-4 block text-sm text-foreground"
                >
                  Your additions
                </label>
                <textarea
                  id="standards-overrides"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={6}
                  placeholder="e.g. Name the reviewer. Link the ticket in the header."
                  className="mt-1.5 w-full cursor-text resize-none rounded-md border border-border bg-background p-2 text-xs leading-5 text-foreground outline-none placeholder:text-muted-foreground focus:border-ring"
                />
                <div className="mt-2 flex items-center gap-3">
                  <Button size="sm" onClick={() => void saveStandards()}>
                    Save
                  </Button>
                  {saved && (
                    <span className="animate-in text-xs text-muted-foreground fade-in">
                      Saved. Agents will use this from their next plan.
                    </span>
                  )}
                </div>

                <details className="mt-5">
                  <summary className="cursor-default text-xs text-muted-foreground">
                    What ships with OpenPlan
                  </summary>
                  <pre className="mt-2 max-h-56 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-[11px] leading-4 whitespace-pre-wrap text-muted-foreground">
                    {standards?.builtIn ?? "Loading…"}
                  </pre>
                </details>
              </>
            )}

            {section === "base" && (
              <>
                <h2 className="text-sm font-semibold">Plan base</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  All your plans live in this folder, as plain Markdown files with
                  their full history. Any tool can read them.
                </p>
                <code className="mt-3 block truncate rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">
                  {base?.root ?? "Not available outside the desktop app"}
                </code>

                {import.meta.env.DEV && (
                  <div className="mt-5 border-t border-border pt-4">
                    <p className="text-sm text-foreground">Development</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() =>
                        void import("@tauri-apps/api/core").then(({ invoke }) =>
                          invoke("reset_onboarding").then(() =>
                            window.location.reload(),
                          ),
                        )
                      }
                    >
                      Replay onboarding
                    </Button>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Shows the welcome flow again. Your plans are not affected,
                      and importing again skips anything already here.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
