import { describe, expect, it } from "vitest";
import {
  basename,
  dirname,
  displayName,
  extensionOf,
  docRelativePath,
  isMarkdownPath,
  isVideoPath,
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

describe("isVideoPath", () => {
  it("knows a video by its extension, in any case", () => {
    expect(isVideoPath("./media/clip.mp4")).toBe(true);
    expect(isVideoPath("media/clip.WEBM")).toBe(true);
    expect(isVideoPath("/abs/clip.mov")).toBe(true);
  });

  it("ignores a query or fragment after the extension", () => {
    expect(isVideoPath("clip.mp4?v=2")).toBe(true);
    expect(isVideoPath("clip.mp4#t=10")).toBe(true);
  });

  it("leaves images and other files alone", () => {
    expect(isVideoPath("media/shot.png")).toBe(false);
    expect(isVideoPath("media/mp4")).toBe(false);
    expect(isVideoPath("notes.md")).toBe(false);
    expect(isVideoPath(undefined)).toBe(false);
  });
});

describe("docRelativePath", () => {
  it("resolves a relative path against the document's folder", () => {
    expect(docRelativePath("./media/clip.mp4", "/base/plans/set/plan.md")).toBe(
      "/base/plans/set/./media/clip.mp4",
    );
    expect(docRelativePath("media/clip.mp4", "/base/plans/plan.md")).toBe(
      "/base/plans/media/clip.mp4",
    );
  });

  it("uses backslashes for a Windows document", () => {
    expect(docRelativePath("media/clip.mp4", "C:\\base\\plan.md")).toBe(
      "C:\\base\\media\\clip.mp4",
    );
  });

  it("keeps an absolute path as it is", () => {
    expect(docRelativePath("/elsewhere/clip.mp4", "/base/plan.md")).toBe(
      "/elsewhere/clip.mp4",
    );
    expect(docRelativePath("D:\\clips\\a.mp4", "C:\\base\\plan.md")).toBe(
      "D:\\clips\\a.mp4",
    );
  });

  it("drops a query and decodes percent-escapes", () => {
    expect(docRelativePath("my%20clip.mp4?v=2", "/base/plan.md")).toBe(
      "/base/my clip.mp4",
    );
  });

  it("has nothing to resolve for urls, fragments or a missing document", () => {
    expect(docRelativePath("https://example.com/a.mp4", "/base/plan.md")).toBeNull();
    expect(docRelativePath("data:video/mp4;base64,AAA", "/base/plan.md")).toBeNull();
    expect(docRelativePath("#t", "/base/plan.md")).toBeNull();
    expect(docRelativePath("a.mp4", undefined)).toBeNull();
    expect(docRelativePath(undefined, "/base/plan.md")).toBeNull();
  });
});
