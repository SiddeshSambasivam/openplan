import {
  MIN_OUTLINE_ITEMS,
  outlineIndentPx,
  type OutlineItem,
} from "../lib/outline";
import { cn } from "../lib/utils";

/** Matches the panel's own `w-56`, so the column reveals it exactly. */
const WIDTH_PX = 224;

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
  if (items.length < MIN_OUTLINE_ITEMS) return null;

  const goTo = (id: string) => {
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    // A floating outline covers the text it just jumped to.
    if (overlay) onClose();
  };

  const panel = (
    <div className="flex h-full w-56 flex-col border-l border-border bg-background">
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
    </div>
  );

  // Floating over the text is a compromise the narrow layout forces, so say
  // so: the page dims behind it and a click anywhere outside puts it away.
  if (overlay) {
    return (
      <>
        {open && (
          <div
            onClick={onClose}
            aria-hidden
            className="absolute inset-0 z-20 animate-in bg-background/70 fade-in duration-200"
          />
        )}
        <aside
          aria-hidden={!open}
          className={cn(
            "absolute inset-y-0 right-0 z-30 shadow-lg transition-transform duration-200 ease-in-out",
            open ? "translate-x-0" : "pointer-events-none translate-x-full",
          )}
        >
          {panel}
        </aside>
      </>
    );
  }

  // Sharing the sidebar's shape: the column widens the layout aside rather
  // than covering it, and stays mounted so the width has something to animate.
  return (
    <aside
      aria-hidden={!open}
      className="shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out"
      style={{ width: open ? WIDTH_PX : 0 }}
    >
      {panel}
    </aside>
  );
}
