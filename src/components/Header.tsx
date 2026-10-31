import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  Hammer,
  ListTodo,
  MessageSquareText,
  Search,
  Send,
  SquarePen,
  TableOfContents,
} from "lucide-react";
import type { ReactNode } from "react";
import type { FontSize } from "../lib/fontSize";
import type { DocFile, MainView, ViewMode } from "../lib/types";
import type { ContentWidth } from "../lib/width";
import type { FolderFilter } from "../lib/folders";
import { VIEW_LABELS, type ListView } from "../lib/origin";
import type { PlanSummary, Status } from "../lib/planBase";
import { COMPLETION_PROMPT, type TodoCount } from "../lib/work";
import { navbarToggleLabel } from "../lib/navbar";
import { cn } from "../lib/utils";
import { BrandMark } from "./BrandMark";
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

interface HeaderProps {
  mainView: MainView;
  /** The name of what is open. Null away from the plan page. */
  title: string | null;
  /** Where the plan page was entered from, named. Null when there is
   * nowhere to go back to. */
  back: string | null;
  onBack: () => void;
  /** The plan's todo count while its work panel floats, so the bar can
   * open it. Null when the panel has a column or nothing to show. */
  work: TodoCount | null;
  workOpen: boolean;
  onToggleWork: () => void;
  /** The open plan, for the status picker. */
  plan: PlanSummary | null;
  onStatusChange: (status: Status) => void;
  /** The status picker's menu, which its key opens too. */
  statusOpen: boolean;
  onStatusOpenChange: (open: boolean) => void;
  /** Every recorded PR reads merged on a plan in review. */
  offerCompletion: boolean;
  /** Sends the agent on the plan to work. Absent once the work has started. */
  onBuild?: () => void;
  /** The score is below the person's target, so Build shows but is off. */
  buildBlocked?: boolean;
  /** What Build says while alignment is unsettled. */
  buildTooltip?: string;
  /** Every folder in the base, for the filter. */
  folders: string[];
  folder: FolderFilter;
  onSelectFolder: (folder: FolderFilter) => void;
  /** The current view's own controls, beside the folder filter. */
  viewTools?: ReactNode;
  /** Word of a new version, shown on every view. */
  updateNotice?: ReactNode;
  doc: DocFile | null;
  wordCount: number | null;
  view: ViewMode;
  /** Whether the current doc can be edited (loaded and on disk or inline). */
  canEdit: boolean;
  dirty: boolean;
  onToggleView: () => void;
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
  /** Whether the last review or Build reached a session, and whether its
   * agent woke. Cleared by whoever set it. */
  sendNotice: string | null;
  onOpenFind: () => void;
  /** How far the bar reaches left over the navbar's column, and where its
   * title starts, in pixels. */
  layout: { pull: number; lead: number };
  /** The navbar is minimized, so the bar carries the mark that expands it. */
  navbarMinimized: boolean;
  onExpandNavbar: () => void;
}

