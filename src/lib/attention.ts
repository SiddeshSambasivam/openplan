/** Lets the app ask for the person's attention once while its window is in
 * the background, and again only after the window has been focused. */
export function attentionGate() {
  let requested = false;
  return {
    /** Whether to ask now, given whether the window has focus. */
    take(focused: boolean): boolean {
      if (focused || requested) return false;
      requested = true;
      return true;
    },
    focused() {
      requested = false;
    },
  };
}
