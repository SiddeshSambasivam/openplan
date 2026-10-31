import { describe, expect, it } from "vitest";
import {
  checkOutcome,
  downloadPercent,
  installTooltip,
  loadLastCheckedAt,
  noticeText,
  packageDownloadUrl,
  saveLastCheckedAt,
  shouldAutoCheck,
  updateMessage,
} from "./updates";

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse("2026-11-05T10:00:00Z");

function fakeStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

function throwingStorage(): Storage {
  const fail = () => {
    throw new Error("blocked");
  };
  return { length: 0, clear: fail, getItem: fail, key: fail, removeItem: fail, setItem: fail };
}

const MANIFEST = {
  version: "0.6.0",
  platforms: {
    "linux-x86_64": {
      url: "https://cdn.example.net/releases/0.6.0/OpenPlan_0.6.0_amd64.AppImage",
      signature: "sig",
    },
  },
};

describe("shouldAutoCheck", () => {
  const app = { enabled: true, inApp: true, isDebug: false, lastCheckedAt: null, now: NOW };

  it("checks once at launch", () => {
    expect(shouldAutoCheck({ ...app, reason: "launch", lastCheckedAt: NOW - HOUR })).toBe(true);
  });

  it("checks on focus only when more than a day passed since the last check", () => {
    expect(shouldAutoCheck({ ...app, reason: "focus", lastCheckedAt: NOW - 23 * HOUR })).toBe(false);
    expect(shouldAutoCheck({ ...app, reason: "focus", lastCheckedAt: NOW - 24 * HOUR })).toBe(false);
    expect(shouldAutoCheck({ ...app, reason: "focus", lastCheckedAt: NOW - 25 * HOUR })).toBe(true);
  });

  it("checks on focus when it never checked before", () => {
    expect(shouldAutoCheck({ ...app, reason: "focus" })).toBe(true);
  });

  it("never checks once the person turned it off", () => {
    expect(shouldAutoCheck({ ...app, enabled: false, reason: "launch" })).toBe(false);
    expect(shouldAutoCheck({ ...app, enabled: false, reason: "focus" })).toBe(false);
  });

  it("never checks in a debug build or the browser", () => {
    expect(shouldAutoCheck({ ...app, isDebug: true, reason: "launch" })).toBe(false);
    expect(shouldAutoCheck({ ...app, inApp: false, reason: "launch" })).toBe(false);
  });
});

describe("updateMessage", () => {
  it("says what each state means", () => {
    expect(updateMessage({ kind: "idle" })).toBeNull();
    expect(updateMessage({ kind: "checking" })).toBe("Checking…");
    expect(updateMessage({ kind: "upToDate" })).toBe("You have the latest version.");
    expect(updateMessage({ kind: "available", version: "0.6.0" })).toBe("Version 0.6.0 is ready.");
    expect(updateMessage({ kind: "installing", version: "0.6.0" })).toBe("Installing…");
    expect(updateMessage({ kind: "checkFailed" })).toBe(
      "Couldn't check for updates. Try again later.",
    );
    expect(updateMessage({ kind: "installFailed", version: "0.6.0" })).toBe(
      "Couldn't install the update. Try again.",
    );
    expect(
      updateMessage({ kind: "packageInstall", version: "0.6.0", downloadUrl: null }),
    ).toBe("This copy can't update itself. Download the new version.");
  });

  it("shows download progress when the size is known", () => {
    expect(updateMessage({ kind: "downloading", version: "0.6.0", percent: 42 })).toBe(
      "Downloading 42%",
    );
    expect(updateMessage({ kind: "downloading", version: "0.6.0", percent: null })).toBe(
      "Downloading…",
    );
  });
});

