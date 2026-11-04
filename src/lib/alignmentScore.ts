import {
  spokenList,
  type Answer,
  type Question,
  type Role,
  type Understanding,
  type UnderstandingDraft,
  type WorkRecord,
} from "./work";

/** Where the agent's statement on an area stands. Corrected waits for the
 * agent to restate it. */
export type UnderstandingState = "not stated" | "stated" | "confirmed" | "corrected";

export interface AreaUnderstanding {
  state: UnderstandingState;
  statement?: string;
  correction?: string;
  /** Who confirmed or corrected it, once that is on the record. */
  by?: string;
}

/** One area the questions or statements cover: every question with the same
 * aspect, and the agent's statement on it. */
export interface AlignmentArea {
  /** The aspect as first asked or stated. */
  name: string;
  /** The same, to start a chip. */
  label: string;
  /** At least one of its questions has an answer, sent or drafted. */
  settled: boolean;
  /** Who asked its first question. */
  askedBy?: Role;
  /** Once the agent has stated any area: set for each required or stated
   * area. */
  understanding?: AreaUnderstanding;
}

export interface AlignmentScore {
  /** 0 to 100. Under the answers rule it is `coverage` plus `reasoning`.
   * Under the understanding rule it is the share of required areas
   * confirmed. */
  total: number;
  /** What `total` counts: answered areas until the agent states its
   * understanding of any area, then confirmed ones. */
  rule: "answers" | "understanding";
  /** Up to 80, for the areas settled out of the required ones and every
   * settled one. */
  coverage: number;
  /** Up to 20, 5 for each answer that says why. */
  reasoning: number;
  /** The required areas first, in order, then the others. */
  areas: AlignmentArea[];
  /** The areas the understanding rule counts. */
  required: string[];
  /** Required areas confirmed, sent or drafted. */
  confirmed: number;
  /** The areas coverage counts: the required ones and every settled one. */
  counted: number;
  answered: number;
  /** Answers with a note beside the pick, or written in full. */
  reasoned: number;
  /** Under the answers rule, the areas every plan should settle that no
   * question asks about. They hold coverage down until settled. */
  notAsked: string[];
}

/** What the person has drafted and not sent: answers by question id, and
 * confirmations and corrections by area. */
export interface ScoreDrafts {
  answers: Record<string, Answer>;
  understanding: Record<string, UnderstandingDraft>;
}

/** The areas the person confirms before Build. A feature plan also needs
 * its entities and states. The Rust side keeps the same lists, which the
 * agent is told. */
export function requiredAreas(planType: string | null): string[] {
  return planType?.trim().toLowerCase() === "feature" ? FEATURE_AREAS : EVERY_PLAN_AREAS;
}

const EVERY_PLAN_AREAS = ["edge cases", "error handling", "scale"];
const FEATURE_AREAS = ["entities", "states", ...EVERY_PLAN_AREAS];

const COVERAGE_POINTS = 80;
const REASONING_POINTS = 20;
const POINTS_PER_REASON = 5;

/** How well the person and the agents agree on the plan so far. Until the
 * agent states its understanding of any area, the score counts answered
 * areas and only rises as questions are asked and answered. From the first
 * statement on, it is the share of required areas the person confirmed. A
 * draft counts like a sent reply. */
export function alignmentScore(
  questions: Question[],
  understanding: Understanding[],
  drafts: ScoreDrafts,
  planType: string | null,
): AlignmentScore {
  const rule = understanding.length > 0 ? "understanding" : "answers";
  const required = rule === "understanding" ? requiredAreas(planType) : EVERY_PLAN_AREAS;
  const answerTo = (question: Question) => question.answer ?? drafts.answers[question.id];
  const areas = new Map<string, AlignmentArea>();
  if (rule === "understanding") for (const name of required) areas.set(name, newArea(name));
  for (const question of questions) {
    const key = areaKey(question.aspect);
    const area = areas.get(key) ?? newArea(question.aspect);
    area.askedBy ??= question.role;
    area.settled ||= answerTo(question) != null;
    areas.set(key, area);
  }
  for (const stated of understanding) {
    const key = areaKey(stated.area);
    if (!areas.has(key)) areas.set(key, newArea(stated.area));
  }
  if (rule === "understanding") {
    for (const [key, area] of areas) {
      const shown = understandingOf(key, understanding, drafts.understanding);
      if (required.includes(key) || shown.state !== "not stated") area.understanding = shown;
    }
  }

  const answers = questions.flatMap((question) => answerTo(question) ?? []);
  const reasoned = answers.filter(givesReason).length;
  const settled = [...areas].filter(([, area]) => area.settled).map(([key]) => key);
  const counted = new Set([...EVERY_PLAN_AREAS, ...settled]);
  const coverage = Math.round((COVERAGE_POINTS * settled.length) / counted.size);
  const reasoning = Math.min(REASONING_POINTS, POINTS_PER_REASON * reasoned);
  const confirmed = required.filter((name) => areas.get(name)?.understanding?.state === "confirmed").length;
  return {
    total: rule === "understanding" ? Math.round((100 * confirmed) / required.length) : coverage + reasoning,
    rule,
    coverage,
    reasoning,
    areas: [...areas.values()],
    required,
    confirmed,
    counted: counted.size,
    answered: answers.length,
    reasoned,
    notAsked: rule === "answers" ? EVERY_PLAN_AREAS.filter((name) => !areas.has(name)) : [],
  };
}

