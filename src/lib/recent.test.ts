import { describe, expect, it } from "vitest";
import { RECENT_LIMIT, pushRecent } from "./recent";

describe("pushRecent", () => {
  it("puts what was just opened first", () => {
    expect(pushRecent(["/a.md"], "/b.md")).toEqual(["/b.md", "/a.md"]);
  });

  it("moves a plan already in the list rather than repeating it", () => {
    expect(pushRecent(["/a.md", "/b.md"], "/b.md")).toEqual(["/b.md", "/a.md"]);
  });

  it("keeps the list short", () => {
    const many = Array.from({ length: RECENT_LIMIT }, (_, i) => `/${i}.md`);

    expect(pushRecent(many, "/new.md")).toHaveLength(RECENT_LIMIT);
    expect(pushRecent(many, "/new.md")[0]).toBe("/new.md");
  });
});
