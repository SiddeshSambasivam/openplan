/** How far one element under a view was scrolled, by its place in the
 * view's tree. */
export interface ScrollMark {
  index: number;
  top: number;
  left: number;
}

/** Every scrolled element under `root`. Read on leaving a view, so it costs
 * one walk per navigation and nothing while the view is open. */
export function scrollMarks(root: Element): ScrollMark[] {
  const marks: ScrollMark[] = [];
  root.querySelectorAll("*").forEach((element, index) => {
    if (element.scrollTop !== 0 || element.scrollLeft !== 0) {
      marks.push({ index, top: element.scrollTop, left: element.scrollLeft });
    }
  });
  return marks;
}

/** Puts the offsets back once the view has rendered again. A view whose
 * plans changed meanwhile may land a little off, never on an error. */
export function restoreScroll(root: Element, marks: ScrollMark[]): void {
  const elements = root.querySelectorAll("*");
  for (const mark of marks) {
    const element = elements[mark.index];
    if (!element) continue;
    element.scrollTop = mark.top;
    element.scrollLeft = mark.left;
  }
}
