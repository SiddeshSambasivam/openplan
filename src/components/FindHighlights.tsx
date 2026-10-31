import { useCallback, useEffect, useState, type RefObject } from "react";

/** A drawn box, in the scroll container's content coordinates. */
interface HighlightBox {
  top: number;
  left: number;
  width: number;
  height: number;
  current: boolean;
}

/** Pathological queries (a single space, say) can match thousands of times;
 * past this the boxes cost more than they help. */
const MAX_BOXES = 800;

function boxesFor(
  matches: Range[],
  currentIndex: number,
  container: HTMLElement,
): HighlightBox[] {
  const base = container.getBoundingClientRect();
  const boxes: HighlightBox[] = [];
  for (let i = 0; i < matches.length && boxes.length < MAX_BOXES; i++) {
    // A match spanning a line break reports one rect per line.
    for (const rect of matches[i].getClientRects()) {
      if (rect.width === 0 || rect.height === 0) continue;
      boxes.push({
        top: rect.top - base.top + container.scrollTop,
        left: rect.left - base.left + container.scrollLeft,
        width: rect.width,
        height: rect.height,
        current: i === currentIndex,
      });
    }
  }
  return boxes;
}

interface FindHighlightsProps {
  matches: Range[];
  currentIndex: number;
  /** The scrolling pane the boxes are positioned inside. */
  containerRef: RefObject<HTMLElement | null>;
  /** Re-measured when this resizes — covers reading width, font size, and
   * the document itself reflowing. */
  articleRef: RefObject<HTMLElement | null>;
}

/**
 * Draws the find matches as ordinary absolutely-positioned elements rather
 * than through the CSS Custom Highlight API: the desktop app's WebView keeps
 * painting highlights after they are removed from that registry, whereas an
 * element that React unmounts is repainted by definition.
 */
export function FindHighlights({
  matches,
  currentIndex,
  containerRef,
  articleRef,
}: FindHighlightsProps) {
  const [boxes, setBoxes] = useState<HighlightBox[]>([]);

  const measure = useCallback(() => {
    const container = containerRef.current;
    setBoxes(container ? boxesFor(matches, currentIndex, container) : []);
  }, [matches, currentIndex, containerRef]);

  useEffect(measure, [measure]);

  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    const observer = new ResizeObserver(measure);
    observer.observe(article);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [articleRef, measure]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10">
      {boxes.map((box, i) => (
        <span
          key={i}
          className="absolute rounded-[2px]"
          style={{
            top: box.top,
            left: box.left,
            width: box.width,
            height: box.height,
            backgroundColor: box.current
              ? "var(--find-current)"
              : "var(--find-match)",
          }}
        />
      ))}
    </div>
  );
}
