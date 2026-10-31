import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Onboarding } from "./Onboarding";

describe("Onboarding", () => {
  const html = renderToStaticMarkup(<Onboarding onDone={() => {}} />);

  it("opens on the hello with the tools on this machine", () => {
    expect(html).toContain("What should we call you?");
    expect(html).toContain("On this machine");
  });

  it("has one step after the hello, and it is not an import", () => {
    expect(html).toContain("One more step and you are in.");
    expect(html).not.toMatch(/import/i);
  });
});
