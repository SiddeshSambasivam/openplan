import { describe, expect, it } from "vitest";
import { sidecarSteps } from "./build-sidecar.mjs";

describe("sidecarSteps", () => {
  it("builds one copy named for a plain target", () => {
    expect(sidecarSteps("aarch64-apple-darwin", "10.13")).toEqual({
      targets: ["aarch64-apple-darwin"],
      copies: [
        {
          from: "target/aarch64-apple-darwin/release/openplan",
          to: "binaries/openplan-aarch64-apple-darwin",
        },
      ],
      universal: null,
      env: { MACOSX_DEPLOYMENT_TARGET: "10.13" },
    });
  });

  // The app's own build sets it, and a C dependency built both ways rebuilds every time.
  it("builds for the app's minimum macOS only on a Mac", () => {
    expect(sidecarSteps("x86_64-apple-darwin", "10.13").env).toEqual({
      MACOSX_DEPLOYMENT_TARGET: "10.13",
    });
    expect(sidecarSteps("x86_64-unknown-linux-gnu", "10.13").env).toEqual({});
  });

  it("keeps the .exe suffix on Windows", () => {
    expect(sidecarSteps("x86_64-pc-windows-msvc", "10.13").copies).toEqual([
      {
        from: "target/x86_64-pc-windows-msvc/release/openplan.exe",
        to: "binaries/openplan-x86_64-pc-windows-msvc.exe",
      },
    ]);
  });

  it("builds both Mac architectures and joins them for a universal target", () => {
    const steps = sidecarSteps("universal-apple-darwin", "10.13");
    expect(steps.targets).toEqual(["aarch64-apple-darwin", "x86_64-apple-darwin"]);
    expect(steps.copies.map((copy) => copy.to)).toEqual([
      "binaries/openplan-aarch64-apple-darwin",
      "binaries/openplan-x86_64-apple-darwin",
    ]);
    expect(steps.universal).toEqual({
      inputs: ["binaries/openplan-aarch64-apple-darwin", "binaries/openplan-x86_64-apple-darwin"],
      output: "binaries/openplan-universal-apple-darwin",
    });
  });
});
