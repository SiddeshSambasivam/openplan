import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TourRow, VersionRow } from "./SettingsDialog";

describe("TourRow", () => {
  it("offers the tour when the app can start it", () => {
    expect(renderToStaticMarkup(<TourRow onTakeTour={() => {}} />)).toContain("Take the tour");
  });

  it("is hidden when the app gives no way to start it", () => {
    expect(renderToStaticMarkup(<TourRow />)).toBe("");
  });
});

describe("VersionRow", () => {
  it("tags the version as beta and says when that ends", () => {
    const html = renderToStaticMarkup(<VersionRow version="0.7.0" />);
    expect(html).toContain("0.7.0");
    expect(html).toContain("Beta");
    expect(html).toContain("1.0.0");
  });
});
