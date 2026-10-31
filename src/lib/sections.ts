/** A plan's body read as sections, so the page can lay each one out by what
 * it is. Everything here works on the markdown source and hands back source
 * line numbers: the renderer stamps those onto the DOM, and comments anchor
 * to them. */

export type SectionKind =
  | "summary"
  | "current"
  | "approach"
  | "steps"
  | "decisions"
  | "risks"
  | "alternatives"
  | "reproduction"
  | "root-cause"
  | "blast-radius"
  | "rollback"
  | "findings"
  | "recommendations"
  | "scope"
  | "question"
  | "options"
  | "recommendation"
  | "other";

/** Heading words that name a kind. First match wins, so the order is the
 * rule: "Open questions" is a risks section, not a question section. */
const KIND_WORDS: [SectionKind, string[]][] = [
  ["summary", ["summary", "overview", "mission"]],
  ["current", ["current state", "what we know", "context"]],
  ["approach", ["approach", "architecture", "phases"]],
  ["steps", ["steps", "plan", "tasks", "todo"]],
  ["decisions", ["decisions"]],
  ["risks", ["risks", "open questions"]],
  ["alternatives", ["alternatives", "rejected"]],
  ["reproduction", ["reproduction"]],
  ["root-cause", ["root cause"]],
  ["blast-radius", ["blast radius"]],
  ["rollback", ["rollback"]],
  ["findings", ["findings"]],
  ["recommendations", ["recommendations"]],
  ["scope", ["scope"]],
  ["question", ["question"]],
  ["options", ["options"]],
  ["recommendation", ["recommendation"]],
];

/** What the page calls each kind, beside a heading that says it differently. */
export const KIND_NAMES: Record<SectionKind, string> = {
  summary: "Summary",
  current: "Current state",
  approach: "Approach",
  steps: "Steps",
  decisions: "Decisions",
  risks: "Risks and open questions",
  alternatives: "Alternatives",
  reproduction: "Reproduction",
  "root-cause": "Root cause",
  "blast-radius": "Blast radius",
  rollback: "Rollback",
  findings: "Findings",
  recommendations: "Recommendations",
  scope: "Scope",
  question: "Question",
  options: "Options",
  recommendation: "Recommendation",
  other: "",
};

export function sectionKind(heading: string): SectionKind {
  const text = heading.toLowerCase();
  for (const [kind, words] of KIND_WORDS) {
    if (words.some((word) => text.includes(word))) return kind;
  }
  return "other";
}

/** A run of markdown and the 1-indexed body line it starts on. */
export interface PlanSlice {
  body: string;
  line: number;
}

export interface PlanSection extends PlanSlice {
  /** The heading as the author wrote it, hashes and spacing removed. */
  heading: string;
  kind: SectionKind;
  level: number;
}

export interface PlanBody {
  /** What sits above the first section, once the title heading is gone. */
  lead: PlanSlice | null;
  sections: PlanSection[];
}

interface Heading {
  index: number;
  level: number;
  text: string;
}

