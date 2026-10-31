import { ChevronRight, FileText, Folder, FolderOpen } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { FOLDED, statusGroups } from "@/lib/board";
import type { CardDisplay } from "@/lib/cardDisplay";
import { entrance, useMountedKeys } from "@/lib/motion";
import { useNewPlans } from "@/lib/newPlans";
import { STATUS_LABELS, type PlanSummary, type Status } from "@/lib/planBase";
import { cn } from "@/lib/utils";
import { branchHolds, buildSetTree, type SetNode } from "@/lib/planTree";
import type { PlanProgress } from "@/lib/work";
import { DemoBadge, NewBadge, PlanRowFacts } from "./PlanFacts";
import { StatusGlyph } from "./StatusGlyph";
import {
  PlanContextMenu,
  SELECTED_ROW,
  useSelectedMark,
} from "@/features/board/PlanActions";

interface PlanListProps {
  plans: PlanSummary[];
  activePath: string | null;
  /** Open threads by plan path, for the plans that have any. */
  openThreads: Map<string, number>;
  /** Live agent sessions by plan id, for the plans anyone is working on. */
  sessions: Map<string, number>;
  /** What the work record says, by plan path, for the plans with one. */
  progress: Map<string, PlanProgress>;
  /** Which facts a row shows. */
  display: CardDisplay;
  onSelect: (plan: PlanSummary) => void;
  /** Opens one document of a set, given its path inside the set's folder. */
  onSelectDocument: (plan: PlanSummary, document: string) => void;
  /** Double-click a row to rename; commits on Enter. */
  onRename: (plan: PlanSummary, newTitle: string) => void;
  /** Renames one document inside a set, given its path inside the folder. */
  onRenameDocument: (plan: PlanSummary, document: string, newName: string) => void;
}

interface Renaming {
  path: string;
  value: string;
}

/** The inline input a row turns into while it is being renamed. */
function RenameInput({
  renaming,
  onChange,
  onCancel,
  onCommit,
}: {
  renaming: Renaming;
  onChange: (value: string) => void;
  onCancel: () => void;
  onCommit: (value: string) => void;
}) {
  return (
    <input
      autoFocus
      value={renaming.value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCancel}
      onKeyDown={(e) => {
        if (e.key === "Enter" && renaming.value.trim()) {
          onCommit(renaming.value.trim());
        }
        if (e.key === "Escape") onCancel();
      }}
      className="min-w-0 flex-1 cursor-text rounded border border-ring bg-background px-1 text-xs text-foreground outline-none"
    />
  );
}

/** One level of a set's tree. Folders start open — a set is small, and a
 * closed folder hides the thing someone came looking for. */
