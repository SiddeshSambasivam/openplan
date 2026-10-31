import { useEffect } from "react";
import {
  MIN_OUTLINE_ITEMS,
  outlineIndentPx,
  type OutlineItem,
} from "../lib/outline";
import { cn } from "../lib/utils";

interface OutlineProps {
  items: OutlineItem[];
  activeId: string | null;
  open: boolean;
  /**
   * True when the main area is too narrow to give the outline a column of its
   * own, so it floats above the content until dismissed instead of squeezing
   * the text it is meant to help you read.
   */
  overlay: boolean;
  onClose: () => void;
}

export function Outline({
  items,
  activeId,
  open,
  overlay,
  onClose,
}: OutlineProps) {
  useEffect(() => {
    if (!overlay || !open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlay, open, onClose]);

  if (!open || items.length < MIN_OUTLINE_ITEMS) return null;

  const goTo = (id: string) => {
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    // A floating outline covers the text it just jumped to.
    if (overlay) onClose();
  };

  const aside = (
    <aside
      className={cn(
        "flex w-56 flex-col border-l border-border bg-background",
        // Kept out of the flow only when there is no room for a column;
        // never parked off-screen, which would let the layout scroll sideways.
        overlay
          ? "animate-slide-in-right absolute inset-y-0 right-0 z-30 shadow-lg"
          : "animate-fade-in shrink-0",
      )}
    >
      <p className="shrink-0 px-4 pt-3.5 pb-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        On this page
      </p>
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => goTo(item.id)}
            style={{ paddingLeft: outlineIndentPx(item.level) + 8 }}
            className={cn(
              "block w-full cursor-default truncate rounded-md py-1 pr-2 text-left text-xs leading-5 transition-colors",
              item.id === activeId
                ? "bg-accent/60 font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.text}
          </button>
        ))}
      </nav>
    </aside>
  );

  if (!overlay) return aside;

  // Floating over the text is a compromise the narrow layout forces, so say
  // so: the page dims behind it and a click anywhere outside puts it away.
  return (
    <>
      <div
        onClick={onClose}
        aria-hidden
        className="animate-fade-in absolute inset-0 z-20 bg-background/70"
      />
      {aside}
    </>
  );
}
