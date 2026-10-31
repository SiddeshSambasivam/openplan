import { describe, expect, it } from "vitest";
import { projectName } from "./projects";

describe("projectName", () => {
  it("reads a git remote as the repository it is", () => {
    expect(projectName("github.com/hypotenuseai/hypotenuse")).toBe(
      "hypotenuseai/hypotenuse",
    );
    expect(projectName("gitlab.com/acme/tools")).toBe("acme/tools");
  });

  it("leaves anything that is not a host and a path alone", () => {
    expect(projectName("openplan")).toBe("openplan");
    expect(projectName("acme/tools")).toBe("acme/tools");
  });

  it("has nothing to say about a plan with no project", () => {
    expect(projectName(null)).toBe(null);
  });
});
