// Builds the `openplan` CLI that the app bundles, named the way Tauri looks
// for it. Runs as part of the app build on every platform, so it uses Node
// rather than a shell.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const TAURI_DIR = fileURLToPath(new URL("../src-tauri/", import.meta.url));
const MAC_ARCHES = ["aarch64-apple-darwin", "x86_64-apple-darwin"];

/**
 * What to build and where each binary goes, relative to `src-tauri`. A
 * universal Mac app needs a copy per architecture and one joined copy. A Mac
 * build targets the app's minimum macOS, as the app's own build does.
 *
 * @param {string} triple the Rust target triple the app is built for
 * @param {string} macosMinimum the app's `bundle.macOS.minimumSystemVersion`
 */
export function sidecarSteps(triple, macosMinimum) {
  const universal = triple === "universal-apple-darwin";
  const targets = universal ? MAC_ARCHES : [triple];
  const exe = triple.includes("windows") ? ".exe" : "";
  return {
    env: triple.endsWith("apple-darwin") ? { MACOSX_DEPLOYMENT_TARGET: macosMinimum } : {},
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
  const config = JSON.parse(readFileSync(join(TAURI_DIR, "tauri.conf.json"), "utf8"));
  const steps = sidecarSteps(
    process.env.TAURI_ENV_TARGET_TRIPLE || hostTriple(),
    config.bundle.macOS.minimumSystemVersion,
  );
  for (const target of steps.targets) {
    run("cargo", ["build", "--release", "-p", "openplan-cli", "--target", target], steps.env);
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

function run(command, args, env = {}) {
  execFileSync(command, args, { cwd: TAURI_DIR, stdio: "inherit", env: { ...process.env, ...env } });
}
