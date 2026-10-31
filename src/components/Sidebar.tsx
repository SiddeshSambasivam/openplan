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
  X,
} from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "../lib/utils";
import type { MainView } from "../lib/types";
import type { FolderFilter } from "../lib/folders";
import {
  loadCollapsedSections,
  saveCollapsedSections,
  toggleSection,
  type SectionId,
} from "../lib/navbar";
import { searchPlans, type PlanSummary, type SearchHit } from "@/lib/planBase";
import { BrandMark } from "./BrandMark";
import { MarqueeText } from "./MarqueeText";
import { StatusGlyph } from "./StatusGlyph";
import { TooltipButton } from "./TooltipButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface SidebarProps {
  /** The rail shows each row as an icon with its label in a tooltip. */
  rail: boolean;
  /** Asked for by the rail's search button: search needs the open navbar. */
  onRequestOpen: () => void;
  /** The person's name, or null before onboarding has asked for it. */
  name: string | null;
  /** The base's folder name, shown beside the person's name. */
  baseName: string | null;
  plans: PlanSummary[];
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
  onRequestOpen,
  name,
  baseName,
  plans,
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

  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const hitsByPlan = usePlanSearch(query.trim());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const showSearch = searching && !rail;

  const openSearch = () => {
    if (rail) onRequestOpen();
    setSearching(true);
    searchInputRef.current?.focus();
  };
  const closeSearch = () => {
    setQuery("");
    setSearching(false);
  };

  const viewRow = (target: MainView, icon: ReactNode, label: string, count?: number) => (
    <NavRow
      rail={rail}
      icon={icon}
      label={label}
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
          onClick={showSearch ? closeSearch : openSearch}
          tooltip="Search plans"
          tooltipSide={rail ? "right" : "bottom"}
          aria-label="Search plans"
          aria-expanded={showSearch}
          className={cn("text-muted-foreground", showSearch && "bg-sidebar-accent text-sidebar-foreground")}
        >
          <Search />
        </TooltipButton>
        <Hint text={NEW_PLAN_HINT} side={rail ? "right" : "bottom"}>
          <SquarePen className={ICON} />
        </Hint>
      </div>

      {showSearch && (
        <div className="relative flex shrink-0 items-center px-3 pt-1 pb-1 animate-in fade-in-0 duration-150">
          <Search className="pointer-events-none absolute left-5.5 size-3.5 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Escape") return;
              e.stopPropagation();
              if (query) setQuery("");
              else closeSearch();
            }}
            placeholder="Search"
            aria-label="Search plans"
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
              className="absolute right-4.5 text-muted-foreground"
            >
              <X />
            </Button>
          )}
        </div>
      )}

      <nav className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2 pb-2">
        {showSearch && query.trim() ? (
          <SearchResults
            query={query.trim()}
            hitsByPlan={hitsByPlan}
            plans={plans}
            onSelectPlan={onSelectPlan}
          />
        ) : (
          <>
            <Section id="views" label="Views" rail={rail} collapsed={collapsed} onToggle={toggle}>
              {viewRow("board", <Columns3 className={ICON} />, "Board")}
              {viewRow("list", <List className={ICON} />, "All plans", plans.length)}
              {viewRow("for-you", <Inbox className={ICON} />, "For you", forYouCount)}
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
          </>
        )}
      </nav>

      <div className={cn("shrink-0 border-t border-sidebar-border p-2", rail && "flex justify-center")}>
        <NavRow
          rail={rail}
          icon={<Settings className={ICON} />}
          label="Settings"
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
 * tooltip. `chosen` marks a filter in force without competing with the
 * accent on the view it filters.
 */
function NavRow({
  rail,
  icon,
  label,
  count,
  active = false,
  chosen = false,
  onClick,
  children,
}: {
  rail: boolean;
  icon: ReactNode;
  label: string;
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
  if (!rail) return row;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={6}>
        {label}
      </TooltipContent>
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
  if (rail) {
    return (
      <div className="flex flex-col items-center gap-px border-t border-sidebar-border pt-2 mt-2 first:mt-1 first:border-t-0 first:pt-0">
        {children}
      </div>
    );
  }
  const open = !collapsed.includes(id);
  return (
    <div className="pt-4 first:pt-2">
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
      {open && (
        <div className="flex flex-col gap-px animate-in fade-in-0 duration-150">{children}</div>
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

function SearchResults({
  query,
  hitsByPlan,
  plans,
  onSelectPlan,
}: {
  query: string;
  hitsByPlan: [string, SearchHit[]][];
  plans: PlanSummary[];
  onSelectPlan: (plan: PlanSummary) => void;
}) {
  const hitCount = hitsByPlan.reduce((sum, [, group]) => sum + group.length, 0);
  return (
    <div className="pt-2 pb-2">
      <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">
        In plans
        <span className="ml-1.5 tabular-nums opacity-60">{hitCount}</span>
      </p>
      {hitsByPlan.length === 0 ? (
        <p className="px-2 py-4 text-center text-xs text-muted-foreground">
          Nothing matches &ldquo;{query}&rdquo;.
        </p>
      ) : (
        hitsByPlan.map(([path, group]) => (
          <div key={path} className="pb-1.5">
            <button
              onClick={() => {
                const plan = plans.find((p) => p.path === path);
                if (plan) onSelectPlan(plan);
              }}
              className={cn(ROW, "w-full truncate px-2 py-1 text-left")}
            >
              {group[0].title}
            </button>
            {group.slice(0, 4).map((hit) => (
              <p key={hit.line} className="truncate px-2 py-0.5 pl-4 text-[11px] text-muted-foreground">
                <span className="tabular-nums opacity-60">{hit.line}</span> {hit.text}
              </p>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

/** Searching reads the base on demand; the pause keeps a fast typist from
 * starting a scan per keystroke. */
function usePlanSearch(query: string): [string, SearchHit[]][] {
  const [hits, setHits] = useState<SearchHit[]>([]);
  useEffect(() => {
    if (!query) {
      setHits([]);
      return;
    }
    let stale = false;
    const timer = setTimeout(() => {
      void searchPlans(query).then((found) => {
        if (!stale) setHits(found);
      });
    }, 150);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query]);

  return useMemo(() => {
    const grouped = new Map<string, SearchHit[]>();
    for (const hit of hits) {
      const group = grouped.get(hit.path);
      if (group) group.push(hit);
      else grouped.set(hit.path, [hit]);
    }
    return [...grouped.entries()];
  }, [hits]);
}
