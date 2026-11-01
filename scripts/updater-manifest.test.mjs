import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { combineManifests, platformManifest } from "./updater-manifest.mjs";

const HOST = "https://d123.cloudfront.net";
const RELEASE = `${HOST}/releases/0.6.0`;

// Names as each platform's build job collects them from its bundle folder.
const BUNDLES = {
  "darwin-aarch64": [
    "OpenPlan.app.tar.gz",
    "OpenPlan.app.tar.gz.sig",
    "OpenPlan_0.6.0_aarch64.dmg",
  ],
  "darwin-x86_64": ["OpenPlan.app.tar.gz", "OpenPlan.app.tar.gz.sig", "OpenPlan_0.6.0_x64.dmg"],
  "linux-x86_64": [
    "OpenPlan_0.6.0_amd64.AppImage",
    "OpenPlan_0.6.0_amd64.AppImage.sig",
    "OpenPlan_0.6.0_amd64.deb",
    "OpenPlan_0.6.0_amd64.deb.sig",
    "OpenPlan-0.6.0-1.x86_64.rpm",
    "OpenPlan-0.6.0-1.x86_64.rpm.sig",
  ],
  "windows-x86_64": ["OpenPlan_0.6.0_x64-setup.exe", "OpenPlan_0.6.0_x64-setup.exe.sig"],
};

let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "updater-manifest-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeBundles(platform, names) {
  return names.map((name) => {
    const path = join(dir, platform, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, name.endsWith(".sig") ? `sig of ${platform}/${name}\n` : "");
    return path;
  });
}

function manifestFor(platform, names = BUNDLES[platform], overrides = {}) {
  return platformManifest({
    platform,
    version: "0.6.0",
    notes: "OpenPlan 0.6.0",
    pubDate: "2026-11-05T10:00:00Z",
    host: HOST,
    files: writeBundles(platform, names),
    ...overrides,
  });
}

describe("platformManifest", () => {
  it("lists only its own platform, under the platform's release folder", () => {
    expect(manifestFor("darwin-aarch64")).toEqual({
      version: "0.6.0",
      notes: "OpenPlan 0.6.0",
      pub_date: "2026-11-05T10:00:00Z",
      platforms: {
        "darwin-aarch64": {
          url: `${RELEASE}/darwin-aarch64/OpenPlan.app.tar.gz`,
          signature: "sig of darwin-aarch64/OpenPlan.app.tar.gz.sig",
        },
      },
    });
  });

  it("picks the AppImage on Linux and the setup.exe on Windows", () => {
    expect(manifestFor("linux-x86_64").platforms["linux-x86_64"].url).toBe(
      `${RELEASE}/linux-x86_64/OpenPlan_0.6.0_amd64.AppImage`,
    );
    expect(manifestFor("windows-x86_64").platforms["windows-x86_64"].url).toBe(
      `${RELEASE}/windows-x86_64/OpenPlan_0.6.0_x64-setup.exe`,
    );
  });

  it("encodes file names in the URL", () => {
    const names = BUNDLES["darwin-x86_64"].map((name) => name.replace("OpenPlan.app", "Open Plan.app"));
    expect(manifestFor("darwin-x86_64", names).platforms["darwin-x86_64"].url).toBe(
      `${RELEASE}/darwin-x86_64/Open%20Plan.app.tar.gz`,
    );
  });

  it("refuses a bundle without its signature", () => {
    const names = BUNDLES["windows-x86_64"].filter((name) => !name.endsWith(".sig"));
    expect(() => manifestFor("windows-x86_64", names)).toThrow(/windows-x86_64/);
  });

  it("refuses a release with the bundle missing", () => {
    const names = BUNDLES["linux-x86_64"].filter((name) => !name.includes("AppImage"));
    expect(() => manifestFor("linux-x86_64", names)).toThrow(/linux-x86_64/);
  });

  it("refuses two bundles for one platform", () => {
    const names = [...BUNDLES["darwin-aarch64"], "Old.app.tar.gz"];
    expect(() => manifestFor("darwin-aarch64", names)).toThrow(/darwin-aarch64/);
  });

  it("refuses a platform the updater does not know", () => {
    expect(() => manifestFor("linux-aarch64", [])).toThrow(/linux-aarch64/);
  });

  it("refuses a host that is not https", () => {
    expect(() => manifestFor("darwin-aarch64", undefined, { host: "d123.cloudfront.net" })).toThrow(
      /https/,
    );
  });
});

describe("combineManifests", () => {
  const all = () => Object.keys(BUNDLES).map((platform) => manifestFor(platform));

  it("joins every platform, each with its own bundle", () => {
    const { platforms, ...rest } = combineManifests(all());

    expect(rest).toEqual({
      version: "0.6.0",
      notes: "OpenPlan 0.6.0",
      pub_date: "2026-11-05T10:00:00Z",
    });
    expect(Object.keys(platforms).sort()).toEqual(Object.keys(BUNDLES).sort());
    expect(platforms["darwin-aarch64"].url).toBe(`${RELEASE}/darwin-aarch64/OpenPlan.app.tar.gz`);
    expect(platforms["darwin-x86_64"].url).toBe(`${RELEASE}/darwin-x86_64/OpenPlan.app.tar.gz`);
    expect(platforms["darwin-x86_64"].signature).toBe("sig of darwin-x86_64/OpenPlan.app.tar.gz.sig");
  });

  it("dates the release by its last build", () => {
    const manifests = all();
    manifests[2] = { ...manifests[2], pub_date: "2026-11-05T10:04:00Z" };
    expect(combineManifests(manifests).pub_date).toBe("2026-11-05T10:04:00Z");
  });

  it("refuses a release with a platform missing", () => {
    const manifests = all().filter((manifest) => !manifest.platforms["windows-x86_64"]);
    expect(() => combineManifests(manifests)).toThrow(/windows-x86_64/);
  });

  it("refuses a platform built twice", () => {
    const manifests = all();
    expect(() => combineManifests([...manifests, manifests[0]])).toThrow(/darwin-aarch64/);
  });

  it("refuses builds of different versions", () => {
    const manifests = all();
    manifests[1] = { ...manifests[1], version: "0.5.9" };
    expect(() => combineManifests(manifests)).toThrow(/0\.5\.9/);
  });
});
