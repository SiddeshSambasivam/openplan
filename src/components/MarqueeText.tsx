import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";

const PX_PER_MS = 0.04; // ~40px/second — comfortable reading speed
const MIN_DURATION_MS = 350;
const MAX_DURATION_MS = 2600;

interface MarqueeTextProps {
  text: string;
  className?: string;
}

/**
 * Truncated text that, on hover, slides smoothly to reveal the clipped end
 * — then stops there (no loop, no bounce) until the pointer leaves, at
 * which point it slides back. A no-op — plain static text — when it isn't
 * actually overflowing its container.
 */
export function MarqueeText({ text, className }: MarqueeTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflowPx, setOverflowPx] = useState(0);
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const span = textRef.current;
    if (!container || !span) return;
    const measure = () => {
      setOverflowPx(Math.max(0, span.offsetWidth - container.clientWidth));
    };
    measure();
    // Re-measure on any reflow that could change either width — window
    // resize, sidebar resize, font-size changes, the text itself changing.
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    ro.observe(span);
    return () => ro.disconnect();
  }, [text]);

  const duration = Math.min(
    MAX_DURATION_MS,
    Math.max(MIN_DURATION_MS, overflowPx / PX_PER_MS),
  );

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => overflowPx > 0 && setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className={cn("min-w-0 overflow-hidden whitespace-nowrap", className)}
    >
      <span
        ref={textRef}
        className="inline-block"
        style={{
          transform: hovering ? `translateX(-${overflowPx}px)` : "translateX(0)",
          transition: `transform ${duration}ms ease-in-out`,
        }}
      >
        {text}
      </span>
    </div>
  );
}
