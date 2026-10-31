import {
  ChevronDown,
  Eye,
  MessageSquareText,
  Moon,
  PanelLeft,
  Search,
  Send,
  SquarePen,
  Sun,
  TableOfContents,
} from "lucide-react";
import type { ReactNode } from "react";
import type { FontSize } from "../lib/fontSize";
import type { DocFile, MainView, ViewMode } from "../lib/types";
import type { ContentWidth } from "../lib/width";
import type { Crumb } from "../lib/board";
import type { FolderFilter } from "../lib/folders";
import type { NavbarMode } from "../lib/navbar";
import type { PlanSummary, Status } from "../lib/planBase";
import { cn } from "../lib/utils";
import { TooltipButton } from "./TooltipButton";
import { FontSizeMenu } from "./FontSizeMenu";
import { MarqueeText } from "./MarqueeText";
import { StatusPicker } from "./StatusPicker";
import { WidthMenu } from "./WidthMenu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/* The choice is shown by highlighting the row, as the status picker does,
   so the dot the radio item would otherwise reserve space for is dropped. */
const FILTER_ITEM =
  "pl-2 [&>span:first-child]:hidden data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground";

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
  /** The status picker's menu, which its key opens too. */
  statusOpen: boolean;
  onStatusOpenChange: (open: boolean) => void;
  /** Every recorded PR reads merged on a plan in review. */
  offerCompletion: boolean;
  /** Opens what the crumb sits under: the plan of a document. */
  onOpenLead: () => void;
  /** Every folder in the base, for the filter. */
  folders: string[];
  folder: FolderFilter;
  onSelectFolder: (folder: FolderFilter) => void;
  /** The current view's own controls, beside the folder filter. */
  viewTools?: ReactNode;
  doc: DocFile | null;
  wordCount: number | null;
  view: ViewMode;
  /** Whether the current doc can be edited (loaded and on disk or inline). */
  canEdit: boolean;
  dirty: boolean;
  onToggleView: () => void;
  dark: boolean;
  onToggleTheme: () => void;
  /** How the navbar sits beside the header at this window width. */
  navbar: NavbarMode;
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
  /** Threads written but not sent. Zero hides the Send button. */
  pendingCommentCount: number;
  onSendReview: () => void;
  /** Whether the last review or align event reached a session. Cleared by
   * whoever set it. */
  sendNotice: string | null;
  onOpenFind: () => void;
  /** Keep clear of the macOS traffic lights where the navbar does not. */
  trafficLightGap: boolean;
}

export function Header({
  mainView,
  crumb,
  plan,
  onStatusChange,
  statusOpen,
  onStatusOpenChange,
  offerCompletion,
  onOpenLead,
  folders,
  folder,
  onSelectFolder,
  viewTools,
  doc,
  wordCount,
  view,
  canEdit,
  dirty,
  onToggleView,
  dark,
  onToggleTheme,
  navbar,
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
  pendingCommentCount,
  onSendReview,
  sendNotice,
  onOpenFind,
  trafficLightGap,
}: HeaderProps) {
  const navbarShown = navbar !== "hidden";
  const toggleSidebarLabel = `${navbarShown ? "Hide" : "Show"} sidebar`;
  const toggleViewLabel = view === "preview" ? "Edit" : "Preview";
  const toggleThemeLabel = dark ? "Switch to light theme" : "Switch to dark theme";
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
            navbar === "open" ? "w-0" : navbar === "rail" ? "w-6" : "w-18",
          )}
        />
      )}
      <TooltipButton
        variant="ghost"
        size="icon-sm"
        onClick={onToggleSidebar}
        shortcut="navbar"
        tooltip={toggleSidebarLabel}
        tooltipSide="bottom" tooltipAlign="start"
        aria-label={toggleSidebarLabel}
        aria-expanded={navbarShown}
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
                  {crumb.lead}
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
            <TooltipButton
              variant="outline"
              size="xs"
              tooltip="Show the plans in one folder"
              tooltipAlign="end"
              className={cn(
                "max-w-48 gap-1.5 font-normal text-muted-foreground",
                folder != null && "bg-accent text-accent-foreground",
              )}
            >
              <span className="truncate">{folder ?? "All plans"}</span>
              <ChevronDown className="text-muted-foreground" />
            </TooltipButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuRadioGroup
              // Radio values are strings, so "every plan" is the one value
              // a folder name can never be.
              value={folder ?? ""}
              onValueChange={(next) => onSelectFolder(next === "" ? null : next)}
            >
              <DropdownMenuRadioItem value="" className={FILTER_ITEM}>
                All plans
              </DropdownMenuRadioItem>
              {folders.map((name) => (
                <DropdownMenuRadioItem key={name} value={name} className={FILTER_ITEM}>
                  <span className="truncate">{name}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            {folders.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                Put a plan in a folder from its page or its card.
              </p>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {!onPlan && viewTools}

      {onPlan && plan && (
        // Keyed to the plan: opening another one is not a change of status,
        // and the glyph must not beat as though it were.
        <StatusPicker
          key={plan.id}
          status={plan.status}
          onChange={onStatusChange}
          open={statusOpen}
          onOpenChange={onStatusOpenChange}
        />
      )}

      {onPlan && offerCompletion && (
        <>
          <span className="truncate pl-1 text-xs text-muted-foreground">
            All pull requests are merged.
          </span>
          <TooltipButton
            size="xs"
            variant="outline"
            onClick={() => onStatusChange("completed")}
            tooltip="Move this plan to Completed"
          >
            Mark completed
          </TooltipButton>
        </>
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
          shortcut="find"
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
          shortcut="outline"
          tooltipSide="bottom" tooltipAlign="end"
          aria-label="Outline"
          aria-expanded={outlineOpen}
          className={cn(outlineOpen && "bg-accent text-accent-foreground")}
        >
          <TableOfContents className="size-4" />
        </TooltipButton>
      )}

      {onPlan && sendNotice && (
        <span
          title={sendNotice}
          className="max-w-80 animate-in truncate pl-1 text-xs text-muted-foreground fade-in slide-in-from-right-2 duration-200"
        >
          {sendNotice}
        </span>
      )}

      {showDocTools && inPreview && canComment && pendingCommentCount > 0 && (
        <TooltipButton
          size="xs"
          onClick={onSendReview}
          // The key sends from the comments panel, where the review is in view.
          shortcut={commentsOpen ? "sendReview" : undefined}
          tooltip="Send your comments to the agent on this plan"
          tooltipAlign="end"
          className="gap-1.5"
        >
          <Send />
          Send review ({pendingCommentCount})
        </TooltipButton>
      )}

      {showDocTools && inPreview && canComment && (
        <TooltipButton
          variant="ghost"
          size="icon-sm"
          onClick={onToggleComments}
          shortcut="comments"
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
          shortcut="edit"
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
        shortcut="theme"
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
