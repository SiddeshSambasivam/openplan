import {
  ChevronDown,
  Eye,
  MessageSquareText,
  Moon,
  PanelLeft,
  Search,
  SquarePen,
  Sun,
  TableOfContents,
} from "lucide-react";
import { isMac } from "../lib/platform";
import type { FontSize } from "../lib/fontSize";
import type { DocFile, MainView, ViewMode } from "../lib/types";
import type { ContentWidth } from "../lib/width";
import type { Crumb, ProjectFilter } from "../lib/board";
import { projectName } from "../lib/projects";
import type { PlanSummary, ProjectInfo, Status } from "../lib/planBase";
import { cn } from "../lib/utils";
import { TooltipButton } from "./TooltipButton";
import { FontSizeMenu } from "./FontSizeMenu";
import { MarqueeText } from "./MarqueeText";
import { StatusPicker } from "./StatusPicker";
import { WidthMenu } from "./WidthMenu";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const VIEW_LABELS: Record<Exclude<MainView, "plan">, string> = {
  board: "Board",
  list: "All plans",
  "for-you": "For you",
};

interface HeaderProps {
  mainView: MainView;
  /** The trail above the open plan. Null away from the plan page. */
  crumb: Crumb | null;
  /** The open plan, for the status picker. */
  plan: PlanSummary | null;
  onStatusChange: (status: Status) => void;
  /** Opens what the crumb sits under: the project, or the plan of a document. */
  onOpenLead: () => void;
  projects: ProjectInfo[];
  project: ProjectFilter;
  onSelectProject: (project: ProjectFilter) => void;
  hideCompleted: boolean;
  onToggleHideCompleted: () => void;
  doc: DocFile | null;
  wordCount: number | null;
  view: ViewMode;
  /** Whether the current doc can be edited (loaded, not the welcome page). */
  canEdit: boolean;
  dirty: boolean;
  onToggleView: () => void;
  dark: boolean;
  onToggleTheme: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  contentWidth: ContentWidth;
  onContentWidthChange: (width: ContentWidth) => void;
  fontSize: FontSize;
  onFontSizeChange: (fontSize: FontSize) => void;
  outlineOpen: boolean;
  onToggleOutline: () => void;
  /** False for a document comments cannot anchor in, such as an HTML plan. */
  canComment: boolean;
  commentsOpen: boolean;
  onToggleComments: () => void;
  /** Open discussions on the current plan, shown on the icon. */
  openCommentCount: number;
  onOpenFind: () => void;
  /** Keep clear of the macOS traffic lights when the sidebar is hidden. */
  trafficLightGap: boolean;
}

/** The label of the project a view is filtered to. */
function projectLabel(project: ProjectFilter): string {
  if (project == null) return "All projects";
  return projectName(project) ?? "No project";
}

