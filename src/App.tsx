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
import { CommandPalette, type OverlayHandle } from "./components/CommandPalette";
import { DropOverlay } from "./components/DropOverlay";
import type { EditorApi } from "./components/Editor";
import { Loader2 } from "lucide-react";
import { EmptyState } from "./components/EmptyState";
import { FindBar } from "./components/FindBar";
import { Header } from "./components/Header";
import { ShortcutSheet } from "./components/ShortcutSheet";
import { Sidebar } from "./components/Sidebar";
import { PlanMetaBar } from "./components/PlanMetaBar";
import { HistoryPanel } from "./features/history/HistoryPanel";
import { SettingsDialog } from "./features/settings/SettingsDialog";
import { Onboarding } from "./features/onboarding/Onboarding";
import { CommentComposer } from "./features/comments/CommentComposer";
import { CommentsLayer, type AnchorState } from "./features/comments/CommentsLayer";
import { CommentsPanel } from "./features/comments/CommentsPanel";
import { useComments } from "./features/comments/useComments";
import { blocksForRange } from "./lib/anchors";
import type { CommentThread, Identity } from "./lib/comments";
import { Outline } from "./components/Outline";
import { Viewer } from "./components/Viewer";
import { directoryEntryToTree, fileListToTree } from "./lib/browserFs";
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
import {
  initialMainView,
  loadLibrary,
  STORE_ACTIVE,
  STORE_EXPANDED,
  STORE_ITEMS,
  STORE_MAIN_VIEW,
} from "./lib/library";
import {
  loadNavbarMode,
  NAVBAR_OVERLAY_BREAKPOINT,
  navbarLayout,
  navbarSections,
  pressNavbarKey,
  RAIL_WIDTH,
  saveNavbarMode,
  topBarGap,
  type NavbarState,
} from "./lib/navbar";
import { isFontSize, FONT_SIZE_SCALES, type FontSize } from "./lib/fontSize";
import type {
  DocFile,
  FolderNode,
  LibraryItem,
  MainView,
  ViewMode,
} from "./lib/types";
import { splitFrontmatter } from "./lib/frontmatter";
import { isHtmlPath } from "./lib/htmlDoc";
import { useOutline } from "./lib/useOutline";
import { deliveryLine, useLiveSessions } from "./lib/liveSessions";
import { usePlanBase } from "./lib/usePlanBase";
import {
  archiveStale,
  commitBase,
  getIdentity,
  getPreferences,
  renamePlan,
  renameDocument,
  reviewSummaries,
  sendAlign,
  setArchiveAfterDays,
  setFolders,
  setMedia,
  setPlanStatus,
  type Preferences,
  type Status,
  SOURCE_LABELS,
  type PlanSummary,
} from "./lib/planBase";
import { forYou, planCrumb, steppedPlan, viewOrder, type ReviewSummary } from "./lib/board";
import { useShortcuts, type ShortcutHandlers } from "./lib/shortcuts";
import { listWorkProgress, offersCompletion, type TodoCount } from "./lib/work";
import { useWorkRecord } from "./features/plan/useWorkRecord";
import { filterByFolder, type FolderFilter } from "./lib/folders";
import { loadRecent, pushRecent, saveRecent } from "./lib/recent";
import { BoardView } from "./features/board/BoardView";
import { ForYouView } from "./features/board/ForYouView";
import { ListView } from "./features/board/ListView";
import { cn } from "./lib/utils";
import {
  isContentWidth,
  WIDTH_VALUES,
  type ContentWidth,
} from "./lib/width";

const STORE_THEME = "openplan:theme";
const STORE_SIDEBAR_WIDTH = "openplan:sidebar-width";
const STORE_WIDTH = "openplan:width";
const STORE_FONT_SIZE = "openplan:font-size";
const STORE_OUTLINE = "openplan:outline";
const STORE_FOLDER = "openplan:folder";

const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_DEFAULT_WIDTH = 240;
const SIDEBAR_MAX_WIDTH = 320;

