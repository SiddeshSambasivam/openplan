import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OpenAtLoginRow, TourRow, VersionRow } from "./SettingsDialog";

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

describe("OpenAtLoginRow", () => {
  it("says what opening at login does", () => {
    const html = renderToStaticMarkup(<OpenAtLoginRow on={false} onChange={() => {}} />);
    expect(html).toContain("Open OpenPlan when you log in");
    expect(html).toContain("Keeps your agents connected after you close the window.");
  });

  it("shows whether the app opens at login", () => {
    expect(renderToStaticMarkup(<OpenAtLoginRow on onChange={() => {}} />)).toContain('aria-checked="true"');
    expect(renderToStaticMarkup(<OpenAtLoginRow on={false} onChange={() => {}} />)).toContain(
      'aria-checked="false"',
    );
  });

  it("waits to show a switch until the state is known", () => {
    expect(renderToStaticMarkup(<OpenAtLoginRow on={null} onChange={() => {}} />)).toContain("disabled");
  });
});
