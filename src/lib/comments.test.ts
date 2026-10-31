import { describe, expect, it } from "vitest";
import {
  formatThreadsForAgent,
  parseCommentsSidecar,
  serializeCommentsSidecar,
  threadState,
  type CommentEntry,
  type CommentThread,
} from "./comments";

function entry(author: string, text = "done"): CommentEntry {
  return { id: `c-${author}-${text}`, text, createdAt: "2026-09-22T10:00:00Z", author };
}

function thread(overrides: Partial<CommentThread> = {}): CommentThread {
  return {
    id: "t1",
    quote: "the quoted text",
    lineStart: 3,
    lineEnd: 3,
    resolved: false,
    pending: false,
    resolvedBy: null,
    resolvedAt: null,
    sentAt: null,
    comments: [
      {
        id: "c1",
        text: "please clarify",
        createdAt: "2026-08-15T10:00:00Z",
        author: "user",
      },
    ],
    ...overrides,
  };
}

describe("parseCommentsSidecar", () => {
  it("reads back what it wrote", () => {
    const threads = [thread()];

    expect(parseCommentsSidecar(serializeCommentsSidecar(threads))).toEqual(threads);
  });

  it("treats comments saved before authors existed as the user's own", () => {
    const v1 = JSON.stringify({
      version: 1,
      threads: [
        {
          id: "t1",
          quote: "q",
          lineStart: 1,
          lineEnd: 1,
          resolved: false,
          comments: [{ id: "c1", text: "hi", createdAt: "2026-08-15T10:00:00Z" }],
        },
      ],
    });

    expect(parseCommentsSidecar(v1)[0].comments[0].author).toBe("user");
  });

  it("treats threads saved before reviews existed as already sent", () => {
    const before = JSON.stringify({
      version: 2,
      threads: [
        {
          id: "t1",
          quote: "q",
          lineStart: 1,
          lineEnd: 1,
          resolved: false,
          comments: [{ id: "c1", text: "hi", createdAt: "x", author: "user" }],
        },
      ],
    });

    expect(parseCommentsSidecar(before)[0]).toMatchObject({
      pending: false,
      resolvedBy: null,
      resolvedAt: null,
      sentAt: null,
    });
  });

  it("keeps who closed a thread and when", () => {
    const threads = [
      thread({
        resolved: true,
        resolvedBy: "claude-code",
        resolvedAt: "2026-09-22T12:00:00Z",
        sentAt: "2026-09-22T11:00:00Z",
      }),
    ];

    expect(parseCommentsSidecar(serializeCommentsSidecar(threads))).toEqual(threads);
  });
});

describe("threadState", () => {
  it("is open until somebody other than the person answers", () => {
    expect(threadState(thread())).toBe("open");
    expect(threadState(thread({ comments: [entry("user", "ask")] }))).toBe("open");
  });

  it("is answered while an agent had the last word", () => {
    expect(
      threadState(thread({ comments: [entry("user", "ask"), entry("claude-code")] })),
    ).toBe("answered");
  });

  it("goes back to open when the person replies again", () => {
    expect(
      threadState(
        thread({
          comments: [entry("user", "ask"), entry("claude-code"), entry("user", "again")],
        }),
      ),
    ).toBe("open");
  });

  it("is resolved whoever spoke last", () => {
    expect(
      threadState(thread({ resolved: true, comments: [entry("claude-code")] })),
    ).toBe("resolved");
  });

  it("keeps the agent that wrote a comment", () => {
    const threads = parseCommentsSidecar(
      serializeCommentsSidecar([
        thread({
          comments: [
            {
              id: "c1",
              text: "done",
              createdAt: "2026-08-15T10:00:00Z",
              author: "claude-code",
            },
          ],
        }),
      ]),
    );

    expect(threads[0].comments[0].author).toBe("claude-code");
  });

  it("degrades to no comments rather than throwing on unusable input", () => {
    expect(parseCommentsSidecar(null)).toEqual([]);
    expect(parseCommentsSidecar("{not json")).toEqual([]);
    expect(parseCommentsSidecar(JSON.stringify({ version: 2 }))).toEqual([]);
    expect(
      parseCommentsSidecar(JSON.stringify({ version: 2, threads: [{ id: 1 }] })),
    ).toEqual([]);
  });
});

describe("formatThreadsForAgent", () => {
  it("gives an agent the file, the lines, the quote, and the discussion", () => {
    const output = formatThreadsForAgent(
      [
        thread({
          lineStart: 3,
          lineEnd: 5,
          comments: [
            {
              id: "c1",
              text: "why this order?",
              createdAt: "x",
              author: "user",
              authorName: "Sid",
              authorEmail: "sid@hypotenuse.ai",
            },
            { id: "c2", text: "because of X", createdAt: "y", author: "claude-code" },
          ],
        }),
      ],
      "plans/auth.md",
    );

    expect(output).toContain("plans/auth.md");
    // The state tells the agent whether it already spoke in this thread.
    expect(output).toContain("### Lines 3-5 (thread t1) [answered]");
    // A person is named; an agent is its tool, whoever it ran for.
    expect(output).toContain("- **Comment (Sid):** why this order?");
    expect(output).toContain("  - **Reply (claude-code):** because of X");
    expect(output).toContain("> the quoted text");
    expect(output).toContain("why this order?");
    expect(output).toContain("because of X");
  });

  it("says so plainly when nothing is open", () => {
    expect(formatThreadsForAgent([thread({ resolved: true })], "plans/auth.md")).toContain(
      "No open review comments",
    );
  });

  it("leaves out a thread that has not been sent", () => {
    const output = formatThreadsForAgent(
      [thread({ id: "sent" }), thread({ id: "unsent", lineStart: 9, pending: true })],
      "plans/auth.md",
    );

    expect(output).toContain("thread sent");
    expect(output).not.toContain("unsent");
  });

  it("orders threads the way they are read, not the way they were made", () => {
    const output = formatThreadsForAgent(
      [
        thread({ id: "late", lineStart: 40, lineEnd: 40 }),
        thread({ id: "early", lineStart: 2, lineEnd: 2 }),
      ],
      "plans/auth.md",
    );

    expect(output.indexOf("Line 2")).toBeLessThan(output.indexOf("Line 40"));
  });
});
