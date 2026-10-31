export type TocVisibility = "open" | "autohide" | "closed";

export const TOC_VISIBILITY_LABELS: Record<TocVisibility, string> = {
  open: "Always show",
  autohide: "Auto-hide",
  closed: "Hide",
};

export const TOC_VISIBILITY_ORDER: TocVisibility[] = [
  "open",
  "autohide",
  "closed",
];

export function isTocVisibility(value: string): value is TocVisibility {
  return (TOC_VISIBILITY_ORDER as string[]).includes(value);
}
