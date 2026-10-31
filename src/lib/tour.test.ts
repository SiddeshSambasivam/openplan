import { describe, expect, it } from "vitest";
import type { PlanSummary, Status } from "./planBase";
import {
  demoStages,
  emitTourEvent,
  litArea,
  nextStep,
  onTourEvent,
  placeCard,
  startTour,
  TOUR_STEPS,
  viewMatches,
  type TourLocation,
  type TourState,
} from "./tour";

const ALL_STAGES = new Map<string, Status>([
  ["demo-add-dark-mode", "draft"],
  ["demo-export-notes-as-pdf", "alignment"],
  ["demo-sync-notes-across-devices", "in-progress"],
  ["demo-faster-search", "in-review"],
  ["demo-keyboard-shortcuts", "completed"],
]);

const at = (index: number): TourState => ({ index, paused: false });

function indexOf(anchor: string): number {
  return TOUR_STEPS.findIndex((step) => step.anchor === anchor);
}

function stagesWith(id: string, status: Status | null): Map<string, Status> {
  const stages = new Map(ALL_STAGES);
  if (status) stages.set(id, status);
  else stages.delete(id);
  return stages;
}

describe("TOUR_STEPS", () => {
  it("has the thirteen steps in their chapters", () => {
    expect(TOUR_STEPS).toHaveLength(13);
    expect(TOUR_STEPS.map((step) => step.chapter)).toEqual([
      "Board",
      "Board",
      "Board",
      "Plan",
      "Plan",
      "Alignment",
      "Alignment",
      "Alignment",
      "Alignment",
      "Work",
      "Work",
      "Done",
      "Keys",
    ]);
  });

  it("gives every step its own anchor", () => {
    const anchors = TOUR_STEPS.map((step) => step.anchor);
    expect(new Set(anchors).size).toBe(anchors.length);
  });

  it("names a demo plan for every step on a plan page", () => {
    for (const step of TOUR_STEPS) {
      if (step.view !== "board") expect(step.plan, step.anchor).toBeDefined();
    }
  });

  it("asks the person to try three things", () => {
    expect(TOUR_STEPS.flatMap((step) => (step.tryIt ? [step.tryIt.event] : []))).toEqual([
      "comment-added",
      "review-sent",
      "question-answered",
    ]);
  });

  it("explains Build without asking the person to press it", () => {
    const build = TOUR_STEPS[indexOf("build")];
    expect(build.tryIt).toBeUndefined();
    expect(TOUR_STEPS[indexOf("score")].body).toBe(
      "The score shows how much is settled. Build unlocks when it reaches your target.",
    );
  });

  it("uses no em dashes in its copy", () => {
    for (const step of TOUR_STEPS) {
      expect(`${step.title} ${step.body} ${step.tryIt?.label ?? ""}`).not.toContain("—");
    }
  });
});

describe("startTour", () => {
  it("opens on the first step", () => {
    expect(startTour(ALL_STAGES)).toEqual(at(0));
  });
});

describe("nextStep", () => {
  it("moves on with Next and finishes after the last step", () => {
    expect(nextStep(at(0), { type: "next" }, ALL_STAGES)).toEqual(at(1));
    expect(nextStep(at(12), { type: "next" }, ALL_STAGES)).toBeNull();
  });

  it("goes back with Back and stays on the first step", () => {
    expect(nextStep(at(5), { type: "back" }, ALL_STAGES)).toEqual(at(4));
    const first = at(0);
    expect(nextStep(first, { type: "back" }, ALL_STAGES)).toBe(first);
  });

  it("ends with Skip, from any step and while paused", () => {
    expect(nextStep(at(3), { type: "skip" }, ALL_STAGES)).toBeNull();
    expect(nextStep({ index: 3, paused: true }, { type: "skip" }, ALL_STAGES)).toBeNull();
  });

  it("moves on when the person does what a step asks", () => {
    for (const [index, step] of TOUR_STEPS.entries()) {
      if (!step.tryIt) continue;
      expect(nextStep(at(index), { type: "try", event: step.tryIt.event }, ALL_STAGES)).toEqual(
        at(index + 1),
      );
    }
  });

  it("ignores a try-it event another step asks for", () => {
    const comment = at(indexOf("try-comment"));
    expect(nextStep(comment, { type: "try", event: "review-sent" }, ALL_STAGES)).toBe(comment);
    const board = at(0);
    expect(nextStep(board, { type: "try", event: "comment-added" }, ALL_STAGES)).toBe(board);
  });

  it("ignores a try-it event while paused", () => {
    const paused = { index: indexOf("try-comment"), paused: true };
    expect(nextStep(paused, { type: "try", event: "comment-added" }, ALL_STAGES)).toBe(paused);
  });

  it("pauses when the person leaves the step's view, and resumes where it was", () => {
    const paused = nextStep(at(4), { type: "leave" }, ALL_STAGES);
    expect(paused).toEqual({ index: 4, paused: true });
    expect(nextStep(paused, { type: "resume" }, ALL_STAGES)).toEqual(at(4));
  });

  it("takes no keys while paused", () => {
    const paused = { index: 4, paused: true };
    expect(nextStep(paused, { type: "next" }, ALL_STAGES)).toBe(paused);
    expect(nextStep(paused, { type: "back" }, ALL_STAGES)).toBe(paused);
  });

  it("skips the steps whose demo plan is missing", () => {
    const stages = stagesWith("demo-export-notes-as-pdf", null);
    expect(nextStep(at(indexOf("review")), { type: "next" }, stages)).toEqual(at(indexOf("todos")));
    expect(nextStep(at(indexOf("todos")), { type: "back" }, stages)).toEqual(at(indexOf("review")));
  });

  it("skips the steps whose demo plan moved on from the stage they show", () => {
    const stages = stagesWith("demo-add-dark-mode", "alignment");
    expect(nextStep(at(0), { type: "next" }, stages)).toEqual(at(indexOf("folder-Demo")));
    expect(nextStep(at(indexOf("folder-Demo")), { type: "next" }, stages)).toEqual(
      at(indexOf("reviewers")),
    );
  });

  it("resumes on the next step it can show when the paused one moved on", () => {
    const stages = stagesWith("demo-faster-search", "completed");
    const paused = { index: indexOf("mark-completed"), paused: true };
    expect(nextStep(paused, { type: "resume" }, stages)).toEqual(at(indexOf("palette")));
  });

  it("stays closed once closed", () => {
    expect(nextStep(null, { type: "next" }, ALL_STAGES)).toBeNull();
  });
});

