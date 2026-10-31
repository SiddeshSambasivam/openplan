import {
  Eye,
  Moon,
  PanelLeft,
  Search,
  Settings,
  SquarePen,
  Sun,
  TableOfContents,
} from "lucide-react";
import { isMac } from "../lib/platform";
import type { FontSize } from "../lib/fontSize";
import type { DocFile, ViewMode } from "../lib/types";
import type { ContentWidth } from "../lib/width";
import { cn } from "../lib/utils";
import { TooltipButton } from "./TooltipButton";
import { FontSizeMenu } from "./FontSizeMenu";
import { MarqueeText } from "./MarqueeText";
import { WidthMenu } from "./WidthMenu";

interface HeaderProps {
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
  onOpenSettings: () => void;
  onOpenFind: () => void;
  /** Keep clear of the macOS traffic lights when the sidebar is hidden. */
  trafficLightGap: boolean;
}

export function Header({
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
  onOpenSettings,
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
      <div className="pointer-events-none flex min-w-0 flex-1 items-center gap-2">
        {doc && (
          <>
            <h1 className="min-w-0 cursor-default pointer-events-auto text-sm font-medium text-foreground">
              <MarqueeText text={doc.name} />
            </h1>
            {dirty && (
              <span
                className="size-1.5 shrink-0 rounded-full bg-foreground/40"
                title="Unsaved changes"
                aria-label="Unsaved changes"
              />
            )}
          </>
        )}
      </div>

      {doc && wordCount != null && (
        <span className="pointer-events-none pr-1.5 text-xs tabular-nums text-muted-foreground">
          {wordCount.toLocaleString()} {wordCount === 1 ? "word" : "words"}
        </span>
      )}

      {doc && inPreview && (
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

      {doc && (
        <WidthMenu width={contentWidth} onChange={onContentWidthChange} />
      )}

      {doc && <FontSizeMenu fontSize={fontSize} onChange={onFontSizeChange} />}

      {doc && inPreview && (
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

      {doc && canEdit && (
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
        onClick={onOpenSettings}
        tooltip={`Settings (${mod},)`}
        tooltipSide="bottom" tooltipAlign="end"
        aria-label="Settings"
      >
        <Settings className="size-4" />
      </TooltipButton>

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
