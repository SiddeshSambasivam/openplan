/** Fenced code blocks that render as something other than code, and the
 * sandboxed frame an `html` fence runs in. */

/** The slice of a hast node a fence check reads. */
export interface FenceNode {
  type: string;
  tagName?: string;
  properties?: { className?: unknown };
  children?: FenceNode[];
}

/** The language of a `pre > code` block, lower-cased, or null if it has none. */
export function fenceLanguage(pre: FenceNode | undefined): string | null {
  if (pre?.type !== "element" || pre.tagName !== "pre") return null;
  const code = pre.children?.[0];
  if (code?.type !== "element" || code.tagName !== "code") return null;
  const classes = code.properties?.className;
  if (!Array.isArray(classes)) return null;
  const language = classes.find(
    (name): name is string => typeof name === "string" && name.startsWith("language-"),
  );
  return language ? language.slice("language-".length).toLowerCase() : null;
}

/** No network at all: only the fence's own inline code and inline data. */
export const FENCE_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:";

export const HEIGHT_MESSAGE = "openplan:height";

// Measures the root element's box rather than its scrollHeight, which never
// drops below the frame's own height and so could never shrink it.
const HEIGHT_SCRIPT = `(function(){var root=document.documentElement;function post(){parent.postMessage({type:"${HEIGHT_MESSAGE}",height:Math.ceil(root.getBoundingClientRect().height)},"*")}addEventListener("load",post);new ResizeObserver(post).observe(document.documentElement)})()`;

/** The document an `html` fence's frame is handed: the fence body, behind a
 * policy that blocks every request, with a script that reports its height. */
export function fenceSrcDoc(body: string): string {
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    `<meta http-equiv="Content-Security-Policy" content="${FENCE_CSP}">` +
    `<script>${HEIGHT_SCRIPT}</script></head><body>` +
    body +
    "</body></html>"
  );
}

const MIN_FRAME_HEIGHT = 120;
const MAX_FRAME_HEIGHT = 2000;

export function clampFrameHeight(height: number): number {
  return Math.min(MAX_FRAME_HEIGHT, Math.max(MIN_FRAME_HEIGHT, Math.ceil(height)));
}

/** The height a message asks the frame to take, or null when the message is
 * not a height report from that frame's own window. */
export function frameHeight(
  event: { source: unknown; data: unknown },
  frame: Window | null | undefined,
): number | null {
  if (!frame || event.source !== frame) return null;
  const data = event.data as { type?: unknown; height?: unknown } | null;
  if (typeof data !== "object" || data === null || data.type !== HEIGHT_MESSAGE) {
    return null;
  }
  const { height } = data;
  return typeof height === "number" && Number.isFinite(height)
    ? clampFrameHeight(height)
    : null;
}
