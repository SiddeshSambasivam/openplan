import { describe, expect, it } from "vitest";
import { progress, type Todo, type TodoState, type WorkRecord } from "./work";

const todo = (id: string, state: TodoState): Todo => ({
  id,
  text: "Write it",
  state,
  by: "claude-code",
  at: "2026-10-28T10:00:00Z",
});

const record = (todos: Todo[]): WorkRecord => ({
  version: 1,
  repos: [],
  decisions: [],
  todos,
  prs: [],
});

describe("progress", () => {
  it("counts done todos out of every todo", () => {
    const counted = progress(
      record([todo("t1", "done"), todo("t2", "doing"), todo("t3", "open")]),
    );

    expect(counted).toEqual({ done: 1, total: 3 });
  });

  it("leaves dropped todos out of both counts", () => {
    const counted = progress(record([todo("t1", "done"), todo("t2", "dropped")]));

    expect(counted).toEqual({ done: 1, total: 1 });
  });

  it("is zero of zero with no todos", () => {
    expect(progress(record([]))).toEqual({ done: 0, total: 0 });
  });
});
