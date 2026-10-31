export type FontSize = "small" | "normal" | "large";

// A unitless scale factor, not absolute pixels — each surface (markdown
// prose vs. the monospace editor) multiplies its own base size by this, so
// the two keep their existing relative proportions at every step.
export const FONT_SIZE_SCALES: Record<FontSize, number> = {
  small: 0.9,
  normal: 1,
  large: 1.15,
};

export const FONT_SIZE_LABELS: Record<FontSize, string> = {
  small: "Small",
  normal: "Normal",
  large: "Large",
};

export const FONT_SIZE_ORDER: FontSize[] = ["small", "normal", "large"];

export function isFontSize(value: string): value is FontSize {
  return (FONT_SIZE_ORDER as string[]).includes(value);
}
