import { useEffect, useRef, useState } from "react";
import type { Status } from "@/lib/planBase";
import { cn } from "@/lib/utils";

/* One small circle per state, so a status reads at a glance without a
   coloured pill: dashed for a draft, a quarter full in alignment, half full
   while in progress, a dot while in review, filled with a tick once
   completed, and filled and greyed with a bar once archived. */
export function StatusGlyph({
  status,
  tick,
  className,
}: {
  status: Status;
  /** Beat once when the status changes, for the glyph that stands for the
   * plan someone is reading. A glyph in a list stays still. */
  tick?: boolean;
  className?: string;
}) {
  const [beating, setBeating] = useState(false);
  const shown = useRef(status);
  useEffect(() => {
    if (shown.current === status) return;
    shown.current = status;
    if (tick) setBeating(true);
  }, [status, tick]);

  return (
    <svg
      viewBox="0 0 14 14"
      aria-hidden
      onAnimationEnd={() => setBeating(false)}
      className={cn(
        "size-3.5 shrink-0",
        beating && "motion-tick",
        (status === "draft" || status === "archived") && "text-muted-foreground",
        (status === "alignment" || status === "in-progress") && "text-warning",
        status === "in-review" && "text-info",
        status === "completed" && "text-success",
        className,
      )}
    >
      {status === "draft" && (
        <circle
          cx="7"
          cy="7"
          r="5.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="2 2"
        />
      )}
      {status === "alignment" && (
        <>
          <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M7 7V3.5A3.5 3.5 0 0 1 10.5 7z" fill="currentColor" />
        </>
      )}
      {status === "in-progress" && (
        <>
          <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M7 7V3.5A3.5 3.5 0 0 1 10.5 7 3.5 3.5 0 0 1 7 10.5z" fill="currentColor" />
        </>
      )}
      {status === "in-review" && (
        <>
          <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="7" cy="7" r="2.5" fill="currentColor" />
        </>
      )}
      {status === "completed" && (
        <>
          <circle cx="7" cy="7" r="6" fill="currentColor" />
          <path
            d="M4.5 7.2l1.8 1.8L9.8 5.5"
            fill="none"
            stroke="var(--background)"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {status === "archived" && (
        <>
          <circle cx="7" cy="7" r="6" fill="currentColor" />
          <path
            d="M4.5 7h5"
            fill="none"
            stroke="var(--background)"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}
