import { ArrowLeftRight } from "lucide-react";
import { useEffect, useState, type RefObject } from "react";
import type { TocVisibility } from "../lib/toc";
import { cn } from "../lib/utils";
import { TooltipLabel } from "./Tooltip";

export type TocSide = "left" | "right";

interface Heading {
  id: string;
  text: string;
  level: number;
}

const HEADING_SELECTOR = "h2[id], h3[id], h4[id]";

function scanHeadings(root: HTMLElement | null): Heading[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(HEADING_SELECTOR)).map(
    (el) => ({
      id: el.id,
      text: el.textContent ?? "",
      level: Number(el.tagName[1]),
    }),
  );
}

// `leading-5` (not the tighter default for text-xs) leaves enough room that
// descenders like g/y/p don't get clipped by the truncate ellipsis's
// overflow:hidden; min-w-0 lets these actually shrink inside a flex column
// instead of silently ignoring their own truncate class. shrink-0 is the
// other half of that: `overflow:hidden` also zeroes a flex item's automatic
// *minimum* size, so once a long list's natural height exceeds the panel's
// max-height, flex-shrink is free to compress every item toward 0 instead of
// leaving the last couple of items to the scrollbar — shrink-0 stops that.
const itemClass = (active: boolean) =>
  cn(
    "min-w-0 shrink-0 cursor-default truncate rounded-md py-0.5 pr-2 text-left text-xs leading-5 transition-colors",
    active
      ? "font-medium text-foreground"
      : "text-muted-foreground hover:text-foreground",
  );

interface TableOfContentsProps {
  articleRef: RefObject<HTMLElement | null>;
  scrollRef: RefObject<HTMLElement | null>;
  /** Re-scan when the doc (or its saved content) changes. */
  watch: unknown;
  side: TocSide;
  onSideChange: (side: TocSide) => void;
  /** "autohide" only matters when floating — panel mode is always fully open. */
  visibility: Exclude<TocVisibility, "closed">;
  /**
   * "panel" sits in-flow beside the content, shrinking it — used at full
   * reading width, where a floating overlay would sit on top of the text
   * instead of beside it. "floating" overlays the empty margin outside the
   * content column.
   */
  mode: "floating" | "panel";
  /** Floating mode only: push clear of the sidebar — its current width in
   * px when open (it's resizable), or 0 when closed. */
  leftInset: number;
  /** Floating mode only: push clear of the Comments panel — its width in
   * px when open, or 0 when closed. */
  rightInset: number;
}

export function TableOfContents({
  articleRef,
  scrollRef,
  watch,
  side,
  onSideChange,
  visibility,
  mode,
  leftInset,
  rightInset,
}: TableOfContentsProps) {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    setHeadings(scanHeadings(articleRef.current));
    // Re-scan whenever the active doc or its saved content changes.
  }, [articleRef, watch]);

  useEffect(() => {
    if (headings.length === 0) return;
    const els = headings
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;
    const visible = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const first = els.find((el) => visible.has(el.id));
        if (first) setActiveId(first.id);
      },
      { root: scrollRef.current, rootMargin: "0px 0px -72% 0px", threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [headings, scrollRef]);

  if (headings.length < 2) return null;

  const goTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const flip = () => onSideChange(side === "right" ? "left" : "right");

  if (mode === "panel") {
    return (
      <div
        className={cn(
          "flex h-full w-56 shrink-0 flex-col",
          side === "left" ? "border-r border-border" : "border-l border-border",
        )}
      >
        <div className="flex shrink-0 items-center justify-between px-3 pt-3 pb-1.5">
          <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
            On this page
          </span>
          <FlipSideButton side={side} onClick={flip} />
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {headings.map((h) => (
            <button
              key={h.id}
              onClick={() => goTo(h.id)}
              style={{ paddingLeft: (h.level - 2) * 14 + 8 }}
              className={cn("block w-full", itemClass(h.id === activeId))}
            >
              {h.text}
            </button>
          ))}
        </nav>
      </div>
    );
  }

  const showList = visibility === "open" || hovering;
  // Right-side TOC is anchored via `right`, so its box grows leftward —
  // content stays glued to the right edge and reveals toward the left.
  // Left-side is the mirror (default flow alignment already does this).
  const alignEnd = side === "right";

  return (
    <div
      className="fixed top-1/2 z-40 flex -translate-y-1/2 items-center gap-1.5 transition-[left,right] duration-200 ease-in-out"
      style={
        side === "left"
          ? { left: leftInset > 0 ? leftInset + 16 : 16 }
          : { right: rightInset > 0 ? rightInset + 16 : 16 }
      }
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {side === "left" && (
        <FlipSideButton side={side} onClick={flip} visible={showList} />
      )}
      {/* Both views stay mounted and cross-fade — swapping them via a
          ternary would instant-cut between two unrelated DOM subtrees with
          nothing for a CSS transition to bridge. The box's own width
          animates between a dots-wide sliver and the full list width, and
          `overflow-hidden` does the reveal/conceal clipping. */}
      <div
        className="relative overflow-hidden transition-[width] duration-200 ease-in-out"
        style={{ width: showList ? 208 : 24 }}
      >
        <nav
          className={cn(
            "flex max-h-[65vh] w-52 flex-col gap-0.5 overflow-y-auto py-1 transition-opacity ease-in-out",
            alignEnd && "ml-auto",
            showList
              ? "opacity-100 duration-150 delay-100"
              : "pointer-events-none opacity-0 duration-150",
          )}
        >
          {headings.map((h) => (
            <button
              key={h.id}
              onClick={() => goTo(h.id)}
              style={{ paddingLeft: (h.level - 2) * 14 + 10 }}
              className={itemClass(h.id === activeId)}
            >
              {h.text}
            </button>
          ))}
        </nav>
        <div
          className={cn(
            "absolute inset-y-0 flex w-6 flex-col items-end justify-center gap-1.5 py-1 transition-opacity ease-in-out",
            alignEnd ? "right-0" : "left-0",
            showList
              ? "pointer-events-none opacity-0 duration-150"
              : "opacity-100 duration-150 delay-100",
          )}
        >
          {headings.map((h) => (
            <button
              key={h.id}
              onClick={() => goTo(h.id)}
              aria-label={h.text}
              style={{ width: `${16 - (h.level - 2) * 4}px` }}
              className={cn(
                "h-1 shrink-0 cursor-default rounded-full transition-all",
                h.id === activeId
                  ? "bg-foreground"
                  : "bg-muted-foreground/40 hover:bg-muted-foreground",
              )}
            />
          ))}
        </div>
      </div>
      {side === "right" && (
        <FlipSideButton side={side} onClick={flip} visible={showList} />
      )}
    </div>
  );
}

function FlipSideButton({
  side,
  onClick,
  visible = true,
}: {
  side: TocSide;
  onClick: () => void;
  /** Floating autohide mode fades this with the list instead of unmounting
   * it, so it doesn't pop in/out abruptly either. */
  visible?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={`Move outline to the ${side === "right" ? "left" : "right"}`}
      className={cn(
        "group/tip relative flex size-6 shrink-0 cursor-default items-center justify-center rounded-full text-muted-foreground/50 transition-opacity duration-150 ease-in-out hover:text-foreground",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <ArrowLeftRight className="size-3" />
      <TooltipLabel
        label={`Move to ${side === "right" ? "left" : "right"}`}
        side={side === "right" ? "top-end" : "top-start"}
      />
    </button>
  );
}
