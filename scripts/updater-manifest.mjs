// Writes the updater's static manifests.
// One platform, from that platform's folder of signed bundles:
//   node updater-manifest.mjs --platform <os-arch> --version <x.y.z> \
//     --host https://<host> --notes "..." --dir <bundles folder> --out <path>
// Every platform, from the four platform manifests:
//   node updater-manifest.mjs --combine --out <latest.json path> <manifest>...
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

/** Each platform the updater serves, keyed as the updater names it, and the end of its bundle's name. */
export const PLATFORMS = {
  "darwin-aarch64": ".app.tar.gz",
  "darwin-x86_64": ".app.tar.gz",
  "linux-x86_64": ".AppImage",
  "windows-x86_64": "-setup.exe",
};

/**
 * The manifest for one platform, whose bundles live in `releases/<version>/<platform>/`.
 * Throws, naming the platform, if its bundle or signature is missing.
 *
 * @param {{ platform: string, version: string, notes: string, pubDate: string, host: string, files: string[] }} release
 */
export function platformManifest({ platform, version, notes, pubDate, host, files }) {
  const suffix = PLATFORMS[platform];
  if (!suffix) throw new Error(`Unknown platform "${platform}"`);
  if (!host.startsWith("https://")) throw new Error(`The host must start with https://, got "${host}"`);
  const bundle = singleBundle(files, platform, suffix);
  const folder = `${host.replace(/\/+$/, "")}/releases/${version}/${platform}`;
  return {
    version,
    notes,
    pub_date: pubDate,
    platforms: {
      [platform]: {
        url: `${folder}/${encodeURIComponent(basename(bundle))}`,
        signature: readSignature(files, platform, bundle),
      },
    },
  };
}

/**
 * The manifest for every platform, joined from each platform's own. Throws if a
 * platform is missing or built twice, or the builds disagree on the version, so
 * a copy never reads a release that has no bundle for it.
 *
 * @param {ReturnType<typeof platformManifest>[]} manifests
 */
export function combineManifests(manifests) {
  const platforms = {};
  for (const manifest of manifests) {
    if (manifest.version !== manifests[0].version) {
      throw new Error(`Builds of ${manifests[0].version} and ${manifest.version} cannot share a release`);
    }
    for (const [platform, entry] of Object.entries(manifest.platforms)) {
      if (platforms[platform]) throw new Error(`${platform} was built twice`);
      platforms[platform] = entry;
    }
  }
  const missing = Object.keys(PLATFORMS).filter((platform) => !platforms[platform]);
  if (missing.length) throw new Error(`No build for ${missing.join(", ")}`);
  return {
    version: manifests[0].version,
    notes: manifests[0].notes,
    pub_date: manifests.map((manifest) => manifest.pub_date).sort().at(-1),
    platforms,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      combine: { type: "boolean" },
      platform: { type: "string" },
      version: { type: "string" },
      host: { type: "string" },
      notes: { type: "string" },
      dir: { type: "string" },
      out: { type: "string" },
    },
  });
  const required = values.combine ? ["out"] : ["platform", "version", "host", "notes", "dir", "out"];
  const missing = required.filter((name) => !values[name]);
  if (missing.length) fail(`Missing ${missing.map((name) => `--${name}`).join(", ")}`);
  try {
    const manifest = values.combine ? combineFiles(positionals) : platformFromDir(values);
    writeFileSync(values.out, `${JSON.stringify(manifest, null, 2)}\n`);
  } catch (error) {
    fail(error.message);
  }
}

function platformFromDir({ platform, version, notes, host, dir }) {
  const files = readdirSync(dir, { recursive: true }).map((name) => join(dir, name));
  return platformManifest({ platform, version, notes, pubDate: new Date().toISOString(), host, files });
}

function combineFiles(paths) {
  return combineManifests(paths.map((path) => JSON.parse(readFileSync(path, "utf8"))));
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
