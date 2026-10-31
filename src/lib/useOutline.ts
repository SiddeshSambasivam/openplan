import { useEffect, useState, type RefObject } from "react";
import {
  OUTLINE_HEADING_SELECTOR,
  toOutlineItems,
  type OutlineItem,
} from "./outline";

/**
 * The document's headings, plus whichever one the reader is currently in.
 * `watch` re-scans when the document (or its saved content) changes.
 */
export function useOutline(
  articleRef: RefObject<HTMLElement | null>,
  scrollRef: RefObject<HTMLElement | null>,
  watch: unknown,
): { items: OutlineItem[]; activeId: string | null } {
  const [items, setItems] = useState<OutlineItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const root = articleRef.current;
    if (!root) {
      setItems([]);
      return;
    }
    setItems(
      toOutlineItems(
        Array.from(root.querySelectorAll<HTMLElement>(OUTLINE_HEADING_SELECTOR)),
      ),
    );
  }, [articleRef, watch]);

  useEffect(() => {
    if (items.length === 0) return;
    const elements = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const onScreen = new Set<string>();
    // The bottom margin keeps the "active" heading to the one nearest the top
    // of the viewport rather than whichever is merely visible somewhere.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) onScreen.add(entry.target.id);
          else onScreen.delete(entry.target.id);
        }
        const first = elements.find((el) => onScreen.has(el.id));
        if (first) setActiveId(first.id);
      },
      { root: scrollRef.current, rootMargin: "0px 0px -72% 0px", threshold: 0 },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items, scrollRef]);

  return { items, activeId };
}
