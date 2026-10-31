import { Check, Folder, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AgentMark } from "@/features/onboarding/Onboarding";
import { Badge } from "@/components/ui/badge";
import { TooltipButton } from "@/components/TooltipButton";
import { cn } from "@/lib/utils";
import {
  importSources,
  preselected,
  type ImportSource,
  type Sources,
} from "./importSources";

interface Imported {
  filed: number;
  documents: number;
  alreadyThere: number;
}

/** Where one source is in the import: being copied, or finished. */
type SourceProgress = "running" | Imported | { error: true };

/**
 * Looks for plans on this machine each time it is shown, and copies the
 * ones the person picks into the base. Copies already filed are skipped.
 */
export function ImportPlans() {
  const [sources, setSources] = useState<ImportSource[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<Record<string, SourceProgress>>({});

  useEffect(() => {
    void invoke<Sources>("discover_sources").then((found) => {
      const next = importSources(found);
      setSources(next);
      setSelected(preselected(next));
    });
  }, []);

  const toggle = (key: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const runImport = async () => {
    setImporting(true);
    for (const item of sources ?? []) {
      if (!selected.has(item.key)) continue;
      setProgress((p) => ({ ...p, [item.key]: "running" }));
      const total: Imported = { filed: 0, documents: 0, alreadyThere: 0 };
      for (const path of item.paths) {
        // A source that can't be read shouldn't sink the rest of the import.
        try {
          const result = await invoke<Imported>("import_source", {
            path,
            source: item.source,
          });
          total.filed += result.filed;
          total.documents += result.documents;
          total.alreadyThere += result.alreadyThere;
        } catch {
          setProgress((p) => ({ ...p, [item.key]: { error: true } }));
        }
      }
      setProgress((p) =>
        (p[item.key] as { error?: boolean })?.error ? p : { ...p, [item.key]: total },
      );
    }
    setImporting(false);
  };

  if (!sources) {
    return (
      <p className="mt-4 text-xs text-muted-foreground">
        <Loader2 className="mr-1.5 inline size-3 animate-spin" />
        Looking around…
      </p>
    );
  }

  if (sources.length === 0) {
    return (
      <p className="mt-4 rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
        No plans found to import.
      </p>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-1.5">
      {sources.map((item) => (
        <button
          key={item.key}
          onClick={() => toggle(item.key)}
          aria-pressed={selected.has(item.key)}
          className={cn(
            "flex cursor-default items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50",
            selected.has(item.key)
              ? "border-foreground/40 bg-accent/50"
              : "border-border text-muted-foreground",
          )}
        >
          {item.kind === "agent" ? (
            <AgentMark
              id={item.source}
              className={cn(
                "size-4 shrink-0 text-foreground transition-opacity",
                !selected.has(item.key) && "opacity-45 grayscale",
              )}
            />
          ) : (
            <Folder
              className={cn(
                "size-4 shrink-0",
                selected.has(item.key) ? "text-foreground" : "text-muted-foreground",
              )}
            />
          )}
          <span className="min-w-0 flex-1 truncate" title={item.paths[0]}>
            {item.label}
          </span>
          {progress[item.key] ? (
            <SourceStatus state={progress[item.key]} />
          ) : (
            <>
              {item.kind === "folder" && !item.namedForPlans && (
                <Badge variant="secondary">markdown</Badge>
              )}
              <span className="shrink-0 text-xs text-muted-foreground">
                {item.detail}
              </span>
            </>
          )}
        </button>
      ))}
      <TooltipButton
        size="sm"
        onClick={() => void runImport()}
        disabled={importing || selected.size === 0}
        tooltip="Copies the plans into OpenPlan. Your files stay where they are."
        tooltipAlign="start"
        className="mt-2 self-start"
      >
        {importing && <Loader2 className="animate-spin" />}
        {importing ? "Importing" : "Import selected"}
      </TooltipButton>
    </div>
  );
}

function SourceStatus({ state }: { state: SourceProgress }) {
  if (state === "running") {
    return <Loader2 className="size-3.5 animate-spin text-muted-foreground" />;
  }
  if ("error" in state) {
    return <span className="text-xs text-destructive">couldn't read</span>;
  }
  const parts = [];
  if (state.filed > 0) parts.push(`${state.filed} filed`);
  if (state.alreadyThere > 0) parts.push(`${state.alreadyThere} already here`);
  return (
    <span className="flex items-center gap-1 text-xs text-success">
      <Check className="size-3.5" />
      {parts.join(" · ") || "nothing new"}
    </span>
  );
}