export function Header({
  mainView,
  title,
  back,
  onBack,
  work,
  workOpen,
  onToggleWork,
  plan,
  onStatusChange,
  statusOpen,
  onStatusOpenChange,
  offerCompletion,
  onBuild,
  buildBlocked = false,
  buildTooltip,
  folders,
  folder,
  onSelectFolder,
  viewTools,
  updateNotice,
  doc,
  wordCount,
  view,
  canEdit,
  dirty,
  onToggleView,
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
  layout,
  navbarMinimized,
  onExpandNavbar,
}: HeaderProps) {
  const toggleViewLabel = view === "preview" ? "Edit" : "Preview";
  const inPreview = view === "preview";
  const onPlan = mainView === "plan";
  const showDocTools = onPlan && doc != null;
  return (
    // Minimized, the bar reaches over the rail to span the window. Its reach
    // and its lead move with the navbar's column, on the same transition,
    // so the title slides rather than jumps.
    <header
      data-tauri-drag-region
      className="navbar-width relative z-30 flex h-12 shrink-0 items-center gap-1.5 border-b border-border bg-background pr-4"
      style={{ marginLeft: -layout.pull }}
    >
      {/* The negative margin takes back the row's gap, so the title starts
          at the lead exactly. */}
      <div
        data-tauri-drag-region
        className="navbar-width relative -mr-1.5 h-full shrink-0 overflow-hidden"
        style={{ width: layout.lead }}
      >
        <ExpandMark shown={navbarMinimized} onExpand={onExpandNavbar} />
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
        {onPlan && back && (
          <TooltipButton
            variant="ghost"
            size="xs"
            onClick={onBack}
            shortcut="escape"
            tooltip={`Back to ${back}`}
            tooltipAlign="start"
            aria-label={`Back to ${back}`}
            className="min-w-0 shrink-0 gap-1.5 font-normal text-muted-foreground"
          >
            <ArrowLeft />
            {/* The title is what someone needs to see, so a narrow window
                keeps only the arrow. */}
            <span className="hidden max-w-40 truncate md:inline">{back}</span>
          </TooltipButton>
        )}
        {onPlan && title != null ? (
          <>
            <h1 className="min-w-0 flex-1 cursor-default text-sm font-medium text-foreground">
              <MarqueeText text={title} />
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
            {VIEW_LABELS[mainView as ListView]}
          </h1>
        )}
      </div>

      {updateNotice}

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
        <div data-tour="mark-completed" className="flex min-w-0 items-center gap-1.5">
          <span className="truncate pl-1 text-xs text-muted-foreground">
            {COMPLETION_PROMPT.said}
          </span>
          <TooltipButton
            size="xs"
            variant="outline"
            onClick={() => onStatusChange("completed")}
            tooltip="Move this plan to Completed"
          >
            <Check />
            {COMPLETION_PROMPT.asked}
          </TooltipButton>
        </div>
      )}

      {onPlan && onBuild && (
        <TooltipButton
          size="xs"
          variant="outline"
          onClick={onBuild}
          data-tour="build"
          disabled={buildBlocked}
          shortcut="build"
          tooltip={buildTooltip ?? "Tell the agent to start the work, with any unsent comments"}
          className="gap-1.5"
        >
          <Hammer />
          Build
        </TooltipButton>
      )}

      {showDocTools && wordCount != null && (
        // A narrow window gives its room to the title.
        <span className="pointer-events-none hidden shrink-0 pr-1.5 text-xs tabular-nums text-muted-foreground lg:inline">
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

      {onPlan && work && (
        <TooltipButton
          variant="ghost"
          size="xs"
          onClick={onToggleWork}
          shortcut="workPanel"
          tooltip="Todos, repos and PRs"
          tooltipAlign="end"
          aria-expanded={workOpen}
          className={cn(
            "gap-1.5 font-normal text-muted-foreground",
            workOpen && "bg-accent text-accent-foreground",
          )}
        >
          <ListTodo />
          Work
          {work.total > 0 && (
            <span className="tabular-nums">
              {work.done}/{work.total}
            </span>
          )}
        </TooltipButton>
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
          data-tour="review"
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
          // Before there is a review to send, the tour lights where it is written.
          data-tour="review"
          shortcut="comments"
          tooltipSide="bottom" tooltipAlign="end"
          aria-label="Comments"
          aria-expanded={commentsOpen}
          className={cn("relative", commentsOpen && "bg-accent text-accent-foreground")}
        >
          <MessageSquareText className="size-4" />
          {openCommentCount > 0 && (
            <span className="absolute top-0.5 right-0.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
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

    </header>
  );
}

/** The mark and the control it turns into, crossfading under the pointer. */
const MORPH = "transition-[opacity,transform] duration-120 ease-out";

/** The OpenPlan mark of the minimized navbar, held at the right end of the
 * bar's lead. Under the pointer or keyboard focus it turns into the expand
 * control. Stays mounted while the navbar is expanded, faded and out of
 * reach, so it can fade in as the bar slides. */
function ExpandMark({ shown, onExpand }: { shown: boolean; onExpand: () => void }) {
  const label = navbarToggleLabel(false);
  return (
    <TooltipButton
      variant="ghost"
      size="icon-xs"
      onClick={onExpand}
      shortcut="navbar"
      tooltip={label}
      tooltipAlign="start"
      aria-label={label}
      aria-expanded={false}
      aria-hidden={!shown || undefined}
      tabIndex={shown ? undefined : -1}
      className={cn(
        "group/mark absolute top-1/2 right-1.5 -translate-y-1/2 text-foreground transition-opacity duration-180 ease-out",
        !shown && "pointer-events-none opacity-0",
      )}
    >
      <BrandMark
        className={cn(
          "size-4 group-hover/mark:scale-90 group-hover/mark:opacity-0 group-focus-visible/mark:scale-90 group-focus-visible/mark:opacity-0",
          MORPH,
        )}
      />
      <ChevronRight
        strokeWidth={1.5}
        className={cn(
          "absolute size-4 scale-90 text-muted-foreground opacity-0 group-hover/mark:scale-100 group-hover/mark:text-foreground group-hover/mark:opacity-100 group-focus-visible/mark:scale-100 group-focus-visible/mark:opacity-100",
          MORPH,
        )}
      />
    </TooltipButton>
  );
}
