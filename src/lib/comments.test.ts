import { describe, expect, it } from "vitest";
import {
  formatThreadsForAgent,
  parseCommentsSidecar,
  serializeCommentsSidecar,
  type CommentThread,
} from "./comments";

function thread(overrides: Partial<CommentThread> = {}): CommentThread {
  return {
    id: "t1",
    quote: "the quoted text",
    lineStart: 3,
    lineEnd: 3,
    resolved: false,
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
            { id: "c1", text: "why this order?", createdAt: "x", author: "user" },
            { id: "c2", text: "because of X", createdAt: "y", author: "claude-code" },
          ],
        }),
      ],
      "plans/auth.md",
    );

    expect(output).toContain("plans/auth.md");
    expect(output).toContain("Lines 3-5");
    expect(output).toContain("> the quoted text");
    expect(output).toContain("why this order?");
    expect(output).toContain("because of X");
  });

  it("says so plainly when nothing is open", () => {
    expect(formatThreadsForAgent([thread({ resolved: true })], "plans/auth.md")).toContain(
      "No open review comments",
    );
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