/** Where one area's statement stands, with a draft taking the place of what
 * the record says. A correction with no words yet is no draft. */
export function understandingOf(
  area: string,
  understanding: Understanding[],
  drafts: Record<string, UnderstandingDraft>,
): AreaUnderstanding {
  const recorded = understanding.find((stated) => areaKey(stated.area) === area);
  if (!recorded) return { state: "not stated" };
  const draft = drafts[area];
  const statement = recorded.statement;
  if (draft && "correct" in draft && draft.correct.trim()) {
    return { state: "corrected", statement, correction: draft.correct.trim() };
  }
  if (draft && "confirm" in draft) return { state: "confirmed", statement };
  if (recorded.correction) {
    return { state: "corrected", statement, correction: recorded.correction.text, by: recorded.correction.by };
  }
  if (recorded.confirmed) return { state: "confirmed", statement, by: recorded.confirmed.by };
  return { state: "stated", statement };
}

/** The same aspect whatever its case and spacing. */
export function areaKey(aspect: string): string {
  return aspect.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Whether the score falls short of the person's target. A target of 0 is
 * no target. */
export function belowTarget(total: number, target: number): boolean {
  return target > 0 && total < target;
}

/** Whether Build can start the work. A target of 0 turns the gate off.
 * Otherwise a plan with any alignment needs the person to have confirmed
 * every required area, and one with none waits for it. Like `buildTooltip`,
 * it reads only what the record holds: a draft does not travel with Build. */
export function canBuild(record: WorkRecord | null, target: number, planType: string | null): boolean {
  if (target <= 0) return true;
  if (!hasAlignment(record)) return false;
  return gaps(record, planType).length === 0;
}

/** What the Build button says: what is missing while Build waits, or the
 * areas the agent still asks about once it can start. */
export function buildTooltip(
  record: WorkRecord | null,
  target: number,
  planType: string | null,
): string | undefined {
  const score = recordedScore(record, planType);
  if (!canBuild(record, target, planType)) {
    const areas = recordedAreas(record, planType);
    const missing = areas.filter((area) => area.state === "not stated").map((area) => area.name);
    const corrected = areas.filter((area) => area.state === "corrected").map((area) => area.name);
    const waiting = areas.filter((area) => area.state === "stated").map((area) => area.name);
    const lead =
      score.rule === "answers" && belowTarget(score.total, target)
        ? `Align with the agent first. Alignment is ${score.total}%, and Build opens at ${target}%.`
        : missing.length + corrected.length > 0 && "Align with the agent first.";
    return [
      lead,
      missing.length > 0 && `The agent still has to state its understanding of ${spokenList(missing)}.`,
      corrected.length > 0 && `The agent still has to restate ${spokenList(corrected)}.`,
      waiting.length > 0 && `Confirm the agent's understanding of ${spokenList(waiting)} first.`,
    ]
      .filter(Boolean)
      .join(" ");
  }
  const unsettled = score.areas
    .filter((area) => !area.settled && hasQuestion(record, area.name))
    .map((area) => area.name);
  if (unsettled.length === 0) return undefined;
  return `Starts the work. The agent asks about ${spokenList(unsettled)} first.`;
}

function hasAlignment(record: WorkRecord | null): record is WorkRecord {
  const alignment = record?.alignment;
  return alignment != null && alignment.questions.length + (alignment.understanding?.length ?? 0) > 0;
}

/** The required areas not confirmed on the record. */
function gaps(record: WorkRecord, planType: string | null): string[] {
  return recordedAreas(record, planType)
    .filter((area) => area.state !== "confirmed")
    .map((area) => area.name);
}

/** Each required area and where its statement stands on the record. */
function recordedAreas(record: WorkRecord | null, planType: string | null) {
  const understanding = record?.alignment?.understanding ?? [];
  return requiredAreas(planType).map((name) => ({ name, state: understandingOf(name, understanding, {}).state }));
}

function recordedScore(record: WorkRecord | null, planType: string | null): AlignmentScore {
  const alignment = record?.alignment;
  return alignmentScore(alignment?.questions ?? [], alignment?.understanding ?? [], NO_DRAFTS, planType);
}

const NO_DRAFTS: ScoreDrafts = { answers: {}, understanding: {} };

function hasQuestion(record: WorkRecord | null, area: string): boolean {
  return (record?.alignment?.questions ?? []).some((question) => areaKey(question.aspect) === areaKey(area));
}

function newArea(aspect: string): AlignmentArea {
  const name = aspect.trim().replace(/\s+/g, " ");
  return { name, label: name.charAt(0).toUpperCase() + name.slice(1), settled: false };
}

function givesReason(answer: Answer): boolean {
  if (answer.kind === "text") return true;
  return answer.kind === "option" && Boolean(answer.note?.trim());
}
