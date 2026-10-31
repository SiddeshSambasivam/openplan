import { useMemo } from "react";
import { frameSrcDoc, type FrameTheme } from "@/lib/htmlDoc";

/** The app's colours and type, read as values. The frame has no same-origin
 * access, so it cannot read the variables these come from. */
export function readTheme(): FrameTheme {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) =>
    style.getPropertyValue(name).trim() || fallback;
  return {
    background: token("--color-background", "#fff"),
    foreground: token("--color-foreground", "#111"),
    muted: token("--color-muted", "#eee"),
    mutedForeground: token("--color-muted-foreground", "#666"),
    border: token("--color-border", "#ddd"),
    fontFamily: token("--font-sans", "system-ui, sans-serif"),
    fontSize: `${15 * Number(token("--content-font-scale", "1") || 1)}px`,
  };
}

/**
 * A plan or set document written as HTML. It renders in a frame that runs no
 * script, loads nothing and submits nothing. The frame cannot be measured
 * from outside a sandbox this tight, so it fills the reading area and scrolls
 * inside it rather than growing to its content.
 */
export function HtmlDoc({ content, dark }: { content: string; dark: boolean }) {
  // `dark` is not read: it re-reads the tokens when the theme changes.
  const srcDoc = useMemo(() => frameSrcDoc(content, readTheme()), [content, dark]);

  return (
    <iframe
      // No allow-same-origin, so nothing in the page can reach the app.
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      title="Document"
      className="plan-frame w-full rounded-lg border border-border bg-background"
    />
  );
}
