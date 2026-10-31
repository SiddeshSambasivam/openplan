import { describe, expect, it } from "vitest";
import { alignmentScore, areaKey, buildTooltip } from "./alignmentScore";
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

  it("gives up to 80 for the areas settled and up to 20 for answers that say why", () => {
    const score = alignmentScore(
      [
        question("q1", "scope", { answer: reasoned }),
        question("q2", "error handling", { answer: pick }),
        question("q3", "scale"),
        question("q4", "edge cases"),
      ],
      {},
    );

    expect(score.coverage).toBe(40);
    expect(score.reasoning).toBe(10);
    expect(score.total).toBe(50);
    expect(score.answered).toBe(2);
    expect(score.reasoned).toBe(1);
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
    expect(score.coverage).toBe(40);
  });

  it("counts a draft reply the same as a sent answer", () => {
    const score = alignmentScore([question("q1", "scale"), question("q2", "ux")], {
      q1: reasoned,
    });

    expect(score.areas.map((area) => area.settled)).toEqual([true, false]);
    expect(score.total).toBe(60);
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
    expect(score.reasoning).toBe(10);
  });

  it("reaches 100 once every area is settled and every answer says why", () => {
    const score = alignmentScore(
      [
        question("q1", "edge cases", { answer: reasoned }),
        question("q2", "error handling", { answer: reasoned }),
        question("q3", "scale"),
      ],
      { q3: { kind: "text", text: "Ten plans at most." } },
    );

    expect(score.total).toBe(100);
    expect(score.notAsked).toEqual([]);
  });

  it("lists the required areas no question covers, which cost nothing", () => {
    const score = alignmentScore([question("q1", "Edge  Cases", { answer: reasoned })], {});

    expect(score.notAsked).toEqual(["error handling", "scale"]);
    expect(score.total).toBe(100);
  });

  it("adds up its parts, so the lines under the ring match the ring", () => {
    const score = alignmentScore(
      [
        question("q1", "a", { answer: reasoned }),
        question("q2", "b", { answer: pick }),
        question("q3", "c", { answer: pick }),
      ],
      {},
    );

    expect(score.coverage).toBe(80);
    expect(score.reasoning).toBe(7);
    expect(score.total).toBe(87);
  });
});

describe("buildTooltip", () => {
  const record = (questions: Question[]): WorkRecord => ({
    version: 1,
    repos: [],
    decisions: [],
    todos: [],
    prs: [],
    alignment: { askedAt: "2026-10-31T09:00:00Z", questions },
  });

  it("names the areas the agent still asks about, from the answers it has", () => {
    expect(
      buildTooltip(
        record([
          question("q1", "scope", { answer: pick }),
          question("q2", "error handling"),
          question("q3", "scale"),
        ]),
      ),
    ).toBe("Starts the work. The agent asks about error handling and scale first.");
  });

  it("says nothing more once every area is settled, or before any question", () => {
    expect(buildTooltip(record([question("q1", "scope", { answer: pick })]))).toBeUndefined();
    expect(buildTooltip(record([]))).toBeUndefined();
    expect(buildTooltip(null)).toBeUndefined();
  });
});