function clampSidebarWidth(width: number): number {
  return Math.min(Math.max(width, SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH);
}

/** The main area needs at least this much room to give the outline a column
 * of its own and still leave a comfortable reading measure beside it. */
const OUTLINE_COLUMN_MIN_WIDTH = 760;

export default function App() {
  const initial = useMemo(() => loadLibrary(), []);
  const [items, setItems] = useState<LibraryItem[]>(initial.items);
  const [activeId, setActiveId] = useState<string | null>(initial.activeId);
  const [expanded, setExpanded] = useState<Set<string>>(initial.expanded);
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<ViewMode>("preview");
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // One line under the top bar's buttons, gone a moment later: whether a
  // review or an align event reached a session. Nothing else needs saying
  // after an action, so there is no toast to build on.
  const [sendNotice, setSendNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );
  const [navbar, setNavbar] = useState<NavbarState>(() => ({
    mode: loadNavbarMode(),
    revealed: false,
  }));
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
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [contentWidth, setContentWidth] = useState<ContentWidth>(() => {
    try {
      const stored = localStorage.getItem(STORE_WIDTH);
      return stored && isContentWidth(stored) ? stored : "compact";
    } catch {
      return "compact";
    }
  });
  const [fontSize, setFontSize] = useState<FontSize>(() => {
    try {
      const stored = localStorage.getItem(STORE_FONT_SIZE);
      return stored && isFontSize(stored) ? stored : "small";
    } catch {
      return "small";
    }
  });
  const [outlineOpen, setOutlineOpen] = useState(() => {
    try {
      return localStorage.getItem(STORE_OUTLINE) !== "closed";
    } catch {
      return true;
    }
  });
  // A floating outline covers the text it describes, so — unlike the column,
  // whose open state is a saved preference — it is only ever shown on
  // purpose, and never carries over from a wider window.
  const [floatingOutlineOpen, setFloatingOutlineOpen] = useState(false);

  // Which surface is on screen. There is no router: the app is one window
  // with one main area, and the last one open is where you come back to.
  const [mainView, setMainView] = useState<MainView>(() => initialMainView());
  const [chosenFolder, setChosenFolder] = useState<FolderFilter>(() => {
    try {
      return localStorage.getItem(STORE_FOLDER);
    } catch {
      return null;
    }
  });
  const [recentPaths, setRecentPaths] = useState<string[]>(loadRecent);
  const [summaries, setSummaries] = useState<ReviewSummary[]>([]);

  const { base, plans, refresh: refreshPlans, arrivals } = usePlanBase();
  const sessions = useLiveSessions();

  const [preferences, setPreferences] = useState<Preferences>({
    media: false,
    archiveAfterDays: 7,
  });
  useEffect(() => {
    void getPreferences()
      .then(setPreferences)
      .catch(() => {});
  }, []);
  const changeMedia = useCallback((media: boolean) => {
    setPreferences((p) => ({ ...p, media }));
    void setMedia(media);
  }, []);
  const changeArchiveAfterDays = useCallback((archiveAfterDays: number) => {
    setPreferences((p) => ({ ...p, archiveAfterDays }));
    void setArchiveAfterDays(archiveAfterDays);
  }, []);

  // Completed plans are put away on launch and each time the board comes
  // into view. Never on a timer, and never on a watcher event.
  const onBoard = mainView === "board";
  const launched = useRef(false);
  useEffect(() => {
    if (launched.current && !onBoard) return;
    launched.current = true;
    void archiveStale()
      .then((archived) => archived > 0 && refreshPlans())
      .catch(() => {});
  }, [onBoard, refreshPlans]);

  // The open threads are read with the plans, on the same base-changed
  // event: nothing polls, and a build without the command just shows none.
  useEffect(() => {
    void reviewSummaries()
      .then(setSummaries)
      .catch(() => setSummaries([]));
  }, [plans]);
  // Todo progress for every card, read the same way: one call per change.
  const [workProgress, setWorkProgress] = useState<Map<string, TodoCount>>(new Map());
  useEffect(() => {
    void listWorkProgress(plans.map((plan) => plan.path))
      .then((found) => setWorkProgress(new Map(found.map((p) => [p.path, p]))))
      .catch(() => setWorkProgress(new Map()));
  }, [plans]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [focusThreadId, setFocusThreadId] = useState<string | null>(null);
  const [anchorStates, setAnchorStates] = useState<Record<string, AnchorState>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const paletteRef = useRef<OverlayHandle>(null);
  const sheetRef = useRef<OverlayHandle>(null);
  // The two pickers their keys open; the header and the plan page own the
  // menus themselves.
  const [statusOpen, setStatusOpen] = useState(false);
  const [foldersOpen, setFoldersOpen] = useState(false);
  // null until the answer is known, so the wizard neither flashes for people
  // who have been here before nor gets skipped for people who haven't.
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isTauri) {
      setNeedsOnboarding(false);
      return;
    }
    void import("@tauri-apps/api/core").then(({ invoke }) =>
      invoke<{ onboarded: boolean }>("app_settings")
        .then((s) => setNeedsOnboarding(!s.onboarded))
        .catch(() => setNeedsOnboarding(false)),
    );
  }, []);

  const finishOnboarding = useCallback(
    (name: string | null) => {
      void import("@tauri-apps/api/core").then(({ invoke }) =>
        invoke("complete_onboarding", { name }).then(() => {
          setNeedsOnboarding(false);
          refreshPlans();
        }),
      );
    },
    [refreshPlans],
  );

  const [dirty, setDirty] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  // Bumped on every ⌘F, even while already open, so FindBar can re-focus
  // and re-select its query — pressing ⌘F again shouldn't be a no-op.
  const [findFocusSeq, setFindFocusSeq] = useState(0);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const viewRef = useRef(view);
  viewRef.current = view;
  const loadSeq = useRef(0);
  const lastLoadedId = useRef<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const basePathRef = useRef<string | null>(null);
  basePathRef.current = base?.root ?? null;
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

  const loadDoc = useCallback(async (doc: DocFile | null) => {
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
    // The document being left stays on screen, blurred, until the next one
    // arrives — clearing it first is what made switching feel like a jolt.
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

  // Reading one document of a set is still reading that plan, so its status
  // and history stay in reach rather than vanishing on the way in.
  const activePlan = useMemo(() => {
    const path = activeDoc?.path;
    if (!path) return null;
    return (
      plans.find((plan) => plan.path === path) ??
      plans.find(
        (plan) =>
          plan.documents.length > 0 &&
          path.startsWith(plan.path.slice(0, plan.path.lastIndexOf("/") + 1)),
      ) ??
      null
    );
  }, [plans, activeDoc?.path]);

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
    void loadDoc(findDocInItems(itemsRef.current, activeIdRef.current));
    if (switched) setFindOpen(false);
  }, [activeDocId, reloadKey, loadDoc]);

  // Find only searches the rendered preview — close it if that's no longer
  // what's on screen (editing, or nothing loaded).
  useEffect(() => {
    if (view !== "preview") setFindOpen(false);
  }, [view]);

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
    // Whatever was above the text goes back exactly as it was.
    const text = planHeaderRef.current + api.getText();
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
      if (doc.path && basePathRef.current && doc.path.startsWith(basePathRef.current)) {
        void commitBase(`edit: ${doc.name}`);
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
    setMainView("plan");
    if (activeIdRef.current === paths[0]) {
      setReloadKey((k) => k + 1); // re-read a file that's already open
    } else {
      setActiveId(paths[0]);
      setView("preview");
    }
    return true;
  }, [flushSave]);

  const selectPlan = useCallback(
    (plan: PlanSummary) => {
      openFilePaths([plan.path]);
    },
    [openFilePaths],
  );

  /** Opens one document of a set. The set's folder is its entry point's. */
  const selectDocument = useCallback(
    (plan: PlanSummary, document: string) => {
      const folder = plan.path.slice(0, plan.path.lastIndexOf("/"));
      openFilePaths([`${folder}/${document}`]);
    },
    [openFilePaths],
  );

  const changeStatus = useCallback(
    (status: Status) => {
      if (!activePlan) return;
      const plan = activePlan;
      void setPlanStatus(plan.path, status).then(async () => {
        refreshPlans();
        // Setting alignment is the person handing the plan back: the
        // session on it starts asking its questions.
        if (status === "alignment") setSendNotice(deliveryLine(await sendAlign(plan.id)));
      });
    },
    [activePlan, refreshPlans],
  );

  // Read only while it can matter: a plan in review waits on its PRs.
  const reviewRecord = useWorkRecord(
    activePlan?.status === "in-review" ? activePlan.path : null,
  );
  const offerCompletion = activePlan != null && offersCompletion(activePlan.status, reviewRecord);

  const changeFolders = useCallback(
    (plan: PlanSummary, folders: string[]) => {
      void setFolders(plan.path, folders).then(refreshPlans);
    },
    [refreshPlans],
  );

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
      setMainView("plan");
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
        it.kind === "folder" ? !it.path.startsWith("mem:") : it.path,
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

  useEffect(() => {
    if (arrivals.length === 0 || needsOnboarding) return;
    const [first] = arrivals;
    const who = SOURCE_LABELS[first.source] ?? first.source;
    notify(
      arrivals.length === 1
        ? `New plan from ${who}: ${first.title}`
        : `${arrivals.length} new plans`,
    );
  }, [arrivals, needsOnboarding, notify]);

  // A narrow window has no room for the expanded navbar beside the main
  // area, so it keeps the minimized column and the expanded navbar floats.
  const narrow = viewportWidth < NAVBAR_OVERLAY_BREAKPOINT;
  const layout = navbarLayout(navbar.mode, narrow);
  const navbarExpanded = layout === "expanded" || navbar.revealed;
  const toggleSidebar = useCallback(
    () => setNavbar((state) => pressNavbarKey(state, narrow)),
    [narrow],
  );
  const concealNavbar = useCallback(
    () => setNavbar((state) => ({ ...state, revealed: false })),
    [],
  );
  // Crossing the breakpoint changes what floats; a reveal from the other
  // side must not linger.
  useEffect(() => concealNavbar(), [narrow, concealNavbar]);
  useEffect(() => saveNavbarMode(navbar.mode), [navbar.mode]);
  const navbarWidth = layout === "expanded" ? sidebarWidth : RAIL_WIDTH;

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
    const onResize = () => {
      setViewportWidth(window.innerWidth);
      setSidebarWidth((w) => clampSidebarWidth(w));
    };
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

  // Whether there is room for the outline to have a column of its own; when
  // there isn't, it floats instead, and the two have separate open states.
  const outlineOverlays =
    viewportWidth - navbarWidth < OUTLINE_COLUMN_MIN_WIDTH;
  const outlineShown = outlineOverlays ? floatingOutlineOpen : outlineOpen;
  const toggleOutline = useCallback(() => {
    if (outlineOverlays) setFloatingOutlineOpen((o) => !o);
    else setOutlineOpen((o) => !o);
  }, [outlineOverlays]);
  const closeOutline = useCallback(() => setFloatingOutlineOpen(false), []);
  const { items: outlineItems, activeId: outlineActiveId } = useOutline(
    articleRef,
    scrollRef,
    content,
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORE_OUTLINE, outlineOpen ? "open" : "closed");
    } catch {
      // best-effort
    }
  }, [outlineOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_MAIN_VIEW, mainView);
      if (chosenFolder == null) localStorage.removeItem(STORE_FOLDER);
      else localStorage.setItem(STORE_FOLDER, chosenFolder);
    } catch {
      // best-effort
    }
  }, [mainView, chosenFolder]);

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

  // macOS hides the traffic lights in fullscreen; the room the sidebar and
  // header reserve for them goes with them.
  const [identity, setIdentity] = useState<Identity | null>(null);
  useEffect(() => {
    void getIdentity().then(setIdentity).catch(() => {});
  }, []);

  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    if (!isTauri) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      const check = () =>
        void win.isFullscreen().then((f) => {
          if (!cancelled) setFullscreen(f);
        });
      check();
      const un = await win.onResized(check);
      if (cancelled) un();
      else unlisten = un;
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
  const windowControls = isTauri && isMac && !fullscreen;

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

  useEffect(() => {
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, []);

  /* ---------- render ---------- */

  // A plan's metadata is the app's bookkeeping: shown as a header, never as
  // the opening paragraph, and never something to edit by hand. Both reading
  // and editing see the text below it, and the block is put back on save.
  const { header: planHeader, body: planBody } = useMemo(
    () =>
      content != null && activePlan
        ? splitFrontmatter(content)
        : { header: "", body: content ?? "" },
    [content, activePlan],
  );
  const planHeaderRef = useRef("");
  planHeaderRef.current = planHeader;
  // Threads store file lines; the renderer sees the stripped body. The
  // header's line count is the constant between the two.
  const commentLineOffset =
    planHeader === "" ? 0 : planHeader.split("\n").length - 1;

  // Comments anchor to markdown source lines, so an HTML plan has none.
  const canComment =
    view === "preview" &&
    activeDoc?.path != null &&
    !isHtmlPath(activeDoc.path) &&
    content != null;
  const commentsDoc = canComment ? (activeDoc?.path ?? null) : null;
  const {
    threads: commentThreads,
    pendingCount: pendingCommentCount,
    addThread,
    reply: replyToThread,
    setResolved: setThreadResolved,
    removeThread,
    sendReview,
  } = useComments(commentsDoc, identity, activePlan?.id ?? null);
  const openCommentCount = commentThreads.filter(
    (t) => !t.resolved && !t.pending,
  ).length;

  const onSendReview = useCallback(() => {
    void sendReview()
      .then(({ threads, sessions }) => {
        if (threads === 0) return;
        setSendNotice(deliveryLine(sessions));
      })
      .catch(() => setSendNotice("Could not send. Your comments are saved."));
  }, [sendReview]);

  useEffect(() => {
    if (!sendNotice) return;
    const timer = setTimeout(() => setSendNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [sendNotice]);

  const toggleComments = useCallback(() => setCommentsOpen((open) => !open), []);
  const closeComments = useCallback(() => {
    setCommentsOpen(false);
    setFocusThreadId(null);
  }, []);
  const toggleHistory = useCallback(() => setHistoryOpen((open) => !open), []);
  const openFind = useCallback(() => {
    setFindOpen(true);
    setFindFocusSeq((s) => s + 1);
  }, []);

  const openThread = useCallback((threadId: string) => {
    setCommentsOpen(true);
    setFocusThreadId(threadId);
  }, []);

  const jumpToThread = useCallback(
    (thread: CommentThread) => {
      const article = articleRef.current;
      if (!article) return;
      const [block] = blocksForRange(article, thread, commentLineOffset);
      block?.scrollIntoView({ behavior: "smooth", block: "center" });
      setFocusThreadId(thread.id);
    },
    [commentLineOffset],
  );

  const handleRename = useCallback(
    (plan: PlanSummary, newTitle: string) => {
      void renamePlan(plan.path, newTitle).then((newPath) => {
        refreshPlans();
        if (activeIdRef.current === plan.path || activeIdRef.current?.startsWith(plan.path)) {
          openFilePaths([newPath]);
        }
      });
    },
    [refreshPlans, openFilePaths],
  );

  const handleRenameDocument = useCallback(
    (plan: PlanSummary, document: string, newName: string) => {
      const folder = plan.path.slice(0, plan.path.lastIndexOf("/") + 1);
      const docPath = folder + document;
      void renameDocument(docPath, newName)
        .then((newPath) => {
          refreshPlans();
          if (activeIdRef.current === docPath) openFilePaths([newPath]);
        })
        .catch((err) => notify(String(err)));
    },
    [refreshPlans, openFilePaths, notify],
  );

  /* ---------- the views ---------- */

  const activePlanPath = activePlan?.path ?? null;
  useEffect(() => {
    if (!activePlanPath) return;
    setRecentPaths((prev) =>
      prev[0] === activePlanPath ? prev : pushRecent(prev, activePlanPath),
    );
  }, [activePlanPath]);

  useEffect(() => saveRecent(recentPaths), [recentPaths]);

  const sections = useMemo(() => navbarSections(plans, recentPaths), [plans, recentPaths]);
  const knownFolders = sections.folders;
  // A folder the last plan left is no filter at all, so the views fall back
  // to every plan rather than showing an empty board.
  const folder = knownFolders.includes(chosenFolder ?? "") ? chosenFolder : null;
  const shownPlans = useMemo(() => filterByFolder(plans, folder), [plans, folder]);

  const forYouCount = useMemo(() => {
    const waiting = forYou(shownPlans, summaries);
    return waiting.review.length + waiting.answered.length;
  }, [shownPlans, summaries]);

  const crumb = useMemo(() => {
    if (!activeDoc) return null;
    if (activePlan && activeDoc.path) return planCrumb(activePlan, activeDoc.path);
    return { lead: null, title: activeDoc.name };
  }, [activeDoc, activePlan]);

  const showView = useCallback(
    (next: MainView) => {
      void flushSave();
      setMainView(next);
    },
    [flushSave],
  );

  /** A folder row filters the board and shows it. */
  const chooseFolder = useCallback(
    (next: FolderFilter) => {
      setChosenFolder(next);
      showView("board");
    },
    [showView],
  );

  /** The breadcrumb's first part: the plan one of its documents belongs to. */
  const openCrumbLead = useCallback(() => {
    if (activePlan && crumb?.lead) selectPlan(activePlan);
  }, [activePlan, crumb, selectPlan]);

  // Stable identity for the memoized sidebar: recompute only when the
  // library or the base changes, not on every render of the app.
  const sidebarItems = useMemo(
    () =>
      base
        ? items.filter(
            (item) => !("path" in item && item.path?.startsWith(base.root)),
          )
        : items,
    [items, base],
  );

  const openSettings = useCallback(() => setSettingsOpen(true), []);

  const wordCount = useMemo(() => {
    if (content == null) return null;
    return content.split(/\s+/).filter(Boolean).length;
  }, [content]);

  const showOutline = view === "preview" && activeDoc != null && content != null;

  /* ---------- keyboard shortcuts ---------- */

  const onPlan = mainView === "plan";
  // `[` and `]` step through the plans in the order of the view the person
  // came from, since the plan page has no order of its own.
  const listViewRef = useRef<Exclude<MainView, "plan">>("board");
  if (mainView !== "plan") listViewRef.current = mainView;
  // Stable, for the memoized navbar's search button.
  const openPalette = useCallback(() => paletteRef.current?.open(), []);
  const stepPlan = useCallback(
    (step: 1 | -1) => {
      const order = viewOrder(listViewRef.current, shownPlans, summaries);
      const next = steppedPlan(order, activePlanPath, step);
      if (next) selectPlan(next);
    },
    [shownPlans, summaries, activePlanPath, selectPlan],
  );
  const lastPlan = sections.recent[0];

  // Topmost first. Menus and dialogs close themselves; these are the app's
  // own panels.
  const closeTopOverlay = findOpen
    ? () => setFindOpen(false)
    : onPlan && activePlan && historyOpen
      ? () => setHistoryOpen(false)
      : onPlan && canComment && commentsOpen
        ? closeComments
        : onPlan && showOutline && outlineOverlays && floatingOutlineOpen
          ? closeOutline
          : navbar.revealed
            ? concealNavbar
            : undefined;

  // One handler per action, shared by the keys, the palette and the
  // buttons. An action that cannot run here has none.
  const shortcutHandlers: ShortcutHandlers = {
    palette: openPalette,
    shortcuts: () => sheetRef.current?.open(),
    settings: openSettings,
    navbar: toggleSidebar,
    theme: toggleTheme,
    openFile: () => void openFileDialog(),
    openFolder: () => void openFolderDialog(),
    escape: closeTopOverlay,
    board: () => showView("board"),
    list: () => showView("list"),
    forYou: () => showView("for-you"),
    plan: activeDoc
      ? () => showView("plan")
      : lastPlan
        ? () => selectPlan(lastPlan)
        : undefined,
    previousPlan: shownPlans.length > 0 ? () => stepPlan(-1) : undefined,
    nextPlan: shownPlans.length > 0 ? () => stepPlan(1) : undefined,
    edit: onPlan && (view === "edit" || canEnterEdit) ? toggleEdit : undefined,
    save: onPlan && view === "edit" ? () => void flushSave() : undefined,
    find: onPlan && showOutline ? openFind : undefined,
    outline: onPlan && showOutline ? toggleOutline : undefined,
    history: onPlan && activePlan ? toggleHistory : undefined,
    status: onPlan && activePlan ? () => setStatusOpen(true) : undefined,
    folders: onPlan && activePlan && view === "preview" ? () => setFoldersOpen(true) : undefined,
    archive:
      onPlan && activePlan && activePlan.status !== "archived"
        ? () => changeStatus("archived")
        : undefined,
    comments: onPlan && canComment ? toggleComments : undefined,
    sendReview:
      onPlan && canComment && commentsOpen && pendingCommentCount > 0 ? onSendReview : undefined,
  };
  useShortcuts(shortcutHandlers);

  return (
    <div className="flex h-full w-full overflow-hidden bg-background text-foreground">
      {/* The column holds the navbar's place in the layout. In a narrow
          window it keeps the minimized width and the navbar grows over the
          main area, so nothing beside it reflows. The handle sits on the
          column's edge rather than beside it, so it takes no width that
          would come and go with the mode. */}
      <div
        className={cn("navbar-width relative h-full shrink-0", sidebarResizing && "transition-none")}
        style={{ width: navbarWidth }}
      >
        <div
          onPointerLeave={narrow && navbar.revealed ? concealNavbar : undefined}
          className={cn(
            "h-full",
            narrow && "navbar-width fixed inset-y-0 left-0 z-40",
            navbar.revealed && "rounded-r-lg shadow-lg",
          )}
          style={narrow ? { width: navbar.revealed ? sidebarWidth : RAIL_WIDTH } : undefined}
        >
          <div className={cn("h-full overflow-hidden", navbar.revealed && "rounded-r-lg")}>
            <Sidebar
              minimized={!navbarExpanded}
              onToggle={toggleSidebar}
              onOpenPalette={openPalette}
              planCount={plans.length}
              folders={knownFolders}
              folder={folder}
              onSelectFolder={chooseFolder}
              recent={sections.recent}
              view={mainView}
              onSelectView={showView}
              forYouCount={forYouCount}
              activePlanPath={activePlanPath}
              onSelectPlan={selectPlan}
              onOpenSettings={openSettings}
              padTop={windowControls}
            />
          </div>
        </div>
        {layout === "expanded" && (
          <div
            onPointerDown={startSidebarResize}
            onDoubleClick={resetSidebarWidth}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize navbar"
            title="Drag to resize, double-click to reset"
            className="group absolute inset-y-0 -right-1 z-10 flex w-2 cursor-col-resize touch-none items-stretch justify-center"
          >
            <div
              className={cn(
                "w-px bg-transparent transition-colors group-hover:bg-ring",
                sidebarResizing && "bg-ring",
              )}
            />
          </div>
        )}
      </div>

      <main className="flex min-w-0 flex-1 flex-col">
        <Header
          mainView={mainView}
          crumb={crumb}
          plan={activePlan}
          onStatusChange={changeStatus}
          statusOpen={statusOpen}
          onStatusOpenChange={setStatusOpen}
          offerCompletion={offerCompletion}
          onOpenLead={openCrumbLead}
          folders={knownFolders}
          folder={folder}
          onSelectFolder={setChosenFolder}
          doc={activeDoc}
          wordCount={activeDoc ? wordCount : null}
          view={view}
          canEdit={canEnterEdit}
          dirty={dirty}
          onToggleView={toggleEdit}
          dark={dark}
          onToggleTheme={toggleTheme}
          contentWidth={contentWidth}
          onContentWidthChange={setContentWidth}
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
          outlineOpen={outlineShown}
          onToggleOutline={toggleOutline}
          canComment={canComment}
          commentsOpen={commentsOpen}
          onToggleComments={toggleComments}
          openCommentCount={openCommentCount}
          pendingCommentCount={pendingCommentCount}
          onSendReview={onSendReview}
          sendNotice={sendNotice}
          onOpenFind={openFind}
          leadingGap={topBarGap(layout, windowControls)}
        />
        {mainView === "board" && (
          <div className="motion-view min-h-0 flex-1">
            <BoardView
              plans={shownPlans}
              summaries={summaries}
              sessions={sessions}
              progress={workProgress}
              folders={knownFolders}
              onFoldersChange={changeFolders}
              onOpen={selectPlan}
            />
          </div>
        )}

        {mainView === "list" && (
          <div className="motion-view min-h-0 flex-1">
            <ListView
              plans={shownPlans}
              summaries={summaries}
              sessions={sessions}
              progress={workProgress}
              activePlanPath={activePlanPath}
              onSelectPlan={selectPlan}
              onSelectDocument={selectDocument}
              onRenamePlan={handleRename}
              onRenameDocument={handleRenameDocument}
              items={sidebarItems}
              activeId={activeDocId}
              expanded={expanded}
              onToggleDir={toggleDir}
              onSelect={selectFile}
              onRemove={removeItem}
            />
          </div>
        )}

        {mainView === "for-you" && (
          <div className="motion-view min-h-0 flex-1">
            <ForYouView
              plans={shownPlans}
              summaries={summaries}
              sessions={sessions}
              progress={workProgress}
              onOpen={selectPlan}
            />
          </div>
        )}

        {/* Clips the outline while it sits translated off-screen — otherwise
            it enlarges the scrollable area and the browser can scroll the
            whole layout sideways to reveal it. */}
        {mainView === "plan" && (
        <div className="motion-view relative flex min-h-0 flex-1 overflow-hidden">
          <div
            ref={scrollRef}
            style={
              {
                "--content-max-width": WIDTH_VALUES[contentWidth],
                "--content-font-scale": FONT_SIZE_SCALES[fontSize],
              } as CSSProperties
            }
            className={cn(
              "relative min-h-0 min-w-0 flex-1",
              view === "edit" && activeDoc && content != null
                ? "overflow-hidden"
                : "overflow-y-auto",
            )}
          >
            {activePlan && view === "preview" && (
              <div
                className="mx-auto w-full px-10 pt-8"
                style={{ maxWidth: "var(--content-max-width, 48rem)" }}
              >
                <PlanMetaBar
                  plan={activePlan}
                  sessions={sessions.get(activePlan.id) ?? 0}
                  onStatusChange={changeStatus}
                  folders={knownFolders}
                  onFoldersChange={(next) => changeFolders(activePlan, next)}
                  foldersOpen={foldersOpen}
                  onFoldersOpenChange={setFoldersOpen}
                  onOpenHistory={toggleHistory}
                />
              </div>
            )}
            {canComment && (
              <>
                <CommentsLayer
                  threads={commentThreads}
                  articleRef={articleRef}
                  containerRef={scrollRef}
                  lineOffset={commentLineOffset}
                  activeThreadId={focusThreadId}
                  onAnchorStates={setAnchorStates}
                  onOpenThread={openThread}
                />
                <CommentComposer
                  articleRef={articleRef}
                  containerRef={scrollRef}
                  lineOffset={commentLineOffset}
                  enabled={canComment && !commentsOpen}
                  onSubmit={addThread}
                />
              </>
            )}
            {activeDoc ? (
              <Viewer
                doc={activeDoc}
                plan={activePlan}
                content={content == null ? null : planBody}
                error={error}
                loading={loading}
                view={view}
                canEdit={canEnterEdit}
                editorRef={editorRef}
                articleRef={articleRef}
                dark={dark}
                media={preferences.media}
                onEditorChange={onEditorChange}
                onEnterEdit={toggleEdit}
                onRetry={() => setReloadKey((k) => k + 1)}
                onRemove={() => removeItem(activeDoc.id)}
              />
            ) : (
              <EmptyState />
            )}
          </div>
          {loading && content != null && (
            <div className="absolute inset-0 z-20 flex animate-in items-center justify-center bg-background/50 fade-in backdrop-blur-[3px] duration-150">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {canComment && (
            <CommentsPanel
              myEmail={identity?.email ?? null}
              open={commentsOpen}
              threads={commentThreads}
              anchorStates={anchorStates}
              docLabel={activePlan?.relativePath ?? activeDoc?.name ?? ""}
              focusThreadId={focusThreadId}
              onClose={closeComments}
              onReply={replyToThread}
              onSetResolved={setThreadResolved}
              onRemoveThread={removeThread}
              onJumpTo={jumpToThread}
              onSendReview={onSendReview}
            />
          )}
          {activePlan && (
            <HistoryPanel
              path={activePlan.path}
              open={historyOpen}
              onClose={() => setHistoryOpen(false)}
              onRestored={() => {
                refreshPlans();
                setReloadKey((k) => k + 1);
              }}
            />
          )}
          {showOutline && (
            <Outline
              items={outlineItems}
              activeId={outlineActiveId}
              open={outlineShown}
              overlay={outlineOverlays}
              onClose={closeOutline}
            />
          )}
        </div>
        )}
      </main>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        dark={dark}
        onToggleTheme={toggleTheme}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
        contentWidth={contentWidth}
        onContentWidthChange={setContentWidth}
        base={base}
        preferences={preferences}
        onMediaChange={changeMedia}
        onArchiveAfterDaysChange={changeArchiveAfterDays}
      />

      <FindBar
        articleRef={articleRef}
        scrollRef={scrollRef}
        open={findOpen}
        focusSeq={findFocusSeq}
        onClose={() => setFindOpen(false)}
      />

      <CommandPalette
        ref={paletteRef}
        handlers={shortcutHandlers}
        plans={plans}
        recent={sections.recent}
        onOpenPlan={selectPlan}
      />

      <ShortcutSheet ref={sheetRef} />

      {dragging && <DropOverlay />}

      {needsOnboarding && <Onboarding onDone={finishOnboarding} />}

      {notice && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-border bg-popover px-4 py-2 text-sm text-popover-foreground shadow-md">
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
