import { RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  planDiff,
  planHistory,
  restorePlanRevision,
  SOURCE_LABELS,
  type DiffLine,
  type Revision,
} from "@/lib/planBase";
import { TooltipButton } from "@/components/TooltipButton";
import { cn } from "@/lib/utils";

function formatWhen(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface HistoryPanelProps {
  path: string;
  open: boolean;
  onClose: () => void;
  /** Told when a restore rewrites the plan, so the reader re-reads it. */
  onRestored: () => void;
}

/**
 * A plan's revisions, and what it said at each one. Restoring writes the old
 * text as a new revision rather than removing what came after, so nothing in
 * the history is ever lost by going back.
 */
export function HistoryPanel({
  path,
  open,
  onClose,
  onRestored,
}: HistoryPanelProps) {
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [selected, setSelected] = useState<Revision | null>(null);
  const [diff, setDiff] = useState<DiffLine[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setDiff(null);
    void planHistory(path).then(setRevisions);
  }, [open, path]);

  useEffect(() => {
    if (!selected) return;
    let stale = false;
    void planDiff(path, selected.id).then((lines) => {
      if (!stale) setDiff(lines);
    });
    return () => {
      stale = true;
    };
  }, [path, selected]);

  if (!open) return null;

  const restore = async () => {
    if (!selected) return;
    await restorePlanRevision(path, selected.id);
    onRestored();
    onClose();
  };

  return (
    <aside className="absolute inset-y-0 right-0 z-30 flex w-96 animate-in flex-col border-l border-border bg-background shadow-lg slide-in-from-right-4 duration-200">
      <div className="flex shrink-0 items-center justify-between px-4 pt-3.5 pb-2">
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          History
        </p>
        <TooltipButton
          variant="ghost"
          size="icon-xs"
          onClick={onClose}
          shortcut="escape"
          tooltip="Close"
          tooltipAlign="end"
          aria-label="Close history"
        >
          <X />
        </TooltipButton>
      </div>

      {revisions.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs leading-5 text-muted-foreground">
          No changes recorded yet.
        </p>
      ) : (
        <ol className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {revisions.map((revision) => (
            <li key={revision.id}>
              <button
                onClick={() =>
                  setSelected((current) =>
                    current?.id === revision.id ? null : revision,
                  )
                }
                className={cn(
                  "block w-full cursor-default rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/60",
                  selected?.id === revision.id && "bg-accent",
                )}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-xs font-medium text-foreground">
                    {SOURCE_LABELS[revision.author] ?? revision.author}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatWhen(revision.timestamp)}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {revision.message}
                </span>
              </button>

              {selected?.id === revision.id && (
                <div className="mt-1 mb-2 px-2">
                  <div className="max-h-72 overflow-auto rounded-md border border-border font-mono text-xs leading-5">
                    {diff == null ? (
                      <p className="p-2 text-muted-foreground">Loading…</p>
                    ) : diff.length === 0 ? (
                      <p className="p-2 text-muted-foreground">
                        Nothing has changed since this version.
                      </p>
                    ) : (
                      diff.map((line, i) => (
                        <div
                          key={i}
                          className={cn(
                            "flex",
                            line.origin === "+" && "bg-success/10",
                            line.origin === "-" && "bg-destructive/10",
                          )}
                        >
                          <span className="w-8 shrink-0 border-r border-border/50 pr-1 text-right text-muted-foreground/60 tabular-nums select-none">
                            {line.oldLine ?? ""}
                          </span>
                          <span className="w-8 shrink-0 border-r border-border/50 pr-1 text-right text-muted-foreground/60 tabular-nums select-none">
                            {line.newLine ?? ""}
                          </span>
                          <span
                            className={cn(
                              "w-4 shrink-0 text-center select-none",
                              line.origin === "+" && "text-success",
                              line.origin === "-" && "text-destructive",
                            )}
                          >
                            {line.origin.trim()}
                          </span>
                          <span
                            className={cn(
                              "whitespace-pre-wrap",
                              line.origin === "+" && "text-success",
                              line.origin === "-" && "text-destructive",
                            )}
                          >
                            {line.text || " "}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                  <TooltipButton
                    variant="outline"
                    size="xs"
                    onClick={() => void restore()}
                    tooltip="Brings this version back as a new change. Nothing is deleted"
                    className="mt-2 w-full gap-1.5"
                  >
                    <RotateCcw />
                    Restore this version
                  </TooltipButton>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
