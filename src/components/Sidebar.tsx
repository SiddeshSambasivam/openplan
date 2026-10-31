import { FileText, Search, Settings, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { isMac } from "../lib/platform";
import { filterLibraryItems } from "../lib/tree";
import type { FileLibraryItem, LibraryItem } from "../lib/types";
import { cn } from "../lib/utils";
import { FolderTree } from "./FolderTree";
import { PlanList } from "./PlanList";
import { searchPlans, type PlanSummary, type SearchHit } from "@/lib/planBase";
import { BrandMark } from "./BrandMark";
import { MarqueeText } from "./MarqueeText";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TooltipButton } from "./TooltipButton";

interface SidebarProps {
  items: LibraryItem[];
  plans: PlanSummary[];
  activePlanPath: string | null;
  onSelectPlan: (plan: PlanSummary) => void;
  onSelectDocument: (plan: PlanSummary, document: string) => void;
  onRenamePlan: (plan: PlanSummary, newTitle: string) => void;
  onOpenSettings: () => void;
  activeId: string | null;
  expanded: Set<string>;
  onToggleDir: (path: string) => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  /** Reserve space for the macOS traffic lights (overlay titlebar). */
  padTop: boolean;
}

function LooseFileRow({
  file,
  active,
  inset,
  onSelect,
  onRemove,
}: {
  file: FileLibraryItem;
  active: boolean;
  /** Align with folder rows (which have a chevron) when folders are present. */
  inset: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <li className="group relative">
      <button
        onClick={() => onSelect(file.id)}
        className={cn(
          "relative flex w-full cursor-default items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
          active &&
            "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
        )}
      >
        {inset && <span className="size-3.5 shrink-0" />}
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <MarqueeText text={file.name} className="flex-1 pr-3" />
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
        className="absolute top-1/2 right-1.5 hidden -translate-y-1/2 text-muted-foreground group-hover:flex"
      >
        <X />
      </TooltipButton>
    </li>
  );
}

export function Sidebar({
  items,
  plans,
  activePlanPath,
  onSelectPlan,
  onSelectDocument,
  onRenamePlan,
  onOpenSettings,
  activeId,
  expanded,
  onToggleDir,
  onSelect,
  onRemove,
  padTop,
}: SidebarProps) {
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const trimmedQuery = query.trim();

  const displayItems = useMemo(
    () => (trimmedQuery ? filterLibraryItems(items, trimmedQuery) : items),
    [items, trimmedQuery],
  );
  const hasFolders = displayItems.some((item) => item.kind === "folder");

  // Searching reads the base on demand; the pause keeps a fast typist from
  // starting a scan per keystroke.
  const [hits, setHits] = useState<SearchHit[]>([]);
  useEffect(() => {
    if (!trimmedQuery) {
      setHits([]);
      return;
    }
    let stale = false;
    const timer = setTimeout(() => {
      void searchPlans(trimmedQuery).then((found) => {
        if (!stale) setHits(found);
      });
    }, 150);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [trimmedQuery]);

  const hitsByPlan = useMemo(() => {
    const grouped = new Map<string, SearchHit[]>();
    for (const hit of hits) {
      const group = grouped.get(hit.path);
      if (group) group.push(hit);
      else grouped.set(hit.path, [hit]);
    }
    return [...grouped.entries()];
  }, [hits]);
  const treeCtx = {
    activeId,
    expanded,
    forceExpandAll: trimmedQuery.length > 0,
    onToggleDir,
    onSelect,
  };

  return (
    <aside className="flex h-full w-full flex-col border-r border-sidebar-border bg-sidebar">
      {padTop && <div data-tauri-drag-region className="h-6 shrink-0" />}

      <div
        data-tauri-drag-region
        className="flex shrink-0 items-center gap-2.5 px-4 pt-4 pb-4"
      >
        <BrandMark className="pointer-events-none size-4 shrink-0 text-sidebar-foreground" />
        <span className="pointer-events-none font-serif text-xl tracking-[-0.01em] text-sidebar-foreground">
          OpenPlan
        </span>
      </div>

      <div className="shrink-0 px-3 pb-4">
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Escape") return;
              e.stopPropagation();
              if (query) setQuery("");
              else searchInputRef.current?.blur();
            }}
            placeholder="Search"
            aria-label="Search library"
            className="h-8 pr-7 pl-8"
          />
          {query && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => {
                setQuery("");
                searchInputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="absolute right-1.5 text-muted-foreground"
            >
              <X />
            </Button>
          )}
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2 pb-2">
        {!trimmedQuery && (
          <PlanList
            plans={plans}
            activePath={activePlanPath}
            onSelect={onSelectPlan}
            onSelectDocument={onSelectDocument}
            onRename={onRenamePlan}
          />
        )}
        {trimmedQuery && (
          <div className="pb-2">
            <p className="px-2 pb-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
              In plans
              <span className="ml-1.5 tabular-nums opacity-60">{hits.length}</span>
            </p>
            {hitsByPlan.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                Nothing matches &ldquo;{trimmedQuery}&rdquo;.
              </p>
            ) : (
              hitsByPlan.map(([path, group]) => (
                <div key={path} className="pb-1.5">
                  <button
                    onClick={() => {
                      const plan = plans.find((p) => p.path === path);
                      if (plan) onSelectPlan(plan);
                    }}
                    className="w-full cursor-default truncate rounded-md px-2 py-1 text-left text-sm text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent/60"
                  >
                    {group[0].title}
                  </button>
                  {group.slice(0, 4).map((hit) => (
                    <p
                      key={hit.line}
                      className="truncate px-2 py-0.5 pl-4 text-[11px] text-muted-foreground"
                    >
                      <span className="tabular-nums opacity-60">{hit.line}</span>{" "}
                      {hit.text}
                    </p>
                  ))}
                </div>
              ))
            )}
          </div>
        )}
        {displayItems.length > 0 && (
          <ul className="mt-1 flex flex-col gap-px">
            {displayItems.map((item) =>
              item.kind === "file" ? (
                <LooseFileRow
                  key={item.id}
                  file={item}
                  active={item.id === activeId}
                  inset={hasFolders}
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
        )}
      </nav>

      <div className="shrink-0 border-t border-sidebar-border p-2">
        <button
          onClick={onOpenSettings}
          className="flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
        >
          <Settings className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex-1">Settings</span>
          <span className="text-[11px] text-muted-foreground">
            {isMac ? "⌘," : "Ctrl+,"}
          </span>
        </button>
      </div>
    </aside>
  );
}
