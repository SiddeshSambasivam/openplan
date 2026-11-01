import type { ReactNode } from "react";
import { useWindowActive } from "@/lib/motion";

/** A place with nothing in it: plans drift into a tray, each on its own
 * clock, so the scene never visibly repeats. The words default to the plan
 * page with no plan open. */
export function EmptyState({
  title = "No plan open",
  hint = "Pick a plan from the board, or wait for an agent to file one.",
  children,
}: {
  title?: string;
  hint?: string;
  /** An action under the words. */
  children?: ReactNode;
}) {
  const active = useWindowActive();
  return (
    <div className="flex h-full animate-in flex-col items-center justify-center gap-4 p-8 text-center fade-in duration-200">
      <Scene paused={!active} />
      <div className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <p className="text-xs text-muted-foreground/80">{hint}</p>
      </div>
      {children}
    </div>
  );
}

/* Three sheets with durations that share no factor, so their phases line
   up only once in minutes. The tray's front wall is drawn last and hides
   the sheet as it lands. */
const SHEETS = [
  { x: 52, duration: "7.3s", delay: "0s" },
  { x: 66, duration: "9.7s", delay: "-3.1s" },
  { x: 44, duration: "12.1s", delay: "-6.4s" },
];

function Scene({ paused }: { paused: boolean }) {
  return (
    <svg
      viewBox="0 0 160 120"
      aria-hidden="true"
      data-paused={paused}
      className="empty-scene h-28 w-40 text-muted-foreground/70"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse
        className="empty-halo"
        cx="80"
        cy="96"
        rx="52"
        ry="8"
        stroke="none"
        fill="currentColor"
        opacity="0.12"
      />
      <g className="empty-tray">
        <path d="M28 70 L28 98 Q28 104 34 104 L126 104 Q132 104 132 98 L132 70" />
        {SHEETS.map((sheet) => (
          <g
            key={sheet.x}
            className="empty-sheet"
            style={{
              ["--duration" as string]: sheet.duration,
              ["--delay" as string]: sheet.delay,
            }}
          >
            <rect
              x={sheet.x}
              y="22"
              width="44"
              height="56"
              rx="5"
              fill="var(--card)"
            />
            <path d={`M${sheet.x + 10} 36 H${sheet.x + 34} M${sheet.x + 10} 46 H${sheet.x + 28} M${sheet.x + 10} 56 H${sheet.x + 32}`} />
          </g>
        ))}
        <path
          d="M28 70 L48 70 L56 82 L104 82 L112 70 L132 70 L132 98 Q132 104 126 104 L34 104 Q28 104 28 98 Z"
          fill="var(--background)"
        />
      </g>
    </svg>
  );
}
