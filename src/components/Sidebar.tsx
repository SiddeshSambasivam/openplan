import {
  ChevronDown,
  ChevronLeft,
  Columns3,
  Folder,
  FolderOpen,
  Folders,
  Inbox,
  List,
  MoreHorizontal,
  Plus,
  Search,
} from "lucide-react";
import { memo, useEffect, useState, type ReactNode } from "react";
import { cn } from "../lib/utils";
import type { MainView } from "../lib/types";
import { folderName, type FolderFilter } from "../lib/folders";
import type { Identity } from "../lib/comments";
import {
  loadCollapsedSections,
  markStart,
  navbarToggleLabel,
  rowHasTooltip,
  saveCollapsedSections,
  toggleSection,
  type SectionId,
} from "../lib/navbar";
import type { PlanSummary } from "@/lib/planBase";
import { shortcut as registryEntry, type ActionId } from "@/lib/shortcuts";
import { BrandMark } from "./BrandMark";
import { MarqueeText } from "./MarqueeText";
import { ProfileMenu } from "./ProfileMenu";
import { ShortcutLabel } from "./ShortcutKeys";
import { StatusGlyph } from "./StatusGlyph";
import { TooltipButton } from "./TooltipButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

interface SidebarProps {
  /** Shows each row as an icon with its label in a tooltip. */
  minimized: boolean;
  /** Expands or minimizes the navbar. */
  onToggle: () => void;
  /** The search row opens the command palette. */
  onOpenPalette: () => void;
  /** How many plans the base holds, shown beside All plans. */
  planCount: number;
  /** Every folder in the base, sorted by name. */
  folders: string[];
  folder: FolderFilter;
  onSelectFolder: (folder: FolderFilter) => void;
  /** Takes the name as typed. */
  onCreateFolder: (name: string) => void;
  onRemoveFolder: (name: string) => void;
  /** The plans last opened, newest first. */
  recent: PlanSummary[];
  view: MainView;
  onSelectView: (view: MainView) => void;
  /** How many plans wait on the person, shown beside For you. */
  forYouCount: number;
  activePlanPath: string | null;
  onSelectPlan: (plan: PlanSummary) => void;
  onEditProfile: () => void;
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
  /** The person this machine's changes belong to. */
  identity: Identity | null;
  dark: boolean;
  onToggleTheme: () => void;
  /** The macOS traffic lights are drawn over the top row. */
  windowControls: boolean;
}

/** Memoized: the app re-renders on every keystroke of an edit, and none of
 * that concerns these rows. */
