import { FileText, Search, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { filterLibraryItems } from "../lib/tree";
import type { FileLibraryItem, LibraryItem } from "../lib/types";
import { cn } from "../lib/utils";
import { FolderTree } from "./FolderTree";
import { MarqueeText } from "./MarqueeText";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TooltipButton } from "./TooltipButton";

interface SidebarProps {
  items: LibraryItem[];
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
      <Tooltip>
        <TooltipTrigger asChild>
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
        </TooltipTrigger>
        <TooltipContent side="right">{file.path ?? file.name}</TooltipContent>
      </Tooltip>
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
        className="flex shrink-0 items-center px-4 pt-4 pb-4"
      >
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

      <p className="shrink-0 px-4 pb-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        Library
      </p>

      <nav className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2 pb-2">
        {displayItems.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs leading-5 text-muted-foreground">
            {trimmedQuery ? (
              <>No files match &ldquo;{trimmedQuery}&rdquo;.</>
            ) : (
              <>
                No plans yet.
                <br />
                Drop Markdown here to begin.
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
    </aside>
  );
}