describe("demoStages", () => {
  it("lists the demo plans by id with their status", () => {
    const plan = (id: string, status: Status, demo: boolean) =>
      ({ id, status, demo }) as PlanSummary;
    const stages = demoStages([
      plan("demo-add-dark-mode", "draft", true),
      plan("mine", "draft", false),
    ]);
    expect([...stages]).toEqual([["demo-add-dark-mode", "draft"]]);
  });
});

describe("viewMatches", () => {
  const board: TourLocation = { view: "board", folder: "Demo", planId: null, tab: null };
  const plan = (planId: string, tab: "plan" | "alignment"): TourLocation => ({
    view: "plan",
    folder: "Demo",
    planId,
    tab,
  });

  it("holds the board steps to the board filtered to the Demo folder", () => {
    expect(viewMatches(TOUR_STEPS[0], board)).toBe(true);
    expect(viewMatches(TOUR_STEPS[0], { ...board, folder: null })).toBe(false);
    expect(viewMatches(TOUR_STEPS[0], { ...board, view: "list" })).toBe(false);
  });

  it("holds a plan step to its plan and tab", () => {
    const comment = TOUR_STEPS[indexOf("try-comment")];
    expect(viewMatches(comment, plan("demo-add-dark-mode", "plan"))).toBe(true);
    expect(viewMatches(comment, plan("demo-add-dark-mode", "alignment"))).toBe(false);
    expect(viewMatches(comment, plan("demo-faster-search", "plan"))).toBe(false);
    expect(viewMatches(comment, board)).toBe(false);
  });
});

describe("litArea", () => {
  it("pads the anchor and keeps it inside the window", () => {
    expect(litArea({ top: 100, left: 100, width: 50, height: 20 }, { width: 720, height: 480 })).toEqual({
      top: 96,
      left: 96,
      width: 58,
      height: 28,
    });
    expect(litArea({ top: -40, left: 200, width: 900, height: 900 }, { width: 720, height: 480 })).toEqual({
      top: 0,
      left: 196,
      width: 524,
      height: 480,
    });
  });
});

describe("placeCard", () => {
  const window = { width: 720, height: 480 };
  const card = { width: 288, height: 160 };

  it("sits on the side the step prefers when it has room", () => {
    const spot = placeCard({ top: 100, left: 20, width: 200, height: 30 }, card, window, "right");
    expect(spot.side).toBe("right");
    expect(spot.left).toBe(232);
  });

  it("flips to the opposite side when the preferred one has no room", () => {
    const spot = placeCard({ top: 300, left: 100, width: 200, height: 40 }, card, window, "bottom");
    expect(spot.side).toBe("top");
    expect(spot.top).toBe(300 - 12 - 160);
  });

  it("tries the other two sides next", () => {
    const spot = placeCard({ top: 60, left: 20, width: 200, height: 380 }, card, window, "bottom");
    expect(spot.side).toBe("right");
  });

  it("lies inside an anchor too big for any side, at its lower right", () => {
    const spot = placeCard({ top: 0, left: 0, width: 720, height: 480 }, card, window, "bottom");
    expect(spot).toEqual({ side: "inside", top: 480 - 16 - 160, left: 720 - 16 - 288 });
  });

  it("stays inside the window along the side it sits on", () => {
    const spot = placeCard({ top: 8, left: 600, width: 100, height: 24 }, card, window, "bottom");
    expect(spot.side).toBe("bottom");
    expect(spot.left).toBe(720 - 8 - 288);
  });
});

describe("tour events", () => {
  it("reaches a listener until it unsubscribes", () => {
    const heard: string[] = [];
    const stop = onTourEvent((event) => heard.push(event));
    emitTourEvent("comment-added");
    stop();
    emitTourEvent("review-sent");
    expect(heard).toEqual(["comment-added"]);
  });
});