export const Sidebar = memo(function Sidebar({
  minimized,
  onToggle,
  onOpenPalette,
  planCount,
  folders,
  folder,
  onSelectFolder,
  onCreateFolder,
  onRemoveFolder,
  recent,
  view,
  onSelectView,
  forYouCount,
  activePlanPath,
  onSelectPlan,
  onEditProfile,
  onOpenSettings,
  onOpenShortcuts,
  identity,
  dark,
  onToggleTheme,
  windowControls,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState<SectionId[]>(loadCollapsedSections);
  useEffect(() => saveCollapsedSections(collapsed), [collapsed]);
  const toggle = (id: SectionId) => setCollapsed((old) => toggleSection(old, id));
  const [creating, setCreating] = useState(false);
  const startFolder = () => {
    setCollapsed((old) => old.filter((id) => id !== "folders"));
    setCreating(true);
  };

  const viewRow = (
    target: MainView,
    shortcut: ActionId,
    icon: ReactNode,
    label: string,
    count?: number,
  ) => (
    <NavRow
      minimized={minimized}
      icon={icon}
      label={label}
      shortcut={shortcut}
      count={count}
      active={view === target}
      onClick={() => onSelectView(target)}
    />
  );

  const folderRow = (name: FolderFilter, label: string) => {
    const chosen = folder === name;
    const Icon = name == null ? Folders : chosen ? FolderOpen : Folder;
    return (
      <div key={label} className="group/folder relative">
        <NavRow
          minimized={minimized}
          icon={<Icon className={cn(ICON, chosen && "text-sidebar-foreground")} />}
          label={label}
          chosen={chosen}
          onClick={() => onSelectFolder(name)}
        />
        {name != null && !minimized && (
          <FolderMenu name={name} onRemove={() => onRemoveFolder(name)} />
        )}
      </div>
    );
  };

  // One layout for both modes: every icon sits where the minimized column
  // centres it and only the labels fade, so a mode change moves nothing.
  // Minimized, the top bar spans the window over the top row and carries
  // the mark, so the row fades out of reach beneath it.
  return (
    <aside className="flex h-full w-full flex-col overflow-hidden border-r border-sidebar-border bg-sidebar">
      <div
        data-tauri-drag-region
        aria-hidden={minimized || undefined}
        className={cn("flex h-12 shrink-0 items-center gap-1 pr-2", FADE, minimized && "opacity-0")}
        style={{ paddingLeft: markStart(windowControls) }}
      >
        <span className="pointer-events-none flex size-6 shrink-0 items-center justify-center text-sidebar-foreground">
          <BrandMark className="size-4" />
        </span>
        <span className="pointer-events-none min-w-0 flex-1 truncate font-serif text-lg tracking-[-0.01em] text-sidebar-foreground">
          OpenPlan
        </span>
        {/* Stays mounted while minimized, faded and out of reach, so the
            row keeps its shape through the transition. */}
        <TooltipButton
          variant="ghost"
          size="icon-xs"
          onClick={onToggle}
          shortcut="navbar"
          tooltip={navbarToggleLabel(true)}
          aria-label={navbarToggleLabel(true)}
          tabIndex={minimized ? -1 : undefined}
          className={cn(
            "text-muted-foreground hover:text-foreground",
            minimized && "pointer-events-none",
          )}
        >
          <ChevronLeft strokeWidth={1.5} className="size-4" />
        </TooltipButton>
      </div>

      <nav className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2 pb-2">
        <div className="pt-1">
          <NavRow
            minimized={minimized}
            icon={<Search className={ICON} />}
            label="Search"
            shortcut="palette"
            onClick={onOpenPalette}
          />
        </div>

        <Section id="views" label="Views" minimized={minimized} collapsed={collapsed} onToggle={toggle}>
          {viewRow("board", "board", <Columns3 className={ICON} />, "Board")}
          {viewRow("list", "list", <List className={ICON} />, "All plans", planCount)}
          {viewRow("for-you", "forYou", <Inbox className={ICON} />, "For you", forYouCount)}
        </Section>

        <Section
          id="folders"
          label="Folders"
          minimized={minimized}
          collapsed={collapsed}
          onToggle={toggle}
          action={
            <TooltipButton
              variant="ghost"
              size="icon-xs"
              onClick={startFolder}
              tooltip="New folder"
              tooltipSide="right"
              aria-label="New folder"
              className="size-5 text-muted-foreground opacity-0 group-hover/section:opacity-100 focus-visible:opacity-100"
            >
              <Plus />
            </TooltipButton>
          }
        >
          {creating && !minimized && (
            <NewFolderInput
              onCreate={onCreateFolder}
              onDone={() => setCreating(false)}
            />
          )}
          {folderRow(null, "All plans")}
          {folders.map((name) => folderRow(name, name))}
        </Section>

        {recent.length > 0 && (
          <Section id="recent" label="Recent" minimized={minimized} collapsed={collapsed} onToggle={toggle}>
            {recent.map((plan) => (
              <NavRow
                key={plan.path}
                minimized={minimized}
                icon={<StatusGlyph status={plan.status} />}
                label={plan.title}
                active={plan.path === activePlanPath && view === "plan"}
                onClick={() => onSelectPlan(plan)}
              >
                <MarqueeText text={plan.title} className="flex-1" />
              </NavRow>
            ))}
          </Section>
        )}
      </nav>

      <div className="shrink-0 border-t border-sidebar-border p-2">
        <ProfileMenu
          identity={identity}
          minimized={minimized}
          dark={dark}
          onToggleTheme={onToggleTheme}
          onEditProfile={onEditProfile}
          onOpenSettings={onOpenSettings}
          onOpenShortcuts={onOpenShortcuts}
        />
      </div>
    </aside>
  );
});

const ICON = "size-4 shrink-0 text-muted-foreground";

const ROW =
  "flex cursor-pointer items-center gap-2 rounded-md text-sm text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground";

/** The one accent: where the main area is now. */
const ACTIVE = "bg-sidebar-accent font-medium text-sidebar-accent-foreground";

/** The labels' fade between the two modes, timed with the column's width. */
const FADE = "transition-opacity duration-180 ease-out";

/** A section's vertical band, which changes between the modes on the same
 * curve as the column's width. */
const BAND = "transition-[padding,height] duration-180 ease-out";

/**
 * One navbar row. Minimized, the label fades out and moves into a tooltip,
 * which also carries the row's key. Expanded, only a row with a key has a
 * tooltip. `chosen` marks a filter in force without competing with the
 * accent on the view it filters.
 */
function NavRow({
  minimized,
  icon,
  label,
  shortcut,
  count,
  active = false,
  chosen = false,
  onClick,
  children,
}: {
  minimized: boolean;
  icon: ReactNode;
  label: string;
  shortcut?: ActionId;
  count?: number;
  active?: boolean;
  chosen?: boolean;
  onClick: () => void;
  /** Stands in for the plain label. */
  children?: ReactNode;
}) {
  const row = (
    <button
      onClick={onClick}
      aria-current={active || undefined}
      aria-label={minimized ? label : undefined}
      className={cn(
        ROW,
        "w-full overflow-hidden px-2 py-1 text-left",
        chosen && "font-medium text-sidebar-foreground",
        active && ACTIVE,
      )}
    >
      {icon}
      <span className={cn("flex min-w-0 flex-1 items-center gap-2", FADE, minimized && "opacity-0")}>
        {children ?? <span className="flex-1 truncate">{label}</span>}
        {count != null && count > 0 && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{count}</span>
        )}
      </span>
    </button>
  );
  // The tooltip stays mounted in both modes so a mode change only
  // re-renders the rows rather than mounting a tooltip for each one. A row
  // with nothing to say is held closed: Radix closes a hovered tooltip from
  // its content, so one opened without content would stay open, unseen,
  // until the rail minimized and every such row showed at once.
  const hasTooltip = rowHasTooltip(minimized, shortcut);
  return (
    <Tooltip open={hasTooltip ? undefined : false} disableHoverableContent>
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      {hasTooltip && (
        <TooltipContent side="right" sideOffset={6}>
          <ShortcutLabel label={label} keys={shortcut && registryEntry(shortcut).keys} />
        </TooltipContent>
      )}
    </Tooltip>
  );
}

