import { X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { isTypingTarget } from "@/lib/shortcuts";
import {
  clipBox,
  litArea,
  nextStep,
  onTourEvent,
  placeCard,
  startTour,
  TOUR_STEPS,
  viewMatches,
  type Box,
  type DemoStages,
  type TourAction,
  type TourLocation,
  type TourStep,
} from "@/lib/tour";
import { cn } from "@/lib/utils";

interface TourProps {
  /** The demo plans and their status, read when a step is chosen. */
  stages: DemoStages;
  /** Where the person is now. Leaving a step's view pauses the tour. */
  location: TourLocation;
  /** Opens the board or the plan tab a step needs. */
  onOpenView: (step: TourStep) => void;
  onClose: () => void;
  /** The navbar column's width, which the Resume pill keeps clear of. */
  navbarWidth: number;
}

/**
 * The guided tour over the real app: a dimmed window with the step's
 * anchor lit, and a card beside it. Mounted only while the tour runs, and
 * nothing in it runs on a timer: it moves on clicks, keys, the try-it
 * events and the anchor's own changes.
 */
export function Tour({ stages, location, onOpenView, onClose, navbarWidth }: TourProps) {
  const [state, setState] = useState(() => startTour(stages));
  const stagesRef = useRef(stages);
  stagesRef.current = stages;
  const dispatch = useCallback(
    (action: TourAction) => setState((old) => nextStep(old, action, stagesRef.current)),
    [],
  );

  const openRef = useRef(onOpenView);
  openRef.current = onOpenView;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (state == null) closeRef.current();
    else if (!state.paused) openRef.current(TOUR_STEPS[state.index]);
  }, [state]);

  // Only a change of place counts as leaving, so the step's own opening of
  // its view, a render later, never does.
  const stateRef = useRef(state);
  stateRef.current = state;
  const placeKey = `${location.view}|${location.folder}|${location.planId}|${location.tab}`;
  const lastPlace = useRef(placeKey);
  useEffect(() => {
    if (lastPlace.current === placeKey) return;
    lastPlace.current = placeKey;
    const now = stateRef.current;
    if (now && !now.paused && !viewMatches(TOUR_STEPS[now.index], location)) {
      dispatch({ type: "leave" });
    }
  }, [placeKey, location, dispatch]);

  useEffect(() => onTourEvent((event) => dispatch({ type: "try", event })), [dispatch]);

  if (state == null) return null;
  if (state.paused) {
    return (
      <ResumePill
        index={state.index}
        left={navbarWidth}
        overReplyBox={location.view === "plan" && location.tab === "alignment"}
        onResume={() => dispatch({ type: "resume" })}
        onEnd={() => dispatch({ type: "skip" })}
      />
    );
  }
  return <TourStepView key={state.index} index={state.index} dispatch={dispatch} />;
}

