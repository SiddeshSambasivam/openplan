import { describe, expect, it } from "vitest";
import { personCanSet, STATUS_FLOW } from "./planBase";

describe("personCanSet", () => {
  it("lets the person set every status but the two the agent moves", () => {
    expect(STATUS_FLOW.filter(personCanSet)).toEqual([
      "draft",
      "alignment",
      "completed",
      "archived",
    ]);
  });
});
