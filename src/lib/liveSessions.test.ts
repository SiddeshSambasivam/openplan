import { describe, expect, it } from "vitest";
import { sessionCounts } from "./liveSessions";

const session = (id: string, plans: string[]) => ({
  id,
  client: "claude-code",
  plans,
  since: "2026-09-22T10:00:00Z",
});

describe("sessionCounts", () => {
  it("counts the sessions on each plan", () => {
    const counts = sessionCounts([
      session("s1", ["auth-refactor"]),
      session("s2", ["auth-refactor", "token-refresh"]),
    ]);

    expect(counts.get("auth-refactor")).toBe(2);
    expect(counts.get("token-refresh")).toBe(1);
  });

  it("leaves out plans nobody is working on", () => {
    const counts = sessionCounts([session("s1", [])]);

    expect(counts.size).toBe(0);
    expect(counts.get("auth-refactor")).toBeUndefined();
  });

  it("counts one session once per plan, however often it registered", () => {
    const counts = sessionCounts([
      session("s1", ["auth-refactor", "auth-refactor"]),
    ]);

    expect(counts.get("auth-refactor")).toBe(1);
  });
});
