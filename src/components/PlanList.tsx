import { ChevronRight, FileText, Folder, FolderOpen } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { ARCHIVED_TAG, isArchived, type PlanSummary } from "@/lib/planBase";
import { cn } from "@/lib/utils";
import { branchHolds, buildSetTree, type SetNode } from "@/lib/planTree";
import { MarqueeText } from "./MarqueeText";

interface PlanListProps {
  plans: PlanSummary[];
  activePath: string | null;
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
              style={{ paddingLeft: 22 + depth * 12 }}
              className={cn(
                "flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-2 text-left text-xs transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
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
  expanded,
  renaming,
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
  expanded: boolean;
  /** Null unless this row is the one being renamed. */
  renaming: Renaming | null;
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
  // The archived label is the group it sits in; repeating it as a chip
  // says nothing.
  const chipTags = plan.tags.filter((tag) => tag !== ARCHIVED_TAG);
  return (
    <li>
      <button
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
          "flex w-full cursor-default items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
          (plan.path === activePath || expanded) &&
            "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
        )}
      >
        {isSet ? (
          <>
            <ChevronRight
              className={cn(
                "-ml-1 size-3 shrink-0 text-muted-foreground transition-transform duration-200",
                expanded && "rotate-90",
              )}
            />
            {expanded ? (
              <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <Folder className="size-4 shrink-0 text-muted-foreground" />
            )}
          </>
        ) : (
          <FileText className="size-4 shrink-0 text-muted-foreground" />
        )}
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
          <MarqueeText text={plan.title} className="flex-1" />
        )}
        {isSet && (
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {plan.documents.length}
          </span>
        )}
        {chipTags.length > 0 && (
          <span className="max-w-24 shrink-0 truncate rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
            {chipTags[0]}
            {chipTags.length > 1 && ` +${chipTags.length - 1}`}
          </span>
        )}
      </button>

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
  onSelect,
  onSelectDocument,
  onRename,
  onRenameDocument,
}: PlanListProps) {
  // Newest first; a plan without a date sorts by name at the end.
  const sorted = useMemo(
    () =>
      [...plans].sort(
        (a, b) =>
          (b.updated ?? "").localeCompare(a.updated ?? "") ||
          a.title.localeCompare(b.title),
      ),
    [plans],
  );
  const active = sorted.filter((plan) => !isArchived(plan));
  const archived = sorted.filter(isArchived);

  // A set follows whatever is being read until someone says otherwise, and
  // then it stays where they put it.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  // Archived plans are kept, not shown: the group starts closed, and opens
  // itself only when the plan being read is inside it.
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [renaming, setRenaming] = useState<Renaming | null>(null);
  const readingArchived = archived.some((plan) => {
    const folder = plan.path.slice(0, plan.path.lastIndexOf("/") + 1);
    return plan.path === activePath || !!activePath?.startsWith(folder);
  });
  const archiveShown = archiveOpen || readingArchived;

  const toggleExpand = useCallback((plan: PlanSummary, next: boolean) => {
    setToggled((t) => ({ ...t, [plan.path]: next }));
  }, []);

  if (plans.length === 0) {
    return (
      <p className="px-2 py-6 text-center text-xs leading-5 text-muted-foreground">
        No plans yet.
        <br />
        Your agents will file them here.
      </p>
    );
  }

  const renderPlan = (plan: PlanSummary) => {
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
        expanded={expanded}
        renaming={rowRenaming}
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
    <div className="flex flex-col gap-3">
      <div>
        <p className="px-2 pb-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          Plans
          <span className="ml-1.5 tabular-nums opacity-60">{active.length}</span>
        </p>
        <ul className="flex flex-col gap-px">{active.map(renderPlan)}</ul>
      </div>

      {archived.length > 0 && (
        <div>
          <button
            onClick={() => setArchiveOpen((o) => !o)}
            aria-expanded={archiveShown}
            className="flex w-full cursor-default items-center gap-1 rounded-md px-2 pb-1 text-left text-[11px] font-medium tracking-wider text-muted-foreground uppercase transition-colors hover:text-foreground"
          >
            <ChevronRight
              className={cn(
                "size-3 shrink-0 transition-transform duration-200",
                archiveShown && "rotate-90",
              )}
            />
            Archived
            <span className="tabular-nums opacity-60">{archived.length}</span>
          </button>
          <div
            className={cn(
              "grid transition-[grid-template-rows] duration-200 ease-in-out",
              archiveShown ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
            )}
          >
            <div className="overflow-hidden">
              <ul className="flex flex-col gap-px">
                {archived.map(renderPlan)}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
