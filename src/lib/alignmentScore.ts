import { spokenList, type Answer, type Question, type Role, type WorkRecord } from "./work";

/** One area the questions cover: every question with the same aspect. */
export interface AlignmentArea {
  /** The aspect as first asked. */
  name: string;
  /** The same, to start a chip. */
  label: string;
  /** At least one of its questions has an answer, sent or drafted. */
  settled: boolean;
  /** Who asked its first question. */
  askedBy?: Role;
}

export interface AlignmentScore {
  /** 0 to 100, always `coverage` plus `reasoning`. */
  total: number;
  /** Up to 80, for the share of areas settled. */
  coverage: number;
  /** Up to 20, for the share of answers that say why. */
  reasoning: number;
  areas: AlignmentArea[];
  answered: number;
  /** Answers with a note beside the pick, or written in full. */
  reasoned: number;
  /** Areas every plan should settle that no question asks about. They count
   * for nothing. */
  notAsked: string[];
}

/** The areas the standards ask agents to cover on every plan. */
export const REQUIRED_AREAS = ["edge cases", "error handling", "scale"];

const COVERAGE_POINTS = 80;
const REASONING_POINTS = 20;

/** How well the person and the agents agree on the plan so far. `drafts`
 * holds the replies not sent yet, by question id. */
export function alignmentScore(
  questions: Question[],
  drafts: Record<string, Answer>,
): AlignmentScore {
  const answerTo = (question: Question) => question.answer ?? drafts[question.id];
  const areas = new Map<string, AlignmentArea>();
  for (const question of questions) {
    const key = areaKey(question.aspect);
    const area = areas.get(key) ?? newArea(question);
    area.settled ||= answerTo(question) != null;
    areas.set(key, area);
  }
  const answers = questions.flatMap((question) => answerTo(question) ?? []);
  const reasoned = answers.filter(givesReason).length;
  const settled = [...areas.values()].filter((area) => area.settled).length;
  const coverage = share(settled, areas.size, COVERAGE_POINTS);
  const reasoning = share(reasoned, answers.length, REASONING_POINTS);
  return {
    total: coverage + reasoning,
    coverage,
    reasoning,
    areas: [...areas.values()],
    answered: answers.length,
    reasoned,
    notAsked: REQUIRED_AREAS.filter((required) => !areas.has(required)),
  };
}

/** The same aspect whatever its case and spacing. */
export function areaKey(aspect: string): string {
  return aspect.trim().replace(/\s+/g, " ").toLowerCase();
}

/** What the Build button says while areas are unsettled. It reads only the
 * answers the agent has: a draft reply does not travel with Build. */
export function buildTooltip(record: WorkRecord | null): string | undefined {
  const open = openAreas(alignmentScore(record?.alignment?.questions ?? [], {}));
  if (open.length === 0) return undefined;
  return `Starts the work. The agent asks about ${spokenList(open)} first.`;
}

/** What the Alignment tab's Build says before and after a press. It counts
 * draft replies, since that Build sends them first. */
export function sendBarBuild(score: AlignmentScore): { tooltip: string; sent: string } {
  const open = openAreas(score);
  if (open.length === 0) {
    return {
      tooltip: "Starts the work.",
      sent: "Build sent. Everything is settled, so the agent starts now.",
    };
  }
  return {
    tooltip: `Starts the work. The agent asks about ${spokenList(open)} first.`,
    sent: `Build sent. The agent asks about ${spokenList(open)} before it starts.`,
  };
}

function openAreas(score: AlignmentScore): string[] {
  return score.areas.filter((area) => !area.settled).map((area) => area.name);
}

function newArea(question: Question): AlignmentArea {
  const name = question.aspect.trim().replace(/\s+/g, " ");
  return {
    name,
    label: name.charAt(0).toUpperCase() + name.slice(1),
    settled: false,
    askedBy: question.role,
  };
}

function givesReason(answer: Answer): boolean {
  if (answer.kind === "text") return true;
  return answer.kind === "option" && Boolean(answer.note?.trim());
}

function share(part: number, whole: number, points: number): number {
  return whole === 0 ? 0 : Math.round((points * part) / whole);
}
