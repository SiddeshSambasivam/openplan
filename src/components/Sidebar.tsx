import {
  ChevronRight,
  Columns3,
  Inbox,
  List,
  Search,
  Settings,
  X,
} from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "../lib/utils";
import type { MainView } from "../lib/types";
import { searchPlans, type PlanSummary, type SearchHit } from "@/lib/planBase";
import { BrandMark } from "./BrandMark";
import { MarqueeText } from "./MarqueeText";
import { StatusGlyph } from "./StatusGlyph";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SidebarProps {
  plans: PlanSummary[];
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

const rowClass =
  "flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground";

/** A group of rows that folds away. The header answers every click, and the
 * rows grow and shrink with the grid row rather than a height. */
function Group({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="pt-3">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full cursor-default items-center gap-1.5 rounded-md px-2 pb-1 text-left text-[11px] font-medium tracking-wider text-muted-foreground uppercase transition-colors hover:text-foreground"
      >
        <ChevronRight
          className={cn(
            "size-3 shrink-0 transition-transform duration-200",
            open && "rotate-90",
          )}
        />
        {label}
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-in-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

/** Memoized: the app re-renders on every keystroke of an edit, and none of
 * that concerns these rows. */
export const Sidebar = memo(function Sidebar({
  plans,
  recent,
  view,
  onSelectView,
  forYouCount,
  activePlanPath,
  onSelectPlan,
  onOpenSettings,
  padTop,
}: SidebarProps) {
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const trimmedQuery = query.trim();

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

  const navRow = (
    target: MainView,
    icon: ReactNode,
    label: string,
    count?: number,
  ) => (
    <button
      onClick={() => onSelectView(target)}
      aria-current={view === target}
      className={cn(
        rowClass,
        view === target &&
          "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
      )}
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {count != null && count > 0 && (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {count}
        </span>
      )}
    </button>
  );

  return (
    <aside className="flex h-full w-full flex-col border-r border-sidebar-border bg-sidebar">
      {padTop && <div data-tauri-drag-region className="h-8 shrink-0" />}

      <div
        data-tauri-drag-region
        className="flex shrink-0 items-center gap-2.5 px-4 pt-4 pb-4"
      >
        <BrandMark className="pointer-events-none size-5 shrink-0 text-sidebar-foreground" />
        <span className="pointer-events-none font-serif text-2xl tracking-[-0.01em] text-sidebar-foreground">
          OpenPlan
        </span>
      </div>

      <div className="shrink-0 px-3 pb-2">
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
              className="absolute right-1.5 text-muted-foreground"
            >
              <X />
            </Button>
          )}
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2 pb-2">
        {trimmedQuery ? (
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
        ) : (
          <>
            <div className="flex flex-col gap-px">
              {navRow(
                "board",
                <Columns3 className="size-4 shrink-0 text-muted-foreground" />,
                "Board",
              )}
              {navRow(
                "list",
                <List className="size-4 shrink-0 text-muted-foreground" />,
                "All plans",
                plans.length,
              )}
              {navRow(
                "for-you",
                <Inbox className="size-4 shrink-0 text-muted-foreground" />,
                "For you",
                forYouCount,
              )}
            </div>

            {recent.length > 0 && (
              <Group label="Recent">
                <div className="flex flex-col gap-px">
                  {recent.map((plan) => (
                    <button
                      key={plan.path}
                      onClick={() => onSelectPlan(plan)}
                      className={cn(
                        rowClass,
                        "animate-in fade-in-0 duration-200",
                        plan.path === activePlanPath &&
                          view === "plan" &&
                          "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                      )}
                    >
                      <StatusGlyph status={plan.status} />
                      <MarqueeText text={plan.title} className="flex-1" />
                    </button>
                  ))}
                </div>
              </Group>
            )}
          </>
        )}
      </nav>

      <div className="shrink-0 border-t border-sidebar-border p-2">
        <button onClick={onOpenSettings} className={rowClass}>
          <Settings className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex-1">Settings</span>
        </button>
      </div>
    </aside>
  );
});
