import { describe, expect, it } from "vitest";
import { alignmentScore, areaKey, belowTarget, buildTooltip, canBuild, requiredAreas } from "./alignmentScore";
import type { Answer, Question, Understanding, UnderstandingDraft, WorkRecord } from "./work";

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

/** The score of answers alone, as on a record with no understanding statements. */
const scoreOf = (questions: Question[], answers: Record<string, Answer> = {}) =>
  alignmentScore(questions, [], { answers, understanding: {} }, null);

describe("areaKey", () => {
  it("matches an aspect whatever its case and spacing", () => {
    expect(areaKey("Error Handling")).toBe(areaKey("error handling"));
    expect(areaKey("  edge   cases ")).toBe("edge cases");
  });
});

describe("alignmentScore", () => {
  it("scores nothing before any question is asked", () => {
    const score = scoreOf([], {});

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
      const score = scoreOf(firstRound(pick), {});

      expect(score.counted).toBe(6);
      expect(score.total).toBe(40);
    });

    it("holds when a new round is posted", () => {
      expect(scoreOf([...firstRound(pick), ...secondRound()], {}).total).toBe(40);
    });

    it("rises as the new round is answered", () => {
      expect(scoreOf([...firstRound(pick), ...secondRound(pick)], {}).total).toBe(67);
    });

    it("reaches full coverage once scale is settled too", () => {
      const score = scoreOf(
        [...firstRound(pick), ...secondRound(pick), question("q6", "scale", { answer: pick })],
        {},
      );

      expect(score.coverage).toBe(80);
      expect(score.total).toBe(80);
    });

    it("gives 5 for each answer that says why, up to 20", () => {
      const score = scoreOf(
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
      const { total } = scoreOf([...asked.values()], {});
      expect(total).toBeGreaterThanOrEqual(last);
      last = total;
    }
    expect(last).toBe(100);
  });

  it("leaves an unanswered question out unless its area is required", () => {
    const score = scoreOf(
      [question("q1", "scope", { answer: pick }), question("q2", "ux"), question("q3", "rollout")],
      {},
    );

    expect(score.counted).toBe(4);
    expect(score.coverage).toBe(20);
    expect(score.areas.map((area) => area.settled)).toEqual([true, false, false]);
  });

  it("counts one area per aspect and settles it with one answered question", () => {
    const score = scoreOf(
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
    const score = scoreOf([question("q1", "scale"), question("q2", "ux")], {
      q1: reasoned,
    });

    expect(score.areas.map((area) => area.settled)).toEqual([true, false]);
    expect(score.total).toBe(32);
  });

  it("counts a written answer as reasoned and a pick the agent made as not", () => {
    const score = scoreOf(
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
    const score = scoreOf([question("q1", "Edge  Cases", { answer: reasoned })], {});

    expect(score.notAsked).toEqual(["error handling", "scale"]);
    expect(score.coverage).toBe(27);
  });

  it("adds up its parts, so the lines under the ring match the ring", () => {
    const score = scoreOf(
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

const stated = (area: string, extra: Partial<Understanding> = {}): Understanding => ({
  area,
  statement: `About ${area}.`,
  by: "claude-code",
  ...extra,
});
const confirmed = (area: string) => stated(area, { confirmed: { by: "Sid", at: "2026-11-04T09:00:00Z" } });
const corrected = (area: string, text: string) =>
  stated(area, { correction: { text, by: "Sid", at: "2026-11-04T09:00:00Z" } });

const FEATURE = ["entities", "states", "edge cases", "error handling", "scale"];

describe("requiredAreas", () => {
  it("asks a feature plan for entities and states too, and every other plan for three", () => {
    expect(requiredAreas("feature")).toEqual(FEATURE);
    expect(requiredAreas("bug")).toEqual(["edge cases", "error handling", "scale"]);
    expect(requiredAreas(null)).toEqual(["edge cases", "error handling", "scale"]);
  });
});

describe("alignmentScore by understanding", () => {
  const understood = (
    understanding: Understanding[],
    drafts: Record<string, UnderstandingDraft> = {},
    planType: string | null = "feature",
    questions: Question[] = [],
  ) => alignmentScore(questions, understanding, { answers: {}, understanding: drafts }, planType);

  it("counts answers until the first statement arrives", () => {
    expect(scoreOf([question("q1", "scale", { answer: pick })]).rule).toBe("answers");
    expect(understood([stated("scale")]).rule).toBe("understanding");
  });

  it("is the share of required areas the person confirmed", () => {
    const score = understood([confirmed("entities"), confirmed("states"), confirmed("scale"), stated("edge cases")]);

    expect(score.total).toBe(60);
    expect(score.confirmed).toBe(3);
    expect(score.required).toEqual(FEATURE);
    expect(score.areas.slice(0, 5).map((area) => [area.name, area.understanding?.state])).toEqual([
      ["entities", "confirmed"],
      ["states", "confirmed"],
      ["edge cases", "stated"],
      ["error handling", "not stated"],
      ["scale", "confirmed"],
    ]);
    expect(score.notAsked).toEqual([]);
  });

  it("asks a bug plan for three areas", () => {
    const score = understood([confirmed("edge cases"), confirmed("scale")], {}, "bug");

    expect(score.total).toBe(67);
    expect(score.areas.map((area) => area.name)).toEqual(["edge cases", "error handling", "scale"]);
  });

  it("keeps the answer points for the details without adding them", () => {
    const questions = [question("q1", "edge cases", { answer: reasoned }), question("q2", "scope", { answer: reasoned })];

    const score = understood([stated("scale")], {}, "bug", questions);

    expect(score.reasoning).toBe(10);
    expect(score.coverage).toBeGreaterThan(0);
    expect(score.total).toBe(0);
    const scope = score.areas.find((area) => area.name === "scope");
    expect(scope?.settled).toBe(true);
    expect(scope?.understanding).toBeUndefined();
  });

  it("counts a drafted confirmation as confirmed and a drafted correction as corrected", () => {
    const score = understood(
      [stated("edge cases"), confirmed("error handling"), stated("scale")],
      { "edge cases": { confirm: true }, "error handling": { correct: "Retries stop after three." }, scale: { correct: " " } },
      "bug",
    );

    expect(score.areas.map((area) => area.understanding)).toEqual([
      { state: "confirmed", statement: "About edge cases." },
      { state: "corrected", statement: "About error handling.", correction: "Retries stop after three." },
      { state: "stated", statement: "About scale." },
    ]);
    expect(score.total).toBe(33);
  });

  it("shows a correction on the record until the agent restates the area", () => {
    const score = understood([corrected("scale", "Thousands.")], {}, "bug");

    expect(score.areas[2].understanding).toEqual({
      state: "corrected",
      statement: "About scale.",
      correction: "Thousands.",
      by: "Sid",
    });
  });

  it("lists a stated area outside the required ones without counting it", () => {
    const score = understood([confirmed("edge cases"), confirmed("rollout")], {}, "bug");

    expect(score.areas.map((area) => area.name)).toEqual(["edge cases", "error handling", "scale", "rollout"]);
    expect(score.total).toBe(33);
  });
});

const record = (questions: Question[], understanding?: Understanding[]): WorkRecord => ({
  version: 1,
  repos: [],
  decisions: [],
  todos: [],
  prs: [],
  alignment: { askedAt: "2026-10-31T09:00:00Z", questions, understanding },
});

const settledPlan = [
  question("q1", "scope", { answer: pick }),
  question("q2", "high-level design", { answer: pick }),
  question("q3", "practices", { answer: pick }),
  question("q4", "error handling", { answer: pick }),
  question("q5", "edge cases", { answer: pick }),
  question("q6", "scale", { answer: pick }),
];

const allConfirmed = (areas: string[]) => areas.map(confirmed);

describe("canBuild", () => {
  it("waits for every required area to be confirmed once there is any alignment", () => {
    expect(canBuild(record(settledPlan), 80, "bug")).toBe(false);
    expect(canBuild(record(settledPlan, allConfirmed(["edge cases", "error handling"])), 80, "bug")).toBe(false);
    expect(canBuild(record(settledPlan, allConfirmed(["edge cases", "error handling", "scale"])), 80, "bug")).toBe(
      true,
    );
    expect(canBuild(record([], allConfirmed(["edge cases", "error handling", "scale"])), 80, "feature")).toBe(false);
    expect(canBuild(record([], allConfirmed(FEATURE)), 100, "feature")).toBe(true);
  });

  it("stays off below a target before any alignment, and on with no target", () => {
    expect(canBuild(record([]), 80, null)).toBe(false);
    expect(canBuild(null, 80, null)).toBe(false);
    expect(canBuild(null, 0, null)).toBe(true);
    expect(canBuild(record([question("q1", "scope")]), 0, null)).toBe(true);
  });
});

describe("buildTooltip", () => {
  it("keeps the target sentence while only answers count, and asks for the statements", () => {
    expect(buildTooltip(record(settledPlan), 90, "bug")).toBe(
      "Align with the agent first. Alignment is 80%, and Build opens at 90%. The agent still has to state its understanding of edge cases, error handling and scale.",
    );
    expect(buildTooltip(record(settledPlan), 80, "bug")).toBe(
      "Align with the agent first. The agent still has to state its understanding of edge cases, error handling and scale.",
    );
    expect(buildTooltip(null, 80, "feature")).toBe(
      "Align with the agent first. Alignment is 0%, and Build opens at 80%. The agent still has to state its understanding of entities, states, edge cases, error handling and scale.",
    );
  });

  it("names what is missing once the agent states its understanding", () => {
    const partly = allConfirmed(["edge cases", "error handling", "scale"]);
    expect(buildTooltip(record([], partly), 80, "feature")).toBe(
      "Align with the agent first. The agent still has to state its understanding of entities and states.",
    );
    expect(buildTooltip(record([], [...allConfirmed(["edge cases", "error handling"]), stated("scale")]), 80, "bug")).toBe(
      "Confirm the agent's understanding of scale first.",
    );
    expect(
      buildTooltip(record([], [...allConfirmed(["edge cases", "error handling"]), corrected("scale", "More.")]), 80, "bug"),
    ).toBe("Align with the agent first. The agent still has to restate scale.");
  });

  it("names the open areas once Build is allowed", () => {
    const done = allConfirmed(["edge cases", "error handling", "scale"]);
    expect(buildTooltip(record([...settledPlan, question("q7", "ux")], done), 80, "bug")).toBe(
      "Starts the work. The agent asks about ux first.",
    );
    expect(buildTooltip(record([question("q1", "scope")]), 0, null)).toBe(
      "Starts the work. The agent asks about scope first.",
    );
  });

  it("says nothing more once nothing is open", () => {
    expect(buildTooltip(record(settledPlan, allConfirmed(["edge cases", "error handling", "scale"])), 80, "bug")).toBeUndefined();
    expect(buildTooltip(record([]), 0, null)).toBeUndefined();
    expect(buildTooltip(null, 0, null)).toBeUndefined();
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
