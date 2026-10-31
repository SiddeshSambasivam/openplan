import { Archive, FileText, Folder, Trash2 } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { sameFolder } from "@/lib/folders";
import {
  actionLabel,
  foldersToggled,
  sharedFolders,
  targetsOf,
} from "@/lib/planActions";
import { deletePlans, setFolders, setStatuses, type PlanSummary } from "@/lib/planBase";
import { keysLabel, PLATFORM, shortcut, type ActionId } from "@/lib/shortcuts";

/** What the board and the lists can do to plans, shared with every card and
 * row through context so the views pass nothing down for it. */
export interface PlanActionsValue {
  /** The selected plans, by path. */
  selected: ReadonlySet<string>;
  select: (paths: ReadonlySet<string>) => void;
  /** Every plan, by path. */
  plans: Map<string, PlanSummary>;
  /** Every folder in the base. */
  folders: string[];
  open: (plan: PlanSummary) => void;
  archive: (paths: string[]) => void;
  /** Asks before anything is deleted. */
  remove: (paths: string[]) => void;
  toggleFolder: (paths: string[], name: string) => void;
}

interface PlanActionsOptions {
  plans: PlanSummary[];
  /** The selection is dropped whenever this changes: another view, another
   * folder. */
  scope: string;
  folders: string[];
  onOpen: (plan: PlanSummary) => void;
  /** After a write, so the views read the base again. */
  onChanged: () => void;
  /** After plans are gone from disk. */
  onDeleted: (plans: PlanSummary[]) => void;
  onError: (message: string) => void;
}

/** Selected cards and rows carry a ring and a background. */
export const SELECTED_CARD =
  "data-selected:bg-primary/5 data-selected:ring-2 data-selected:ring-primary/60";
export const SELECTED_ROW =
  "data-selected:rounded-md data-selected:bg-primary/5 data-selected:ring-2 data-selected:ring-inset data-selected:ring-primary/50";

const PlanActionsContext = createContext<PlanActionsValue | null>(null);

export const PlanActionsProvider = PlanActionsContext.Provider;

/** The selection, and archiving, filing and deleting plans. The delete
 * waits in `deleting` until the dialog confirms it. */
export function usePlanActions(options: PlanActionsOptions) {
  const { plans, scope, folders } = options;
  // Read when an action runs, so the handlers keep one identity and the
  // memoized views stay still while the app re-renders.
  const latest = useRef(options);
  latest.current = options;

  const [chosen, setChosen] = useState<ReadonlySet<string>>(NOTHING);
  const [chosenIn, setChosenIn] = useState(scope);
  if (chosenIn !== scope) {
    setChosenIn(scope);
    setChosen(NOTHING);
  }
  const [deleting, setDeleting] = useState<string[]>([]);

  const byPath = useMemo(() => new Map(plans.map((plan) => [plan.path, plan])), [plans]);
  // A plan an agent removed drops out of the selection with it.
  const selected = useMemo(() => {
    const live = [...chosen].filter((path) => byPath.has(path));
    return live.length === chosen.size ? chosen : new Set(live);
  }, [chosen, byPath]);

  const clear = useCallback(() => setChosen(NOTHING), []);

  const archive = useCallback(
    (paths: string[]) => {
      setChosen(NOTHING);
      void setStatuses(paths, "archived").then(
        () => latest.current.onChanged(),
        (e) => latest.current.onError(`Couldn't archive: ${e}`),
      );
    },
    [],
  );

  const toggleFolder = useCallback(
    (paths: string[], name: string) => {
      const targets = paths.flatMap((path) => byPath.get(path) ?? []);
      const changes = foldersToggled(targets, name, latest.current.folders);
      // One plan at a time: each write commits, and commits share one index.
      void (async () => {
        for (const change of changes) await setFolders(change.path, change.folders);
      })().then(
        () => latest.current.onChanged(),
        (e) => latest.current.onError(`Couldn't change folders: ${e}`),
      );
    },
    [byPath],
  );

  const confirmDelete = useCallback(() => {
    const gone = deleting.flatMap((path) => byPath.get(path) ?? []);
    setDeleting([]);
    setChosen(NOTHING);
    void deletePlans(deleting).then(
      () => {
        latest.current.onDeleted(gone);
        latest.current.onChanged();
      },
      (e) => latest.current.onError(`Couldn't delete: ${e}`),
    );
  }, [deleting, byPath]);

  const value = useMemo<PlanActionsValue>(
    () => ({
      selected,
      select: setChosen,
      plans: byPath,
      folders,
      open: (plan) => latest.current.onOpen(plan),
      archive,
      remove: setDeleting,
      toggleFolder,
    }),
    [selected, byPath, folders, archive, toggleFolder],
  );

  return {
    value,
    selected,
    clear,
    /** The titles of the plans waiting on the delete dialog. */
    deleting: deleting.map((path) => byPath.get(path)?.title ?? path),
    cancelDelete: useCallback(() => setDeleting([]), []),
    confirmDelete,
  };
}

export function usePlanActionsContext(): PlanActionsValue | null {
  return useContext(PlanActionsContext);
}

/** Whether a card or row is selected, as the attribute its styles read. */
export function useSelectedMark(path: string): true | undefined {
  return usePlanActionsContext()?.selected.has(path) || undefined;
}

/** A card's or a row's own menu: Open, Folders, Archive, Delete. With a
 * selection that holds the plan, it acts on the whole selection. */
export function PlanContextMenu({
  plan,
  children,
}: {
  plan: PlanSummary;
  children: ReactElement;
}) {
  const actions = usePlanActionsContext();
  if (!actions) return children;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <PlanMenuItems plan={plan} actions={actions} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** Mounted only while the menu is open, so a closed menu costs a card nothing. */
function PlanMenuItems({ plan, actions }: { plan: PlanSummary; actions: PlanActionsValue }) {
  const targets = targetsOf(actions.selected, plan.path);
  const plans = targets.flatMap((path) => actions.plans.get(path) ?? []);
  const shared = sharedFolders(plans);
  const inFolder = (name: string) => shared.some((folder) => sameFolder(folder, name));
  return (
    <>
      <ContextMenuItem onSelect={() => actions.open(plan)}>
        <FileText />
        Open
      </ContextMenuItem>
      <ContextMenuSub>
        <ContextMenuSubTrigger className="gap-2">
          <Folder />
          Folders
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="max-h-64 w-48 overflow-y-auto">
          {actions.folders.length === 0 ? (
            <ContextMenuItem disabled>No folders yet</ContextMenuItem>
          ) : (
            actions.folders.map((name) => (
              <ContextMenuCheckboxItem
                key={name}
                checked={inFolder(name)}
                // The menu stays open, so several folders can be set at once.
                onSelect={(event) => {
                  event.preventDefault();
                  actions.toggleFolder(targets, name);
                }}
              >
                <span className="truncate">{name}</span>
              </ContextMenuCheckboxItem>
            ))
          )}
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuItem
        disabled={plans.every((target) => target.status === "archived")}
        onSelect={() => actions.archive(targets)}
      >
        <Archive />
        {actionLabel("Archive", targets.length)}
        <MenuKeys action="archive" />
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onSelect={() => actions.remove(targets)}>
        <Trash2 />
        {actionLabel("Delete", targets.length)}
        <MenuKeys action="deletePlans" />
      </ContextMenuItem>
    </>
  );
}

function MenuKeys({ action }: { action: ActionId }) {
  return <ContextMenuShortcut>{keysLabel(shortcut(action).keys, PLATFORM)}</ContextMenuShortcut>;
}

const NOTHING: ReadonlySet<string> = new Set();
