import { Download, FileText, Folder, Info, SlidersHorizontal } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { FONT_SIZE_LABELS, FONT_SIZE_ORDER, type FontSize } from "@/lib/fontSize";
import { WIDTH_LABELS, WIDTH_ORDER, type ContentWidth } from "@/lib/width";
import {
  AUTHORING_LABELS,
  AUTHORING_ORDER,
  getAuthoring,
  getStandards,
  setAuthoring,
  setStandardsOverrides,
  type Authoring,
  type BaseInfo,
  type Preferences,
  type Standards,
} from "@/lib/planBase";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { BrandMark } from "@/components/BrandMark";
import { Segmented } from "@/components/Segmented";
import { isTauri } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { ImportPlans } from "./ImportPlans";

const SECTIONS = [
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "standards", label: "Standards", icon: FileText },
  { id: "base", label: "Plan base", icon: Folder },
  { id: "import", label: "Import plans", icon: Download },
  { id: "about", label: "About", icon: Info },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

const FONT_SIZE_OPTIONS = FONT_SIZE_ORDER.map((value) => ({
  value,
  label: FONT_SIZE_LABELS[value],
}));

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

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dark: boolean;
  onToggleTheme: () => void;
  fontSize: FontSize;
  onFontSizeChange: (value: FontSize) => void;
  appFontSize: FontSize;
  onAppFontSizeChange: (value: FontSize) => void;
  contentWidth: ContentWidth;
  onContentWidthChange: (value: ContentWidth) => void;
  base: BaseInfo | null;
  preferences: Preferences;
  onMediaChange: (on: boolean) => void;
  onArchiveAfterDaysChange: (days: number) => void;
}

/** A whole number of days, or null while the field holds something else. */
function parseDays(text: string): number | null {
  return /^\d{1,4}$/.test(text.trim()) ? Number(text.trim()) : null;
}

function ArchiveDays({
  days,
  onChange,
}: {
  days: number;
  onChange: (days: number) => void;
}) {
  // The field keeps what is typed, so clearing it to type a new number does
  // not snap back. Only a whole number is saved.
  const [text, setText] = useState(String(days));
  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        max={9999}
        value={text}
        aria-label="Days before a completed plan is archived"
        aria-invalid={parseDays(text) == null}
        onChange={(e) => {
          setText(e.target.value);
          const next = parseDays(e.target.value);
          if (next != null) onChange(next);
        }}
        onBlur={() => setText(String(days))}
        className="h-7 w-16 text-right"
      />
      <span className="w-10 text-sm text-muted-foreground">
        {days === 0 ? "Never" : days === 1 ? "day" : "days"}
      </span>
    </div>
  );
}

export function SettingsDialog({
  open,
  onOpenChange,
  dark,
  onToggleTheme,
  fontSize,
  onFontSizeChange,
  appFontSize,
  onAppFontSizeChange,
  contentWidth,
  onContentWidthChange,
  base,
  preferences,
  onMediaChange,
  onArchiveAfterDaysChange,
}: SettingsDialogProps) {
  const [section, setSection] = useState<SectionId>("general");
  const [version, setVersion] = useState<string | null>(null);
  const [standards, setStandards] = useState<Standards | null>(null);
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(false);
  const [authoring, setAuthoringMode] = useState<Authoring>("markdown");

  useEffect(() => {
    if (!open || version != null) return;
    if (!isTauri) {
      setVersion("dev");
      return;
    }
    void import("@tauri-apps/api/app")
      .then(({ getVersion }) => getVersion())
      .then(setVersion)
      .catch(() => {});
  }, [open, version]);

  useEffect(() => {
    if (!open) return;
    void getStandards().then((next) => {
      setStandards(next);
      setDraft(next?.overrides ?? "");
    });
    void getAuthoring().then(setAuthoringMode);
  }, [open]);

  const chooseAuthoring = (mode: Authoring) => {
    setAuthoringMode(mode);
    void setAuthoring(mode);
  };

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
            <p className="px-2 pt-2 pb-1.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">
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
                  <Row
                    label="App text size"
                    hint="Menus, lists and cards. Plans keep their own size."
                  >
                    <Segmented
                      value={appFontSize}
                      options={FONT_SIZE_OPTIONS}
                      onChange={onAppFontSizeChange}
                    />
                  </Row>
                  <Row label="Plan text size">
                    <Segmented
                      value={fontSize}
                      options={FONT_SIZE_OPTIONS}
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

                <h2 className="pt-5 pb-1 text-sm font-semibold">Plans</h2>
                <div className="divide-y divide-border">
                  <Row
                    label="Archive completed plans after"
                    hint="Checked when you open the app or the board. Set 0 to never archive."
                  >
                    <ArchiveDays
                      days={preferences.archiveAfterDays}
                      onChange={onArchiveAfterDaysChange}
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

                <div className="mt-4 divide-y divide-border border-t border-border">
                  <Row label="How agents write plans">
                    <Segmented
                      value={authoring}
                      options={AUTHORING_ORDER.map((value) => ({
                        value,
                        label: AUTHORING_LABELS[value],
                      }))}
                      onChange={chooseAuthoring}
                    />
                  </Row>
                  <Row
                    label="Media in plans"
                    hint="Agents may add short videos and interactive pieces. They stay inside the plan folder."
                  >
                    <Switch
                      checked={preferences.media}
                      onCheckedChange={onMediaChange}
                      aria-label="Media in plans"
                    />
                  </Row>
                </div>

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
                  placeholder="e.g. Name the reviewer. Link the ticket in the summary."
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
                  <pre className="mt-2 max-h-56 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs leading-4 whitespace-pre-wrap text-muted-foreground">
                    {standards?.builtIn ?? "Loading…"}
                  </pre>
                </details>
              </>
            )}

            {section === "about" && (
              <>
                <div className="flex items-center gap-2.5 pt-1">
                  <BrandMark className="size-5 text-foreground" />
                  <span className="font-serif text-2xl tracking-[-0.01em] text-foreground">
                    OpenPlan
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  One place for the plans you and your agents work on.
                </p>
                <div className="mt-4 divide-y divide-border border-t border-border">
                  <Row label="Version">
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {version ?? "…"}
                    </span>
                  </Row>
                </div>
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
                      Shows the welcome flow again. Your plans are not affected.
                    </p>
                  </div>
                )}
              </>
            )}

            {section === "import" && (
              <>
                <h2 className="text-sm font-semibold">Import plans</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Bring in plans your agents already wrote on this machine.
                  Importing makes a copy. Your original files stay where they
                  are, and plans already here are skipped.
                </p>
                {isTauri ? (
                  <ImportPlans />
                ) : (
                  <p className="mt-4 text-xs text-muted-foreground">
                    Available in the desktop app.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