const FENCE = /^\s{0,3}(```|~~~)/;
const HEADING = /^(#{1,6})\s+(.*)$/;

/** Headings outside fenced code. A `# comment` inside a python block is not a
 * section, and plans quote shell and python constantly. */
function headings(lines: string[]): Heading[] {
  const found: Heading[] = [];
  let fence: string | null = null;
  lines.forEach((line, index) => {
    const fenced = FENCE.exec(line);
    if (fence) {
      if (fenced && line.trim().startsWith(fence)) fence = null;
      return;
    }
    if (fenced) {
      fence = fenced[1];
      return;
    }
    const match = HEADING.exec(line);
    const text = match?.[2].replace(/\s+#+\s*$/, "").trim();
    if (match && text) found.push({ index, level: match[1].length, text });
  });
  return found;
}

function slice(lines: string[], from: number, to: number): PlanSlice | null {
  let start = from;
  let end = to;
  while (start < end && lines[start].trim() === "") start += 1;
  while (end > start && lines[end - 1].trim() === "") end -= 1;
  if (start === end) return null;
  return { body: lines.slice(start, end).join("\n"), line: start + 1 };
}

/** Whether the body's first H1 is the title the meta bar already shows. A
 * plan often shortens its title in the file, so a prefix counts. */
function isTitleHeading(heading: Heading, title: string): boolean {
  if (heading.level !== 1) return false;
  const normalise = (text: string) => text.toLowerCase().replace(/[\s.:,—–-]+$/, "").trim();
  const head = normalise(heading.text);
  return head.length > 0 && normalise(title).startsWith(head);
}

/**
 * Splits a body into the lead and the sections below it. The section level is
 * the shallowest heading left once the title is gone, so a plan written in
 * H1s reads the same as one written in H2s.
 */
export function splitSections(body: string, title: string): PlanBody {
  const lines = body.split("\n");
  const all = headings(lines);
  const titleHeading = all[0] && isTitleHeading(all[0], title) ? all[0] : null;
  const rest = titleHeading ? all.slice(1) : all;
  const start = titleHeading ? titleHeading.index + 1 : 0;

  if (rest.length === 0) {
    return { lead: slice(lines, start, lines.length), sections: [] };
  }
  const level = Math.min(...rest.map((heading) => heading.level));
  const tops = rest.filter((heading) => heading.level === level);

  const sections: PlanSection[] = [];
  tops.forEach((heading, i) => {
    const end = tops[i + 1]?.index ?? lines.length;
    const body = slice(lines, heading.index, end);
    if (!body) return;
    sections.push({
      ...body,
      heading: heading.text,
      kind: sectionKind(heading.text),
      level,
    });
  });
  return { lead: slice(lines, start, tops[0].index), sections };
}

export interface DecisionSlice extends PlanSlice {
  /** True for the run a decision card is drawn around. */
  card: boolean;
}

/** A decision's lead: `**D1 ...`, `- **D-2 ...`, or a `### D3 ...` heading. */
const DECISION_LEAD = /^(?:[-*+]\s+)?\*\*\s*D[-–—\s]?\d+\b/i;
const DECISION_HEADING = /^D[-–—\s]?\d+\b/i;

/**
 * Splits a decisions section into the runs the page cards. A card starts at a
 * `D<n>` heading, paragraph or list item and runs to the next one; a heading
 * card also ends at the next heading of its level or shallower.
 */
export function splitDecisions(body: string, startLine: number): DecisionSlice[] {
  const lines = body.split("\n");
  const heads = new Map(headings(lines).map((heading) => [heading.index, heading]));

  const starts: { index: number; card: boolean; level: number }[] = [];
  let openLevel = 0;
  lines.forEach((line, index) => {
    if (line.trim() === "") return;
    // Only the first line of a block can open a card.
    if (index > 0 && lines[index - 1].trim() !== "") return;
    const heading = heads.get(index);
    const card = heading
      ? DECISION_HEADING.test(heading.text)
      : !heads.has(index) && DECISION_LEAD.test(line.trimStart());
    const level = heading?.level ?? 0;
    if (card) {
      openLevel = heading ? heading.level : 0;
      starts.push({ index, card, level });
      return;
    }
    // A heading at or above the open card's level closes it.
    if (heading && openLevel > 0 && heading.level <= openLevel) {
      openLevel = 0;
      starts.push({ index, card: false, level });
      return;
    }
    if (starts.length === 0) starts.push({ index, card: false, level });
  });

  const slices: DecisionSlice[] = [];
  starts.forEach((start, i) => {
    const end = starts[i + 1]?.index ?? lines.length;
    const part = slice(lines, start.index, end);
    if (part) {
      slices.push({
        body: part.body,
        line: part.line + startLine - 1,
        card: start.card,
      });
    }
  });
  return slices;
}

/** What each plan type has to carry, mirroring the built-in standards. */
export const REQUIRED_SECTIONS: Record<string, string[]> = {
  feature: ["Summary", "Current state", "Approach", "Steps", "Risks and open questions"],
  bug: ["Summary", "Reproduction", "Root cause", "Blast radius", "Steps"],
  migration: ["Summary", "Current state", "Approach", "Steps", "Rollback"],
  research: ["Question", "What we know", "Options", "Recommendation", "Open questions"],
  audit: ["Scope", "Findings", "Recommendations"],
};

/** The required sections no heading carries. A type nobody declared asks for
 * nothing: the page says what is missing, it never invents a standard. */
export function missingSections(type: string | null, headings: string[]): string[] {
  const required = REQUIRED_SECTIONS[type?.trim().toLowerCase() ?? ""] ?? [];
  const found = headings.map((heading) => heading.toLowerCase());
  return required.filter(
    (section) => !found.some((heading) => heading.includes(section.toLowerCase())),
  );
}
