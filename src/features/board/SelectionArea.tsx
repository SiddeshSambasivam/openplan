import { Archive, FolderInput, Trash2, X } from "lucide-react";
import {
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from "react";
import { FolderPicker } from "@/components/FolderPicker";
import { TooltipButton } from "@/components/TooltipButton";
import { Button } from "@/components/ui/button";
import { sameFolder } from "@/lib/folders";
import { selectedLabel, sharedFolders } from "@/lib/planActions";
import {
  boxBetween,
  boxSelection,
  isDrag,
  overlap,
  rangeBetween,
  sameSelection,
  toggled,
  type Box,
  type Point,
} from "@/lib/selection";
import { PLATFORM } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import { PlanActionsProvider, type PlanActionsValue } from "./PlanActions";

interface SelectionAreaProps {
  actions: PlanActionsValue;
  ref?: Ref<HTMLDivElement>;
  className?: string;
  children: ReactNode;
}

interface Drag {
  start: Point;
  before: ReadonlySet<string>;
  /** cmd was held: the box adds to the selection instead of replacing it. */
  additive: boolean;
  moved: boolean;
}

/**
 * Where plans are selected: a box dragged from empty space, cmd+click to
 * toggle one, shift+click for a range. Cards and rows mark themselves with
 * `data-plan-path`, and their order on screen is the view's order.
 */
export function SelectionArea({ actions, ref, className, children }: SelectionAreaProps) {
  const drag = useRef<Drag | null>(null);
  // The last plan clicked, where a shift+click range starts.
  const anchor = useRef<string | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  // Read while dragging, so a move compares with what is selected now.
  const current = useRef(actions);
  current.current = actions;

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const area = event.currentTarget;
    if (event.button !== 0 || !startsABox(area, event)) return;
    event.preventDefault();
    area.setPointerCapture(event.pointerId);
    drag.current = {
      start: pointOf(event),
      before: actions.selected,
      additive: withMod(event),
      moved: false,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const now = drag.current;
    if (!now) return;
    const at = pointOf(event);
    if (!now.moved && !isDrag(now.start, at)) return;
    now.moved = true;
    const bounds = boxOf(event.currentTarget.getBoundingClientRect());
    const drawn = overlap(boxBetween(now.start, at), bounds);
    setBox(drawn && shift(drawn, bounds));
    const covered = drawn ? coveredPlans(event.currentTarget, drawn) : [];
    const next = boxSelection(covered, now.before, now.additive);
    if (!sameSelection(next, current.current.selected)) current.current.select(next);
  };

  const onPointerUp = () => {
    const ended = drag.current;
    drag.current = null;
    setBox(null);
    // A press that never became a drag clears the selection.
    if (ended && !ended.moved && current.current.selected.size > 0) {
      current.current.select(new Set());
    }
  };

  const onPointerCancel = () => {
    drag.current = null;
    setBox(null);
  };

  // Captured before the card's own click, which opens the plan.
  const onClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    const card = planElement(event.currentTarget, event.target);
    if (!card) return;
    const path = card.dataset.planPath!;
    const { selected, select } = current.current;
    if (event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      const order = planPathsIn(event.currentTarget);
      select(new Set([...selected, ...rangeBetween(order, anchor.current ?? path, path)]));
      anchor.current ??= path;
      return;
    }
    anchor.current = path;
    if (withMod(event)) {
      event.preventDefault();
      event.stopPropagation();
      select(toggled(selected, path));
      return;
    }
    if (selected.size > 0) select(new Set());
  };

  // Shift+press would otherwise extend the page's text selection.
  const onMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.shiftKey && planElement(event.currentTarget, event.target)) event.preventDefault();
  };

  return (
    <PlanActionsProvider value={actions}>
      <div
        ref={ref}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClickCapture={onClickCapture}
        onMouseDown={onMouseDown}
        className={cn("relative", box && "select-none", className)}
      >
        {children}
        {box && (
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 z-10 rounded-md border border-primary/40 bg-primary/10"
            style={{
              transform: `translate(${box.left}px, ${box.top}px)`,
              width: box.right - box.left,
              height: box.bottom - box.top,
            }}
          />
        )}
        {actions.selected.size > 0 && <SelectionBar actions={actions} />}
      </div>
    </PlanActionsProvider>
  );
}

/** The paths of the plans on screen in the area, in the order they appear.
 * A folded group's rows stay mounted, so they are left out. */
