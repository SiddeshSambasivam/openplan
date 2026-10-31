import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { CommentComposer } from "./components/CommentComposer";
import { CommentDraftPopover } from "./components/CommentDraftPopover";
import { CommentHighlightOverlay } from "./components/CommentHighlightOverlay";
import { CommentsPanel } from "./components/CommentsPanel";
import { CommentThreadPopover } from "./components/CommentThreadPopover";
import { DropOverlay } from "./components/DropOverlay";
import type { EditorApi } from "./components/Editor";
import { EmptyState } from "./components/EmptyState";
import { FindBar } from "./components/FindBar";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { TableOfContents, type TocSide } from "./components/TableOfContents";
import { Viewer } from "./components/Viewer";
import { directoryEntryToTree, fileListToTree } from "./lib/browserFs";
import type { CommentThread, PendingDraft } from "./lib/comments";
import { findQuoteRange, lineRangeForSelection } from "./lib/domRange";
import {
  basename,
  classifyPaths,
  displayName,
  isMac,
  isMarkdownPath,
  isTauri,
  MARKDOWN_EXTENSIONS,
  pickFolders,
  pickMarkdownFiles,
  readTextFile,
  scanFolder,
  writeTextFile,
} from "./lib/platform";
import {
  ancestorDirsOf,
  findDocInItems,
  firstDocInItems,
  firstFileOfTree,
  isPathWithin,
  updateInlineDoc,
} from "./lib/tree";
import { isFontSize, FONT_SIZE_SCALES, type FontSize } from "./lib/fontSize";
import {
  isTocVisibility,
  TOC_VISIBILITY_ORDER,
  type TocVisibility,
} from "./lib/toc";
import type { DocFile, FolderNode, LibraryItem, ViewMode } from "./lib/types";
import { useComments } from "./lib/useComments";
import { cn } from "./lib/utils";
import { WELCOME_DOC_ID, WELCOME_MARKDOWN } from "./lib/welcome";
import {
  isContentWidth,
  WIDTH_VALUES,
  type ContentWidth,
} from "./lib/width";

const STORE_ITEMS = "openplan:items";
const STORE_ITEMS_V1 = "openplan:files";
const STORE_ACTIVE = "openplan:active";
const STORE_THEME = "openplan:theme";
const STORE_EXPANDED = "openplan:expanded";
const STORE_SIDEBAR = "openplan:sidebar";
const STORE_SIDEBAR_WIDTH = "openplan:sidebar-width";
const STORE_WIDTH = "openplan:width";
const STORE_FONT_SIZE = "openplan:font-size";
const STORE_TOC_VISIBILITY = "openplan:toc-visibility";
const STORE_TOC_SIDE = "openplan:toc-side";

const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_DEFAULT_WIDTH = 256;
const SIDEBAR_MAX_RATIO = 0.4;

/** Clamp to [SIDEBAR_MIN_WIDTH, 40% of the current window width] — the max
 * is evaluated live so a wide sidebar shrinks along if the window does. */
function clampSidebarWidth(width: number): number {
  const max = Math.max(SIDEBAR_MIN_WIDTH, window.innerWidth * SIDEBAR_MAX_RATIO);
  return Math.min(Math.max(width, SIDEBAR_MIN_WIDTH), max);
}

/** Below this, the TOC's "panel" mode (which assumes room to spare) and the
 * comments panel (normally an in-flow column) both switch to floating over
 * the content instead of permanently claiming layout width from it. */
const NARROW_VIEWPORT_BREAKPOINT = 900;

interface StoredItem {
  kind?: "file" | "folder";
  id: string;
  name: string;
  path?: string;
}

interface PersistedState {
  items: LibraryItem[];
  activeId: string | null;
  expanded: Set<string>;
}

function loadPersisted(): PersistedState {
  const welcome: LibraryItem = {
    kind: "file",
    id: WELCOME_DOC_ID,
    name: "Welcome",
    inline: WELCOME_MARKDOWN,
  };
  try {
    let raw = localStorage.getItem(STORE_ITEMS);
    if (raw == null) {
      // Migrate the v1 flat-files key, if present.
      raw = localStorage.getItem(STORE_ITEMS_V1);
      if (raw != null) localStorage.removeItem(STORE_ITEMS_V1);
    }
    if (raw == null) {
      // First launch: show the welcome document.
      return { items: [welcome], activeId: WELCOME_DOC_ID, expanded: new Set() };
    }
    const stored = JSON.parse(raw) as StoredItem[];
    const items = stored
      .map((s): LibraryItem | null => {
        if (s.id === WELCOME_DOC_ID) return welcome;
        // Path-backed entries are only readable inside the Tauri shell.
        if (!s.path || !isTauri) return null;
        if (s.kind === "folder") {
          return { kind: "folder", id: s.id, name: s.name, path: s.path, tree: null };
        }
        return { kind: "file", id: s.id, name: s.name, path: s.path };
      })
      .filter((s): s is LibraryItem => s !== null);

    let expanded = new Set<string>();
    try {
      const rawExpanded = localStorage.getItem(STORE_EXPANDED);
      if (rawExpanded) expanded = new Set(JSON.parse(rawExpanded) as string[]);
    } catch {
      // ignore — expansion state is cosmetic
    }

    // Folder trees resolve asynchronously after the initial scan, so keep the
    // stored active id if it matches an item or could live inside a stored
    // folder; otherwise fall back to the first item.
    const storedActive = localStorage.getItem(STORE_ACTIVE);
    const plausible =
      storedActive != null &&
      items.some(
        (it) =>
          it.id === storedActive ||
          (it.kind === "folder" && isPathWithin(storedActive, it.path)),
      );
    const activeId = plausible ? storedActive : (items[0]?.id ?? null);
    return { items, activeId, expanded };
  } catch {
    return { items: [welcome], activeId: WELCOME_DOC_ID, expanded: new Set() };
  }
}

