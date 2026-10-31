/** The parts of an element the guard reads, so it can be checked without a
 * browser. */
export interface MenuTarget {
  tagName: string;
  isContentEditable?: boolean;
  classList?: { contains(name: string): boolean };
  parentElement: MenuTarget | null;
}

/** Whether a right-click keeps the webview's own menu: where text is edited,
 * inside the editor, or while text is selected, so Copy and Paste still work. */
export function keepsNativeMenu(target: MenuTarget | null, selectedText: string): boolean {
  if (selectedText.trim() !== "") return true;
  for (let node = target; node; node = node.parentElement) {
    if (
      TEXT_TAGS.includes(node.tagName) ||
      node.isContentEditable === true ||
      node.classList?.contains(EDITOR_CLASS)
    ) {
      return true;
    }
  }
  return false;
}

/** Hides the webview's menu, which offers Reload, everywhere else. The app's
 * own menus open from their triggers. */
export function guardContextMenu(doc: Document): () => void {
  const onMenu = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!keepsNativeMenu(target, doc.getSelection()?.toString() ?? "")) event.preventDefault();
  };
  doc.addEventListener("contextmenu", onMenu);
  return () => doc.removeEventListener("contextmenu", onMenu);
}

const TEXT_TAGS = ["INPUT", "TEXTAREA"];

const EDITOR_CLASS = "cm-editor";
