import { describe, expect, it } from "vitest";
import { attentionGate } from "./attention";

describe("attentionGate", () => {
  it("asks once while the window stays in the background", () => {
    const gate = attentionGate();

    expect(gate.take(false)).toBe(true);
    expect(gate.take(false)).toBe(false);
  });

  it("never asks while the window is focused", () => {
    expect(attentionGate().take(true)).toBe(false);
  });

  it("asks again after the window has been focused", () => {
    const gate = attentionGate();
    gate.take(false);
    gate.focused();

    expect(gate.take(false)).toBe(true);
  });
});