export default function App() {
  const initial = useMemo(loadPersisted, []);
  const [items, setItems] = useState<LibraryItem[]>(initial.items);
  const [activeId, setActiveId] = useState<string | null>(initial.activeId);
  const [expanded, setExpanded] = useState<Set<string>>(initial.expanded);
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<ViewMode>("preview");
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      return localStorage.getItem(STORE_SIDEBAR) !== "closed";
    } catch {
      return true;
    }
  });
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const stored = Number(localStorage.getItem(STORE_SIDEBAR_WIDTH));
      return clampSidebarWidth(
        Number.isFinite(stored) && stored > 0 ? stored : SIDEBAR_DEFAULT_WIDTH,
      );
    } catch {
      return SIDEBAR_DEFAULT_WIDTH;
    }
  });
  const [sidebarResizing, setSidebarResizing] = useState(false);
  const [isNarrowViewport, setIsNarrowViewport] = useState(
    () => window.innerWidth < NARROW_VIEWPORT_BREAKPOINT,
  );
  const [contentWidth, setContentWidth] = useState<ContentWidth>(() => {
    try {
      const stored = localStorage.getItem(STORE_WIDTH);
      return stored && isContentWidth(stored) ? stored : "spaced";
    } catch {
      return "spaced";
    }
  });
  const [fontSize, setFontSize] = useState<FontSize>(() => {
    try {
      const stored = localStorage.getItem(STORE_FONT_SIZE);
      return stored && isFontSize(stored) ? stored : "normal";
    } catch {
      return "normal";
    }
  });
  const [tocSide, setTocSide] = useState<TocSide>(() => {
    try {
      return localStorage.getItem(STORE_TOC_SIDE) === "left" ? "left" : "right";
    } catch {
      return "right";
    }
  });
  const [tocVisibility, setTocVisibility] = useState<TocVisibility>(() => {
    try {
      const stored = localStorage.getItem(STORE_TOC_VISIBILITY);
      return stored && isTocVisibility(stored) ? stored : "open";
    } catch {
      return "open";
    }
  });

  const [dirty, setDirty] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  // Bumped on every ⌘F, even while already open, so FindBar can re-focus
  // and re-select its query — pressing ⌘F again shouldn't be a no-op.
  const [findFocusSeq, setFindFocusSeq] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  // The thread shown in a floating "view" popover after clicking its
  // highlight while the panel is CLOSED — mutually exclusive with the panel
  // (see toggleCommentsPanel / the click-to-open handler below).
  const [viewingThreadId, setViewingThreadId] = useState<string | null>(null);
  // The thread the panel should scroll to + briefly emphasize — set when a
  // highlight is clicked while the panel is already OPEN (no popover in
  // that case, the panel just scrolls to it), or when a thread's quote
  // button is clicked from within the panel itself.
  const [focusThreadId, setFocusThreadId] = useState<string | null>(null);
  // Briefly highlighted in the "active" color after jumping to it from the
  // panel's quote button.
  const [flashThreadId, setFlashThreadId] = useState<string | null>(null);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const viewRef = useRef(view);
  viewRef.current = view;
  const loadSeq = useRef(0);
  const lastLoadedId = useRef<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<EditorApi | null>(null);
  const dirtyRef = useRef(false);
  const editGen = useRef(0);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLDivElement>(null);

  const notify = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 2600);
  }, []);

  /* ---------- document loading ---------- */

  const activeDoc = useMemo(
    () => findDocInItems(items, activeId),
    [items, activeId],
  );

  const loadDoc = useCallback(async (doc: DocFile | null, clear: boolean) => {
    const seq = ++loadSeq.current;
    if (!doc) {
      setContent(null);
      setError(null);
      setLoading(false);
      return;
    }
    if (doc.inline != null) {
      setContent(doc.inline);
      setError(null);
      setLoading(false);
      return;
    }
    if (!doc.path) return;
    if (clear) setContent(null);
    setLoading(true);
    try {
      const text = await readTextFile(doc.path);
      if (seq !== loadSeq.current) return;
      setContent(text);
      setError(null);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      setContent(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, []);

  const activeDocId = activeDoc?.id ?? null;
  useEffect(() => {
    const switched = lastLoadedId.current !== activeDocId;
    lastLoadedId.current = activeDocId;
    if (switched) {
      // Any pending edits were flushed (or dropped) by the switcher.
      dirtyRef.current = false;
      setDirty(false);
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
    }
    void loadDoc(
      findDocInItems(itemsRef.current, activeIdRef.current),
      switched,
    );
    if (switched) {
      setFindOpen(false);
      setViewingThreadId(null);
      setFocusThreadId(null);
    }
  }, [activeDocId, reloadKey, loadDoc]);

  // Find only searches the rendered preview — close it if that's no longer
  // what's on screen (editing, or nothing loaded).
  useEffect(() => {
    if (view !== "preview") setFindOpen(false);
  }, [view]);

  /* ---------- comments ---------- */

  const {
    threads: commentThreads,
    addThread,
    addReply,
    setResolved,
    updateComment,
    deleteComment,
  } = useComments(activeDocId, activeDoc?.path);

  const [pendingDraft, setPendingDraft] = useState<PendingDraft | null>(null);

  // Selecting text to comment only makes sense while actually reading the
  // rendered doc — same preview-only scope as Find and the TOC. The Welcome
  // page is excluded too, matching how it's also not editable.
  const canComment =
    view === "preview" &&
    activeDoc != null &&
    activeDoc.id !== WELCOME_DOC_ID &&
    content != null;
  const canCommentRef = useRef(canComment);
  canCommentRef.current = canComment;

  const commentDocLabel = activeDoc?.path ?? activeDoc?.name ?? "";
  const viewingThread = viewingThreadId
    ? (commentThreads.find((t) => t.id === viewingThreadId) ?? null)
    : null;
  // The highlight painted in the darker "active" color — the thread whose
  // popover is currently open, or (briefly) one just jumped to from the panel.
  const activeThreadId = viewingThreadId ?? flashThreadId;

  // Clear a stale draft if it can no longer be composed (doc switched away,
  // left preview, etc.) — matches how findOpen already resets in a sibling
  // effect below.
  useEffect(() => {
    if (!canComment) setPendingDraft(null);
  }, [canComment]);

  /** Captures a selection's anchor into a standalone draft popover — shared
   * by the floating trigger button and the ⇧⌘C shortcut. Deliberately does
   * NOT open the Comments panel: starting a new comment shouldn't force the
   * whole thread list open, just show a small composer next to what you
   * selected. */
  const beginComment = useCallback(
    (quote: string, lineStart: number, lineEnd: number) => {
      setPendingDraft({ quote, lineStart, lineEnd });
    },
    [],
  );

  // Opening the panel (browse-all-threads mode) and showing a single
  // thread's view popover are mutually exclusive surfaces — never show both
  // at once. If a popover was open, its thread carries over as the panel's
  // focus target (scrolled to + emphasized) rather than just vanishing.
  // Composing a NEW draft is deliberately NOT touched here: it's unsaved
  // user input, so an incidental panel-open shouldn't discard it.
  const toggleCommentsPanel = useCallback(() => {
    setCommentsOpen((o) => {
      const next = !o;
      if (next) {
        setViewingThreadId((id) => {
          if (id) setFocusThreadId(id);
          return null;
        });
      }
      return next;
    });
  }, []);

  const beginCommentFromSelection = useCallback(() => {
    const root = articleRef.current;
    const sel = window.getSelection();
    const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    if (!root || !sel || sel.isCollapsed || !range || !root.contains(range.commonAncestorContainer)) {
      // Nothing selected to anchor a new comment to — reveal the panel
      // instead of silently doing nothing.
      toggleCommentsPanel();
      return;
    }
    const quote = sel.toString().trim();
    const lines = lineRangeForSelection(sel, root);
    if (!quote || !lines) {
      toggleCommentsPanel();
      return;
    }
    beginComment(quote, lines.lineStart, lines.lineEnd);
    sel.removeAllRanges();
  }, [beginComment, toggleCommentsPanel]);

  // Submitting just leaves the comment's highlight behind — same as any
  // other saved thread, found either by clicking that highlight or opening
  // the panel manually. No forced panel-open/scroll-to on creation.
  const submitDraft = useCallback(
    (text: string) => {
      if (!pendingDraft) return;
      addThread(pendingDraft.quote, pendingDraft.lineStart, pendingDraft.lineEnd, text);
      setPendingDraft(null);
    },
    [pendingDraft, addThread],
  );

  const cancelDraft = useCallback(() => setPendingDraft(null), []);

  // Scrolls the document to a thread clicked in the panel and briefly
  // flashes its highlight in the "active" color.
  const jumpToThread = useCallback((thread: CommentThread) => {
    const root = articleRef.current;
    if (!root) return;
    const range = findQuoteRange(root, thread.quote, thread.lineStart, thread.lineEnd);
    if (!range) return;
    range.startContainer.parentElement?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    setFlashThreadId(thread.id);
    setTimeout(() => setFlashThreadId((id) => (id === thread.id ? null : id)), 1400);
  }, []);

  // Clicking already-commented (highlighted) text: if the panel is closed,
  // opens a floating "view" popover for just that thread (mutually
  // exclusive with the panel — see toggleCommentsPanel above); if the panel
  // is already open, scrolls it to that thread's card instead (no popover,
  // the thread is already visible in the list). Ignored whenever there's an
  // active, non-collapsed selection: that means the user just finished
  // dragging out a NEW selection (handled by CommentComposer's own
  // listener), not clicking on existing commented text.
  useEffect(() => {
    if (!canComment) return;
    const root = articleRef.current;
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim()) return;
      if (!(e.target instanceof Node) || !root.contains(e.target)) return;
      const caretRange = document.caretRangeFromPoint?.(e.clientX, e.clientY);
      if (!caretRange) return;
      for (const thread of commentThreads) {
        if (thread.resolved) continue;
        const range = findQuoteRange(root, thread.quote, thread.lineStart, thread.lineEnd);
        if (range?.isPointInRange(caretRange.startContainer, caretRange.startOffset)) {
          if (commentsOpen) setFocusThreadId(thread.id);
          else setViewingThreadId(thread.id);
          return;
        }
      }
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [canComment, commentThreads, commentsOpen]);

  const refreshActive = useCallback(() => {
    const doc = findDocInItems(itemsRef.current, activeIdRef.current);
    if (doc?.path) setReloadKey((k) => k + 1);
  }, []);

  /* ---------- editing & saving ---------- */

  /**
   * Persist the edit buffer now (no-op when clean). The buffer snapshot is
   * taken synchronously, so callers may switch documents right after calling
   * this without waiting for the disk write.
   */
  const flushSave = useCallback(async () => {
    if (!dirtyRef.current) return;
    const doc = findDocInItems(itemsRef.current, activeIdRef.current);
    const api = editorRef.current;
    if (!doc || !api) return;
    const text = api.getText();
    const gen = editGen.current;
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    // Keep the newest buffer in memory immediately — even if the disk write
    // fails, the edits survive (shown in preview, retried on next save).
    setContent(text);
    try {
      if (doc.path && isTauri) {
        await writeTextFile(doc.path, text);
      } else if (doc.inline != null) {
        // Browser demo docs live in memory only.
        setItems((prev) => updateInlineDoc(prev, doc.id, text));
      } else {
        return;
      }
      // Only mark clean if nothing changed while the write was in flight.
      if (editGen.current === gen) {
        dirtyRef.current = false;
        setDirty(false);
      }
    } catch (e) {
      notify(`Couldn’t save: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [notify]);

  /** Called by CodeMirror on every buffer change — must stay cheap. */
  const onEditorChange = useCallback(() => {
    editGen.current += 1;
    if (!dirtyRef.current) {
      dirtyRef.current = true;
      setDirty(true);
    }
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      autosaveTimer.current = null;
      void flushSave();
    }, 800);
  }, [flushSave]);

  const canEdit =
    activeDoc != null &&
    activeDoc.id !== WELCOME_DOC_ID &&
    (activeDoc.path != null || activeDoc.inline != null) &&
    error == null;
  const canEnterEdit = canEdit && content != null;
  const canEnterEditRef = useRef(canEnterEdit);
  canEnterEditRef.current = canEnterEdit;

  const toggleEdit = useCallback(() => {
    if (viewRef.current === "edit") {
      void flushSave();
      setView("preview");
    } else if (canEnterEditRef.current) {
      setView("edit");
    }
  }, [flushSave]);

  /* ---------- expansion state ---------- */

  const toggleDir = useCallback((path: string) => {
    setExpanded((old) => {
      const next = new Set(old);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const expandDir = useCallback((path: string) => {
    setExpanded((old) => {
      if (old.has(path)) return old;
      return new Set(old).add(path);
    });
  }, []);

  /* ---------- opening files ---------- */

  /** Add markdown file paths to the library and select the first. */
  const openFilePaths = useCallback((paths: string[]): boolean => {
    if (paths.length === 0) return false;
    void flushSave();
    setItems((prev) => {
      const next = [...prev];
      for (const p of paths) {
        // Skip files already visible somewhere (loose or inside a folder tree).
        if (!findDocInItems(next, p)) {
          next.push({ kind: "file", id: p, name: displayName(p), path: p });
        }
      }
      return next;
    });
    if (activeIdRef.current === paths[0]) {
      setReloadKey((k) => k + 1); // re-read a file that's already open
    } else {
      setActiveId(paths[0]);
      setView("preview");
    }
    return true;
  }, [flushSave]);

  /* ---------- opening folders ---------- */

  /** Scan one folder and update (or error-mark) its library item. */
  const rescanFolderItem = useCallback(async (path: string) => {
    try {
      const result = await scanFolder(path);
      setItems((prev) =>
        prev.map((it) =>
          it.kind === "folder" && it.path === path
            ? {
                ...it,
                tree: result.root,
                truncated: result.truncated,
                error: undefined,
              }
            : it,
        ),
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setItems((prev) =>
        prev.map((it) =>
          it.kind === "folder" && it.path === path
            ? { ...it, tree: null, error: message }
            : it,
        ),
      );
    }
  }, []);

  /** Add folders to the library (Tauri), scanning before insertion. */
  const addFolders = useCallback(
    async (paths: string[], opts: { select?: boolean } = {}) => {
      let shouldSelect = opts.select ?? true;
      if (shouldSelect) void flushSave();
      for (const path of paths) {
        const existing = itemsRef.current.find(
          (it) => it.kind === "folder" && it.path === path,
        );
        if (existing) {
          expandDir(path);
          void rescanFolderItem(path);
          continue;
        }
        try {
          const result = await scanFolder(path);
          if (!result.root) {
            notify(`No Markdown files found in “${basename(path)}”`);
            continue;
          }
          const item: LibraryItem = {
            kind: "folder",
            id: path,
            name: basename(path),
            path,
            tree: result.root,
            truncated: result.truncated,
          };
          setItems((prev) =>
            prev.some((it) => it.kind === "folder" && it.path === path)
              ? prev
              : [...prev, item],
          );
          expandDir(path);
          if (shouldSelect) {
            const first = firstFileOfTree(result.root);
            if (first) {
              // Reveal the doc if it lives in a subfolder.
              ancestorDirsOf(result.root, first.id)?.forEach(expandDir);
              setActiveId(first.id);
              setView("preview");
              shouldSelect = false;
            }
          }
        } catch (e) {
          notify(
            `Couldn’t read folder: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    },
    [expandDir, flushSave, notify, rescanFolderItem],
  );

  /** Add an in-memory folder tree (browser drops / directory picker). */
  const addInlineFolderTree = useCallback(
    (tree: FolderNode) => {
      setItems((prev) => [
        ...prev,
        { kind: "folder", id: tree.path, name: tree.name, path: tree.path, tree },
      ]);
      expandDir(tree.path);
      const first = firstFileOfTree(tree);
      if (first) {
        ancestorDirsOf(tree, first.id)?.forEach(expandDir);
        setActiveId(first.id);
        setView("preview");
      }
    },
    [expandDir],
  );

  /* ---------- dropped paths (Tauri: may be files or folders) ---------- */

  const handleDroppedPaths = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return;
      try {
        const info = await classifyPaths(paths);
        const dirs = info.filter((i) => i.exists && i.isDir).map((i) => i.path);
        const files = info
          .filter((i) => i.exists && !i.isDir)
          .map((i) => i.path);
        const mdFiles = files.filter(isMarkdownPath);
        const skipped = files.length - mdFiles.length;

        const openedFiles = openFilePaths(mdFiles);
        await addFolders(dirs, { select: !openedFiles });

        if (skipped > 0 && (mdFiles.length > 0 || dirs.length > 0)) {
          notify(
            `Skipped ${skipped} ${skipped === 1 ? "file that isn’t" : "files that aren’t"} Markdown`,
          );
        } else if (mdFiles.length === 0 && dirs.length === 0) {
          notify("Only Markdown files and folders can be opened");
        }
      } catch (e) {
        notify(e instanceof Error ? e.message : String(e));
      }
    },
    [addFolders, notify, openFilePaths],
  );

  /* ---------- browser fallback: inline docs ---------- */

  const addInlineDocs = useCallback(
    async (fileList: File[]) => {
      const valid = fileList.filter((f) => isMarkdownPath(f.name));
      if (valid.length === 0) {
        if (fileList.length > 0)
          notify("Only Markdown files and folders can be opened");
        return;
      }
      const docs: LibraryItem[] = [];
      for (const f of valid) {
        docs.push({
          kind: "file",
          id: crypto.randomUUID(),
          name: displayName(f.name),
          inline: await f.text(),
        });
      }
      setItems((prev) => [...prev, ...docs]);
      setActiveId(docs[0].id);
      setView("preview");
    },
    [notify],
  );

  /* ---------- dialogs ---------- */

  const openFileDialog = useCallback(async () => {
    if (isTauri) {
      try {
        const picked = await pickMarkdownFiles();
        if (picked.length > 0) openFilePaths(picked);
      } catch (e) {
        notify(`Couldn’t open the file dialog: ${String(e)}`);
      }
    } else {
      fileInputRef.current?.click();
    }
  }, [openFilePaths, notify]);

  const openFolderDialog = useCallback(async () => {
    if (isTauri) {
      try {
        const picked = await pickFolders();
        if (picked.length > 0) await addFolders(picked);
      } catch (e) {
        notify(`Couldn’t open the folder dialog: ${String(e)}`);
      }
    } else {
      folderInputRef.current?.click();
    }
  }, [addFolders, notify]);

  const onFileInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const picked = Array.from(e.target.files ?? []);
      e.target.value = "";
      void addInlineDocs(picked);
    },
    [addInlineDocs],
  );

  const onFolderInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const picked = Array.from(e.target.files ?? []);
      e.target.value = "";
      void fileListToTree(picked).then((tree) => {
        if (tree) addInlineFolderTree(tree);
        else if (picked.length > 0)
          notify("No Markdown files found in that folder");
      });
    },
    [addInlineFolderTree, notify],
  );

  /* ---------- selection / removal ---------- */

  const selectFile = useCallback(
    (id: string) => {
      if (activeIdRef.current === id) {
        // Clicking the open doc refreshes it — unless it's being edited.
        if (viewRef.current !== "edit") setReloadKey((k) => k + 1);
      } else {
        void flushSave();
        setActiveId(id);
        setView("preview");
      }
    },
    [flushSave],
  );

  const removeItem = useCallback((id: string) => {
    if (activeIdRef.current === id) void flushSave(); // save edits before letting go
    const prev = itemsRef.current;
    const removed = prev.find((it) => it.id === id);
    const next = prev.filter((it) => it.id !== id);
    setItems(next);
    if (removed?.kind === "folder") {
      setExpanded(
        (old) => new Set([...old].filter((p) => !isPathWithin(p, removed.path))),
      );
    }
    if (activeIdRef.current && !findDocInItems(next, activeIdRef.current)) {
      setActiveId(firstDocInItems(next)?.id ?? null);
      setView("preview");
    }
  }, [flushSave]);

  /* ---------- persistence ---------- */

  useEffect(() => {
    const storable = items
      .filter((it) =>
        it.kind === "folder"
          ? !it.path.startsWith("mem:")
          : it.path || it.id === WELCOME_DOC_ID,
      )
      .map(({ kind, id, name, ...rest }) => ({
        kind,
        id,
        name,
        path: "path" in rest ? rest.path : undefined,
      }));
    try {
      localStorage.setItem(STORE_ITEMS, JSON.stringify(storable));
      if (activeId) localStorage.setItem(STORE_ACTIVE, activeId);
      else localStorage.removeItem(STORE_ACTIVE);
    } catch {
      // localStorage unavailable — persistence is best-effort
    }
  }, [items, activeId]);

  useEffect(() => {
    try {
      // Only persist real paths; mem: trees don't survive a reload anyway.
      const paths = [...expanded].filter((p) => !p.startsWith("mem:"));
      localStorage.setItem(STORE_EXPANDED, JSON.stringify(paths));
    } catch {
      // best-effort
    }
  }, [expanded]);

  const toggleSidebar = useCallback(() => setSidebarOpen((o) => !o), []);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_SIDEBAR, sidebarOpen ? "open" : "closed");
    } catch {
      // best-effort
    }
  }, [sidebarOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_SIDEBAR_WIDTH, String(sidebarWidth));
    } catch {
      // best-effort
    }
  }, [sidebarWidth]);

  // Re-clamp if the window shrinks enough that the current width now
  // exceeds 40% of it (also covers a width persisted from a wider display).
  useEffect(() => {
    const onResize = () => setSidebarWidth((w) => clampSidebarWidth(w));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const onResize = () =>
      setIsNarrowViewport(window.innerWidth < NARROW_VIEWPORT_BREAKPOINT);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const sidebarWidthRef = useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;

  const startSidebarResize = useCallback((e: ReactPointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidthRef.current;
    setSidebarResizing(true);
    const onMove = (ev: PointerEvent) => {
      setSidebarWidth(clampSidebarWidth(startWidth + (ev.clientX - startX)));
    };
    const onUp = () => {
      setSidebarResizing(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  const resetSidebarWidth = useCallback(
    () => setSidebarWidth(clampSidebarWidth(SIDEBAR_DEFAULT_WIDTH)),
    [],
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORE_WIDTH, contentWidth);
    } catch {
      // best-effort
    }
  }, [contentWidth]);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_FONT_SIZE, fontSize);
    } catch {
      // best-effort
    }
  }, [fontSize]);

  /** Cycle open -> autohide -> closed -> open. */
  const cycleTocVisibility = useCallback(() => {
    setTocVisibility((current) => {
      const i = TOC_VISIBILITY_ORDER.indexOf(current);
      return TOC_VISIBILITY_ORDER[(i + 1) % TOC_VISIBILITY_ORDER.length];
    });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_TOC_SIDE, tocSide);
    } catch {
      // best-effort
    }
  }, [tocSide]);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_TOC_VISIBILITY, tocVisibility);
    } catch {
      // best-effort
    }
  }, [tocVisibility]);

  /* ---------- initial folder scans ---------- */

  useEffect(() => {
    if (!isTauri) return;
    for (const item of itemsRef.current) {
      if (item.kind === "folder") void rescanFolderItem(item.path);
    }
    // mount-only: rescan persisted folders (StrictMode double-run is harmless)
  }, [rescanFolderItem]);

  /* ---------- theme ---------- */

  const toggleTheme = useCallback(() => {
    setDark((d) => {
      const next = !d;
      document.documentElement.classList.toggle("dark", next);
      try {
        localStorage.setItem(STORE_THEME, next ? "dark" : "light");
      } catch {
        // best-effort
      }
      return next;
    });
  }, []);

  /* ---------- drag & drop (Tauri native) ---------- */

  useEffect(() => {
    if (!isTauri) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      const { getCurrentWebview } = await import("@tauri-apps/api/webview");
      const un = await getCurrentWebview().onDragDropEvent((event) => {
        const kind = event.payload.type;
        if (kind === "enter" || kind === "over") setDragging(true);
        else if (kind === "leave") setDragging(false);
        else if (kind === "drop") {
          setDragging(false);
          void handleDroppedPaths(event.payload.paths);
        }
      });
      if (cancelled) un();
      else unlisten = un;
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [handleDroppedPaths]);

  /* ---------- drag & drop (browser fallback) ---------- */

  useEffect(() => {
    if (isTauri) return;
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.types.includes("Files")) setDragging(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (!e.relatedTarget) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      // webkitGetAsEntry must be called synchronously, before any await.
      const dirEntries: unknown[] = [];
      const looseFiles: File[] = [];
      const dtItems = e.dataTransfer?.items;
      if (dtItems) {
        for (const item of dtItems) {
          const entry = (
            item as DataTransferItem & { webkitGetAsEntry?: () => unknown }
          ).webkitGetAsEntry?.() as { isDirectory?: boolean } | null;
          if (entry?.isDirectory) {
            dirEntries.push(entry);
          } else {
            const f = item.getAsFile?.();
            if (f) looseFiles.push(f);
          }
        }
      } else {
        looseFiles.push(...Array.from(e.dataTransfer?.files ?? []));
      }
      void (async () => {
        if (looseFiles.length > 0) await addInlineDocs(looseFiles);
        for (const entry of dirEntries) {
          const tree = await directoryEntryToTree(entry);
          if (tree) addInlineFolderTree(tree);
          else notify("No Markdown files found in that folder");
        }
      })();
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [addInlineDocs, addInlineFolderTree, notify]);

  /* ---------- browser demo hook: inject a folder tree ---------- */

  useEffect(() => {
    if (isTauri) return;
    const onAddFolder = (e: Event) => {
      const tree = (e as CustomEvent<FolderNode>).detail;
      if (tree) addInlineFolderTree(tree);
    };
    window.addEventListener("openplan:add-folder", onAddFolder);
    return () =>
      window.removeEventListener("openplan:add-folder", onAddFolder);
  }, [addInlineFolderTree]);

  /* ---------- refresh on window focus ---------- */

  const refreshOnFocus = useCallback(() => {
    // While editing, the buffer owns the document — don't reload from disk.
    if (viewRef.current !== "edit") refreshActive();
    if (!isTauri) return;
    for (const item of itemsRef.current) {
      if (item.kind === "folder" && !item.path.startsWith("mem:")) {
        void rescanFolderItem(item.path);
      }
    }
  }, [refreshActive, rescanFolderItem]);

  useEffect(() => {
    if (isTauri) {
      let unlisten: (() => void) | undefined;
      let cancelled = false;
      void (async () => {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const un = await getCurrentWindow().onFocusChanged(({ payload }) => {
          if (payload) refreshOnFocus();
          else void flushSave(); // save when the window loses focus
        });
        if (cancelled) un();
        else unlisten = un;
      })();
      return () => {
        cancelled = true;
        unlisten?.();
      };
    }
    const onFocus = () => refreshOnFocus();
    const onBlur = () => void flushSave();
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, [refreshOnFocus, flushSave]);

  /* ---------- save on window close (Tauri) ---------- */

  useEffect(() => {
    if (!isTauri) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const un = await getCurrentWindow().onCloseRequested(async (event) => {
        if (!dirtyRef.current) return;
        event.preventDefault();
        await flushSave();
        void getCurrentWindow().destroy();
      });
      if (cancelled) un();
      else unlisten = un;
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [flushSave]);

  /* ---------- keyboard shortcuts ---------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "o") {
        e.preventDefault();
        if (e.shiftKey) void openFolderDialog();
        else void openFileDialog();
      } else if (key === "b" && !e.shiftKey) {
        e.preventDefault();
        toggleSidebar();
      } else if (key === "s" && !e.shiftKey) {
        e.preventDefault();
        void flushSave();
      } else if (key === "e" && !e.shiftKey) {
        e.preventDefault();
        toggleEdit();
      } else if (key === "l" && e.shiftKey) {
        e.preventDefault();
        toggleTheme();
      } else if (key === "t" && e.shiftKey) {
        e.preventDefault();
        cycleTocVisibility();
      } else if (key === "f" && !e.shiftKey) {
        // Editing has its own find (CodeMirror's built-in panel, bound via
        // searchKeymap on the editor itself) — don't intercept there.
        if (viewRef.current === "preview") {
          e.preventDefault();
          setFindOpen(true);
          setFindFocusSeq((s) => s + 1);
        }
      } else if (key === "c" && e.shiftKey) {
        if (canCommentRef.current) {
          e.preventDefault();
          beginCommentFromSelection();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    openFileDialog,
    openFolderDialog,
    beginCommentFromSelection,
    toggleSidebar,
    flushSave,
    toggleEdit,
    toggleTheme,
    cycleTocVisibility,
  ]);

  useEffect(() => {
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, []);

  /* ---------- render ---------- */

  const wordCount = useMemo(() => {
    if (content == null) return null;
    return content.split(/\s+/).filter(Boolean).length;
  }, [content]);

  const showToc =
    view === "preview" &&
    activeDoc != null &&
    content != null &&
    tocVisibility !== "closed";
  // A floating TOC would sit on top of the text once it spans full width —
  // give it its own column instead. autohide stays an overlay: it's only
  // ever transiently visible, so a brief overlap on hover is fine. Panel
  // mode assumes room to spare, so it's suppressed on narrow viewports even
  // if the width setting would otherwise call for it.
  const tocIsPanel =
    showToc && tocVisibility === "open" && contentWidth === "full" && !isNarrowViewport;
  // Narrowed for TableOfContents' prop type; only used once showToc/tocIsPanel
  // have already ruled out "closed".
  const openTocVisibility: Exclude<TocVisibility, "closed"> =
    tocVisibility === "closed" ? "open" : tocVisibility;

  const sidebarInsetPx = sidebarOpen ? sidebarWidth : 0;
  // Matches the panel's own `w-80` — pushes the floating right-side TOC
  // clear of it (open or overlay, either way it visually claims that edge).
  const commentsInsetPx = commentsOpen ? 320 : 0;
  const openCommentCount = commentThreads.filter((t) => !t.resolved).length;

  return (
    <div className="flex h-full w-full overflow-hidden bg-background text-foreground">
      <div
        className={cn(
          "h-full shrink-0 overflow-hidden",
          !sidebarResizing && "transition-[width] duration-200 ease-in-out",
        )}
        style={{ width: sidebarOpen ? sidebarWidth : 0 }}
        aria-hidden={!sidebarOpen}
      >
        <Sidebar
          items={items}
          activeId={activeDocId}
          expanded={expanded}
          onToggleDir={toggleDir}
          onSelect={selectFile}
          onRemove={removeItem}
          onOpenFileDialog={() => void openFileDialog()}
          onOpenFolderDialog={() => void openFolderDialog()}
          padTop={isTauri && isMac}
        />
      </div>

      {sidebarOpen && (
        <div
          onPointerDown={startSidebarResize}
          onDoubleClick={resetSidebarWidth}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          title="Drag to resize, double-click to reset"
          className="group relative z-10 flex w-2.5 shrink-0 cursor-col-resize touch-none items-stretch justify-center"
        >
          <div
            className={cn(
              "w-px bg-transparent transition-colors group-hover:bg-ring",
              sidebarResizing && "bg-ring",
            )}
          />
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <Header
          doc={activeDoc}
          wordCount={activeDoc ? wordCount : null}
          view={view}
          canEdit={canEnterEdit}
          dirty={dirty}
          onToggleView={toggleEdit}
          dark={dark}
          onToggleTheme={toggleTheme}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={toggleSidebar}
          contentWidth={contentWidth}
          onContentWidthChange={setContentWidth}
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
          tocVisibility={tocVisibility}
          onTocVisibilityChange={setTocVisibility}
          onOpenFind={() => {
            setFindOpen(true);
            setFindFocusSeq((s) => s + 1);
          }}
          commentsOpen={commentsOpen}
          onToggleComments={toggleCommentsPanel}
          openCommentCount={openCommentCount}
          trafficLightGap={isTauri && isMac}
        />
        <div className="flex min-h-0 flex-1">
          {tocIsPanel && tocSide === "left" && (
            <TableOfContents
              mode="panel"
              articleRef={articleRef}
              scrollRef={scrollRef}
              watch={content}
              side={tocSide}
              onSideChange={setTocSide}
              visibility="open"
              leftInset={sidebarInsetPx}
              rightInset={commentsInsetPx}
            />
          )}
          <div
            ref={scrollRef}
            style={
              {
                "--content-max-width": WIDTH_VALUES[contentWidth],
                "--content-font-scale": FONT_SIZE_SCALES[fontSize],
              } as CSSProperties
            }
            className={cn(
              "relative min-h-0 flex-1",
              view === "edit" && activeDoc && content != null
                ? "overflow-hidden"
                : "overflow-y-auto",
            )}
          >
            {activeDoc ? (
              <Viewer
                doc={activeDoc}
                content={content}
                error={error}
                loading={loading}
                view={view}
                canEdit={canEnterEdit}
                editorRef={editorRef}
                articleRef={articleRef}
                dark={dark}
                onEditorChange={onEditorChange}
                onEnterEdit={toggleEdit}
                onRetry={() => setReloadKey((k) => k + 1)}
                onRemove={() => removeItem(activeDoc.id)}
              />
            ) : (
              <EmptyState
                onOpenFileDialog={() => void openFileDialog()}
                onOpenFolderDialog={() => void openFolderDialog()}
              />
            )}
            {canComment && (
              <CommentHighlightOverlay
                articleRef={articleRef}
                scrollRef={scrollRef}
                threads={commentThreads}
                pendingDraft={pendingDraft}
                activeThreadId={activeThreadId}
              />
            )}
          </div>
          {tocIsPanel && tocSide === "right" && (
            <TableOfContents
              mode="panel"
              articleRef={articleRef}
              scrollRef={scrollRef}
              watch={content}
              side={tocSide}
              onSideChange={setTocSide}
              visibility="open"
              leftInset={sidebarInsetPx}
              rightInset={commentsInsetPx}
            />
          )}
        </div>
      </main>

      <CommentsPanel
        open={commentsOpen}
        threads={commentThreads}
        docLabel={commentDocLabel}
        focusThreadId={focusThreadId}
        overlay={isNarrowViewport}
        onClose={() => setCommentsOpen(false)}
        onReply={addReply}
        onToggleResolved={setResolved}
        onEditComment={updateComment}
        onDeleteComment={deleteComment}
        onJumpToThread={jumpToThread}
      />

      {pendingDraft && (
        <CommentDraftPopover
          draft={pendingDraft}
          articleRef={articleRef}
          scrollRef={scrollRef}
          onSubmit={submitDraft}
          onCancel={cancelDraft}
        />
      )}

      {viewingThread && (
        <CommentThreadPopover
          thread={viewingThread}
          articleRef={articleRef}
          scrollRef={scrollRef}
          onReply={(text) => addReply(viewingThread.id, text)}
          onToggleResolved={() => setResolved(viewingThread.id, !viewingThread.resolved)}
          onEditComment={(commentId, text) => updateComment(viewingThread.id, commentId, text)}
          onDeleteComment={(commentId) => deleteComment(viewingThread.id, commentId)}
          onClose={() => setViewingThreadId(null)}
        />
      )}

      {showToc && !tocIsPanel && (
        <TableOfContents
          mode="floating"
          articleRef={articleRef}
          scrollRef={scrollRef}
          watch={content}
          side={tocSide}
          onSideChange={setTocSide}
          visibility={openTocVisibility}
          leftInset={sidebarInsetPx}
          rightInset={commentsInsetPx}
        />
      )}

      <FindBar
        articleRef={articleRef}
        open={findOpen}
        focusSeq={findFocusSeq}
        onClose={() => setFindOpen(false)}
      />

      <CommentComposer
        articleRef={articleRef}
        scrollRef={scrollRef}
        enabled={canComment}
        suppressed={pendingDraft != null}
        onBegin={beginComment}
      />
      {dragging && <DropOverlay />}

      {notice && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-border bg-popover px-4 py-2 text-sm text-popover-foreground shadow-md">
          {notice}
        </div>
      )}

      {!isTauri && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            multiple
            accept={MARKDOWN_EXTENSIONS.map((e) => `.${e}`).join(",")}
            onChange={onFileInputChange}
          />
          <input
            ref={folderInputRef}
            type="file"
            hidden
            onChange={onFolderInputChange}
            {...({ webkitdirectory: "", directory: "" } as Record<
              string,
              string
            >)}
          />
        </>
      )}
    </div>
  );
}
