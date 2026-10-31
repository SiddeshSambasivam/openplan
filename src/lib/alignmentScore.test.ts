import { describe, expect, it } from "vitest";
import { alignmentScore, areaKey, belowTarget, buildTooltip, canBuild } from "./alignmentScore";
import type { Answer, Question, WorkRecord } from "./work";

const question = (id: string, aspect: string, extra: Partial<Question> = {}): Question => ({
  id,
  aspect,
  question: `Question ${id}`,
  options: [
    { id: "a", label: "Keep it" },
    { id: "b", label: "Drop it" },
  ],
  recommended: "a",
  mustAnswer: false,
  ...extra,
});

const pick: Answer = { kind: "option", options: ["a"] };
const reasoned: Answer = { kind: "option", options: ["a"], note: "Fewer moving parts." };

describe("areaKey", () => {
  it("matches an aspect whatever its case and spacing", () => {
    expect(areaKey("Error Handling")).toBe(areaKey("error handling"));
    expect(areaKey("  edge   cases ")).toBe("edge cases");
  });
});

describe("alignmentScore", () => {
  it("scores nothing before any question is asked", () => {
    const score = alignmentScore([], {});

    expect(score).toMatchObject({ total: 0, coverage: 0, reasoning: 0, areas: [] });
    expect(score.notAsked).toEqual(["edge cases", "error handling", "scale"]);
  });

  describe("across a real plan's rounds", () => {
    const firstRound = (answer?: Answer) => [
      question("q1", "scope", { answer }),
      question("q2", "high-level design", { answer }),
      question("q3", "practices", { answer }),
    ];
    const secondRound = (answer?: Answer) => [
      question("q4", "error handling", { answer }),
      question("q5", "edge cases", { answer }),
    ];

    it("counts the required areas from the start, asked or not", () => {
      const score = alignmentScore(firstRound(pick), {});

      expect(score.counted).toBe(6);
      expect(score.total).toBe(40);
    });

    it("holds when a new round is posted", () => {
      expect(alignmentScore([...firstRound(pick), ...secondRound()], {}).total).toBe(40);
    });

    it("rises as the new round is answered", () => {
      expect(alignmentScore([...firstRound(pick), ...secondRound(pick)], {}).total).toBe(67);
    });

    it("reaches full coverage once scale is settled too", () => {
      const score = alignmentScore(
        [...firstRound(pick), ...secondRound(pick), question("q6", "scale", { answer: pick })],
        {},
      );

      expect(score.coverage).toBe(80);
      expect(score.total).toBe(80);
    });

    it("gives 5 for each answer that says why, up to 20", () => {
      const score = alignmentScore(
        [
          ...firstRound(reasoned),
          ...secondRound(pick),
          question("q6", "scale", { answer: reasoned }),
        ],
        {},
      );

      expect(score.reasoned).toBe(4);
      expect(score.reasoning).toBe(20);
      expect(score.total).toBe(100);
    });
  });

  it("never drops as questions are asked and answered", () => {
    const steps: [string, string, Answer?][] = [
      ["q1", "scope"],
      ["q1", "scope", pick],
      ["q2", "ux"],
      ["q3", "error handling"],
      ["q2", "ux", reasoned],
      ["q4", "rollout"],
      ["q5", "Error Handling", pick],
      ["q6", "logging", reasoned],
      ["q7", "scale", pick],
      ["q8", "edge cases", { kind: "text", text: "Empty plans too." }],
      ["q9", "copy", reasoned],
      ["q10", "naming", reasoned],
    ];
    const asked = new Map<string, Question>();
    let last = 0;
    for (const [id, aspect, answer] of steps) {
      asked.set(id, question(id, aspect, { answer }));
      const { total } = alignmentScore([...asked.values()], {});
      expect(total).toBeGreaterThanOrEqual(last);
      last = total;
    }
    expect(last).toBe(100);
  });

  it("leaves an unanswered question out unless its area is required", () => {
    const score = alignmentScore(
      [question("q1", "scope", { answer: pick }), question("q2", "ux"), question("q3", "rollout")],
      {},
    );

    expect(score.counted).toBe(4);
    expect(score.coverage).toBe(20);
    expect(score.areas.map((area) => area.settled)).toEqual([true, false, false]);
  });

  it("counts one area per aspect and settles it with one answered question", () => {
    const score = alignmentScore(
      [
        question("q1", "Error Handling", { role: "oncall" }),
        question("q2", "error handling", { role: "engineering", answer: pick }),
        question("q3", "scale", { role: "engineering" }),
      ],
      {},
    );

    expect(score.areas).toEqual([
      { name: "Error Handling", label: "Error Handling", settled: true, askedBy: "oncall" },
      { name: "scale", label: "Scale", settled: false, askedBy: "engineering" },
    ]);
    expect(score.coverage).toBe(27);
  });

  it("counts a draft reply the same as a sent answer", () => {
    const score = alignmentScore([question("q1", "scale"), question("q2", "ux")], {
      q1: reasoned,
    });

    expect(score.areas.map((area) => area.settled)).toEqual([true, false]);
    expect(score.total).toBe(32);
  });

  it("counts a written answer as reasoned and a pick the agent made as not", () => {
    const score = alignmentScore(
      [
        question("q1", "scope", { answer: { kind: "text", text: "Only new plans." } }),
        question("q2", "scale", { answer: { kind: "agent" } }),
      ],
      {},
    );

    expect(score.answered).toBe(2);
    expect(score.reasoned).toBe(1);
    expect(score.reasoning).toBe(5);
  });

  it("lists the required areas no question covers, which hold coverage down", () => {
    const score = alignmentScore([question("q1", "Edge  Cases", { answer: reasoned })], {});

    expect(score.notAsked).toEqual(["error handling", "scale"]);
    expect(score.coverage).toBe(27);
  });

  it("adds up its parts, so the lines under the ring match the ring", () => {
    const score = alignmentScore(
      [
        question("q1", "edge cases", { answer: reasoned }),
        question("q2", "error handling", { answer: pick }),
        question("q3", "scale", { answer: pick }),
        question("q4", "scope", { answer: reasoned }),
      ],
      {},
    );

    expect(score.coverage).toBe(80);
    expect(score.reasoning).toBe(10);
    expect(score.total).toBe(90);
  });
});

