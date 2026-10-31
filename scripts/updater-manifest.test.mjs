import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildManifest } from "./updater-manifest.mjs";

const HOST = "https://d123.cloudfront.net";

// Names as tauri-action leaves them under each platform's bundle folder.
const BUNDLES = [
  "macos/OpenPlan.app.tar.gz",
  "macos/OpenPlan.app.tar.gz.sig",
  "dmg/OpenPlan_0.6.0_universal.dmg",
  "nsis/OpenPlan_0.6.0_x64-setup.exe",
  "nsis/OpenPlan_0.6.0_x64-setup.exe.sig",
  "msi/OpenPlan_0.6.0_x64_en-US.msi",
  "msi/OpenPlan_0.6.0_x64_en-US.msi.sig",
  "appimage/OpenPlan_0.6.0_amd64.AppImage",
  "appimage/OpenPlan_0.6.0_amd64.AppImage.sig",
  "deb/OpenPlan_0.6.0_amd64.deb",
  "rpm/OpenPlan-0.6.0-1.x86_64.rpm",
];

let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "updater-manifest-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeBundles(names) {
  return names.map((name) => {
    const path = join(dir, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, name.endsWith(".sig") ? `sig of ${name}\n` : "");
    return path;
  });
}

function manifestFor(names) {
  return buildManifest({
    version: "0.6.0",
    notes: "OpenPlan 0.6.0",
    pubDate: "2026-11-05T10:00:00Z",
    host: HOST,
    files: writeBundles(names),
  });
}

describe("buildManifest", () => {
  it("points every platform at its updater bundle and signature", () => {
    const { platforms, ...rest } = manifestFor(BUNDLES);
    const release = `${HOST}/releases/0.6.0`;
    const mac = {
      url: `${release}/OpenPlan.app.tar.gz`,
      signature: "sig of macos/OpenPlan.app.tar.gz.sig",
    };

    expect(rest).toEqual({
      version: "0.6.0",
      notes: "OpenPlan 0.6.0",
      pub_date: "2026-11-05T10:00:00Z",
    });
    expect(platforms).toEqual({
      "darwin-aarch64": mac,
      "darwin-x86_64": mac,
      "linux-x86_64": {
        url: `${release}/OpenPlan_0.6.0_amd64.AppImage`,
        signature: "sig of appimage/OpenPlan_0.6.0_amd64.AppImage.sig",
      },
      "windows-x86_64": {
        url: `${release}/OpenPlan_0.6.0_x64-setup.exe`,
        signature: "sig of nsis/OpenPlan_0.6.0_x64-setup.exe.sig",
      },
    });
  });

  it("encodes file names in the URL", () => {
    const names = BUNDLES.map((name) => name.replace("macos/OpenPlan", "macos/Open Plan"));
    expect(manifestFor(names).platforms["darwin-aarch64"].url).toBe(
      `${HOST}/releases/0.6.0/Open%20Plan.app.tar.gz`,
    );
  });

  it("refuses a release with a platform's signature missing", () => {
    const names = BUNDLES.filter((name) => name !== "nsis/OpenPlan_0.6.0_x64-setup.exe.sig");
    expect(() => manifestFor(names)).toThrow(/windows-x86_64/);
  });

  it("refuses a release with a platform's bundle missing", () => {
    const names = BUNDLES.filter((name) => !name.startsWith("appimage/"));
    expect(() => manifestFor(names)).toThrow(/linux-x86_64/);
  });

  it("refuses two bundles for one platform", () => {
    expect(() => manifestFor([...BUNDLES, "macos/Old.app.tar.gz"])).toThrow(/darwin/);
  });

  it("refuses a host that is not https", () => {
    expect(() =>
      buildManifest({ version: "0.6.0", notes: "", pubDate: "", host: "d123.cloudfront.net", files: [] }),
    ).toThrow(/https/);
  });
});
