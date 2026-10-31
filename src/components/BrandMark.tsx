/* The OpenPlan mark: four circles around an open square, each missing the
   quarter that falls inside it. Drawn in currentColor, so one asset serves
   both themes. The stroke is heavier than the 0.78 master so the mark holds
   up at the 16-20px sizes the app uses. */

import type { SVGProps } from "react";

export function BrandMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="-0.75 -0.75 25.5 25.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      aria-hidden
      {...props}
    >
      <path d="M8 16A8 8 0 1 1 16 8M8 8A8 8 0 1 1 16 16M16 8A8 8 0 1 1 8 16M16 16A8 8 0 1 1 8 8M0 8H16M16 0V16M24 16H8M8 24V8" />
    </svg>
  );
}
