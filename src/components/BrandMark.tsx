/* The OpenPlan mark: a pinwheel of four blades around an open centre.
   Drawn in currentColor, so one asset serves both themes. */

import type { SVGProps } from "react";

export function BrandMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M0 8A8 8 0 0 1 16 8ZM8 8A8 8 0 0 0 8 24ZM8 16A8 8 0 0 0 24 16ZM16 0A8 8 0 0 1 16 16Z" />
    </svg>
  );
}
