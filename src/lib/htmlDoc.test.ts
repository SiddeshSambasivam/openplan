import { describe, expect, it } from "vitest";
import { frameSrcDoc, isHtmlPath, stripHtmlFrontmatter } from "./htmlDoc";

describe("isHtmlPath", () => {
  it("knows an HTML plan or document by its extension", () => {
    expect(isHtmlPath("/base/plans/rendered.html")).toBe(true);
    expect(isHtmlPath("/base/plans/rendered.HTM")).toBe(true);
    expect(isHtmlPath("/base/plans/set/02-mock.html")).toBe(true);
  });

  it("leaves everything else to the markdown renderer", () => {
    expect(isHtmlPath("/base/plans/rendered.md")).toBe(false);
    expect(isHtmlPath("/base/plans/html")).toBe(false);
    expect(isHtmlPath(undefined)).toBe(false);
  });
});

describe("stripHtmlFrontmatter", () => {
  it("takes off the commented metadata block", () => {
    const text = [
      "<!--",
      "---",
      "id: auth-refactor",
      "title: Auth refactor",
      "---",
      "-->",
      "<h1>Auth refactor</h1>",
    ].join("\n");

    expect(stripHtmlFrontmatter(text)).toBe("<h1>Auth refactor</h1>");
  });

  it("leaves a page that carries no metadata alone", () => {
    expect(stripHtmlFrontmatter("<h1>A mock</h1>\n")).toBe("<h1>A mock</h1>\n");
    expect(stripHtmlFrontmatter("<!-- a note -->\n<h1>A mock</h1>")).toBe(
      "<!-- a note -->\n<h1>A mock</h1>",
    );
  });
});

const theme = {
  background: "#fff",
  foreground: "#111",
  muted: "#eee",
  mutedForeground: "#666",
  border: "#ddd",
  fontFamily: "system-ui",
  fontSize: "15px",
};

describe("frameSrcDoc", () => {
  it("puts the theme stylesheet at the top of the head", () => {
    const doc = frameSrcDoc("<html><head><title>T</title></head><body>hi</body></html>", theme);

    expect(doc.indexOf("<style")).toBeLessThan(doc.indexOf("<title>"));
    expect(doc).toContain("color:#111");
    expect(doc).toContain("hi");
  });

  it("opens a head for a fragment that has none", () => {
    expect(frameSrcDoc("<h1>A mock</h1>", theme)).toContain("<style");
    expect(frameSrcDoc("<h1>A mock</h1>", theme)).toContain("<h1>A mock</h1>");
  });

  it("goes inside the existing html element when the page has no head", () => {
    const doc = frameSrcDoc('<html lang="en"><body>hi</body></html>', theme);

    expect(doc.indexOf("<style")).toBeGreaterThan(doc.indexOf("<html"));
    expect(doc.indexOf("<style")).toBeLessThan(doc.indexOf("<body"));
  });

  it("drops the metadata block on the way in", () => {
    const doc = frameSrcDoc("<!--\n---\nid: a\n---\n-->\n<h1>A</h1>", theme);

    expect(doc).not.toContain("id: a");
  });
});
