import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TourRow } from "./SettingsDialog";

describe("TourRow", () => {
  it("offers the tour when the app can start it", () => {
    expect(renderToStaticMarkup(<TourRow onTakeTour={() => {}} />)).toContain("Take the tour");
  });

  it("is hidden when the app gives no way to start it", () => {
    expect(renderToStaticMarkup(<TourRow />)).toBe("");
  });
});
