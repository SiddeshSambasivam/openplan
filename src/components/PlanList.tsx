import { ChevronRight, FileText, Folder, FolderOpen } from "lucide-react";
import { useMemo, useState } from "react";
import {
  PLAN_STATUSES,
  SOURCE_LABELS,
  STATUS_LABELS,
  type PlanStatus,
  type PlanSummary,
} from "@/lib/planBase";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { buildSetTree, type SetNode } from "@/lib/planTree";
import { MarqueeText } from "./MarqueeText";
import { StatusBadge } from "./StatusBadge";

/** What is waiting on you comes first; what is finished sinks. */
const ORDER: PlanStatus[] = [
  "in-review",
  "in-progress",
  "approved",
  "draft",
  "done",
  "archived",
];

function groupByStatus(plans: PlanSummary[]): [PlanStatus, PlanSummary[]][] {
  const groups = new Map<PlanStatus, PlanSummary[]>();
  for (const plan of plans) {
    const status = PLAN_STATUSES.includes(plan.status) ? plan.status : "draft";
    const group = groups.get(status);
    if (group) group.push(plan);
    else groups.set(status, [plan]);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""));
  }
  return ORDER.filter((status) => groups.has(status)).map((status) => [
    status,
    groups.get(status)!,
  ]);
}

interface PlanListProps {
  plans: PlanSummary[];
  activePath: string | null;
  onSelect: (plan: PlanSummary) => void;
  /** Opens one document of a set, given its path inside the set's folder. */
  onSelectDocument: (plan: PlanSummary, document: string) => void;
}

/** One level of a set's tree. Folders start open — a set is small, and a
 * closed folder hides the thing someone came looking for. */
function SetBranch({
  nodes,
  depth,
  activePath,
  onOpen,
}: {
  nodes: SetNode[];
  depth: number;
  activePath: string | null;
  onOpen: (document: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-px">
      {nodes.map((node) =>
        node.kind === "document" ? (
          <li key={node.path}>
            <button
              onClick={() => onOpen(node.path)}
              style={{ paddingLeft: 22 + depth * 12 }}
              className={cn(
                "flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-2 text-left text-xs transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                activePath?.endsWith("/" + node.path)
                  ? "bg-sidebar-accent/70 text-sidebar-foreground"
                  : "text-muted-foreground",
              )}
            >
              <FileText className="size-3.5 shrink-0 opacity-70" />
              <span className="truncate">{node.label}</span>
            </button>
          </li>
        ) : (
          <SetFolder
            key={node.name}
            node={node}
            depth={depth}
            activePath={activePath}
            onOpen={onOpen}
          />
        ),
      )}
    </ul>
  );
}

function SetFolder({
  node,
  depth,
  activePath,
  onOpen,
}: {
  node: Extract<SetNode, { kind: "folder" }>;
  depth: number;
  activePath: string | null;
  onOpen: (document: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const Icon = open ? FolderOpen : Folder;
  return (
    <li>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ paddingLeft: 10 + depth * 12 }}
        className="flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-2 text-left text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
      >
        <ChevronRight
          className={cn(
            "size-3 shrink-0 transition-transform duration-150",
            open && "rotate-90",
          )}
        />
        <Icon className="size-3.5 shrink-0 opacity-70" />
        <span className="truncate">{node.name}</span>
        <span className="ml-auto shrink-0 tabular-nums opacity-60">
          {node.children.length}
        </span>
      </button>
      {open && (
        <SetBranch
          nodes={node.children}
          depth={depth + 1}
          activePath={activePath}
          onOpen={onOpen}
        />
      )}
    </li>
  );
}

export function PlanList({
  plans,
  activePath,
  onSelect,
  onSelectDocument,
}: PlanListProps) {
  const groups = useMemo(() => groupByStatus(plans), [plans]);

  if (plans.length === 0) {
    return (
      <p className="px-2 py-6 text-center text-xs leading-5 text-muted-foreground">
        No plans yet.
        <br />
        Your agents will file them here.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map(([status, group]) => (
        <div key={status}>
          <p className="px-2 pb-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
            {STATUS_LABELS[status]}
            <span className="ml-1.5 tabular-nums opacity-60">{group.length}</span>
          </p>
          <ul className="flex flex-col gap-px">
            {group.map((plan) => {
              const folder = plan.path.slice(0, plan.path.lastIndexOf("/") + 1);
              const isOpenSet =
                plan.documents.length > 1 && !!activePath?.startsWith(folder);
              return (
              <li key={plan.path}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onSelect(plan)}
                      className={cn(
                        "flex w-full cursor-default items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                        (plan.path === activePath || isOpenSet) &&
                          "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                      )}
                    >
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <MarqueeText text={plan.title} className="flex-1" />
                      {plan.documents.length > 1 && (
                        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                          {plan.documents.length}
                        </span>
                      )}
                      {plan.status === "in-review" && (
                        <StatusBadge status={plan.status} className="px-1" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {SOURCE_LABELS[plan.source] ?? plan.source} · {plan.relativePath}
                  </TooltipContent>
                </Tooltip>

                {/* A set opens at its entry point; the rest of it is only
                    reachable if the documents are listed. */}
                {isOpenSet && (
                  <div className="mb-1">
                    <SetBranch
                      nodes={buildSetTree(plan.documents)}
                      depth={0}
                      activePath={activePath}
                      onOpen={(document) => onSelectDocument(plan, document)}
                    />
                  </div>
                )}
              </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