const record = (questions: Question[]): WorkRecord => ({
  version: 1,
  repos: [],
  decisions: [],
  todos: [],
  prs: [],
  alignment: { askedAt: "2026-10-31T09:00:00Z", questions },
});

const settledPlan = [
  question("q1", "scope", { answer: pick }),
  question("q2", "high-level design", { answer: pick }),
  question("q3", "practices", { answer: pick }),
  question("q4", "error handling", { answer: pick }),
  question("q5", "edge cases", { answer: pick }),
];

describe("canBuild", () => {
  it("waits until the score reaches the target", () => {
    expect(canBuild(record(settledPlan), 80)).toBe(false);
    expect(canBuild(record(settledPlan), 67)).toBe(true);
    expect(canBuild(record([...settledPlan, question("q6", "scale", { answer: pick })]), 80)).toBe(true);
  });

  it("stays off below a target before any question, and on with no target", () => {
    expect(canBuild(record([]), 80)).toBe(false);
    expect(canBuild(null, 80)).toBe(false);
    expect(canBuild(null, 0)).toBe(true);
    expect(canBuild(record([question("q1", "scope")]), 0)).toBe(true);
  });
});

describe("buildTooltip", () => {
  it("says how far the score is from the target while Build waits", () => {
    expect(buildTooltip(record(settledPlan), 80)).toBe(
      "Align with the agent first. Alignment is 67%, and Build opens at 80%. The agent still has to ask about scale.",
    );
    expect(buildTooltip(record([...settledPlan, question("q6", "scale")]), 90)).toBe(
      "Align with the agent first. Alignment is 67%, and Build opens at 90%.",
    );
  });

  it("names every required area nobody has asked about yet", () => {
    expect(buildTooltip(record([]), 80)).toBe(
      "Align with the agent first. Alignment is 0%, and Build opens at 80%. The agent still has to ask about edge cases, error handling and scale.",
    );
    expect(buildTooltip(null, 80)).toBe(
      "Align with the agent first. Alignment is 0%, and Build opens at 80%. The agent still has to ask about edge cases, error handling and scale.",
    );
  });

  it("names the open areas once Build is allowed", () => {
    expect(buildTooltip(record([...settledPlan, question("q6", "scale"), question("q7", "ux")]), 60)).toBe(
      "Starts the work. The agent asks about scale and ux first.",
    );
    expect(buildTooltip(record([question("q1", "scope")]), 0)).toBe(
      "Starts the work. The agent asks about scope first.",
    );
  });

  it("says nothing more once nothing is open", () => {
    expect(buildTooltip(record(settledPlan), 60)).toBeUndefined();
    expect(buildTooltip(record([]), 0)).toBeUndefined();
    expect(buildTooltip(null, 0)).toBeUndefined();
  });
});

describe("belowTarget", () => {
  it("is true only under a set target", () => {
    expect(belowTarget(62, 80)).toBe(true);
    expect(belowTarget(80, 80)).toBe(false);
    expect(belowTarget(95, 80)).toBe(false);
    expect(belowTarget(0, 0)).toBe(false);
  });
});
