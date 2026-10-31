import type { PlanSummary, Status } from "./planBase";
import type { PlanTab } from "./planTab";
import { keysLabel, PLATFORM, shortcut } from "./shortcuts";
import type { MainView } from "./types";

/** What the person does on a step that asks them to try it. */
export type TryEvent = "comment-added" | "review-sent" | "question-answered";

/** The board filtered to the Demo folder, or a demo plan's tab. */
export type TourView = "board" | PlanTab;

export interface TourStep {
  chapter: string;
  /** The `data-tour` value of the element the step lights. */
  anchor: string;
  view: TourView;
  /** The demo plan the step shows, and the stage it must still be in. */
  plan?: { id: string; stage: Status };
  /** The step's anchor is in the work panel, which opens with it. */
  work?: boolean;
  /** Where the card goes when there is room there. */
  side: Side;
  title: string;
  body: string;
  tryIt?: { event: TryEvent; label: string };
}

/** Closed is null. A paused tour keeps its step for the Resume pill. */
export type TourState = { index: number; paused: boolean } | null;

export type TourAction =
  | { type: "next" }
  | { type: "back" }
  | { type: "skip" }
  | { type: "try"; event: TryEvent }
  /** The person opened something other than the step's view. */
  | { type: "leave" }
  | { type: "resume" };

/** Demo plan ids and their status, which decide the steps a tour can show. */
export type DemoStages = ReadonlyMap<string, Status>;

/** Where the person is, in the terms a step's view is held to. */
export interface TourLocation {
  view: MainView;
  /** The folder the person chose to filter by. */
  folder: string | null;
  planId: string | null;
  tab: PlanTab | null;
}

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export type Side = "top" | "right" | "bottom" | "left";

export const DEMO_FOLDER = "Demo";

const DRAFT = { id: "demo-add-dark-mode", stage: "draft" } as const;
const ALIGNMENT = { id: "demo-export-notes-as-pdf", stage: "alignment" } as const;
const BUILDING = { id: "demo-sync-notes-across-devices", stage: "in-progress" } as const;
const REVIEW = { id: "demo-faster-search", stage: "in-review" } as const;

export const TOUR_STEPS: readonly TourStep[] = [
  {
    chapter: "Board",
    anchor: "board",
    view: "board",
    side: "bottom",
    title: "Your board",
    body: "Plans move from Draft to Completed. Your agents move them, and you approve.",
  },
  {
    chapter: "Board",
    anchor: `card-${DRAFT.id}`,
    view: "board",
    plan: DRAFT,
    side: "right",
    title: "A plan card",
    body: "Each card shows which agent filed it, its repos and how far along it is.",
  },
  {
    chapter: "Board",
    anchor: `folder-${DEMO_FOLDER}`,
    view: "board",
    side: "right",
    title: "Folders",
    body: "Folders group plans. Delete this one when you are done.",
  },
  {
    chapter: "Plan",
    anchor: "try-comment",
    view: "plan",
    plan: DRAFT,
    side: "bottom",
    title: "Comment on a plan",
    body: "Select any text to comment.",
    tryIt: { event: "comment-added", label: "Leave a comment on this sentence." },
  },
  {
    chapter: "Plan",
    anchor: "review",
    view: "plan",
    plan: DRAFT,
    side: "bottom",
    title: "Send your review",
    body: "Send your comments to the agent. The plan moves to Alignment.",
    tryIt: { event: "review-sent", label: "Send it." },
  },
  {
    chapter: "Alignment",
    anchor: "reviewers",
    view: "alignment",
    plan: ALIGNMENT,
    side: "right",
    title: "Your reviewers",
    body: "Your reviewers ask what the plan leaves open, before any code. The panel is the one your role picked.",
  },
  {
    chapter: "Alignment",
    anchor: "open-question",
    view: "alignment",
    plan: ALIGNMENT,
    side: "bottom",
    title: "Answer a question",
    body: "Pick an option or write your own. The recommended one is marked.",
    tryIt: { event: "question-answered", label: "Answer it." },
  },
  {
    chapter: "Alignment",
    anchor: "score",
    view: "alignment",
    plan: ALIGNMENT,
    side: "bottom",
    title: "The score",
    body: "The score shows how much is settled. Build unlocks when it reaches your target.",
  },
  {
    chapter: "Alignment",
    anchor: "build",
    view: "alignment",
    plan: ALIGNMENT,
    side: "bottom",
    title: "Build",
    body: "Build tells your agent to start. On a demo plan it only shows the next stage.",
  },
  {
    chapter: "Work",
    anchor: "todos",
    view: "plan",
    plan: BUILDING,
    work: true,
    side: "left",
    title: "Todos",
    body: "Todos tick off as the agent works.",
  },
  {
    chapter: "Work",
    anchor: "repos-prs",
    view: "plan",
    plan: BUILDING,
    work: true,
    side: "left",
    title: "Repos and PRs",
    body: "Pull requests show here with their state.",
  },
  {
    chapter: "Done",
    anchor: "mark-completed",
    view: "plan",
    plan: REVIEW,
    side: "bottom",
    title: "Mark it completed",
    body: "When every PR is merged, you mark the plan completed.",
  },
  {
    chapter: "Keys",
    anchor: "palette",
    view: "board",
    side: "right",
    title: "Keys for everything",
    body: `Every action has a key. Press ${keysLabel(shortcut("palette").keys, PLATFORM)} to search and ${keysLabel(shortcut("shortcuts").keys, PLATFORM)} to see them all.`,
  },
];

export function startTour(stages: DemoStages): TourState {
  const index = shownFrom(0, 1, stages);
  return index == null ? null : { index, paused: false };
}