/** A labelled group of rows. The label folds it away. Minimized, the label
 * fades into a thin divider and every row stays in reach. */
function Section({
  id,
  label,
  minimized,
  collapsed,
  onToggle,
  action,
  children,
}: {
  id: SectionId;
  label: string;
  minimized: boolean;
  collapsed: SectionId[];
  onToggle: (id: SectionId) => void;
  /** A control beside the label, shown on hover and focus. */
  action?: ReactNode;
  children: ReactNode;
}) {
  // One tree for both modes, so the rows survive a mode change.
  const open = minimized || !collapsed.includes(id);
  // Minimized, the label's band shrinks to an even gap around the divider.
  // It moves on the navbar's width curve, so the rows glide with it.
  return (
    <div className={cn(BAND, minimized ? "pt-0" : "pt-4")}>
      <div className={cn("group/section relative", BAND, minimized ? "h-4" : "h-5")}>
        {action && !minimized && <div className="absolute -top-0.5 right-1">{action}</div>}
        <button
          onClick={() => onToggle(id)}
          aria-expanded={open}
          aria-hidden={minimized || undefined}
          tabIndex={minimized ? -1 : undefined}
          className={cn(
            "flex cursor-pointer items-center gap-1 rounded-md px-2 pb-1 text-xs font-medium whitespace-nowrap text-muted-foreground transition-[color,opacity] duration-180 ease-out hover:text-foreground",
            minimized && "pointer-events-none opacity-0",
          )}
        >
          {label}
          <ChevronDown
            className={cn("size-3 transition-transform duration-150", !open && "-rotate-90")}
          />
        </button>
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-2 top-1/2 h-px bg-sidebar-border opacity-0",
            FADE,
            minimized && "opacity-100",
          )}
        />
      </div>
      {open && (
        <div className="flex flex-col gap-px animate-in fade-in-0 duration-150">{children}</div>
      )}
    </div>
  );
}

/** The name field a new folder starts from. Enter makes it, Escape or
 * leaving the field drops it. */
function NewFolderInput({
  onCreate,
  onDone,
}: {
  onCreate: (name: string) => void;
  onDone: () => void;
}) {
  const [typed, setTyped] = useState("");
  // The plan file cannot hold some characters in a folder name, so say so
  // before they disappear.
  const loses = folderName(typed) !== typed.trim().replace(/\s+/g, " ");
  return (
    <div className="pb-1">
      <Input
        autoFocus
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== "Escape") return;
          // Handled here, so the app's own Escape leaves its panels alone.
          e.preventDefault();
          if (e.key === "Enter") onCreate(typed);
          onDone();
        }}
        onBlur={onDone}
        placeholder="Folder name"
        aria-label="New folder name"
        className="h-7 text-sm"
      />
      {loses && (
        <p className="px-1 pt-1 text-xs text-muted-foreground">
          Commas, brackets, quotes, colons and # are left out of folder names.
        </p>
      )}
    </div>
  );
}

/** A folder row's menu. Removing a folder takes it off the navbar only. */
function FolderMenu({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <TooltipButton
          variant="ghost"
          size="icon-xs"
          tooltip="Folder options"
          tooltipSide="right"
          aria-label={`Options for ${name}`}
          className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground opacity-0 group-hover/folder:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreHorizontal />
        </TooltipButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start" className="w-52">
        <DropdownMenuItem onSelect={onRemove}>Remove folder</DropdownMenuItem>
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          It stays while plans are in it.
        </DropdownMenuLabel>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
