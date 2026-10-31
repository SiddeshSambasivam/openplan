import { STORAGE_PREFIX } from "./storage";

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

/** The app's own text, apart from the plan's: the size of a row's label.
 * The smaller and larger UI text sizes keep their ratio to it. */
export const APP_FONT_SIZES: Record<FontSize, string> = {
  small: "12px",
  normal: "13px",
  large: "14px",
};

export const STORE_APP_FONT_SIZE = `${STORAGE_PREFIX}app-font-size`;

export function loadAppFontSize(storage: Storage = localStorage): FontSize {
  try {
    const stored = storage.getItem(STORE_APP_FONT_SIZE);
    return stored && isFontSize(stored) ? stored : "normal";
  } catch {
    return "normal";
  }
}
