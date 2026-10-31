import { describe, expect, it } from "vitest";
import { loadReplyDrafts, repliedAnswers, saveReplyDrafts } from "./alignmentDrafts";
import type { Question } from "./work";

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  };
}

const question = (id: string, extra: Partial<Question> = {}): Question => ({
  id,
  aspect: "scope",
  question: `Question ${id}`,
  options: [
    { id: "a", label: "Keep it" },
    { id: "b", label: "Drop it" },
  ],
  mustAnswer: false,
  ...extra,
});

describe("reply drafts in storage", () => {
  it("keeps each plan's drafts apart across a reload", () => {
    const storage = memoryStorage();
    saveReplyDrafts("p1", { q1: { option: "a", text: "Why not", replied: true } }, storage);
    saveReplyDrafts("p2", { q1: { text: "Other plan", replied: false } }, storage);

    expect(loadReplyDrafts("p1", storage)).toEqual({
      q1: { option: "a", text: "Why not", replied: true },
    });
    expect(loadReplyDrafts("p2", storage)).toEqual({ q1: { text: "Other plan", replied: false } });
  });

  it("forgets a plan's drafts once none are left", () => {
    const storage = memoryStorage();
    saveReplyDrafts("p1", { q1: { text: "Draft", replied: false } }, storage);
    saveReplyDrafts("p1", {}, storage);

    expect(storage.length).toBe(0);
  });

  it("drops what it cannot read and keeps the rest", () => {
    const storage = memoryStorage();
    storage.setItem(
      "openplan:alignment-drafts:p1",
      JSON.stringify({ q1: { text: 3 }, q2: { option: "b", text: "", replied: true }, q3: null }),
    );

    expect(loadReplyDrafts("p1", storage)).toEqual({ q2: { option: "b", text: "", replied: true } });
    storage.setItem("openplan:alignment-drafts:p1", "{not json");
    expect(loadReplyDrafts("p1", storage)).toEqual({});
  });

  it("runs on without storage", () => {
    const broken = {
      ...memoryStorage(),
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    } as Storage;

    expect(loadReplyDrafts("p1", broken)).toEqual({});
    expect(() => saveReplyDrafts("p1", { q1: { text: "x", replied: false } }, broken)).not.toThrow();
  });
});

describe("repliedAnswers", () => {
  it("gives the answers replied to and not yet recorded", () => {
    const answers = repliedAnswers(
      [
        question("q1"),
        question("q2"),
        question("q3", { answer: { kind: "option", options: ["a"] } }),
        question("q4"),
      ],
      {
        q1: { option: "a", text: " Fewer parts. ", replied: true },
        q2: { option: "b", text: "", replied: false },
        q3: { option: "b", text: "", replied: true },
        q4: { text: "Only new plans.", replied: true },
      },
    );

    expect(answers).toEqual({
      q1: { kind: "option", options: ["a"], note: "Fewer parts." },
      q4: { kind: "text", text: "Only new plans." },
    });
  });
});
