import type { ReactNode } from "react";
import type { Role } from "@/lib/work";
import { cn } from "@/lib/utils";

/**
 * The face of the role that asks a question: a drawn face on a tile in the
 * role's chart colour, with one prop in the same colour. Drawn, not
 * photographed, so nobody takes a persona for a real person. The face and
 * its features use the page's own colours, so they read in both themes.
 * Size it with a `size-*` class.
 */
export function PersonaAvatar({ role, className }: { role: Role; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("shrink-0 rounded-md", className)}>
      <rect width="32" height="32" className={TILE[role]} />
      {FACES[role]}
    </svg>
  );
}

/* Whole class names, so Tailwind finds them. */
const TILE: Record<Role, string> = {
  product: "fill-chart-1/20",
  engineering: "fill-chart-2/20",
  design: "fill-chart-4/25",
  oncall: "fill-chart-3/20",
};

const LINE = {
  fill: "none",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function Eyes({ y, apart = 3 }: { y: number; apart?: number }) {
  return (
    <>
      <circle cx={16 - apart} cy={y} r="1.3" className="fill-foreground" />
      <circle cx={16 + apart} cy={y} r="1.3" className="fill-foreground" />
    </>
  );
}

const FACES: Record<Role, ReactNode> = {
  // A pennant over a round face: the one who sets the direction.
  product: (
    <>
      <path d="M16 4.5V11" {...LINE} className="stroke-foreground" />
      <path d="M16.75 4.5 23 6.75 16.75 9Z" className="fill-chart-1" />
      <circle cx="16" cy="19.5" r="8" className="fill-background" />
      <Eyes y={18.5} />
      <path d="M13 22.25q3 2.5 6 0" {...LINE} className="stroke-foreground" />
    </>
  ),
  // A square face behind square glasses.
  engineering: (
    <>
      <rect x="7.5" y="8" width="17" height="17" rx="4.5" className="fill-background" />
      <rect x="9.25" y="13.5" width="6" height="4.5" rx="1.5" {...LINE} className="stroke-chart-2" />
      <rect x="16.75" y="13.5" width="6" height="4.5" rx="1.5" {...LINE} className="stroke-chart-2" />
      <Eyes y={15.75} apart={3.75} />
      <path d="M13.5 21.5h5" {...LINE} className="stroke-foreground" />
    </>
  ),
  // A round face under a tilted beret.
  design: (
    <>
      <circle cx="16" cy="19" r="8" className="fill-background" />
      <path d="M7 13.5C7.5 7.5 20 5 25 10.5 21.5 13 12 14 7 13.5Z" className="fill-chart-4" />
      <circle cx="19.5" cy="6.75" r="1.4" className="fill-chart-4" />
      <Eyes y={18.5} />
      <path d="M13.25 22q3 2.25 5.75-.5" {...LINE} className="stroke-foreground" />
    </>
  ),
  // A round face in a headset, ready for the page.
  oncall: (
    <>
      <circle cx="16" cy="17" r="7.5" className="fill-background" />
      <path d="M8 16.5a8 8 0 0 1 16 0" {...LINE} strokeWidth={2} className="stroke-chart-3" />
      <rect x="5.75" y="14.5" width="3.5" height="6" rx="1.5" className="fill-chart-3" />
      <rect x="22.75" y="14.5" width="3.5" height="6" rx="1.5" className="fill-chart-3" />
      <path d="M7.5 20.5q1 4.75 6 4.75" {...LINE} className="stroke-chart-3" />
      <circle cx="14.5" cy="25.25" r="1.3" className="fill-chart-3" />
      <Eyes y={16.5} apart={2.75} />
      <path d="M14.5 20.25h3" {...LINE} className="stroke-foreground" />
    </>
  ),
};
