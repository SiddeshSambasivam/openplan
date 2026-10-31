import { describe, expect, it } from "vitest";
import {
  answeredCount,
  draftedAnswers,
  loadRailShown,
  loadReplyDrafts,
  newestWaiting,
  nextWaiting,
  saveRailShown,
  saveReplyDrafts,
} from "./alignmentDrafts";
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
    saveReplyDrafts("p1", { q1: { option: "a", text: "Why not" } }, storage);
    saveReplyDrafts("p2", { q1: { text: "Other plan" } }, storage);

    expect(loadReplyDrafts("p1", storage)).toEqual({ q1: { option: "a", text: "Why not" } });
    expect(loadReplyDrafts("p2", storage)).toEqual({ q1: { text: "Other plan" } });
  });

  it("forgets a plan's drafts once none are left", () => {
    const storage = memoryStorage();
    saveReplyDrafts("p1", { q1: { text: "Draft" } }, storage);
    saveReplyDrafts("p1", {}, storage);

    expect(storage.length).toBe(0);
  });

  it("drops what it cannot read and keeps the rest, drafts saved before picks counted included", () => {
    const storage = memoryStorage();
    storage.setItem(
      "openplan:alignment-drafts:p1",
      JSON.stringify({ q1: { text: 3 }, q2: { option: "b", text: "", replied: false }, q3: null }),
    );

    expect(loadReplyDrafts("p1", storage)).toEqual({ q2: { option: "b", text: "" } });
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
    expect(() => saveReplyDrafts("p1", { q1: { text: "x" } }, broken)).not.toThrow();
  });
});

describe("draftedAnswers", () => {
  it("gives a pick, a pick with a note, or words alone, for questions not yet recorded", () => {
    const answers = draftedAnswers(
      [
        question("q1"),
        question("q2"),
        question("q3", { answer: { kind: "option", options: ["a"] } }),
        question("q4"),
        question("q5"),
      ],
      {
        q1: { option: "a", text: " Fewer parts. " },
        q2: { option: "b", text: "" },
        q3: { option: "b", text: "" },
        q4: { text: "Only new plans." },
        q5: { text: "  " },
      },
    );

    expect(answers).toEqual({
      q1: { kind: "option", options: ["a"], note: "Fewer parts." },
      q2: { kind: "option", options: ["b"] },
      q4: { kind: "text", text: "Only new plans." },
    });
  });

  it("takes the latest pick when the person picks again", () => {
    const answers = draftedAnswers([question("q1")], { q1: { option: "b", text: "" } });
    expect(answers.q1).toEqual({ kind: "option", options: ["b"] });
  });
});

describe("nextWaiting", () => {
  const thread = [
    question("q1", { round: 2 }),
    question("q2"),
    question("q3", { answer: { kind: "option", options: ["a"] } }),
    question("q4"),
  ];

  it("starts at the first waiting question in thread order, oldest round first", () => {
    expect(nextWaiting(thread, {})?.id).toBe("q2");
  });

  it("goes on to the next waiting question below, past answered and drafted ones", () => {
    const drafts = { q4: { text: "Drafted" } };
    expect(nextWaiting(thread, drafts, "q2")?.id).toBe("q1");
  });

  it("goes back up to the first waiting one when nothing waits below", () => {
    expect(nextWaiting(thread, {}, "q1")?.id).toBe("q2");
  });

  it("gives none once every question has an answer, a pick or words", () => {
    const drafts = {
      q1: { text: "Yes" },
      q2: { option: "a", text: "" },
      q4: { text: "No" },
    };
    expect(nextWaiting(thread, drafts, "q2")).toBeUndefined();
  });

  it("counts a draft with neither a pick nor words as still waiting", () => {
    expect(nextWaiting(thread, { q2: { text: " " } })?.id).toBe("q2");
  });
});

describe("newestWaiting", () => {
  it("gives the last waiting question in thread order", () => {
    const thread = [question("q1", { round: 2 }), question("q2"), question("q3")];
    expect(newestWaiting(thread, {})?.id).toBe("q1");
    expect(newestWaiting(thread, { q1: { option: "a", text: "" } })?.id).toBe("q3");
    expect(newestWaiting([], {})).toBeUndefined();
  });
});

describe("answeredCount", () => {
  it("counts the drafted answers against the questions still open", () => {
    const thread = [
      question("q1"),
      question("q2"),
      question("q3"),
      question("q4", { answer: { kind: "option", options: ["a"] } }),
    ];
    const drafts = {
      q1: { option: "a", text: "" },
      q2: { text: "Words" },
      q3: { text: "" },
    };

    expect(answeredCount(thread, drafts)).toBe("Answered 2/3");
    expect(answeredCount([question("q1")], {})).toBe("Answered 0/1");
  });

  it("says to send once every open question has an answer drafted", () => {
    const drafts = { q1: { option: "a", text: "" }, q2: { text: "Words" } };
    expect(answeredCount([question("q1"), question("q2")], drafts)).toBe(
      "Answered 2/2. Send when ready.",
    );
  });

  it("says nothing waits once every question has its answer", () => {
    const answered = question("q1", { answer: { kind: "option", options: ["a"] } });
    expect(answeredCount([answered], {})).toBe("Nothing waits on you.");
  });
});

describe("the people rail choice", () => {
  it("is hidden until shown, and remembered across a reload", () => {
    const storage = memoryStorage();
    expect(loadRailShown(storage)).toBe(false);
    saveRailShown(true, storage);
    expect(loadRailShown(storage)).toBe(true);
    saveRailShown(false, storage);
    expect(loadRailShown(storage)).toBe(false);
  });

  it("stays hidden without storage", () => {
    const broken = {
      ...memoryStorage(),
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    } as Storage;

    expect(loadRailShown(broken)).toBe(false);
    expect(() => saveRailShown(true, broken)).not.toThrow();
  });
});
