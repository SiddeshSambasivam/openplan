import { describe, expect, it } from "vitest";
import { APP_FONT_SIZES, loadAppFontSize } from "./fontSize";

function storageWith(value: string | null): Storage {
  return { getItem: () => value } as unknown as Storage;
}

describe("APP_FONT_SIZES", () => {
  it("steps the app's text from 12px to 14px, one pixel a step", () => {
    expect(APP_FONT_SIZES).toEqual({ small: "12px", normal: "13px", large: "14px" });
  });
});

describe("loadAppFontSize", () => {
  it("is normal, one step under the old 14px, when nothing is stored", () => {
    expect(loadAppFontSize(storageWith(null))).toBe("normal");
  });

  it("reads a stored step", () => {
    expect(loadAppFontSize(storageWith("large"))).toBe("large");
  });

  it("is normal for a value it does not know, or when storage throws", () => {
    expect(loadAppFontSize(storageWith("huge"))).toBe("normal");
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    expect(loadAppFontSize(blocked)).toBe("normal");
  });
});
