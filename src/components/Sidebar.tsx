import {
  ChevronDown,
  Columns3,
  Folder,
  FolderOpen,
  Folders,
  Inbox,
  List,
  Search,
  Settings,
  SquarePen,
} from "lucide-react";
import { memo, useEffect, useState, type ReactNode } from "react";
import { cn } from "../lib/utils";
import type { MainView } from "../lib/types";
import type { FolderFilter } from "../lib/folders";
import {
  loadCollapsedSections,
  saveCollapsedSections,
  toggleSection,
  type SectionId,
} from "../lib/navbar";
import type { PlanSummary } from "@/lib/planBase";
import { shortcut as registryEntry, type ActionId } from "@/lib/shortcuts";
import { BrandMark } from "./BrandMark";
import { MarqueeText } from "./MarqueeText";
import { ShortcutLabel } from "./ShortcutKeys";
import { StatusGlyph } from "./StatusGlyph";
import { TooltipButton } from "./TooltipButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface SidebarProps {
  /** The rail shows each row as an icon with its label in a tooltip. */
  rail: boolean;
  /** The search button opens the command palette. */
  onOpenPalette: () => void;
  /** The person's name, or null before onboarding has asked for it. */
  name: string | null;
  /** The base's folder name, shown beside the person's name. */
  baseName: string | null;
  /** How many plans the base holds, shown beside All plans. */
  planCount: number;
  /** Every folder in the base, sorted by name. */
  folders: string[];
  folder: FolderFilter;
  onSelectFolder: (folder: FolderFilter) => void;
  /** The plans last opened, newest first. */
  recent: PlanSummary[];
  view: MainView;
  onSelectView: (view: MainView) => void;
  /** How many plans wait on the person, shown beside For you. */
  forYouCount: number;
  activePlanPath: string | null;
  onSelectPlan: (plan: PlanSummary) => void;
  onOpenSettings: () => void;
  /** Reserve space for the macOS traffic lights (overlay titlebar). */
  padTop: boolean;
}

const NEW_PLAN_HINT = "New plans come from your agents. Ask one to file a plan.";

/** Memoized: the app re-renders on every keystroke of an edit, and none of
 * that concerns these rows. */
