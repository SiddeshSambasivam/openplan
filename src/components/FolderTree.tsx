import {
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  TriangleAlert,
  X,
} from "lucide-react";
import type { FileLeaf, FolderLibraryItem, FolderNode } from "../lib/types";
import { cn } from "../lib/utils";
import { MarqueeText } from "./MarqueeText";
import { TooltipButton } from "./TooltipButton";

interface TreeContext {
  activeId: string | null;
  expanded: Set<string>;
  /** While searching, every matching folder shows expanded regardless of
   * the user's own expand/collapse state, so results are never hidden. */
  forceExpandAll: boolean;
  onToggleDir: (path: string) => void;
  onSelect: (id: string) => void;
}

const indent = (depth: number) => ({ paddingLeft: `${8 + depth * 14}px` });

const rowClass =
  "group/tip relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground";

function FileRow({
  leaf,
  depth,
  ctx,
}: {
  leaf: FileLeaf;
  depth: number;
  ctx: TreeContext;
}) {
  return (
    <li>
      <button
        onClick={() => ctx.onSelect(leaf.id)}
        style={indent(depth)}
        className={cn(
          rowClass,
          leaf.id === ctx.activeId &&
            "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
        )}
      >
        <span className="size-3.5 shrink-0" />
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <MarqueeText text={leaf.name} className="flex-1" />
      </button>
    </li>
  );
}

function NoteRow({
  depth,
  text,
  warn,
}: {
  depth: number;
  text: string;
  warn?: boolean;
}) {
  return (
    <li>
      <p
        style={indent(depth)}
        className="flex items-center gap-1.5 py-1 pr-2 text-xs text-muted-foreground"
      >
        {warn && <TriangleAlert className="size-3.5 shrink-0" />}
        <span className="min-w-0 flex-1 truncate" title={text}>
          {text}
        </span>
      </p>
    </li>
  );
}

function DirRow({
  name,
  path,
  depth,
  open,
  onToggle,
}: {
  name: string;
  path: string;
  depth: number;
  open: boolean;
  onToggle: (path: string) => void;
}) {
  const FolderIcon = open ? FolderOpen : Folder;
  return (
    <button
      onClick={() => onToggle(path)}
      style={indent(depth)}
      className={rowClass}
      aria-expanded={open}
    >
      <ChevronRight
        className={cn(
          "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
          open && "rotate-90",
        )}
      />
      <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{name}</span>
    </button>
  );
}

function TreeChildren({
  node,
  depth,
  ctx,
}: {
  node: FolderNode;
  depth: number;
  ctx: TreeContext;
}) {
  return (
    <>
      {node.dirs.map((dir) => (
        <TreeDir key={dir.path} node={dir} depth={depth} ctx={ctx} />
      ))}
      {node.files.map((file) => (
        <FileRow key={file.id} leaf={file} depth={depth} ctx={ctx} />
      ))}
    </>
  );
}

function TreeDir({
  node,
  depth,
  ctx,
}: {
  node: FolderNode;
  depth: number;
  ctx: TreeContext;
}) {
  const open = ctx.forceExpandAll || ctx.expanded.has(node.path);
  return (
    <li>
      <DirRow
        name={node.name}
        path={node.path}
        depth={depth}
        open={open}
        onToggle={ctx.onToggleDir}
      />
      {open && (
        <ul>
          <TreeChildren node={node} depth={depth + 1} ctx={ctx} />
        </ul>
      )}
    </li>
  );
}

interface FolderTreeProps {
  item: FolderLibraryItem;
  ctx: TreeContext;
  onRemove: (id: string) => void;
}

/** A top-level folder in the sidebar: collapsible root with a remove button. */
export function FolderTree({ item, ctx, onRemove }: FolderTreeProps) {
  const open = ctx.forceExpandAll || ctx.expanded.has(item.path);
  return (
    <li>
      <div className="group relative">
        <DirRow
          name={item.name}
          path={item.path}
          depth={0}
          open={open}
          onToggle={ctx.onToggleDir}
        />
        <TooltipButton
          variant="ghost"
          size="icon-xs"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(item.id);
          }}
          aria-label={`Remove ${item.name} from list`}
          tooltip="Remove from list (files stay on disk)"
          className="absolute top-1/2 right-1.5 hidden -translate-y-1/2 bg-sidebar-accent text-muted-foreground group-hover:flex"
        >
          <X />
        </TooltipButton>
      </div>
      {open && (
        <ul>
          {item.error ? (
            <NoteRow depth={1} text={item.error} warn />
          ) : item.tree ? (
            <>
              <TreeChildren node={item.tree} depth={1} ctx={ctx} />
              {item.truncated && (
                <NoteRow depth={1} text="Large folder. Not everything is shown" />
              )}
            </>
          ) : (
            <NoteRow depth={1} text="No Markdown files" />
          )}
        </ul>
      )}
    </li>
  );
}
