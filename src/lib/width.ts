export type ContentWidth = "compact" | "spaced" | "full";

export const WIDTH_VALUES: Record<ContentWidth, string> = {
  compact: "40rem",
  spaced: "48rem",
  full: "100%",
};

export const WIDTH_LABELS: Record<ContentWidth, string> = {
  compact: "Compact",
  spaced: "Spaced",
  full: "Full width",
};

export const WIDTH_ORDER: ContentWidth[] = ["compact", "spaced", "full"];

export function isContentWidth(value: string): value is ContentWidth {
  return (WIDTH_ORDER as string[]).includes(value);
}
