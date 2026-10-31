import { describe, expect, it } from "vitest";
import { personCanSet, profileChanged, STATUS_FLOW } from "./planBase";

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

describe("profileChanged", () => {
  const sid = { name: "Sid", email: "sid@example.com" };

  it("is false while the fields still read what is saved", () => {
    expect(profileChanged(sid, "Sid", "sid@example.com")).toBe(false);
    expect(profileChanged(sid, " Sid ", "sid@example.com ")).toBe(false);
  });

  it("is true once either field differs", () => {
    expect(profileChanged(sid, "Siddesh", "sid@example.com")).toBe(true);
    expect(profileChanged(sid, "Sid", "")).toBe(true);
  });

  it("is false without an identity to compare against", () => {
    expect(profileChanged(null, "Sid", "sid@example.com")).toBe(false);
  });
});
