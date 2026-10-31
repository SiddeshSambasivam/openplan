import { Check, Folder, Loader2 } from "lucide-react";
import {
  ClaudeCodeIcon,
  CodexIcon,
  CursorIcon,
} from "@/components/AgentIcons";
import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface DetectedAgent {
  id: string;
  name: string;
  installed: boolean;
  plans: string[];
}

interface DiscoveredFolder {
  path: string;
  documents: number;
  namedForPlans: boolean;
}

interface Sources {
  agents: DetectedAgent[];
  folders: DiscoveredFolder[];
}

interface Imported {
  filed: number;
  documents: number;
  alreadyThere: number;
}

/** Where one source is in the import: waiting, being copied, or finished. */
type SourceProgress = "running" | Imported | { error: true };

interface InstallStep {
  label: string;
  done: boolean;
  detail: string;
}

type Stage = "hello" | "import" | "connect";

const AGENT_ICONS: Record<string, typeof ClaudeCodeIcon> = {
  "claude-code": ClaudeCodeIcon,
  codex: CodexIcon,
  cursor: CursorIcon,
};

function AgentMark({ id, className }: { id: string; className?: string }) {
  const Icon = AGENT_ICONS[id];
  return Icon ? <Icon className={className} /> : null;
}

function SourceStatus({ state }: { state: SourceProgress | undefined }) {
  if (state === "running") {
    return <Loader2 className="size-3.5 animate-spin text-muted-foreground" />;
  }
  if (state && typeof state === "object" && "error" in state) {
    return <span className="text-xs text-destructive">couldn't read</span>;
  }
  if (state) {
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
  return null;
}

/** Staggered entrance for a column of elements. */
function rise(index: number): React.CSSProperties {
  return { animationDelay: `${index * 120}ms`, animationFillMode: "backwards" };
}

interface OnboardingProps {
  onDone: (name: string | null) => void;
}

/**
 * First run: a hello, what this machine already has, and connecting the
 * tools that will file plans from now on. Every step can be skipped —
 * onboarding earns its keep or gets out of the way.
 */
export function Onboarding({ onDone }: OnboardingProps) {
  const [stage, setStage] = useState<Stage>("hello");
  const [name, setName] = useState("");
  const [sources, setSources] = useState<Sources | null>(null);
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<Record<string, SourceProgress>>({});
  const [installing, setInstalling] = useState(false);
  const [installResults, setInstallResults] = useState<
    { tool: string; steps: InstallStep[]; error?: string }[]
  >([]);

  // Detection runs while the hello is still animating in, so the next screen
  // is already answered by the time anyone reaches it.
  useEffect(() => {
    void invoke<Sources>("discover_sources").then((found) => {
      setSources(found);
      setSelectedTools(
        new Set(found.agents.filter((a) => a.installed).map((a) => a.id)),
      );
      setSelectedSources(
        new Set(
          found.agents
            .filter((a) => a.plans.length > 0)
            .map((a) => `agent:${a.id}`),
        ),
      );
    });
  }, []);

  const toggle = (set: Set<string>, value: string) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  const agentSources = useMemo(
    () =>
      (sources?.agents ?? [])
        .filter((a) => a.plans.length > 0)
        .map((a) => ({
          key: `agent:${a.id}`,
          label: `${a.name} plans`,
          detail: `${a.plans.length} ${a.plans.length === 1 ? "plan" : "plans"}`,
          paths: a.plans,
          source: a.id,
        })),
    [sources],
  );

  const folderSources = useMemo(
    () =>
      (sources?.folders ?? []).map((f) => ({
        key: f.path,
        label: f.path.split("/").slice(-2).join("/"),
        detail: `${f.documents} documents`,
        paths: [f.path],
        source: "import",
        namedForPlans: f.namedForPlans,
      })),
    [sources],
  );

  const importables = useMemo(
    () => [...agentSources, ...folderSources],
    [agentSources, folderSources],
  );

  const runImport = async () => {
    setImporting(true);
    for (const item of importables) {
      if (!selectedSources.has(item.key)) continue;
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
    // The ticks get a beat to land, then the flow moves on by itself.
    setTimeout(() => setStage("connect"), 900);
  };

  const runInstalls = async () => {
    setInstalling(true);
    const results: { tool: string; steps: InstallStep[]; error?: string }[] = [];
    for (const tool of selectedTools) {
      try {
        const steps = await invoke<InstallStep[]>("install_tool", { tool });
        results.push({ tool, steps });
      } catch (e) {
        results.push({ tool, steps: [], error: String(e) });
      }
      setInstallResults([...results]);
    }
    setInstalling(false);
    // When every connection worked, the last click was the one that mattered.
    if (results.every((r) => !r.error)) {
      setTimeout(() => onDone(name.trim() || null), 1200);
    }
  };

  const agentName = (id: string) =>
    sources?.agents.find((a) => a.id === id)?.name ?? id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background">
      <div className="w-full max-w-md px-8 py-12">
        {stage === "hello" && (
          <div className="flex flex-col gap-6">
            <h1
              className="flex animate-in items-center gap-4 font-serif text-5xl tracking-[-0.01em] fade-in slide-in-from-bottom-4 duration-700"
              style={rise(0)}
            >
              <BrandMark className="size-8 shrink-0" />
              OpenPlan
            </h1>
            <p
              className="animate-in text-sm leading-6 text-muted-foreground fade-in slide-in-from-bottom-2 duration-500"
              style={rise(2)}
            >
              Keep every plan you and your coding agents write in one place.
              Two quick steps and you are in.
            </p>
            <div
              className="animate-in fade-in slide-in-from-bottom-2 duration-500"
              style={rise(3)}
            >
              <label htmlFor="onboarding-name" className="text-sm text-foreground">
                What should we call you?
              </label>
              <Input
                id="onboarding-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setStage("import");
                }}
                placeholder="Your name"
                className="mt-1.5"
                autoFocus
              />
            </div>
            <div
              className="animate-in fade-in slide-in-from-bottom-2 duration-500"
              style={rise(4)}
            >
              <p className="pb-1.5 text-sm text-foreground">On this machine</p>
              <div className="flex flex-col gap-1.5">
                {(sources?.agents ?? []).map((agent, i) => (
                  <button
                    key={agent.id}
                    disabled={!agent.installed}
                    onClick={() =>
                      setSelectedTools((s) => toggle(s, agent.id))
                    }
                    aria-pressed={selectedTools.has(agent.id)}
                    className={cn(
                      "animate-in flex cursor-default items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors fade-in duration-300",
                      agent.installed ? "hover:bg-accent/50" : "opacity-40",
                      selectedTools.has(agent.id)
                        ? "border-foreground/40 bg-accent/50"
                        : "border-border text-muted-foreground",
                    )}
                    style={rise(5 + i)}
                  >
                    <AgentMark
                      id={agent.id}
                      className={cn(
                        "size-5 shrink-0 text-foreground transition-all duration-200",
                        !selectedTools.has(agent.id) && "opacity-45 grayscale",
                      )}
                    />
                    <span className="flex-1">{agent.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {agent.installed ? "Detected" : "Not found"}
                    </span>
                  </button>
                ))}
                {!sources && (
                  <p className="py-2 text-xs text-muted-foreground">
                    <Loader2 className="mr-1.5 inline size-3 animate-spin" />
                    Looking around…
                  </p>
                )}
              </div>
            </div>
            <div
              className="animate-in fade-in slide-in-from-bottom-2 duration-500"
              style={rise(8)}
            >
              <Button onClick={() => setStage("import")} className="w-full">
                Continue
              </Button>
            </div>
          </div>
        )}

        {stage === "import" && (
          <div className="flex flex-col gap-5">
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-400">
              <h2 className="text-xl font-semibold tracking-tight">
                {name.trim() ? `Good to meet you, ${name.trim()}.` : "Bring your plans in"}
              </h2>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                We found plans already on this machine. Importing makes a copy.
                Your original files stay exactly where they are.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              {agentSources.map((item, i) => (
                <button
                  key={item.key}
                  onClick={() => setSelectedSources((s) => toggle(s, item.key))}
                  aria-pressed={selectedSources.has(item.key)}
                  className={cn(
                    "animate-in flex cursor-default items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors fade-in duration-300 hover:bg-accent/50",
                    selectedSources.has(item.key)
                      ? "border-foreground/40 bg-accent/50"
                      : "border-border text-muted-foreground",
                  )}
                  style={rise(i)}
                >
                  <AgentMark
                    id={item.key.slice("agent:".length)}
                    className={cn(
                      "size-4 shrink-0 text-foreground transition-all duration-200",
                      !selectedSources.has(item.key) && "opacity-45 grayscale",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {progress[item.key] ? (
                    <SourceStatus state={progress[item.key]} />
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {item.detail}
                    </span>
                  )}
                </button>
              ))}

              {folderSources.length > 0 && (
                <p
                  className="animate-in pt-2 pb-0.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase fade-in duration-300"
                  style={rise(agentSources.length)}
                >
                  Suggested folders
                </p>
              )}
              {folderSources.map((item, i) => (
                <button
                  key={item.key}
                  onClick={() => setSelectedSources((s) => toggle(s, item.key))}
                  aria-pressed={selectedSources.has(item.key)}
                  className={cn(
                    "animate-in flex cursor-default items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors fade-in duration-300 hover:bg-accent/50",
                    selectedSources.has(item.key)
                      ? "border-foreground/40 bg-accent/50"
                      : "border-border text-muted-foreground",
                  )}
                  style={rise(agentSources.length + 1 + i)}
                >
                  <Folder
                    className={cn(
                      "size-4 shrink-0 transition-colors duration-200",
                      selectedSources.has(item.key)
                        ? "text-foreground"
                        : "text-muted-foreground",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate" title={item.paths[0]}>
                    {item.label}
                  </span>
                  {progress[item.key] ? (
                    <SourceStatus state={progress[item.key]} />
                  ) : (
                    <>
                      {!item.namedForPlans && (
                        <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
                          markdown
                        </span>
                      )}
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {item.detail}
                      </span>
                    </>
                  )}
                </button>
              ))}

              {importables.length === 0 && (
                <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                  No plans found to import. Once your agents are connected,
                  new plans will show up here.
                </p>
              )}
            </div>

            <div className="flex gap-2">
              {importables.length > 0 && (
                <Button
                  onClick={() => void runImport()}
                  disabled={importing || selectedSources.size === 0}
                  className="flex-1"
                >
                  {importing && <Loader2 className="animate-spin" />}
                  {importing ? "Importing" : "Import selected"}
                </Button>
              )}
              {!importing && (
                <Button
                  variant={importables.length > 0 ? "ghost" : "default"}
                  onClick={() => setStage("connect")}
                  className={importables.length > 0 ? "" : "w-full"}
                >
                  Skip
                </Button>
              )}
            </div>
          </div>
        )}

        {stage === "connect" && (
          <div className="flex flex-col gap-5">
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-400">
              <h2 className="text-xl font-semibold tracking-tight">
                Connect your agents
              </h2>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                Connected tools can file plans here and read your standards.
                OpenPlan adds a short note to each tool's instructions and
                changes nothing else in its files.
              </p>
            </div>

            {installResults.length === 0 ? (
              <div className="flex flex-col gap-1.5">
                {[...selectedTools].map((tool, i) => (
                  <div
                    key={tool}
                    className="animate-in flex items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-sm fade-in duration-300"
                    style={rise(i)}
                  >
                    <AgentMark id={tool} className="size-4 shrink-0 text-foreground" />
                    <span className="flex-1">{agentName(tool)}</span>
                    {installing && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                  </div>
                ))}
                {selectedTools.size === 0 && (
                  <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                    No tools selected. You can connect them any time from Settings.
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {installResults.map((result) => (
                  <div
                    key={result.tool}
                    className="animate-in rounded-lg border border-border px-3 py-2.5 fade-in duration-300"
                  >
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <AgentMark id={result.tool} className="size-4 shrink-0" />
                      {agentName(result.tool)}
                    </p>
                    {result.error ? (
                      <p className="mt-1 text-xs text-destructive">{result.error}</p>
                    ) : (
                      result.steps.map((step) => (
                        <p
                          key={step.label}
                          className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground"
                        >
                          <Check className="mt-0.5 size-3 shrink-0 text-success" />
                          <span>
                            {step.label}: {step.detail}
                          </span>
                        </p>
                      ))
                    )}
                  </div>
                ))}
              </div>
            )}

            {installResults.length > 0 || selectedTools.size === 0 ? (
              <Button
                onClick={() => onDone(name.trim() || null)}
                disabled={installing}
                className="w-full"
              >
                Open OpenPlan
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  onClick={() => void runInstalls()}
                  disabled={installing}
                  className="flex-1"
                >
                  {installing && <Loader2 className="animate-spin" />}
                  Connect
                </Button>
                <Button variant="ghost" onClick={() => onDone(name.trim() || null)}>
                  Skip
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
