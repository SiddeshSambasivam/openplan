import { FileText, X } from "lucide-react";
import { useMemo } from "react";
import { FolderTree } from "@/components/FolderTree";
import { PlanList } from "@/components/PlanList";
import { TooltipButton } from "@/components/TooltipButton";
import type { ReviewSummary } from "@/lib/board";
import type { PlanSummary } from "@/lib/planBase";
import type { FileLibraryItem, LibraryItem } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ListViewProps {
  plans: PlanSummary[];
  summaries: ReviewSummary[];
  avatars: Map<string, string>;
  activePlanPath: string | null;
  onSelectPlan: (plan: PlanSummary) => void;
  onSelectDocument: (plan: PlanSummary, document: string) => void;
  onRenamePlan: (plan: PlanSummary, newTitle: string) => void;
  onRenameDocument: (plan: PlanSummary, document: string, newName: string) => void;
  /** Files and folders the person added from outside the base. */
  items: LibraryItem[];
  activeId: string | null;
  expanded: Set<string>;
  onToggleDir: (path: string) => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}

function LooseFileRow({
  file,
  active,
  onSelect,
  onRemove,
}: {
  file: FileLibraryItem;
  active: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <li className="group relative">
      <button
        onClick={() => onSelect(file.id)}
        className={cn(
          "flex w-full cursor-default items-center gap-3 border-b border-border px-4 py-2 text-left text-sm transition-colors hover:bg-sidebar",
          active && "bg-sidebar-accent/60",
        )}
      >
        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate">{file.name}</span>
      </button>
      <TooltipButton
        variant="ghost"
        size="icon-xs"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(file.id);
        }}
        aria-label={`Remove ${file.name} from list`}
        tooltip="Remove from list (the file stays on disk)"
        className="absolute top-1/2 right-3 hidden -translate-y-1/2 text-muted-foreground group-hover:flex"
      >
        <X />
      </TooltipButton>
    </li>
  );
}

/** Every plan, grouped by status, with the files and folders added from
 * outside the base underneath. */
export function ListView({
  plans,
  summaries,
  avatars,
  activePlanPath,
  onSelectPlan,
  onSelectDocument,
  onRenamePlan,
  onRenameDocument,
  items,
  activeId,
  expanded,
  onToggleDir,
  onSelect,
  onRemove,
}: ListViewProps) {
  const openThreads = useMemo(
    () => new Map(summaries.map((summary) => [summary.path, summary.open])),
    [summaries],
  );
  const treeCtx = {
    activeId,
    expanded,
    forceExpandAll: false,
    onToggleDir,
    onSelect,
  };

  return (
    <div className="h-full overflow-y-auto pb-8">
      <PlanList
        plans={plans}
        activePath={activePlanPath}
        avatars={avatars}
        openThreads={openThreads}
        onSelect={onSelectPlan}
        onSelectDocument={onSelectDocument}
        onRename={onRenamePlan}
        onRenameDocument={onRenameDocument}
      />
      {items.length > 0 && (
        <>
          <p className="flex items-center gap-2 border-b border-border bg-sidebar px-4 py-2 text-xs font-medium">
            Files you added
            <span className="font-normal tabular-nums text-muted-foreground">
              {items.length}
            </span>
          </p>
          <ul className="flex flex-col px-1">
            {items.map((item) =>
              item.kind === "file" ? (
                <LooseFileRow
                  key={item.id}
                  file={item}
                  active={item.id === activeId}
                  onSelect={onSelect}
                  onRemove={onRemove}
                />
              ) : (
                <FolderTree
                  key={item.id}
                  item={item}
                  ctx={treeCtx}
                  onRemove={onRemove}
                />
              ),
            )}
          </ul>
        </>
      )}
    </div>
  );
}