export const Sidebar = memo(function Sidebar({
  rail,
  onOpenPalette,
  name,
  baseName,
  planCount,
  folders,
  folder,
  onSelectFolder,
  recent,
  view,
  onSelectView,
  forYouCount,
  activePlanPath,
  onSelectPlan,
  onOpenSettings,
  padTop,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState<SectionId[]>(loadCollapsedSections);
  useEffect(() => saveCollapsedSections(collapsed), [collapsed]);
  const toggle = (id: SectionId) => setCollapsed((old) => toggleSection(old, id));

  const viewRow = (
    target: MainView,
    shortcut: ActionId,
    icon: ReactNode,
    label: string,
    count?: number,
  ) => (
    <NavRow
      rail={rail}
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
      <NavRow
        key={label}
        rail={rail}
        icon={<Icon className={cn(ICON, chosen && "text-sidebar-foreground")} />}
        label={label}
        chosen={chosen}
        onClick={() => onSelectFolder(name)}
      />
    );
  };

  return (
    <aside className="flex h-full w-full flex-col border-r border-sidebar-border bg-sidebar">
      {padTop && <div data-tauri-drag-region className="h-8 shrink-0" />}

      <div
        data-tauri-drag-region
        className={cn(
          "flex shrink-0 items-center gap-2 pt-3 pb-1",
          rail ? "flex-col px-2" : "px-3",
        )}
      >
        {rail ? (
          <Hint text={[name, baseName].filter(Boolean).join(" · ") || "OpenPlan"}>
            <BrandMark className="size-4 text-sidebar-foreground" />
          </Hint>
        ) : (
          <>
            <BrandMark className="pointer-events-none size-4 shrink-0 text-sidebar-foreground" />
            <p className="pointer-events-none flex min-w-0 flex-1 items-baseline gap-1.5">
              {name ? (
                <span className="truncate text-sm font-medium text-sidebar-foreground">
                  {name}
                </span>
              ) : (
                <span className="font-serif text-lg tracking-[-0.01em] text-sidebar-foreground">
                  OpenPlan
                </span>
              )}
              {baseName && (
                <span className="truncate text-xs text-muted-foreground">{baseName}</span>
              )}
            </p>
          </>
        )}
        <TooltipButton
          variant="ghost"
          size="icon-sm"
          onClick={onOpenPalette}
          shortcut="palette"
          tooltip="Search plans and commands"
          tooltipSide={rail ? "right" : "bottom"}
          aria-label="Search plans and commands"
          className="text-muted-foreground"
        >
          <Search />
        </TooltipButton>
        <Hint text={NEW_PLAN_HINT} side={rail ? "right" : "bottom"}>
          <SquarePen className={ICON} />
        </Hint>
      </div>

      <nav className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2 pb-2">
        <Section id="views" label="Views" rail={rail} collapsed={collapsed} onToggle={toggle}>
          {viewRow("board", "board", <Columns3 className={ICON} />, "Board")}
          {viewRow("list", "list", <List className={ICON} />, "All plans", planCount)}
          {viewRow("for-you", "forYou", <Inbox className={ICON} />, "For you", forYouCount)}
        </Section>

        <Section id="folders" label="Folders" rail={rail} collapsed={collapsed} onToggle={toggle}>
          {folderRow(null, "All plans")}
          {folders.map((name) => folderRow(name, name))}
        </Section>

        {recent.length > 0 && (
          <Section id="recent" label="Recent" rail={rail} collapsed={collapsed} onToggle={toggle}>
            {recent.map((plan) => (
              <NavRow
                key={plan.path}
                rail={rail}
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

      <div className={cn("shrink-0 border-t border-sidebar-border p-2", rail && "flex justify-center")}>
        <NavRow
          rail={rail}
          icon={<Settings className={ICON} />}
          label="Settings"
          shortcut="settings"
          onClick={onOpenSettings}
        />
      </div>
    </aside>
  );
});

const ICON = "size-4 shrink-0 text-muted-foreground";

const ROW =
  "flex cursor-default items-center gap-2 rounded-md text-sm text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground";

/** The one accent: where the main area is now. */
const ACTIVE = "bg-sidebar-accent font-medium text-sidebar-accent-foreground";

/**
 * One navbar row. The rail keeps the icon and moves the label into a
 * tooltip, which also carries the row's key. In the open navbar only a row
 * with a key has a tooltip. `chosen` marks a filter in force without
 * competing with the accent on the view it filters.
 */
function NavRow({
  rail,
  icon,
  label,
  shortcut,
  count,
  active = false,
  chosen = false,
  onClick,
  children,
}: {
  rail: boolean;
  icon: ReactNode;
  label: string;
  shortcut?: ActionId;
  count?: number;
  active?: boolean;
  chosen?: boolean;
  onClick: () => void;
  /** Stands in for the plain label in the open navbar. */
  children?: ReactNode;
}) {
  const row = (
    <button
      onClick={onClick}
      aria-current={active || undefined}
      aria-label={rail ? label : undefined}
      className={cn(
        ROW,
        rail ? "size-8 justify-center" : "w-full px-2 py-1 text-left",
        chosen && "font-medium text-sidebar-foreground",
        active && ACTIVE,
      )}
    >
      {icon}
      {!rail && (children ?? <span className="flex-1 truncate">{label}</span>)}
      {!rail && count != null && count > 0 && (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{count}</span>
      )}
    </button>
  );
  // The tooltip stays mounted in both modes so switching to the rail only
  // re-renders the rows rather than mounting a tooltip for each one.
  return (
    <Tooltip>
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      {(rail || shortcut) && (
        <TooltipContent side="right" sideOffset={6}>
          <ShortcutLabel label={label} keys={shortcut && registryEntry(shortcut).keys} />
        </TooltipContent>
      )}
    </Tooltip>
  );
}

/** A labelled group of rows. The label folds it away. In the rail the label
 * becomes a thin divider and every row stays in reach. */
function Section({
  id,
  label,
  rail,
  collapsed,
  onToggle,
  children,
}: {
  id: SectionId;
  label: string;
  rail: boolean;
  collapsed: SectionId[];
  onToggle: (id: SectionId) => void;
  children: ReactNode;
}) {
  // One tree for both modes, so the rows survive a switch to the rail.
  const open = rail || !collapsed.includes(id);
  return (
    <div
      className={cn(
        rail
          ? "mt-2 border-t border-sidebar-border pt-2 first:mt-1 first:border-t-0 first:pt-0"
          : "pt-4 first:pt-2",
      )}
    >
      {!rail && (
        <button
          onClick={() => onToggle(id)}
          aria-expanded={open}
          className="flex cursor-default items-center gap-1 rounded-md px-2 pb-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {label}
          <ChevronDown
            className={cn("size-3 transition-transform duration-150", !open && "-rotate-90")}
          />
        </button>
      )}
      {open && (
        <div
          className={cn(
            "flex flex-col gap-px animate-in fade-in-0 duration-150",
            rail && "items-center",
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** An icon that explains itself on hover. It does nothing when clicked. */
function Hint({
  text,
  side = "right",
  children,
}: {
  text: string;
  side?: "right" | "bottom";
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label={text}
          className="flex size-8 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side={side} sideOffset={6} className="max-w-56">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
