export interface Point {
  x: number;
  y: number;
}

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** How far the pointer travels before a press counts as a drag. */
export const DRAG_THRESHOLD = 4;

/** The rectangle two points span, whichever way the pointer went. */
export function boxBetween(a: Point, b: Point): Box {
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    right: Math.max(a.x, b.x),
    bottom: Math.max(a.y, b.y),
  };
}

export function isDrag(start: Point, now: Point): boolean {
  return Math.hypot(now.x - start.x, now.y - start.y) >= DRAG_THRESHOLD;
}

/** The area two rectangles share, or null when they only touch or sit apart. */
export function overlap(a: Box, b: Box): Box | null {
  const shared = {
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  };
  return shared.left < shared.right && shared.top < shared.bottom ? shared : null;
}

export function toggled(selection: ReadonlySet<string>, path: string): Set<string> {
  const next = new Set(selection);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  return next;
}

/** The plans from the anchor to the target in the view's order, both
 * included. Without an anchor in the view, the target alone. */
export function rangeBetween(order: string[], anchor: string | null, target: string): string[] {
  const from = anchor == null ? -1 : order.indexOf(anchor);
  const to = order.indexOf(target);
  if (from === -1 || to === -1) return [target];
  return order.slice(Math.min(from, to), Math.max(from, to) + 1);
}

/** What a selection box leaves selected: what it covers, added to what was
 * there before while cmd is held. */
export function boxSelection(
  covered: string[],
  before: ReadonlySet<string>,
  additive: boolean,
): Set<string> {
  return new Set(additive ? [...before, ...covered] : covered);
}

export function sameSelection(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((path) => b.has(path));
}
