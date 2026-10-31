/** Plans and set documents written as HTML. The file opens as a page in any
 * browser, so the app shows it as one: in a frame that runs no script, loads
 * nothing from the network, and only borrows the app's colours. */

/** The extension is the only signal that a file is HTML rather than markdown. */
export function isHtmlPath(path: string | undefined | null): boolean {
  return /\.html?$/i.test(path ?? "");
}

/** Takes the commented metadata block off the top, the way the markdown
 * renderer is handed a body with its fenced block already gone. */
export function stripHtmlFrontmatter(text: string): string {
  const match = /^<!--\r?\n---\r?\n[\s\S]*?\r?\n---\r?\n-->\r?\n?/.exec(text);
  return match ? text.slice(match[0].length) : text;
}

/** The app colours and type the frame is given, resolved to real values: a
 * sandbox with no same-origin access cannot read the app's variables. */
export interface FrameTheme {
  background: string;
  foreground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  fontFamily: string;
  fontSize: string;
}

function themeStyle(theme: FrameTheme): string {
  return `<style>html{color-scheme:light dark;background:${theme.background};}body{margin:0;padding:1.25rem;background:${theme.background};color:${theme.foreground};font-family:${theme.fontFamily};font-size:${theme.fontSize};line-height:1.6;}a{color:inherit;}hr,table,th,td{border-color:${theme.border};}code,pre{background:${theme.muted};}blockquote{color:${theme.mutedForeground};border-left:2px solid ${theme.border};margin-left:0;padding-left:1rem;}img{max-width:100%;height:auto;}</style>`;
}

/**
 * The document the frame is handed: the page as written, with the metadata
 * block gone and the theme stylesheet first in the head so the page's own
 * rules still win.
 */
export function frameSrcDoc(html: string, theme: FrameTheme): string {
  const page = stripHtmlFrontmatter(html);
  const style = themeStyle(theme);
  const head = /<head[^>]*>/i.exec(page);
  if (head) {
    const at = head.index + head[0].length;
    return page.slice(0, at) + style + page.slice(at);
  }
  const root = /<html[^>]*>/i.exec(page);
  if (root) {
    const at = root.index + root[0].length;
    return `${page.slice(0, at)}<head>${style}</head>${page.slice(at)}`;
  }
  return style + page;
}
