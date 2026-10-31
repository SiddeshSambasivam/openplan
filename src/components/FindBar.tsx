import { CaseSensitive, ChevronDown, ChevronUp, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { findTextRanges } from "../lib/domRange";
import { FindHighlights } from "./FindHighlights";
import { cn } from "../lib/utils";
import { TooltipButton } from "./TooltipButton";

interface FindBarProps {
  /** The rendered preview's root — the text that gets searched. */
  articleRef: RefObject<HTMLElement | null>;
  /** The scrolling pane the matches are drawn inside. */
  scrollRef: RefObject<HTMLElement | null>;
  open: boolean;
  /** Bumped on every ⌘F press, even while already open, so pressing it
   * again re-focuses and re-selects instead of being a no-op. */
  focusSeq: number;
  onClose: () => void;
}

export function FindBar({
  articleRef,
  scrollRef,
  open,
  focusSeq,
  onClose,
}: FindBarProps) {
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else {
      setQuery("");
    }
  }, [open, focusSeq]);

  const matches = useMemo(() => {
    const root = articleRef.current;
    if (!open || !query || !root) return [];
    return findTextRanges(root, query, caseSensitive);
  }, [open, query, caseSensitive, articleRef]);

  useEffect(() => setCurrentIndex(0), [matches]);

  useEffect(() => {
    if (!open) return;
    matches[currentIndex]?.startContainer.parentElement?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [open, matches, currentIndex]);

  const matchCount = matches.length;

  if (!open) return null;

  const goNext = () => {
    if (matchCount === 0) return;
    setCurrentIndex((i) => (i + 1) % matchCount);
  };
  const goPrev = () => {
    if (matchCount === 0) return;
    setCurrentIndex((i) => (i - 1 + matchCount) % matchCount);
  };

  return (
    <>
      {scrollRef.current &&
        createPortal(
          <FindHighlights
            matches={matches}
            currentIndex={currentIndex}
            containerRef={scrollRef}
            articleRef={articleRef}
          />,
          scrollRef.current,
        )}
      <div className="fixed top-16 right-4 z-50 flex items-center gap-1 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-lg">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) goPrev();
            else goNext();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
        placeholder="Find in document"
        aria-label="Find in document"
        className="h-7 w-48 cursor-text rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring"
      />
      <span className="min-w-[3.25rem] shrink-0 px-1 text-center text-xs tabular-nums text-muted-foreground">
        {matchCount === 0 ? "0/0" : `${currentIndex + 1}/${matchCount}`}
      </span>
      <TooltipButton
        variant="ghost"
        size="icon-sm"
        onClick={() => setCaseSensitive((c) => !c)}
        tooltip="Match case"
        aria-label="Match case"
        aria-pressed={caseSensitive}
        className={cn(caseSensitive && "bg-accent text-accent-foreground")}
      >
        <CaseSensitive className="size-4" />
      </TooltipButton>
      <TooltipButton
        variant="ghost"
        size="icon-sm"
        onClick={goPrev}
        disabled={matchCount === 0}
        tooltip="Previous match (⇧↵)"
        aria-label="Previous match"
      >
        <ChevronUp className="size-4" />
      </TooltipButton>
      <TooltipButton
        variant="ghost"
        size="icon-sm"
        onClick={goNext}
        disabled={matchCount === 0}
        tooltip="Next match (↵)"
        aria-label="Next match"
      >
        <ChevronDown className="size-4" />
      </TooltipButton>
      <TooltipButton
        variant="ghost"
        size="icon-sm"
        onClick={onClose}
        tooltip="Close (Esc)"
        aria-label="Close find"
      >
        <X className="size-4" />
      </TooltipButton>
    </div>
    </>
  );
}
