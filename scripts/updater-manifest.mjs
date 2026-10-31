// Writes the updater's latest.json from a folder of signed bundles.
// Usage: node updater-manifest.mjs --version <x.y.z> --host https://<host> \
//          --notes "..." --dir <bundles folder> --out <latest.json path>
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

/**
 * The updater's static manifest, with every platform filled in. Throws, naming
 * the platform, if a bundle or its signature is missing, so a release never
 * ships a manifest that leaves a platform out.
 *
 * @param {{ version: string, notes: string, pubDate: string, host: string, files: string[] }} release
 */
export function buildManifest({ version, notes, pubDate, host, files }) {
  if (!host.startsWith("https://")) throw new Error(`The host must start with https://, got "${host}"`);
  const releaseUrl = `${host.replace(/\/+$/, "")}/releases/${version}`;
  const entry = (platform, suffix) => {
    const bundle = singleBundle(files, platform, suffix);
    return {
      url: `${releaseUrl}/${encodeURIComponent(basename(bundle))}`,
      signature: readSignature(files, platform, bundle),
    };
  };
  // One universal macOS build serves both architectures.
  const mac = entry("darwin", ".app.tar.gz");
  return {
    version,
    notes,
    pub_date: pubDate,
    platforms: {
      "darwin-aarch64": mac,
      "darwin-x86_64": mac,
      "linux-x86_64": entry("linux-x86_64", ".AppImage"),
      "windows-x86_64": entry("windows-x86_64", "-setup.exe"),
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

function main() {
  const { values } = parseArgs({
    options: {
      version: { type: "string" },
      host: { type: "string" },
      notes: { type: "string" },
      dir: { type: "string" },
      out: { type: "string" },
    },
  });
  const missing = ["version", "host", "notes", "dir", "out"].filter((name) => !values[name]);
  if (missing.length) fail(`Missing ${missing.map((name) => `--${name}`).join(", ")}`);
  try {
    const files = readdirSync(values.dir, { recursive: true }).map((name) => join(values.dir, name));
    const manifest = buildManifest({
      version: values.version,
      notes: values.notes,
      pubDate: new Date().toISOString(),
      host: values.host,
      files,
    });
    writeFileSync(values.out, `${JSON.stringify(manifest, null, 2)}\n`);
  } catch (error) {
    fail(error.message);
  }
}

function singleBundle(files, platform, suffix) {
  const matches = files.filter((file) => file.endsWith(suffix));
  if (matches.length !== 1) {
    throw new Error(`Expected one ${suffix} bundle for ${platform}, found ${matches.length}`);
  }
  return matches[0];
}

function readSignature(files, platform, bundle) {
  const sig = `${bundle}.sig`;
  if (!files.includes(sig)) throw new Error(`No signature for ${platform}: ${basename(sig)} is missing`);
  return readFileSync(sig, "utf8").trim();
}

function fail(message) {
  console.error(`updater-manifest: ${message}`);
  process.exit(1);
}
