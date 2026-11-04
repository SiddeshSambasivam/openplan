import type { ScrollMark } from "./scroll";
import type { MainView } from "./types";

export type ListView = Exclude<MainView, "plan">;

export const VIEW_LABELS: Record<ListView, string> = {
  board: "Board",
  list: "List",
  "for-you": "For you",
};

/** Where the plan page was entered from, so its back control returns
 * there. A view keeps how far it was scrolled, the palette its query. */
export type Origin =
  | { kind: "view"; view: ListView; scroll: ScrollMark[] }
  | { kind: "search"; query: string }
  | { kind: "page"; path: string; title: string };

export function originLabel(origin: Origin): string {
  if (origin.kind === "view") return VIEW_LABELS[origin.view];
  if (origin.kind === "search") return "Search";
  return origin.title;
}

/**
 * The trail after opening `opening` from `from`. A view or the palette
 * starts it over; a page opened from a page stacks, so back walks the pages
 * in turn until it reaches where the reading started.
 */
export function pushOrigin(trail: Origin[], from: Origin | null, opening: string): Origin[] {
  if (!from) return [];
  if (from.kind !== "page") return [from];
  if (from.path === opening) return trail;
  return [...trail, from];
}
