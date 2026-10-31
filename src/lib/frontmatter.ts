/** The `---` fenced block a plan carries its metadata in. */
const FENCE = "---";

/**
 * Splits a plan's metadata block from the text a reader should see. The block
 * is shown as a header, not as the first paragraph of the plan, so preview
 * renders only what remains.
 */
export function stripFrontmatter(text: string): string {
  if (!text.startsWith(FENCE)) return text;
  const afterOpen = text.slice(FENCE.length);
  if (!afterOpen.startsWith("\n") && !afterOpen.startsWith("\r\n")) return text;
  const body = afterOpen.replace(/^\r?\n/, "");
  const lines = body.split("\n");
  const close = lines.findIndex((line) => line.trimEnd() === FENCE);
  // An unterminated fence is a horizontal rule someone wrote, not metadata.
  if (close === -1) return text;
  return lines.slice(close + 1).join("\n");
}
