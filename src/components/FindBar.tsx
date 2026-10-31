import { CaseSensitive, ChevronDown, ChevronUp, X } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { HAS_HIGHLIGHT_API, findTextRanges } from "../lib/domRange";
import { cn } from "../lib/utils";
import { Button } from "./Button";

function paintHighlights(matches: Range[], currentIndex: number) {
  if (!HAS_HIGHLIGHT_API) return;
  CSS.highlights.set("app-find-match", new Highlight(...matches));
  const current = matches[currentIndex];
  if (current) CSS.highlights.set("app-find-current", new Highlight(current));
  else CSS.highlights.delete("app-find-current");
}

function clearHighlights() {
  if (!HAS_HIGHLIGHT_API) return;
  CSS.highlights.delete("app-find-match");
  CSS.highlights.delete("app-find-current");
}

interface FindBarProps {
  /** The rendered preview's root — searched and scrolled within. */
  articleRef: RefObject<HTMLElement | null>;
  open: boolean;
  /** Bumped on every ⌘F press, even while already open, so pressing it
   * again re-focuses and re-selects instead of being a no-op. */
  focusSeq: number;
  onClose: () => void;
}

export function FindBar({ articleRef, open, focusSeq, onClose }: FindBarProps) {
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const matchesRef = useRef<Range[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else {
      clearHighlights();
      matchesRef.current = [];
      setQuery("");
    }
  }, [open, focusSeq]);

  // Re-scan whenever the query or case-sensitivity changes, while open.
  useEffect(() => {
    if (!open) return;
    const root = articleRef.current;
    const matches = root ? findTextRanges(root, query, caseSensitive) : [];
    matchesRef.current = matches;
    setMatchCount(matches.length);
    setCurrentIndex(0);
  }, [open, query, caseSensitive, articleRef]);

  // Keep the highlight + scroll position in sync with the current match.
  useEffect(() => {
    if (!open) return;
    paintHighlights(matchesRef.current, currentIndex);
    const range = matchesRef.current[currentIndex];
    range?.startContainer.parentElement?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    // matchCount is in the deps so this re-runs right after a fresh scan
    // (query/case change) resets currentIndex to 0, not just on navigation.
  }, [open, currentIndex, matchCount]);

  useEffect(() => () => clearHighlights(), []);

  if (!open) return null;

  const goNext = () => {
    if (matchesRef.current.length === 0) return;
    setCurrentIndex((i) => (i + 1) % matchesRef.current.length);
  };
  const goPrev = () => {
    if (matchesRef.current.length === 0) return;
    setCurrentIndex(
      (i) => (i - 1 + matchesRef.current.length) % matchesRef.current.length,
    );
  };

  return (
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
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setCaseSensitive((c) => !c)}
        tooltip="Match case"
        aria-label="Match case"
        aria-pressed={caseSensitive}
        className={cn(caseSensitive && "bg-accent text-accent-foreground")}
      >
        <CaseSensitive className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={goPrev}
        disabled={matchCount === 0}
        tooltip="Previous match (⇧↵)"
        aria-label="Previous match"
      >
        <ChevronUp className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={goNext}
        disabled={matchCount === 0}
        tooltip="Next match (↵)"
        aria-label="Next match"
      >
        <ChevronDown className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onClose}
        tooltip="Close (Esc)"
        aria-label="Close find"
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
