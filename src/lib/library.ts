import { isTauri } from "./platform";
import { STORAGE_PREFIX } from "./storage";
import { isPathWithin } from "./tree";
import type { LibraryItem, MainView } from "./types";

export const STORE_ITEMS = `${STORAGE_PREFIX}items`;
export const STORE_ACTIVE = `${STORAGE_PREFIX}active`;
export const STORE_EXPANDED = `${STORAGE_PREFIX}expanded`;
export const STORE_MAIN_VIEW = `${STORAGE_PREFIX}main-view`;
const STORE_ITEMS_V1 = `${STORAGE_PREFIX}files`;

const MAIN_VIEWS: MainView[] = ["board", "list", "for-you", "plan"];

export interface Library {
  items: LibraryItem[];
  activeId: string | null;
  expanded: Set<string>;
}

interface StoredItem {
  kind?: "file" | "folder";
  id: string;
  name: string;
  path?: string;
}

/**
 * The files and folders a person added, and the document they had open.
 * A first launch has neither, so the plan page shows its empty state.
 */
export function loadLibrary(
  storage: Storage = localStorage,
  readsPaths: boolean = isTauri,
): Library {
  const empty: Library = { items: [], activeId: null, expanded: new Set() };
  try {
    let raw = storage.getItem(STORE_ITEMS);
    if (raw == null) {
      // Migrate the v1 flat-files key, if present.
      raw = storage.getItem(STORE_ITEMS_V1);
      if (raw != null) storage.removeItem(STORE_ITEMS_V1);
    }
    if (raw == null) return empty;
    const stored = JSON.parse(raw) as StoredItem[];
    const items = stored
      .map((s): LibraryItem | null => {
        // Path-backed entries are only readable inside the Tauri shell.
        if (!s.path || !readsPaths) return null;
        if (s.kind === "folder") {
          return { kind: "folder", id: s.id, name: s.name, path: s.path, tree: null };
        }
        return { kind: "file", id: s.id, name: s.name, path: s.path };
      })
      .filter((s): s is LibraryItem => s !== null);

    // Folder trees resolve asynchronously after the initial scan, so keep the
    // stored active id if it matches an item or could live inside a stored
    // folder; otherwise fall back to the first item.
    const storedActive = storage.getItem(STORE_ACTIVE);
    const plausible =
      storedActive != null &&
      items.some(
        (it) =>
          it.id === storedActive ||
          (it.kind === "folder" && isPathWithin(storedActive, it.path)),
      );
    const activeId = plausible ? storedActive : (items[0]?.id ?? null);
    return { items, activeId, expanded: loadExpanded(storage) };
  } catch {
    return empty;
  }
}

/** The surface that was open last, or the plan page. */
export function initialMainView(storage: Storage = localStorage): MainView {
  try {
    const stored = storage.getItem(STORE_MAIN_VIEW);
    if (stored && (MAIN_VIEWS as string[]).includes(stored)) return stored as MainView;
  } catch {
    // best-effort
  }
  return "plan";
}

function loadExpanded(storage: Storage): Set<string> {
  try {
    const raw = storage.getItem(STORE_EXPANDED);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    // ignore — expansion state is cosmetic
    return new Set();
  }
}
