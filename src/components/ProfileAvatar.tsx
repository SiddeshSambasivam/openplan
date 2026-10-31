import { useId, useMemo } from "react";
import { MARBLE_SIZE, marble, type ChartColor } from "@/lib/avatar";
import { cn } from "@/lib/utils";

/* Whole class names, so Tailwind finds them. */
const FILL: Record<ChartColor, string> = {
  1: "fill-chart-1",
  2: "fill-chart-2",
  3: "fill-chart-3",
  4: "fill-chart-4",
  5: "fill-chart-5",
};

/** A person's marble: the same seed always draws the same picture, in the
 * theme's chart colours. Size it with a `size-*` class. */
export function ProfileAvatar({ seed, className }: { seed: string; className?: string }) {
  // React's ids carry punctuation that a `url(#...)` reference can trip on.
  const id = `marble-${useId().replace(/[^\w-]/g, "")}`;
  const { background, blobs, rotate } = useMemo(() => marble(seed), [seed]);
  const half = MARBLE_SIZE / 2;
  return (
    <svg
      viewBox={`0 0 ${MARBLE_SIZE} ${MARBLE_SIZE}`}
      aria-hidden
      className={cn("shrink-0 rounded-full", className)}
    >
      <defs>
        <clipPath id={`${id}-clip`}>
          <circle cx={half} cy={half} r={half} />
        </clipPath>
        <filter id={`${id}-blur`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={MARBLE_SIZE / 12} />
        </filter>
      </defs>
      <g clipPath={`url(#${id}-clip)`}>
        <rect width={MARBLE_SIZE} height={MARBLE_SIZE} className={FILL[background]} />
        <g filter={`url(#${id}-blur)`} transform={`rotate(${rotate} ${half} ${half})`}>
          {blobs.map((blob, index) => (
            <circle key={index} cx={blob.cx} cy={blob.cy} r={blob.r} className={FILL[blob.color]} />
          ))}
        </g>
      </g>
    </svg>
  );
}
