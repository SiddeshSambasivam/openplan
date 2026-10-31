export interface DetectedAgent {
  id: string;
  name: string;
  installed: boolean;
  plans: string[];
}

export interface DiscoveredFolder {
  path: string;
  documents: number;
  namedForPlans: boolean;
}

/** What discovery found on this machine. */
export interface Sources {
  agents: DetectedAgent[];
  folders: DiscoveredFolder[];
}

/** One row the person can pick to import. */
export interface ImportSource {
  key: string;
  kind: "agent" | "folder";
  label: string;
  detail: string;
  paths: string[];
  /** Who the plans are filed from: the agent's id, or "import" for a folder. */
  source: string;
  namedForPlans?: boolean;
}

/** Each agent that wrote plans, then each folder that looks like plans. */
export function importSources(found: Sources): ImportSource[] {
  const agents = found.agents
    .filter((a) => a.plans.length > 0)
    .map<ImportSource>((a) => ({
      key: `agent:${a.id}`,
      kind: "agent",
      label: `${a.name} plans`,
      detail: `${a.plans.length} ${a.plans.length === 1 ? "plan" : "plans"}`,
      paths: a.plans,
      source: a.id,
    }));
  const folders = found.folders.map<ImportSource>((f) => ({
    key: f.path,
    kind: "folder",
    label: f.path.split("/").slice(-2).join("/"),
    detail: `${f.documents} documents`,
    paths: [f.path],
    source: "import",
    namedForPlans: f.namedForPlans,
  }));
  return [...agents, ...folders];
}

/** An agent's own plans are what people came for. Folders are a guess. */
export function preselected(sources: ImportSource[]): Set<string> {
  return new Set(sources.filter((s) => s.kind === "agent").map((s) => s.key));
}
