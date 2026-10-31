import { MessageSquarePlus } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { selectionRange } from "@/lib/anchors";
import { Button } from "@/components/ui/button";

interface Draft {
  quote: string;
  lineStart: number;
  lineEnd: number;
  /** Below the highlight, in the scroll container's content space. */
  top: number;
  /** Horizontal middle of the highlight's last line. */
  centerX: number;
}

/**
 * Select text, get a small Comment button by the selection; clicking it
 * drops a composer right there. Submitting leaves only the highlight
 * behind; the panel is not forced open.
 */
export function CommentComposer({
  articleRef,
  containerRef,
  lineOffset,
  enabled,
  onSubmit,
}: {
  articleRef: RefObject<HTMLElement | null>;
  containerRef: RefObject<HTMLElement | null>;
  lineOffset: number;
  enabled: boolean;
  onSubmit: (quote: string, lineStart: number, lineEnd: number, text: string) => void;
}) {
  const [trigger, setTrigger] = useState<Draft | null>(null);
  const [composing, setComposing] = useState<Draft | null>(null);
  const [text, setText] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) {
      setTrigger(null);
      return;
    }
    const onMouseUp = () => {
      // Let the click settle so a collapsing selection reads as collapsed.
      setTimeout(() => {
        const article = articleRef.current;
        const container = containerRef.current;
        const selection = window.getSelection();
        if (!article || !container || !selection) return;
        const range = selectionRange(selection, article, lineOffset);
        if (!range) {
          setTrigger(null);
          return;
        }
        // The last client rect is the selection's final line; the button
        // hangs centered right under it.
        const rects = selection.getRangeAt(0).getClientRects();
        const last = rects[rects.length - 1];
        if (!last) return;
        const base = container.getBoundingClientRect();
        setTrigger({
          ...range,
          top: last.bottom - base.top + container.scrollTop + 6,
          centerX: last.left + last.width / 2 - base.left + container.scrollLeft,
        });
      }, 0);
    };
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, [enabled, articleRef, containerRef, lineOffset]);

  useEffect(() => {
    if (!composing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setComposing(null);
        setText("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [composing]);

  const submit = () => {
    if (!composing || !text.trim()) return;
    onSubmit(composing.quote, composing.lineStart, composing.lineEnd, text.trim());
    setComposing(null);
    setText("");
  };

  // Keeps a box of the given width inside the container, whatever the
  // window size.
  const clampedLeft = (centerX: number, width: number) => {
    const max = (containerRef.current?.clientWidth ?? width) - width - 8;
    return Math.min(Math.max(centerX - width / 2, 8), Math.max(max, 8));
  };

  if (composing) {
    return (
      <div
        ref={boxRef}
        className="absolute z-30 w-72 animate-in rounded-lg border border-border bg-popover p-2 shadow-lg fade-in slide-in-from-bottom-1 duration-150"
        style={{ top: composing.top, left: clampedLeft(composing.centerX, 288) }}
      >
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          rows={3}
          placeholder="Comment on this"
          className="w-full cursor-text resize-none rounded-md border border-border bg-background p-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring"
        />
        <div className="mt-1.5 flex justify-end gap-1.5">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              setComposing(null);
              setText("");
            }}
          >
            Cancel
          </Button>
          <Button size="xs" onClick={submit} disabled={!text.trim()}>
            Comment
          </Button>
        </div>
      </div>
    );
  }

  if (!trigger) return null;
  return (
    <div
      className="absolute z-30 -translate-x-1/2 animate-in fade-in duration-150"
      style={{ top: trigger.top, left: trigger.centerX }}
    >
      <Button
        size="xs"
        variant="outline"
        className="gap-1.5 bg-popover shadow-md dark:bg-popover dark:hover:bg-accent"
        onClick={() => {
          setComposing(trigger);
          setTrigger(null);
          window.getSelection()?.removeAllRanges();
        }}
      >
        <MessageSquarePlus />
        Comment
      </Button>
    </div>
  );
}
