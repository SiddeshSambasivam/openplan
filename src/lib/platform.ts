import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import type { PathInfo, ScanResult } from "./types";

/** True when running inside the Tauri shell (vs. a plain browser). */
export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const isMac =
  typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);

export const MARKDOWN_EXTENSIONS = [
  "md",
  "markdown",
  "mdown",
  "mkd",
  "mkdn",
  "mdx",
  "txt",
];

export function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function dirname(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const i = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return i <= 0 ? trimmed : trimmed.slice(0, i);
}

export function extensionOf(name: string): string {
  const base = basename(name);
  const i = base.lastIndexOf(".");
  // A leading dot names a hidden file; it does not give it an extension.
  return i <= 0 ? "" : base.slice(i + 1).toLowerCase();
}

export function isMarkdownPath(path: string): boolean {
  return MARKDOWN_EXTENSIONS.includes(extensionOf(path));
}

/** Basename without its extension — what we show in the sidebar. */
export function displayName(path: string): string {
  const base = basename(path);
  const i = base.lastIndexOf(".");
  return i <= 0 ? base : base.slice(0, i);
}

export async function readTextFile(path: string): Promise<string> {
  return invoke<string>("read_markdown", { path });
}

export async function writeTextFile(
  path: string,
  contents: string,
): Promise<void> {
  return invoke<void>("write_markdown", { path, contents });
}

/** Reads a doc's comment sidecar. `null` means none has been saved yet. */
export async function readCommentsSidecar(path: string): Promise<string | null> {
  return invoke<string | null>("read_comments", { path });
}

export async function writeCommentsSidecar(
  path: string,
  contents: string,
): Promise<void> {
  return invoke<void>("write_comments", { path, contents });
}

export async function deleteCommentsSidecar(path: string): Promise<void> {
  return invoke<void>("delete_comments", { path });
}

export async function pickMarkdownFiles(): Promise<string[]> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({
    multiple: true,
    filters: [{ name: "Markdown", extensions: [...MARKDOWN_EXTENSIONS] }],
  });
  if (!picked) return [];
  return Array.isArray(picked) ? picked : [picked];
}

export async function pickFolders(): Promise<string[]> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({ directory: true, multiple: true });
  if (!picked) return [];
  return Array.isArray(picked) ? picked : [picked];
}

export async function scanFolder(path: string): Promise<ScanResult> {
  return invoke<ScanResult>("scan_folder", { path });
}

export async function classifyPaths(paths: string[]): Promise<PathInfo[]> {
  return invoke<PathInfo[]>("classify_paths", { paths });
}

export async function openExternal(url: string): Promise<void> {
  if (isTauri) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/**
 * Resolve an image src found in a document. Relative paths are resolved
 * against the document's folder and served through Tauri's asset protocol;
 * absolute URLs (http, https, data:, …) pass through untouched.
 */
export function resolveAssetSrc(
  src: string | undefined,
  docPath: string | undefined,
): string | undefined {
  if (!src) return src;
  if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("//") || src.startsWith("#")) {
    return src;
  }
  if (!isTauri || !docPath) return src;

  let rel = src.split(/[?#]/)[0];
  try {
    rel = decodeURIComponent(rel);
  } catch {
    // keep the raw value if it isn't valid percent-encoding
  }
  const windowsStyle = docPath.includes("\\");
  const isAbsolute = rel.startsWith("/") || /^[A-Za-z]:[\\/]/.test(rel);
  const abs = isAbsolute
    ? rel
    : dirname(docPath) + (windowsStyle ? "\\" : "/") + (windowsStyle ? rel.replace(/\//g, "\\") : rel);
  return convertFileSrc(abs);
}
