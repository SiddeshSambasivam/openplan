import { describe, expect, it } from "vitest";
import { sidecarSteps } from "./build-sidecar.mjs";

describe("sidecarSteps", () => {
  it("builds one copy named for a plain target", () => {
    expect(sidecarSteps("aarch64-apple-darwin")).toEqual({
      targets: ["aarch64-apple-darwin"],
      copies: [
        {
          from: "target/aarch64-apple-darwin/release/openplan",
          to: "binaries/openplan-aarch64-apple-darwin",
        },
      ],
      universal: null,
    });
  });

  it("keeps the .exe suffix on Windows", () => {
    expect(sidecarSteps("x86_64-pc-windows-msvc").copies).toEqual([
      {
        from: "target/x86_64-pc-windows-msvc/release/openplan.exe",
        to: "binaries/openplan-x86_64-pc-windows-msvc.exe",
      },
    ]);
  });

  it("builds both Mac architectures and joins them for a universal target", () => {
    const steps = sidecarSteps("universal-apple-darwin");
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
