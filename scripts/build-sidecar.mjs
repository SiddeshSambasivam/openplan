// Builds the `openplan` CLI that the app bundles, named the way Tauri looks
// for it. Runs as part of the app build on every platform, so it uses Node
// rather than a shell.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const TAURI_DIR = fileURLToPath(new URL("../src-tauri/", import.meta.url));
const MAC_ARCHES = ["aarch64-apple-darwin", "x86_64-apple-darwin"];

/**
 * What to build and where each binary goes, relative to `src-tauri`. A
 * universal Mac app needs a copy per architecture and one joined copy.
 *
 * @param {string} triple the Rust target triple the app is built for
 */
export function sidecarSteps(triple) {
  const universal = triple === "universal-apple-darwin";
  const targets = universal ? MAC_ARCHES : [triple];
  const exe = triple.includes("windows") ? ".exe" : "";
  return {
    targets,
    copies: targets.map((target) => ({
      from: `target/${target}/release/openplan${exe}`,
      to: `binaries/openplan-${target}${exe}`,
    })),
    universal: universal
      ? {
          inputs: targets.map((target) => `binaries/openplan-${target}`),
          output: "binaries/openplan-universal-apple-darwin",
        }
      : null,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

function main() {
  const steps = sidecarSteps(process.env.TAURI_ENV_TARGET_TRIPLE || hostTriple());
  for (const target of steps.targets) {
    run("cargo", ["build", "--release", "-p", "openplan-cli", "--target", target]);
  }
  mkdirSync(join(TAURI_DIR, "binaries"), { recursive: true });
  for (const { from, to } of steps.copies) {
    copyFileSync(join(TAURI_DIR, from), join(TAURI_DIR, to));
  }
  if (steps.universal) {
    const { inputs, output } = steps.universal;
    run("lipo", ["-create", "-output", output, ...inputs]);
  }
}

function hostTriple() {
  const info = execFileSync("rustc", ["-vV"], { encoding: "utf8" });
  return info.match(/^host: (.+)$/m)[1];
}

function run(command, args) {
  execFileSync(command, args, { cwd: TAURI_DIR, stdio: "inherit" });
}