export function Header({
  mainView,
  crumb,
  plan,
  onStatusChange,
  onOpenLead,
  projects,
  project,
  onSelectProject,
  hideCompleted,
  onToggleHideCompleted,
  doc,
  wordCount,
  view,
  canEdit,
  dirty,
  onToggleView,
  dark,
  onToggleTheme,
  sidebarOpen,
  onToggleSidebar,
  contentWidth,
  onContentWidthChange,
  fontSize,
  onFontSizeChange,
  outlineOpen,
  onToggleOutline,
  canComment,
  commentsOpen,
  onToggleComments,
  openCommentCount,
  onOpenFind,
  trafficLightGap,
}: HeaderProps) {
  const mod = isMac ? "⌘" : "Ctrl+";
  const modShift = isMac ? "⇧⌘" : "Ctrl+Shift+";
  const toggleSidebarLabel = `${sidebarOpen ? "Hide" : "Show"} sidebar (${mod}B)`;
  const toggleViewLabel =
    view === "preview" ? `Edit (${mod}E)` : `Preview (${mod}E)`;
  const toggleThemeLabel = `${dark ? "Switch to light theme" : "Switch to dark theme"} (${modShift}L)`;
  const inPreview = view === "preview";
  const onPlan = mainView === "plan";
  const showDocTools = onPlan && doc != null;
  return (
    <header
      data-tauri-drag-region
      className="flex h-12 shrink-0 items-center gap-1.5 border-b border-border px-4"
    >
      {trafficLightGap && (
        <div
          data-tauri-drag-region
          className={cn(
            "h-full shrink-0 transition-[width] duration-200 ease-in-out",
            // The controls end around 72pt in; clear them before the toggle.
            sidebarOpen ? "w-0" : "w-18",
          )}
        />
      )}
      <TooltipButton
        variant="ghost"
        size="icon-sm"
        onClick={onToggleSidebar}
        tooltip={toggleSidebarLabel}
        tooltipSide="bottom" tooltipAlign="start"
        aria-label={toggleSidebarLabel}
        aria-expanded={sidebarOpen}
      >
        <PanelLeft className="size-4" />
      </TooltipButton>

      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
        {onPlan && crumb ? (
          <>
            {crumb.lead && (
              <>
                {/* The trail is the first thing to go when the window is
                    narrow: the title is what someone needs to see. */}
                <button
                  onClick={onOpenLead}
                  className="hidden max-w-40 shrink-0 cursor-default truncate rounded-md px-1.5 py-0.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:block"
                >
                  {crumb.lead.label}
                </button>
                <span aria-hidden className="hidden text-muted-foreground/50 md:inline">
                  /
                </span>
              </>
            )}
            <h1 className="min-w-0 flex-1 cursor-default text-sm font-medium text-foreground">
              <MarqueeText text={crumb.title} />
            </h1>
            {dirty && (
              <span
                className="size-1.5 shrink-0 rounded-full bg-foreground/40"
                title="Unsaved changes"
                aria-label="Unsaved changes"
              />
            )}
          </>
        ) : (
          <h1 className="cursor-default text-sm font-medium text-foreground">
            {VIEW_LABELS[mainView as Exclude<MainView, "plan">]}
          </h1>
        )}
      </div>

      {!onPlan && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="xs"
              className={cn(
                "gap-1.5 font-normal text-muted-foreground",
                project != null && "bg-accent text-accent-foreground",
              )}
            >
              {projectLabel(project)}
              <ChevronDown className="text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuRadioGroup
              value={project ?? "all"}
              onValueChange={(next) =>
                onSelectProject(next === "all" ? null : next)
              }
            >
              <DropdownMenuRadioItem value="all" className="pl-2 [&>span:first-child]:hidden">
                All projects
              </DropdownMenuRadioItem>
              {projects.map((info) => (
                <DropdownMenuRadioItem
                  key={info.project ?? ""}
                  value={info.project ?? ""}
                  className="pl-2 [&>span:first-child]:hidden"
                >
                  <span className="truncate">
                    {projectName(info.project) ?? info.name}
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {mainView === "board" && (
        <Button
          variant="outline"
          size="xs"
          onClick={onToggleHideCompleted}
          aria-pressed={hideCompleted}
          className={cn(
            "font-normal text-muted-foreground",
            hideCompleted && "bg-accent text-accent-foreground",
          )}
        >
          Hide completed
        </Button>
      )}

      {onPlan && plan && (
        <StatusPicker status={plan.status} onChange={onStatusChange} />
      )}

      {showDocTools && wordCount != null && (
        <span className="pointer-events-none pr-1.5 text-xs tabular-nums text-muted-foreground">
          {wordCount.toLocaleString()} {wordCount === 1 ? "word" : "words"}
        </span>
      )}

      {showDocTools && inPreview && (
        <TooltipButton
          variant="ghost"
          size="icon-sm"
          onClick={onOpenFind}
          tooltip={`Find (${mod}F)`}
          aria-label="Find in document"
        >
          <Search className="size-4" />
        </TooltipButton>
      )}

      {showDocTools && (
        <WidthMenu width={contentWidth} onChange={onContentWidthChange} />
      )}

      {showDocTools && (
        <FontSizeMenu fontSize={fontSize} onChange={onFontSizeChange} />
      )}

      {showDocTools && inPreview && (
        <TooltipButton
          variant="ghost"
          size="icon-sm"
          onClick={onToggleOutline}
          tooltip={`Outline (${modShift}T)`}
          tooltipSide="bottom" tooltipAlign="end"
          aria-label="Outline"
          aria-expanded={outlineOpen}
          className={cn(outlineOpen && "bg-accent text-accent-foreground")}
        >
          <TableOfContents className="size-4" />
        </TooltipButton>
      )}

      {showDocTools && inPreview && canComment && (
        <TooltipButton
          variant="ghost"
          size="icon-sm"
          onClick={onToggleComments}
          tooltip="Comments"
          tooltipSide="bottom" tooltipAlign="end"
          aria-label="Comments"
          aria-expanded={commentsOpen}
          className={cn("relative", commentsOpen && "bg-accent text-accent-foreground")}
        >
          <MessageSquareText className="size-4" />
          {openCommentCount > 0 && (
            <span className="absolute top-0.5 right-0.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">
              {openCommentCount > 9 ? "9+" : openCommentCount}
            </span>
          )}
        </TooltipButton>
      )}

      {showDocTools && canEdit && (
        <TooltipButton
          variant="ghost"
          size="icon-sm"
          onClick={onToggleView}
          tooltip={toggleViewLabel}
          tooltipSide="bottom" tooltipAlign="end"
          aria-label={toggleViewLabel}
        >
          {view === "preview" ? (
            <SquarePen className="size-4" />
          ) : (
            <Eye className="size-4" />
          )}
        </TooltipButton>
      )}

      <TooltipButton
        variant="ghost"
        size="icon-sm"
        onClick={onToggleTheme}
        tooltip={toggleThemeLabel}
        tooltipSide="bottom" tooltipAlign="end"
        aria-label="Toggle theme"
        className="relative"
      >
        {/* Both suns and moons are always mounted so the swap can be a turn
            rather than a cut; only transforms and opacity move. */}
        <Sun className="rotate-0 scale-100 opacity-100 transition-[transform,opacity] duration-300 ease-in-out dark:-rotate-90 dark:scale-0 dark:opacity-0" />
        <Moon className="absolute rotate-90 scale-0 opacity-0 transition-[transform,opacity] duration-300 ease-in-out dark:rotate-0 dark:scale-100 dark:opacity-100" />
      </TooltipButton>
    </header>
  );
}
