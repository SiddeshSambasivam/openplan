import { FilePlus2, FileText, FolderPlus, Search, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { isMac } from "../lib/platform";
import { filterLibraryItems } from "../lib/tree";
import type { FileLibraryItem, LibraryItem } from "../lib/types";
import { cn } from "../lib/utils";
import { Button } from "./Button";
import { FolderTree } from "./FolderTree";
import { MarqueeText } from "./MarqueeText";
import { TooltipLabel } from "./Tooltip";

interface SidebarProps {
  items: LibraryItem[];
  activeId: string | null;
  expanded: Set<string>;
  onToggleDir: (path: string) => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onOpenFileDialog: () => void;
  onOpenFolderDialog: () => void;
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
          "group/tip relative flex w-full cursor-default items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
          active &&
            "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
        )}
      >
        {inset && <span className="size-3.5 shrink-0" />}
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <MarqueeText text={file.name} className="flex-1 pr-3" />
        <TooltipLabel label={file.path ?? file.name} />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove(file.id);
        }}
        aria-label={`Remove ${file.name} from list`}
        className="group/tip absolute top-1/2 right-1.5 hidden size-5 -translate-y-1/2 cursor-default items-center justify-center rounded-sm text-muted-foreground group-hover:flex hover:bg-border hover:text-foreground"
      >
        <X className="size-3.5" />
        <TooltipLabel label="Remove from list (the file stays on disk)" />
      </button>
    </li>
  );
}

export function Sidebar({
  items,
  activeId,
  expanded,
  onToggleDir,
  onSelect,
  onRemove,
  onOpenFileDialog,
  onOpenFolderDialog,
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
        className="flex shrink-0 items-center gap-2 px-4 pt-3.5 pb-2"
      >
        <div className="pointer-events-none flex size-6 items-center justify-center rounded-md bg-foreground">
          <FileText className="size-3.5 text-background" strokeWidth={2.25} />
        </div>
        <span className="pointer-events-none text-sm font-semibold tracking-tight text-sidebar-foreground">
          OpenPlan
        </span>
      </div>

      <div className="shrink-0 px-3 pb-2">
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
          <input
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
            className="w-full cursor-text rounded-md border border-sidebar-border bg-background py-1.5 pr-7 pl-8 text-sm text-sidebar-foreground outline-none placeholder:text-muted-foreground focus:border-ring"
          />
          {query && (
            <button
              onClick={() => {
                setQuery("");
                searchInputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="absolute right-1.5 flex size-5 cursor-default items-center justify-center rounded-sm text-muted-foreground hover:bg-border hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <p className="shrink-0 px-4 pb-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        Library
      </p>

      <nav className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2 pb-2">
        {displayItems.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs leading-5 text-muted-foreground">
            {trimmedQuery ? (
              <>No files match &ldquo;{trimmedQuery}&rdquo;.</>
            ) : (
              <>
                Nothing here yet.
                <br />
                Drop Markdown files or folders to begin.
              </>
            )}
          </p>
        ) : (
          <ul className="flex flex-col gap-px">
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

      <div className="shrink-0 border-t border-sidebar-border p-3">
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            onClick={onOpenFileDialog}
            tooltip={`Open file (${isMac ? "⌘O" : "Ctrl+O"})`}
            tooltipSide="top"
          >
            <FilePlus2 className="size-4" />
            File
          </Button>
          <Button
            variant="outline"
            onClick={onOpenFolderDialog}
            tooltip={`Open folder (${isMac ? "⇧⌘O" : "Ctrl+Shift+O"})`}
            tooltipSide="top"
          >
            <FolderPlus className="size-4" />
            Folder
          </Button>
        </div>
        <p className="pt-2 text-center text-[11px] text-muted-foreground">
          or drop files & folders anywhere
        </p>
      </div>
    </aside>
  );
}
