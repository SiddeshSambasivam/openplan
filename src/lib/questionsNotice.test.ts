import { describe, expect, it } from "vitest";
import type { Question, Role } from "./work";
import { questionsNoticeText } from "./questionsNotice";

function asked(id: string, role?: Role): Question {
  return { id, aspect: "scope", role, question: "Which?", options: [], mustAnswer: false };
}

describe("questionsNoticeText", () => {
  it("names one asker of one question", () => {
    expect(questionsNoticeText([asked("q1", "engineering")])).toBe("Theo asked a question");
  });

  it("counts the questions of one asker", () => {
    expect(questionsNoticeText([asked("q1", "engineering"), asked("q2", "engineering")])).toBe(
      "Theo asked 2 questions",
    );
  });

  it("names each asker once, in the order they asked", () => {
    const questions = [asked("q1", "engineering"), asked("q2", "product"), asked("q3", "engineering")];

    expect(questionsNoticeText(questions)).toBe("Theo and Mila asked 3 questions");
  });

  it("calls an agent without a role the agent", () => {
    expect(questionsNoticeText([asked("q1"), asked("q2")])).toBe("The agent asked 2 questions");
    expect(questionsNoticeText([asked("q1", "design"), asked("q2")])).toBe(
      "Iris and the agent asked 2 questions",
    );
  });

  it("says nothing when there are no questions", () => {
    expect(questionsNoticeText([])).toBeNull();
  });
});