function SetBranch({
  nodes,
  depth,
  activeDocument,
  onOpen,
  renamePrefix,
  renaming,
  setRenaming,
  onRenameDocument,
}: {
  nodes: SetNode[];
  depth: number;
  /** Which document of this set is open, relative to the set's folder. */
  activeDocument: string | null;
  onOpen: (document: string) => void;
  /** Distinguishes this set's documents from same-named ones elsewhere. */
  renamePrefix: string;
  renaming: Renaming | null;
  setRenaming: (renaming: Renaming | null) => void;
  onRenameDocument: (document: string, newName: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-px">
      {nodes.map((node) =>
        node.kind === "document" ? (
          <li key={node.path}>
            <button
              onClick={() => onOpen(node.path)}
              onDoubleClick={() =>
                setRenaming({
                  path: `${renamePrefix}/${node.path}`,
                  value: node.label,
                })
              }
              style={{ paddingLeft: 44 + depth * 12 }}
              className={cn(
                "flex w-full cursor-pointer items-center gap-1.5 border-b border-border py-1.5 pr-4 text-left text-xs transition-colors hover:bg-sidebar",
                node.path === activeDocument
                  ? "bg-sidebar-accent/70 text-sidebar-foreground"
                  : "text-muted-foreground",
              )}
            >
              <FileText className="size-3.5 shrink-0 opacity-70" />
              {renaming?.path === `${renamePrefix}/${node.path}` ? (
                <RenameInput
                  renaming={renaming}
                  onChange={(value) =>
                    setRenaming({ path: `${renamePrefix}/${node.path}`, value })
                  }
                  onCancel={() => setRenaming(null)}
                  onCommit={(value) => {
                    onRenameDocument(node.path, value);
                    setRenaming(null);
                  }}
                />
              ) : (
                <span className="truncate">{node.label}</span>
              )}
            </button>
          </li>
        ) : (
          <SetFolder
            key={node.name}
            node={node}
            depth={depth}
            activeDocument={activeDocument}
            onOpen={onOpen}
            renamePrefix={renamePrefix}
            renaming={renaming}
            setRenaming={setRenaming}
            onRenameDocument={onRenameDocument}
          />
        ),
      )}
    </ul>
  );
}

function SetFolder({
  node,
  depth,
  activeDocument,
  onOpen,
  renamePrefix,
  renaming,
  setRenaming,
  onRenameDocument,
}: {
  node: Extract<SetNode, { kind: "folder" }>;
  depth: number;
  activeDocument: string | null;
  onOpen: (document: string) => void;
  renamePrefix: string;
  renaming: Renaming | null;
  setRenaming: (renaming: Renaming | null) => void;
  onRenameDocument: (document: string, newName: string) => void;
}) {
  // Opens itself when what is being read is inside it, so nothing is hidden
  // behind a closed folder.
  const [open, setOpen] = useState(() => branchHolds(node, activeDocument));
  const Icon = open ? FolderOpen : Folder;
  return (
    <li>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ paddingLeft: 32 + depth * 12 }}
        className="flex w-full cursor-pointer items-center gap-1.5 border-b border-border py-1.5 pr-4 text-left text-xs text-muted-foreground transition-colors hover:bg-sidebar"
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
      {/* Always mounted, so the rows have somewhere to grow from; the grid
          row animates between nothing and its natural height. */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-in-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <SetBranch
            nodes={node.children}
            depth={depth + 1}
            activeDocument={activeDocument}
            onOpen={onOpen}
            renamePrefix={renamePrefix}
            renaming={renaming}
            setRenaming={setRenaming}
            onRenameDocument={onRenameDocument}
          />
        </div>
      </div>
    </li>
  );
}

/**
 * One plan row, memoized so a thousand siblings sit still while one of them
 * changes. A set's document tree is not built or mounted until the first
 * time it is opened.
 */
