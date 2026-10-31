import { describe, expect, it } from "vitest";
import {
  basename,
  dirname,
  displayName,
  extensionOf,
  isMarkdownPath,
  resolveAssetSrc,
} from "./platform";

describe("basename", () => {
  it("takes the last segment on either platform's separator", () => {
    expect(basename("/w/guides/intro.md")).toBe("intro.md");
    expect(basename("C:\\w\\guides\\intro.md")).toBe("intro.md");
  });

  it("ignores a trailing separator", () => {
    expect(basename("/w/guides/")).toBe("guides");
  });

  it("passes through a bare name", () => {
    expect(basename("intro.md")).toBe("intro.md");
  });
});

describe("dirname", () => {
  it("drops the last segment", () => {
    expect(dirname("/w/guides/intro.md")).toBe("/w/guides");
    expect(dirname("C:\\w\\guides\\intro.md")).toBe("C:\\w\\guides");
  });

  it("ignores a trailing separator", () => {
    expect(dirname("/w/guides/")).toBe("/w");
  });
});

describe("extensionOf", () => {
  it("reads the extension in lower case", () => {
    expect(extensionOf("PLAN.MD")).toBe("md");
  });

  it("is empty when there is no extension", () => {
    expect(extensionOf("README")).toBe("");
  });

  it("does not mistake a dotted folder for an extension", () => {
    expect(extensionOf("/w/v1.2/README")).toBe("");
  });

  it("treats a dotfile as a name, not an extension", () => {
    expect(extensionOf(".gitignore")).toBe("");
  });
});

describe("isMarkdownPath", () => {
  it("accepts the markdown extensions regardless of case", () => {
    expect(isMarkdownPath("plan.md")).toBe(true);
    expect(isMarkdownPath("plan.MARKDOWN")).toBe(true);
    expect(isMarkdownPath("notes.mdx")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isMarkdownPath("image.png")).toBe(false);
    expect(isMarkdownPath("README")).toBe(false);
  });
});

describe("displayName", () => {
  it("drops the extension", () => {
    expect(displayName("/w/guides/intro.md")).toBe("intro");
  });

  it("keeps a dotfile's name intact", () => {
    expect(displayName("/w/.gitignore")).toBe(".gitignore");
  });
});

describe("resolveAssetSrc", () => {
  it("leaves absolute urls and fragments untouched", () => {
    for (const src of [
      "https://example.com/a.png",
      "data:image/png;base64,AAA",
      "//example.com/a.png",
      "#section",
    ]) {
      expect(resolveAssetSrc(src, "/w/guides/intro.md")).toBe(src);
    }
  });

  it("passes a relative path through unchanged outside the desktop app", () => {
    // Without Tauri there is no asset protocol to resolve against.
    expect(resolveAssetSrc("img/a.png", "/w/guides/intro.md")).toBe("img/a.png");
  });

  it("returns whatever it was given when there is nothing to resolve", () => {
    expect(resolveAssetSrc(undefined, "/w/intro.md")).toBeUndefined();
    expect(resolveAssetSrc("img/a.png", undefined)).toBe("img/a.png");
  });
});
