/** Who this machine's comments belong to. */
export interface Identity {
  name: string;
  email: string;
  /** The picture's path on disk. Absent or null draws the marble. */
  avatar?: string | null;
}

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
  /** The person who typed this, when a person did. Agents leave it unset:
   * their name is the tool's, already in `author`. */
  authorName?: string;
  /** Whose base this was written against, agent entries included. This is
   * what tells two people apart once a base is shared. */
  authorEmail?: string;
}

/** What to call whoever wrote a comment: a person by name, an agent by
 * tool. Kept identical to the Rust side, which writes the same files. */
export function commentLabel(entry: CommentEntry): string {
  return entry.authorName ?? entry.author;
}

export interface CommentThread {
  id: string;
  /** The exact text this thread is anchored to. */
  quote: string;
  /** 1-indexed source line range in the markdown file (inclusive). */
  lineStart: number;
  lineEnd: number;
  resolved: boolean;
  /** Written but not sent. The person is still putting the review together,
   * so nothing outside the app may read it yet. A sidecar saved before
   * reviews existed holds threads that went out the moment they were made. */
  pending: boolean;
  /** Who closed the thread: `user`, or the agent's own name. */
  resolvedBy: string | null;
  resolvedAt: string | null;
  /** When the review carrying this thread was sent. */
  sentAt: string | null;
  /** comments[0] is the opening comment; the rest are replies, in order. */
  comments: CommentEntry[];
}

/** Where a thread stands for whoever is reading it. */
export type ThreadState = "open" | "answered" | "resolved";

/** Open means nobody has answered; answered means an agent had the last word. */
export function threadState(thread: CommentThread): ThreadState {
  if (thread.resolved) return "resolved";
  const last = thread.comments[thread.comments.length - 1];
  return last && last.author !== "user" ? "answered" : "open";
}

/** A thread the person has written but not sent yet. */
export function isPending(thread: CommentThread): boolean {
  return thread.pending && !thread.resolved;
}

/** Everything waiting goes out together: one review, one time on all of it.
 * A thread already sent keeps the time it actually went. */
export function markSent(threads: CommentThread[], now: string): CommentThread[] {
  return threads.map((thread) =>
    isPending(thread) ? { ...thread, pending: false, sentAt: now } : thread,
  );
}

/** Closing a thread in the app is always the person's own doing; an agent
 * closing one signs it with its own name through the MCP server. */
export function resolveThread(thread: CommentThread, now: string): CommentThread {
  return { ...thread, resolved: true, resolvedBy: "user", resolvedAt: now };
}

/** Reopening clears every trace of the close, so the thread reads as open
 * again rather than as closed by whoever closed it last. */
export function reopenThread(thread: CommentThread): CommentThread {
  return { ...thread, resolved: false, resolvedBy: null, resolvedAt: null };
}

/** The panel's three sections. A thread is in one of them, never two. */
export interface ThreadGroups {
  /** Written, on disk, not sent. */
  pending: CommentThread[];
  /** Sent and still live: open and answered together. */
  open: CommentThread[];
  resolved: CommentThread[];
}

export function groupThreads(threads: CommentThread[]): ThreadGroups {
  return {
    pending: threads.filter(isPending),
    open: threads.filter((t) => !t.resolved && !t.pending),
    resolved: threads.filter((t) => t.resolved),
  };
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
  identity?: Identity | null,
  author: CommentAuthor = "user",
): CommentEntry {
  return {
    id: newCommentId(),
    text,
    createdAt: new Date().toISOString(),
    author,
    ...(identity ? { authorName: identity.name, authorEmail: identity.email } : {}),
  };
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
    // reading the plan. Sidecars written before reviews existed hold threads
    // that went out the moment they were made.
    return threads.filter(isValidThread).map((thread) => ({
      ...thread,
      pending: thread.pending ?? false,
      resolvedBy: thread.resolvedBy ?? null,
      resolvedAt: thread.resolvedAt ?? null,
      sentAt: thread.sentAt ?? null,
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
 * act on the feedback without re-deriving context. A pending thread is left
 * out: it has not been sent, so as far as an agent is concerned it is not
 * there. The Rust side writes the same text; a golden test on each keeps
 * them identical.
 */
export function formatThreadsForAgent(
  threads: CommentThread[],
  fileLabel: string,
  opts: { includeResolved?: boolean } = {},
): string {
  const relevant = threads
    .filter((t) => (opts.includeResolved || !t.resolved) && !t.pending)
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
    out.push(`### ${lineLabel} (thread ${thread.id}) [${threadState(thread)}]`);
    for (const quoteLine of thread.quote.split("\n")) out.push(`> ${quoteLine}`);
    out.push("");
    const [root, ...replies] = thread.comments;
    if (root) out.push(`- **Comment (${commentLabel(root)}):** ${root.text}`);
    for (const reply of replies)
      out.push(`  - **Reply (${commentLabel(reply)}):** ${reply.text}`);
    out.push("");
  }

  return `${out.join("\n").trimEnd()}\n`;
}
