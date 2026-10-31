import { describe, expect, it } from "vitest";
import {
  FENCE_CSP,
  HEIGHT_MESSAGE,
  clampFrameHeight,
  fenceLanguage,
  fenceSrcDoc,
  frameHeight,
} from "./fences";

function pre(className: unknown) {
  return {
    type: "element",
    tagName: "pre",
    children: [
      {
        type: "element",
        tagName: "code",
        properties: { className },
        children: [{ type: "text", value: "<p>hi</p>" }],
      },
    ],
  };
}

describe("fenceLanguage", () => {
  it("reads the fence's language, in lower case", () => {
    expect(fenceLanguage(pre(["language-html"]))).toBe("html");
    expect(fenceLanguage(pre(["language-HTML", "hljs"]))).toBe("html");
    expect(fenceLanguage(pre(["hljs", "language-mermaid"]))).toBe("mermaid");
  });

  it("is null for a block with no language or no code inside", () => {
    expect(fenceLanguage(pre(undefined))).toBeNull();
    expect(fenceLanguage(pre(["hljs"]))).toBeNull();
    expect(fenceLanguage({ type: "element", tagName: "pre", children: [] })).toBeNull();
    expect(fenceLanguage(undefined)).toBeNull();
  });

  it("is null for inline code at the start of a paragraph", () => {
    expect(fenceLanguage({ ...pre(["language-math"]), tagName: "p" })).toBeNull();
  });
});

describe("fenceSrcDoc", () => {
  const body = '<button onclick="this.textContent=\'Done\'">Go</button>';
  const doc = fenceSrcDoc(body);

  it("carries the content security policy in its head", () => {
    expect(FENCE_CSP).toBe(
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:",
    );
    const head = doc.slice(doc.indexOf("<head>"), doc.indexOf("</head>"));
    expect(head).toContain(
      `<meta http-equiv="Content-Security-Policy" content="${FENCE_CSP}">`,
    );
  });

  it("puts the fence body in once, inside the body", () => {
    expect(doc.split(body)).toHaveLength(2);
    const inner = doc.slice(doc.indexOf("<body>"), doc.indexOf("</body>"));
    expect(inner).toContain(body);
  });

  it("keeps replacement patterns in the body as written", () => {
    const tricky = "<p>$& $1 $$</p>";
    expect(fenceSrcDoc(tricky)).toContain(tricky);
  });

  it("posts its height to the parent on load and on resize", () => {
    expect(doc).toContain(HEIGHT_MESSAGE);
    expect(doc).toContain("parent.postMessage");
    expect(doc).toContain('addEventListener("load"');
    expect(doc).toContain("new ResizeObserver");
    expect(doc).toContain("observe(document.documentElement)");
  });
});

describe("clampFrameHeight", () => {
  it("keeps a height between 120 and 2000 pixels", () => {
    expect(clampFrameHeight(40)).toBe(120);
    expect(clampFrameHeight(640.4)).toBe(641);
    expect(clampFrameHeight(99_999)).toBe(2000);
  });
});

describe("frameHeight", () => {
  const frame = {} as Window;
  const message = (source: unknown, data: unknown) => ({ source, data });

  it("takes the height the frame posted, clamped", () => {
    expect(frameHeight(message(frame, { type: HEIGHT_MESSAGE, height: 300 }), frame)).toBe(300);
    expect(frameHeight(message(frame, { type: HEIGHT_MESSAGE, height: 5 }), frame)).toBe(120);
    expect(frameHeight(message(frame, { type: HEIGHT_MESSAGE, height: 1e6 }), frame)).toBe(2000);
  });

  it("ignores a message from any other window", () => {
    const other = {} as Window;
    expect(frameHeight(message(other, { type: HEIGHT_MESSAGE, height: 300 }), frame)).toBeNull();
    expect(frameHeight(message(null, { type: HEIGHT_MESSAGE, height: 300 }), frame)).toBeNull();
    expect(frameHeight(message(frame, { type: HEIGHT_MESSAGE, height: 300 }), null)).toBeNull();
  });

  it("ignores anything that is not a height message", () => {
    for (const data of [
      null,
      "openplan:height",
      { type: "other", height: 300 },
      { type: HEIGHT_MESSAGE },
      { type: HEIGHT_MESSAGE, height: "300" },
      { type: HEIGHT_MESSAGE, height: Number.NaN },
      { type: HEIGHT_MESSAGE, height: Number.POSITIVE_INFINITY },
    ]) {
      expect(frameHeight(message(frame, data), frame)).toBeNull();
    }
  });
});