/** Where the tour goes on an action. An action that changes nothing
 * returns the state it was given, so nothing re-renders. */
export function nextStep(state: TourState, action: TourAction, stages: DemoStages): TourState {
  if (state == null || action.type === "skip") return null;
  if (state.paused) {
    if (action.type !== "resume") return state;
    const index = shownFrom(state.index, 1, stages);
    return index == null ? null : { index, paused: false };
  }
  switch (action.type) {
    case "next":
      return moveOn(state, stages);
    case "back": {
      const index = shownFrom(state.index - 1, -1, stages);
      return index == null ? state : { index, paused: false };
    }
    case "try":
      return TOUR_STEPS[state.index].tryIt?.event === action.event ? moveOn(state, stages) : state;
    case "leave":
      return { index: state.index, paused: true };
    case "resume":
      return state;
  }
}

export function demoStages(plans: readonly PlanSummary[]): DemoStages {
  return new Map(plans.filter((plan) => plan.demo).map((plan) => [plan.id, plan.status]));
}

/** Whether the person is on the view a step needs. */
export function viewMatches(step: TourStep, location: TourLocation): boolean {
  if (step.view === "board") return location.view === "board" && location.folder === DEMO_FOLDER;
  return location.view === "plan" && location.planId === step.plan?.id && location.tab === step.view;
}

/** The anchor's box with a little room around it, cut to the window. */
export function litArea(anchor: Box, window: { width: number; height: number }): Box {
  const top = Math.max(0, anchor.top - LIT_PADDING);
  const left = Math.max(0, anchor.left - LIT_PADDING);
  const bottom = Math.min(window.height, anchor.top + anchor.height + LIT_PADDING);
  const right = Math.min(window.width, anchor.left + anchor.width + LIT_PADDING);
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/** Where the card goes beside `anchor`: the preferred side, its opposite,
 * then the other two, whichever first has room for the whole card. With no
 * room on any side, it lies inside the anchor at its lower right. */
export function placeCard(
  anchor: Box,
  card: { width: number; height: number },
  window: { width: number; height: number },
  prefer: Side,
): { side: Side | "inside"; top: number; left: number } {
  const right = anchor.left + anchor.width;
  const bottom = anchor.top + anchor.height;
  const across = (start: number, size: number, cardSize: number, windowSize: number) =>
    clamp(start + size / 2 - cardSize / 2, CARD_MARGIN, windowSize - CARD_MARGIN - cardSize);
  const spots: Record<Side, { fits: boolean; top: number; left: number }> = {
    right: {
      fits: right + CARD_GAP + card.width <= window.width - CARD_MARGIN,
      top: across(anchor.top, anchor.height, card.height, window.height),
      left: right + CARD_GAP,
    },
    left: {
      fits: anchor.left - CARD_GAP - card.width >= CARD_MARGIN,
      top: across(anchor.top, anchor.height, card.height, window.height),
      left: anchor.left - CARD_GAP - card.width,
    },
    bottom: {
      fits: bottom + CARD_GAP + card.height <= window.height - CARD_MARGIN,
      top: bottom + CARD_GAP,
      left: across(anchor.left, anchor.width, card.width, window.width),
    },
    top: {
      fits: anchor.top - CARD_GAP - card.height >= CARD_MARGIN,
      top: anchor.top - CARD_GAP - card.height,
      left: across(anchor.left, anchor.width, card.width, window.width),
    },
  };
  for (const side of SIDE_ORDER[prefer]) {
    const spot = spots[side];
    if (spot.fits) return { side, top: spot.top, left: spot.left };
  }
  return {
    side: "inside",
    top: clamp(
      Math.min(bottom, window.height) - CARD_INSET - card.height,
      CARD_MARGIN,
      window.height - CARD_MARGIN - card.height,
    ),
    left: clamp(
      Math.min(right, window.width) - CARD_INSET - card.width,
      CARD_MARGIN,
      window.width - CARD_MARGIN - card.width,
    ),
  };
}

/** Tells a running tour that the person did something a step asks for.
 * With no tour open, nothing listens. */
export function emitTourEvent(event: TryEvent): void {
  EVENTS.dispatchEvent(new CustomEvent<TryEvent>(EVENT_NAME, { detail: event }));
}

export function onTourEvent(listener: (event: TryEvent) => void): () => void {
  const handle = (event: Event) => listener((event as CustomEvent<TryEvent>).detail);
  EVENTS.addEventListener(EVENT_NAME, handle);
  return () => EVENTS.removeEventListener(EVENT_NAME, handle);
}

const LIT_PADDING = 4;
const CARD_GAP = 12;
const CARD_MARGIN = 8;
const CARD_INSET = 16;

const SIDE_ORDER: Record<Side, Side[]> = {
  right: ["right", "left", "bottom", "top"],
  left: ["left", "right", "bottom", "top"],
  bottom: ["bottom", "top", "right", "left"],
  top: ["top", "bottom", "right", "left"],
};

const EVENTS = new EventTarget();
const EVENT_NAME = "tour";

function moveOn(state: { index: number }, stages: DemoStages): TourState {
  const index = shownFrom(state.index + 1, 1, stages);
  return index == null ? null : { index, paused: false };
}

/** The first step from `index`, walking by `step`, whose demo plan is
 * there and still in the stage it shows. */
function shownFrom(index: number, step: 1 | -1, stages: DemoStages): number | null {
  for (let i = index; i >= 0 && i < TOUR_STEPS.length; i += step) {
    const plan = TOUR_STEPS[i].plan;
    if (!plan || stages.get(plan.id) === plan.stage) return i;
  }
  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