export function planPathsIn(area: HTMLElement | null): string[] {
  if (!area) return [];
  return [...area.querySelectorAll<HTMLElement>("[data-plan-path]")]
    .filter((element) => !element.closest("[data-folded]"))
    .map((element) => element.dataset.planPath!);
}

/** What to do with the selection, floating at the bottom of the view. */
function SelectionBar({ actions }: { actions: PlanActionsValue }) {
  const paths = [...actions.selected];
  const shared = sharedFolders(paths.flatMap((path) => actions.plans.get(path) ?? []));
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
      <div
        role="toolbar"
        aria-label="Selected plans"
        className="pointer-events-auto flex animate-in items-center gap-1 rounded-lg border border-border bg-popover p-1 pl-3 text-sm text-popover-foreground shadow-lg duration-150 fade-in-0 slide-in-from-bottom-2"
      >
        <span className="pr-2 whitespace-nowrap tabular-nums text-muted-foreground">
          {selectedLabel(paths.length)}
        </span>
        <TooltipButton
          variant="ghost"
          size="sm"
          shortcut="archive"
          tooltip="Archive the selected plans"
          tooltipSide="top"
          onClick={() => actions.archive(paths)}
        >
          <Archive />
          Archive
        </TooltipButton>
        <FolderPicker
          folders={shared}
          known={actions.folders}
          onChange={(next) => {
            const name =
              next.find((folder) => !shared.some((had) => sameFolder(had, folder))) ??
              shared.find((had) => !next.some((folder) => sameFolder(had, folder)));
            if (name) actions.toggleFolder(paths, name);
          }}
          tooltip="Put every selected plan in a folder"
          trigger={
            <Button variant="ghost" size="sm">
              <FolderInput />
              Move to folder
            </Button>
          }
        />
        <TooltipButton
          variant="ghost"
          size="sm"
          shortcut="deletePlans"
          tooltip="Delete the selected plans"
          tooltipSide="top"
          onClick={() => actions.remove(paths)}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 />
          Delete
        </TooltipButton>
        <TooltipButton
          variant="ghost"
          size="icon-sm"
          shortcut="escape"
          tooltip="Clear the selection"
          tooltipSide="top"
          aria-label="Clear the selection"
          onClick={() => actions.select(new Set())}
          className="text-muted-foreground"
        >
          <X />
        </TooltipButton>
      </div>
    </div>
  );
}

/** A box starts on empty space: not on a card, a control, or a scrollbar,
 * and not in a menu or popover portalled out of the area. */
function startsABox(area: HTMLElement, event: ReactPointerEvent): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement) || !area.contains(target)) return false;
  if (target.closest(NOT_EMPTY)) return false;
  const scrolls =
    target.scrollHeight > target.clientHeight || target.scrollWidth > target.clientWidth;
  const { offsetX, offsetY } = event.nativeEvent;
  return !(scrolls && (offsetX >= target.clientWidth || offsetY >= target.clientHeight));
}

function planElement(area: HTMLElement, target: EventTarget): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const card = target.closest<HTMLElement>("[data-plan-path]");
  return card && area.contains(card) ? card : null;
}

/** The plans the box touches where they can be seen: a card scrolled out
 * of its column does not count. */
function coveredPlans(area: HTMLElement, drawn: Box): string[] {
  return [...area.querySelectorAll<HTMLElement>("[data-plan-path]")]
    .filter((element) => {
      if (element.closest("[data-folded]")) return false;
      const clip = element.closest("[data-scroll-clip]");
      const rect = boxOf(element.getBoundingClientRect());
      const shown = clip ? overlap(rect, boxOf(clip.getBoundingClientRect())) : rect;
      return shown != null && overlap(shown, drawn) != null;
    })
    .map((element) => element.dataset.planPath!);
}

function withMod(event: { metaKey: boolean; ctrlKey: boolean }): boolean {
  return PLATFORM === "mac" ? event.metaKey : event.ctrlKey;
}

function pointOf(event: { clientX: number; clientY: number }): Point {
  return { x: event.clientX, y: event.clientY };
}

function boxOf(rect: DOMRect): Box {
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

/** A box in the page, moved into the area's own coordinates. */
function shift(box: Box, area: Box): Box {
  return {
    left: box.left - area.left,
    top: box.top - area.top,
    right: box.right - area.left,
    bottom: box.bottom - area.top,
  };
}

const NOT_EMPTY =
  "[data-plan-path], button, a, input, textarea, [role='toolbar'], [role='menu'], [role='dialog']";
