/** Who wrote a comment: the person using OpenPlan, or the agent that did. */
export type CommentAuthor = "user" | (string & {});

export interface CommentEntry {
  id: string;
  text: string;
  createdAt: string; // ISO 8601
  /** Set (and bumped) whenever the comment's text is edited after creation —
   * drives an "(edited)" marker, Notion-style. Absent for never-edited entries. */
  editedAt?: string;
  author: CommentAuthor;
}

export interface CommentThread {
  id: string;
  /** The exact text this thread is anchored to. */
  quote: string;
  /** 1-indexed source line range in the markdown file (inclusive). */
  lineStart: number;
  lineEnd: number;
  resolved: boolean;
  /** comments[0] is the opening comment; the rest are replies, in order. */
  comments: CommentEntry[];
}

/** An in-progress, not-yet-saved comment — just the anchor, captured from
 * the live selection when the user starts commenting. The draft's own text
 * is kept as local state in the panel until submitted (no need to re-render
 * the whole app on every keystroke). */
export interface PendingDraft {
  quote: string;
  lineStart: number;
  lineEnd: number;
}

export function newCommentId(): string {
  return crypto.randomUUID();
}

export function newCommentEntry(
  text: string,
  author: CommentAuthor = "user",
): CommentEntry {
  return { id: newCommentId(), text, createdAt: new Date().toISOString(), author };
}

const SIDECAR_VERSION = 2;

interface SidecarShape {
  version: number;
  threads: CommentThread[];
}

function isValidThread(value: unknown): value is CommentThread {
  if (!value || typeof value !== "object") return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.id === "string" &&
    typeof t.quote === "string" &&
    typeof t.lineStart === "number" &&
    typeof t.lineEnd === "number" &&
    typeof t.resolved === "boolean" &&
    Array.isArray(t.comments)
  );
}

/** Parses a comment sidecar file's contents. Malformed or missing data
 * (including from a future/incompatible version) degrades to an empty
 * list rather than throwing — comments are a nice-to-have, never a reason
 * to block opening the document. */
export function parseCommentsSidecar(json: string | null): CommentThread[] {
  if (!json) return [];
  try {
    const data: unknown = JSON.parse(json);
    if (!data || typeof data !== "object") return [];
    const threads = (data as Partial<SidecarShape>).threads;
    if (!Array.isArray(threads)) return [];
    // Version 1 predates authorship, when the only writer was the person
    // reading the plan.
    return threads.filter(isValidThread).map((thread) => ({
      ...thread,
      comments: thread.comments.map((comment) => ({
        ...comment,
        author: comment.author ?? "user",
      })),
    }));
  } catch {
    return [];
  }
}

export function serializeCommentsSidecar(threads: CommentThread[]): string {
  const payload: SidecarShape = { version: SIDECAR_VERSION, threads };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

/**
 * Renders unresolved (by default) comment threads as LLM-friendly Markdown:
 * the file path, each thread's source line range and exact quote, and its
 * full comment + reply thread — everything an agent needs to locate and
 * act on the feedback without re-deriving context.
 */
export function formatThreadsForAgent(
  threads: CommentThread[],
  fileLabel: string,
  opts: { includeResolved?: boolean } = {},
): string {
  const relevant = threads
    .filter((t) => opts.includeResolved || !t.resolved)
    .slice()
    .sort((a, b) => a.lineStart - b.lineStart);

  if (relevant.length === 0) {
    return `No open review comments on \`${fileLabel}\`.\n`;
  }

  const out: string[] = [
    `Review comments on \`${fileLabel}\`. Each item quotes the exact text it refers to and the line(s) in the file. Please address the feedback in each thread.`,
    "",
  ];

  for (const thread of relevant) {
    const lineLabel =
      thread.lineStart === thread.lineEnd
        ? `Line ${thread.lineStart}`
        : `Lines ${thread.lineStart}-${thread.lineEnd}`;
    out.push(`### ${lineLabel}`);
    for (const quoteLine of thread.quote.split("\n")) out.push(`> ${quoteLine}`);
    out.push("");
    const [root, ...replies] = thread.comments;
    if (root) out.push(`- **Comment:** ${root.text}`);
    for (const reply of replies) out.push(`  - **Reply:** ${reply.text}`);
    out.push("");
  }

  return `${out.join("\n").trimEnd()}\n`;
}
