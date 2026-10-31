import { describe, expect, it } from "vitest";
import { parseWorkPanelMode } from "./workPanel";

describe("parseWorkPanelMode", () => {
  it("reads the two modes, and anything else as expanded", () => {
    expect(parseWorkPanelMode("expanded")).toBe("expanded");
    expect(parseWorkPanelMode("minimized")).toBe("minimized");
    expect(parseWorkPanelMode(null)).toBe("expanded");
    expect(parseWorkPanelMode("rail")).toBe("expanded");
  });
});
