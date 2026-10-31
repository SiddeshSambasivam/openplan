import { describe, expect, it } from "vitest";
import { deliveryLine, sessionCounts, wakeLine } from "./liveSessions";

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

describe("deliveryLine", () => {
  it("says it reached one session", () => {
    expect(deliveryLine(1)).toBe("Delivered to 1 session.");
  });

  it("counts every session that got it", () => {
    expect(deliveryLine(2)).toBe("Delivered to 2 sessions.");
  });

  it("tells the person how to deliver it when no session got it", () => {
    expect(deliveryLine(0)).toBe(
      "Waiting for the session. Type anything in it to deliver.",
    );
  });
});

describe("wakeLine", () => {
  it("says the agent is working when the wake reached it", () => {
    expect(wakeLine(true)).toBe("Agent woken.");
  });

  it("says when the agent will hear when the wake failed", () => {
    expect(wakeLine(false)).toBe(
      "Couldn't wake the session. It will hear on your next message.",
    );
  });
});