function TourStepView({
  index,
  dispatch,
}: {
  index: number;
  dispatch: (action: TourAction) => void;
}) {
  const step = TOUR_STEPS[index];
  const view = useAnchorBox(step.anchor);
  const [card, setCard] = useState({ width: CARD_WIDTH, height: CARD_HEIGHT_GUESS });
  const cardRef = useRef<HTMLDivElement | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  // On a step that asks for an action, the dimming lifts once the person
  // starts on the lit area, so what opens beside it is not dimmed.
  const [lifted, setLifted] = useState(false);

  const frame = { width: view.width, height: view.height };
  const lit = view.box
    ? litArea(view.box, frame)
    : { top: frame.height / 2, left: frame.width / 2, width: 0, height: 0 };
  const spot = view.box
    ? placeCard(lit, card, frame, step.side)
    : {
        side: "inside" as const,
        top: Math.max(0, (frame.height - card.height) / 2),
        left: Math.max(0, (frame.width - card.width) / 2),
      };

  // The popover mounts its content a render after it opens, so the card is
  // measured from its ref rather than from an effect. It is measured once as
  // it attaches, which re-renders before the first paint, so the card never
  // shows at the guessed size and then jumps. The observer covers later
  // changes.
  const measureCard = useCallback((element: HTMLDivElement | null) => {
    cardRef.current = element;
    if (!element) return;
    const measure = () =>
      setCard((old) =>
        old.width === element.offsetWidth && old.height === element.offsetHeight
          ? old
          : { width: element.offsetWidth, height: element.offsetHeight },
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target as Node | null;
      const inCard = target != null && cardRef.current?.contains(target) === true;
      const onPage = target === document.body || target === document.documentElement;
      if (!inCard && !onPage) return;
      // In the card, Enter presses the focused button.
      const action =
        event.key === "ArrowRight" || (event.key === "Enter" && onPage)
          ? "next"
          : event.key === "ArrowLeft"
            ? "back"
            : null;
      if (!action) return;
      event.preventDefault();
      dispatch({ type: action });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch]);

  const litRef = useRef(lit);
  litRef.current = lit;
  useEffect(() => {
    if (!step.tryIt) return;
    const onPointer = (event: PointerEvent) => {
      const area = litRef.current;
      const inside =
        event.clientX >= area.left &&
        event.clientX <= area.left + area.width &&
        event.clientY >= area.top &&
        event.clientY <= area.top + area.height;
      if (inside) setLifted(true);
    };
    window.addEventListener("pointerdown", onPointer, true);
    return () => window.removeEventListener("pointerdown", onPointer, true);
  }, [step.tryIt]);

  const anchorRef = useMemo(
    () => ({ current: { getBoundingClientRect: () => pointAt(spot.top, spot.left) } }),
    [spot.top, spot.left],
  );
  const first = index === 0;
  const last = index === TOUR_STEPS.length - 1;

  return (
    <>
      {/* The scrim fades in here rather than on the hole: the entrance
          animation runs on transform, and would slide the hole in from the
          window's corner. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-50 animate-in overflow-hidden fade-in-0 motion-reduce:animate-none"
      >
        <div
          className={cn(
            "tour-hole absolute top-0 left-0 rounded-lg outline-2 outline-ring transition-opacity duration-200",
            lifted && "opacity-0",
          )}
          style={{
            transform: `translate(${lit.left}px, ${lit.top}px)`,
            width: lit.width,
            height: lit.height,
          }}
        />
      </div>
      <Popover open modal={false}>
        <PopoverAnchor virtualRef={anchorRef} />
        <PopoverContent
          ref={measureCard}
          side="bottom"
          align="start"
          sideOffset={0}
          avoidCollisions={false}
          aria-label={`Tour, step ${index + 1} of ${TOUR_STEPS.length}`}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            nextRef.current?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={(event) => event.preventDefault()}
          // Escape reaches the card only when no menu or dialog sits above
          // it, and something that already took it keeps it.
          onEscapeKeyDown={(event) => {
            if (event.defaultPrevented || isTypingTarget(event.target)) return;
            dispatch({ type: "skip" });
          }}
          className="flex flex-col gap-3 motion-reduce:animate-none"
        >
          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">
              {step.chapter} · {index + 1} of {TOUR_STEPS.length}
            </p>
            <h2 className="text-sm font-medium text-foreground">{step.title}</h2>
            <p className="text-sm text-muted-foreground">{step.body}</p>
            {step.tryIt && (
              <p className="text-sm text-foreground">
                <span className="font-medium">Try it.</span> {step.tryIt.label}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => dispatch({ type: "skip" })}
              className="-ml-2 text-muted-foreground"
            >
              Skip tour
              <Kbd>Esc</Kbd>
            </Button>
            <span className="flex-1" />
            {!first && (
              <Button variant="outline" size="xs" onClick={() => dispatch({ type: "back" })}>
                <Kbd>←</Kbd>
                Back
              </Button>
            )}
            <Button
              ref={nextRef}
              size="xs"
              onClick={() => dispatch({ type: "next" })}
              className="[&_kbd]:bg-primary-foreground/15 [&_kbd]:text-primary-foreground"
            >
              {last ? "Done" : "Next"}
              <Kbd>→</Kbd>
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}

/** The tour waits here while the person looks around: at the lower left of
 * the main area, in the room lists and columns leave at their end. It moves
 * with the navbar's column, and rises above the Alignment reply box. A
 * navbar that floats open covers it. */
function ResumePill({
  index,
  left,
  overReplyBox,
  onResume,
  onEnd,
}: {
  index: number;
  left: number;
  overReplyBox: boolean;
  onResume: () => void;
  onEnd: () => void;
}) {
  return (
    <div
      className={cn(
        "fixed bottom-4 left-4 z-30 transition-transform duration-180 ease-out",
        overReplyBox && "-translate-y-14",
      )}
      style={{ transform: `translateX(${left}px)` }}
    >
      <div className="flex animate-in items-center gap-0.5 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none">
        <Button variant="ghost" size="xs" onClick={onResume}>
          Resume tour, step {index + 1} of {TOUR_STEPS.length}
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onEnd}
          aria-label="End the tour"
          title="End the tour"
          className="text-muted-foreground"
        >
          <X />
        </Button>
      </div>
    </div>
  );
}

/**
 * The anchor's box in the window, and the window's size. It follows the
 * anchor as it renders, moves, resizes or goes, on observer and layout
 * events only. A first sighting off screen scrolls it into view.
 */
function useAnchorBox(anchor: string): { box: Box | null; width: number; height: number } {
  const [view, setView] = useState(() => ({
    box: null as Box | null,
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  useLayoutEffect(() => {
    let element: Element | null = null;
    let revealed = false;
    const measure = () => {
      const found = document.querySelector(`[data-tour="${anchor}"]`);
      if (found !== element) {
        if (element) resizes.unobserve(element);
        element = found;
        if (element) resizes.observe(element);
      }
      const shown = element ? visibleBox(element) : null;
      const box = shown && shown.width > 0 && shown.height > 0 ? shown : null;
      if (element && !revealed) revealed = reveal(element);
      setView((old) => {
        const next = { box, width: window.innerWidth, height: window.innerHeight };
        return sameView(old, next) ? old : next;
      });
    };
    const resizes = new ResizeObserver(measure);
    const mutations = new MutationObserver(measure);
    mutations.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-tour"],
    });
    window.addEventListener("resize", measure);
    document.addEventListener("scroll", measure, { capture: true, passive: true });
    document.addEventListener("transitionend", measure, true);
    document.addEventListener("animationend", measure, true);
    measure();
    return () => {
      resizes.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", measure);
      document.removeEventListener("scroll", measure, { capture: true });
      document.removeEventListener("transitionend", measure, true);
      document.removeEventListener("animationend", measure, true);
    };
  }, [anchor]);
  return view;
}

/** The part of an element the window and its scrolling containers show. */
function visibleBox(element: Element): Box {
  let box = toBox(element.getBoundingClientRect());
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(parent);
    if (overflowX !== "visible" || overflowY !== "visible") {
      box = clipBox(box, toBox(parent.getBoundingClientRect()));
    }
  }
  return box;
}

/** Brings an anchor its containers hide into view: centred when it fits,
 * and from its top when it is taller than the window. False while the
 * anchor has no size yet, to try again on the next change. */
function reveal(element: Element): boolean {
  const whole = toBox(element.getBoundingClientRect());
  if (whole.height === 0) return false;
  const shown = visibleBox(element);
  if (whole.width > window.innerWidth) return true;
  if (shown.height >= Math.min(whole.height, window.innerHeight)) return true;
  const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({
    block: whole.height <= window.innerHeight / 2 ? "center" : "start",
    inline: "nearest",
    behavior: smooth ? "smooth" : "auto",
  });
  return true;
}

function toBox(rect: DOMRect): Box {
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

function sameView(
  a: { box: Box | null; width: number; height: number },
  b: { box: Box | null; width: number; height: number },
): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  if (a.box == null || b.box == null) return a.box === b.box;
  return (
    a.box.top === b.box.top &&
    a.box.left === b.box.left &&
    a.box.width === b.box.width &&
    a.box.height === b.box.height
  );
}

/** A zero-size box at the card's corner, for the popover to sit under. */
function pointAt(top: number, left: number): DOMRect {
  const point = { top, left, right: left, bottom: top, x: left, y: top, width: 0, height: 0 };
  return { ...point, toJSON: () => point };
}

/** The card's width is the popover's own; its height is measured. */
const CARD_WIDTH = 288;
const CARD_HEIGHT_GUESS = 168;