const PlanRow = memo(function PlanRow({
  plan,
  activePath,
  openThreads,
  sessions,
  work,
  display,
  fresh,
  expanded,
  renaming,
  index,
  mountedWith,
  onToggleExpand,
  onSelect,
  onSelectDocument,
  setRenaming,
  onRename,
  onRenameDocument,
}: {
  plan: PlanSummary;
  /** Null unless this row's plan or one of its documents is open. */
  activePath: string | null;
  openThreads: number;
  sessions: number;
  work?: PlanProgress;
  display: CardDisplay;
  /** Filed in the last few minutes: the row carries a New tag, unless it
   * is a demo plan, which carries a Demo tag. */
  fresh: boolean;
  expanded: boolean;
  /** Null unless this row is the one being renamed. */
  renaming: Renaming | null;
  /** Where the row sits in its group, which sets its entrance delay. */
  index: number;
  /** False for a plan filed after the list was drawn: it fades in place. */
  mountedWith: boolean;
  onToggleExpand: (plan: PlanSummary, next: boolean) => void;
  onSelect: (plan: PlanSummary) => void;
  onSelectDocument: (plan: PlanSummary, document: string) => void;
  setRenaming: (renaming: Renaming | null) => void;
  onRename: (plan: PlanSummary, newTitle: string) => void;
  onRenameDocument: (plan: PlanSummary, document: string, newName: string) => void;
}) {
  const folder = plan.path.slice(0, plan.path.lastIndexOf("/") + 1);
  const isSet = plan.documents.length > 1;
  // Once opened, a set stays mounted so closing it can animate; until then
  // its tree costs nothing.
  const [everExpanded, setEverExpanded] = useState(expanded);
  if (expanded && !everExpanded) setEverExpanded(true);
  const tree = useMemo(
    () => (isSet && everExpanded ? buildSetTree(plan.documents) : null),
    [isSet, everExpanded, plan.documents],
  );
  const enter = entrance(index, mountedWith);
  const selected = useSelectedMark(plan.path);
  return (
    <li style={enter.style} className={enter.className}>
      <PlanContextMenu plan={plan}>
        <button
          data-plan-path={plan.path}
          data-selected={selected}
          onDoubleClick={() => setRenaming({ path: plan.path, value: plan.title })}
          onClick={() => {
            if (!isSet) {
              onSelect(plan);
              return;
            }
            // Opening a set shows the plan and its documents; folding it
            // away leaves you where you were reading.
            const next = !expanded;
            onToggleExpand(plan, next);
            if (next) onSelect(plan);
          }}
          aria-expanded={isSet ? expanded : undefined}
          className={cn(
            "flex w-full cursor-pointer items-center gap-3 border-b border-border px-4 py-2 text-left text-sm text-foreground transition-colors hover:bg-sidebar",
            (plan.path === activePath || expanded) && "bg-sidebar-accent/60",
            SELECTED_ROW,
          )}
        >
          <span className="flex shrink-0 items-center gap-1">
            {isSet ? (
              <ChevronRight
                className={cn(
                  "size-3 shrink-0 text-muted-foreground transition-transform duration-200",
                  expanded && "rotate-90",
                )}
              />
            ) : (
              <span className="size-3 shrink-0" />
            )}
            <StatusGlyph status={plan.status} />
          </span>
          {renaming?.path === plan.path ? (
            <RenameInput
              renaming={renaming}
              onChange={(value) => setRenaming({ path: plan.path, value })}
              onCancel={() => setRenaming(null)}
              onCommit={(value) => {
                onRename(plan, value);
                setRenaming(null);
              }}
            />
          ) : (
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="truncate font-medium">{plan.title}</span>
              {plan.demo ? <DemoBadge /> : fresh && <NewBadge />}
            </span>
          )}
          <span className="flex items-center gap-3 text-xs text-muted-foreground">
            {isSet && (
              <span className="hidden shrink-0 tabular-nums sm:inline">
                {plan.documents.length} docs
              </span>
            )}
            <PlanRowFacts
              plan={plan}
              open={openThreads}
              sessions={sessions}
              work={work}
              display={display}
            />
          </span>
        </button>
      </PlanContextMenu>

      {/* A set opens at its entry point; the rest of it is only reachable
          if the documents are listed. */}
      {tree && (
        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-200 ease-in-out",
            expanded ? "mb-1 grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="overflow-hidden">
            <SetBranch
              nodes={tree}
              depth={0}
              activeDocument={
                activePath?.startsWith(folder)
                  ? activePath.slice(folder.length)
                  : null
              }
              onOpen={(document) => onSelectDocument(plan, document)}
              renamePrefix={plan.path}
              renaming={renaming}
              setRenaming={setRenaming}
              onRenameDocument={(document, newName) =>
                onRenameDocument(plan, document, newName)
              }
            />
          </div>
        </div>
      )}
    </li>
  );
});

