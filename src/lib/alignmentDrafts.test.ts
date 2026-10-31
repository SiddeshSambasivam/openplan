import { describe, expect, it } from "vitest";
import {
  answeredCount,
  loadRailShown,
  loadReplyDrafts,
  newestWaiting,
  nextWaiting,
  queueReply,
  repliedAnswers,
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

  it("goes on to the next waiting question below, past answered and queued ones", () => {
    const drafts = { q4: { text: "Queued", replied: true } };
    expect(nextWaiting(thread, drafts, "q2")?.id).toBe("q1");
  });

  it("goes back up to the first waiting one when nothing waits below", () => {
    expect(nextWaiting(thread, {}, "q1")?.id).toBe("q2");
  });

  it("gives none once every question has an answer or a reply queued", () => {
    const drafts = {
      q1: { text: "Yes", replied: true },
      q2: { option: "a", text: "", replied: true },
      q4: { text: "No", replied: true },
    };
    expect(nextWaiting(thread, drafts, "q2")).toBeUndefined();
  });

  it("counts a draft not replied yet as still waiting", () => {
    expect(nextWaiting(thread, { q2: { option: "a", text: "", replied: false } })?.id).toBe("q2");
  });
});

describe("newestWaiting", () => {
  it("gives the last waiting question in thread order", () => {
    const thread = [question("q1", { round: 2 }), question("q2"), question("q3")];
    expect(newestWaiting(thread, {})?.id).toBe("q1");
    expect(newestWaiting(thread, { q1: { text: "Done", replied: true } })?.id).toBe("q3");
    expect(newestWaiting([], {})).toBeUndefined();
  });
});

describe("queueReply", () => {
  it("queues a pick, a pick with words, or words alone", () => {
    expect(queueReply("q1", { q1: { option: "a", text: "", replied: false } })).toEqual({
      q1: { option: "a", text: "", replied: true },
    });
    expect(queueReply("q1", { q1: { option: "a", text: "Why", replied: false } })?.q1.replied).toBe(
      true,
    );
    expect(queueReply("q1", { q1: { text: "Only words", replied: false } })?.q1.replied).toBe(true);
  });

  it("queues nothing without a pick or words", () => {
    expect(queueReply("q1", {})).toBeNull();
    expect(queueReply("q1", { q1: { text: "  ", replied: false } })).toBeNull();
  });

  it("leaves the other drafts as they were", () => {
    const other = { text: "Later", replied: false };
    expect(queueReply("q1", { q1: { text: "Now", replied: false }, q2: other })?.q2).toBe(other);
  });
});

describe("answeredCount", () => {
  it("counts the replies queued against the questions still open", () => {
    const thread = [
      question("q1"),
      question("q2"),
      question("q3"),
      question("q4", { answer: { kind: "option", options: ["a"] } }),
    ];
    const drafts = {
      q1: { option: "a", text: "", replied: true },
      q2: { text: "Words", replied: true },
      q3: { option: "b", text: "", replied: false },
    };

    expect(answeredCount(thread, drafts)).toBe("2 of 3 waiting questions answered");
    expect(answeredCount([question("q1")], {})).toBe("0 of 1 waiting question answered");
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