describe("noticeText", () => {
  it("names the version that is ready", () => {
    expect(noticeText({ kind: "available", version: "0.6.0" })).toBe("OpenPlan 0.6.0 is ready");
  });

  it("follows the install through to a failure", () => {
    expect(noticeText({ kind: "downloading", version: "0.6.0", percent: 7 })).toBe(
      "Downloading 7%",
    );
    expect(noticeText({ kind: "installing", version: "0.6.0" })).toBe("Installing…");
    expect(noticeText({ kind: "installFailed", version: "0.6.0" })).toBe(
      "Couldn't install the update. Try again.",
    );
  });

  it("tells a package install it has to download the version", () => {
    expect(
      noticeText({ kind: "packageInstall", version: "0.6.0", downloadUrl: null }),
    ).toBe("OpenPlan 0.6.0 is ready. This copy can't update itself.");
  });

  it("is null for a state the top bar does not show", () => {
    expect(noticeText({ kind: "idle" })).toBeNull();
    expect(noticeText({ kind: "checking" })).toBeNull();
    expect(noticeText({ kind: "upToDate" })).toBeNull();
    expect(noticeText({ kind: "checkFailed" })).toBeNull();
  });
});

describe("installTooltip", () => {
  it("warns on Windows that the app closes", () => {
    expect(installTooltip(true)).toBe("OpenPlan closes and reopens to install.");
    expect(installTooltip(false)).toBe("OpenPlan restarts to install.");
  });
});

describe("downloadPercent", () => {
  it("is the share received, in whole percent, up to 100", () => {
    expect(downloadPercent(0, 200)).toBe(0);
    expect(downloadPercent(85, 200)).toBe(42);
    expect(downloadPercent(250, 200)).toBe(100);
  });

  it("is unknown when the size is", () => {
    expect(downloadPercent(85, undefined)).toBeNull();
    expect(downloadPercent(85, 0)).toBeNull();
  });
});

describe("packageDownloadUrl", () => {
  it("points beside the AppImage, at the package this copy came from", () => {
    expect(packageDownloadUrl(MANIFEST, "0.6.0", "deb")).toBe(
      "https://cdn.example.net/releases/0.6.0/OpenPlan_0.6.0_amd64.deb",
    );
    expect(packageDownloadUrl(MANIFEST, "0.6.0", "rpm")).toBe(
      "https://cdn.example.net/releases/0.6.0/OpenPlan-0.6.0-1.x86_64.rpm",
    );
  });

  it("is null when the manifest has no Linux download", () => {
    expect(packageDownloadUrl({ version: "0.6.0" }, "0.6.0", "deb")).toBeNull();
    expect(packageDownloadUrl({ platforms: { "linux-x86_64": { url: "not a url" } } }, "0.6.0", "deb")).toBeNull();
  });
});

describe("checkOutcome", () => {
  it("reads no update as up to date", async () => {
    expect(await checkOutcome(async () => null, null)).toEqual({ kind: "upToDate" });
  });

  it("reads a found version as ready to install", async () => {
    const found = { version: "0.6.0", rawJson: MANIFEST };
    expect(await checkOutcome(async () => found, null)).toEqual({
      kind: "available",
      version: "0.6.0",
    });
  });

  it("sends a package install to the download instead", async () => {
    const found = { version: "0.6.0", rawJson: MANIFEST };
    expect(await checkOutcome(async () => found, "deb")).toEqual({
      kind: "packageInstall",
      version: "0.6.0",
      downloadUrl: "https://cdn.example.net/releases/0.6.0/OpenPlan_0.6.0_amd64.deb",
    });
  });

  it("reads any error as a failed check", async () => {
    const failing = async () => {
      throw new Error("Could not fetch a valid release JSON from the remote");
    };
    expect(await checkOutcome(failing, null)).toEqual({ kind: "checkFailed" });
  });
});

describe("last check time", () => {
  it("is remembered on this machine", () => {
    const storage = fakeStorage();
    saveLastCheckedAt(NOW, storage);

    expect(loadLastCheckedAt(storage)).toBe(NOW);
  });

  it("is unknown when nothing or nonsense is stored", () => {
    expect(loadLastCheckedAt(fakeStorage())).toBeNull();
    expect(loadLastCheckedAt(fakeStorage({ "openplan:updates-last-checked": "soon" }))).toBeNull();
  });

  it("survives storage that throws", () => {
    expect(loadLastCheckedAt(throwingStorage())).toBeNull();
    expect(() => saveLastCheckedAt(NOW, throwingStorage())).not.toThrow();
  });
});