export function PlanList({
  plans,
  activePath,
  openThreads,
  sessions,
  progress,
  display,
  onSelect,
  onSelectDocument,
  onRename,
  onRenameDocument,
}: PlanListProps) {
  const groups = useMemo(() => statusGroups(plans), [plans]);
  const fresh = useNewPlans(plans);
  const sorted = useMemo(() => groups.flatMap((group) => group.plans), [groups]);
  const mounted = useMountedKeys(sorted.map((plan) => plan.path));

  // A set follows whatever is being read until someone says otherwise, and
  // then it stays where they put it.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  // Finished work is kept, not shown: its groups start closed. Opening a
  // plan in one opens that group once; after that the toggle is the
  // person's, so a click always does what it says.
  const [foldOpen, setFoldOpen] = useState<Partial<Record<Status, boolean>>>({});
  const [renaming, setRenaming] = useState<Renaming | null>(null);
  // A single plan's folder is the base's, so only a set is read through
  // the documents inside its folder.
  const reading = sorted.find(
    (plan) =>
      plan.path === activePath ||
      (plan.documents.length > 1 &&
        !!activePath?.startsWith(plan.path.slice(0, plan.path.lastIndexOf("/") + 1))),
  );
  const shownFold = (status: Status) => foldOpen[status] ?? reading?.status === status;

  const toggleExpand = useCallback((plan: PlanSummary, next: boolean) => {
    setToggled((t) => ({ ...t, [plan.path]: next }));
  }, []);

  if (plans.length === 0) {
    return (
      <p className="animate-in fade-in-0 p-10 text-center text-sm leading-6 text-muted-foreground duration-200">
        No plans yet.
        <br />
        Your agents will file them here.
      </p>
    );
  }

  const renderPlan = (plan: PlanSummary, index: number) => {
    const folder = plan.path.slice(0, plan.path.lastIndexOf("/") + 1);
    const isSet = plan.documents.length > 1;
    const holdsActive = plan.path === activePath || !!activePath?.startsWith(folder);
    const expanded = isSet && (toggled[plan.path] ?? holdsActive);
    // Rows only receive what concerns them, so a keystroke in one rename
    // input or a switch of documents leaves the other rows untouched.
    const rowRenaming =
      renaming &&
      (renaming.path === plan.path ||
        (isSet && renaming.path.startsWith(`${plan.path}/`)))
        ? renaming
        : null;
    return (
      <PlanRow
        key={plan.path}
        plan={plan}
        activePath={holdsActive ? activePath : null}
        openThreads={openThreads.get(plan.path) ?? 0}
        sessions={sessions.get(plan.id) ?? 0}
        work={progress.get(plan.path)}
        display={display}
        fresh={fresh.has(plan.path)}
        expanded={expanded}
        renaming={rowRenaming}
        index={index}
        mountedWith={mounted.has(plan.path)}
        onToggleExpand={toggleExpand}
        onSelect={onSelect}
        onSelectDocument={onSelectDocument}
        setRenaming={setRenaming}
        onRename={onRename}
        onRenameDocument={onRenameDocument}
      />
    );
  };

  return (
    <div className="flex flex-col">
      {groups.map(({ status, plans: inState }) => {
        // Only finished work folds away; the states you are working in are
        // always open, so nothing live is ever a click from view.
        const collapsible = FOLDED.includes(status);
        const shown = !collapsible || shownFold(status);
        const heading = (
          <>
            <StatusGlyph status={status} />
            {STATUS_LABELS[status]}
            <span className="font-normal tabular-nums text-muted-foreground">
              {inState.length}
            </span>
            {collapsible && (
              <span className="ml-auto flex items-center gap-1 font-normal text-muted-foreground">
                {shown ? "Fold" : "Show"}
                <ChevronRight
                  className={cn(
                    "size-3 shrink-0 transition-transform duration-200",
                    shown && "rotate-90",
                  )}
                />
              </span>
            )}
          </>
        );
        const headingClass =
          "flex w-full items-center gap-2 border-b border-border bg-sidebar px-4 py-2 text-left text-xs font-medium";
        return (
          <div key={status}>
            {collapsible ? (
              <button
                onClick={() => setFoldOpen((open) => ({ ...open, [status]: !shown }))}
                aria-expanded={shown}
                className={cn(headingClass, "cursor-pointer hover:bg-sidebar-accent/60")}
              >
                {heading}
              </button>
            ) : (
              <p className={headingClass}>{heading}</p>
            )}
            {/* Folded rows stay mounted, and selecting skips them. */}
            <div
              data-folded={shown ? undefined : ""}
              className={cn(
                collapsible &&
                  "grid transition-[grid-template-rows] duration-200 ease-in-out",
                collapsible && (shown ? "grid-rows-[1fr]" : "grid-rows-[0fr]"),
              )}
            >
              <div className={cn(collapsible && "overflow-hidden")}>
                <ul className="flex flex-col">{inState.map(renderPlan)}</ul>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
