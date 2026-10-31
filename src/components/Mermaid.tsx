import { useEffect, useId, useRef, useState } from "react";

interface MermaidProps {
  code: string;
  /** Re-render (with re-resolved colors) whenever the app theme flips. */
  dark: boolean;
}

let mermaidModulePromise: Promise<typeof import("mermaid").default> | null =
  null;

function loadMermaid() {
  mermaidModulePromise ??= import("mermaid").then((m) => m.default);
  return mermaidModulePromise;
}

/**
 * Rasterize a CSS color to concrete `rgb()`/`rgba()` byte values via a 1x1
 * canvas. Needed because `getComputedStyle(...).color` on modern engines can
 * return the color verbatim in whatever space it was declared in (e.g. the
 * app's tokens are oklch()), which mermaid's color utilities (lighten/darken)
 * can't parse — reading back rasterized pixel data sidesteps that entirely.
 */
let sharedCanvas: HTMLCanvasElement | null = null;
function cssColorToRgbString(cssColor: string): string {
  sharedCanvas ??= document.createElement("canvas");
  sharedCanvas.width = 1;
  sharedCanvas.height = 1;
  const ctx = sharedCanvas.getContext("2d");
  if (!ctx) return cssColor;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = cssColor;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a / 255})`;
}

/**
 * Resolve the app's CSS custom properties (oklch, defined on :root/.dark) to
 * concrete `rgb()` strings — first through a throwaway probe element (to
 * resolve the var() reference and cascade), then through canvas (to
 * normalize whatever color space that resolves to into plain rgb byte
 * values mermaid's color utilities can operate on).
 */
function resolveNeutralPalette() {
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;";
  document.body.appendChild(probe);
  const resolve = (expr: string) => {
    probe.style.color = expr;
    return cssColorToRgbString(getComputedStyle(probe).color);
  };
  const palette = {
    foreground: resolve("var(--color-foreground)"),
    background: resolve("var(--color-background)"),
    border: resolve("var(--color-border)"),
    muted: resolve("var(--color-muted)"),
    mutedForeground: resolve("var(--color-muted-foreground)"),
  };
  document.body.removeChild(probe);
  return palette;
}

/** Map the app's grayscale palette onto mermaid's theme variables, so every
 * diagram type (flowchart, sequence, class, state, ER, ...) stays neutral
 * instead of mermaid's default colorful theme. */
function neutralThemeVariables() {
  const { foreground, background, border, muted, mutedForeground } =
    resolveNeutralPalette();
  return {
    background,
    primaryColor: muted,
    primaryTextColor: foreground,
    primaryBorderColor: border,
    secondaryColor: muted,
    secondaryTextColor: foreground,
    secondaryBorderColor: border,
    tertiaryColor: background,
    tertiaryTextColor: foreground,
    tertiaryBorderColor: border,
    lineColor: mutedForeground,
    textColor: foreground,
    mainBkg: muted,
    nodeBorder: border,
    clusterBkg: background,
    clusterBorder: border,
    edgeLabelBackground: background,
    actorBkg: muted,
    actorBorder: border,
    actorTextColor: foreground,
    actorLineColor: mutedForeground,
    signalColor: foreground,
    signalTextColor: foreground,
    labelBoxBkgColor: muted,
    labelBoxBorderColor: border,
    labelTextColor: foreground,
    loopTextColor: foreground,
    noteBkgColor: muted,
    noteBorderColor: border,
    noteTextColor: foreground,
    activationBkgColor: background,
    activationBorderColor: border,
    sequenceNumberColor: background,
    fontFamily: "inherit",
  };
}

let renderSeq = 0;

/** Renders a fenced ```mermaid block as an SVG diagram, neutral-themed to
 * match the app's own grayscale palette in both light and dark mode. */
export function Mermaid({ code, dark }: MermaidProps) {
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const seq = ++renderSeq;
    setError(null);
    void (async () => {
      try {
        const mermaid = await loadMermaid();
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          themeVariables: neutralThemeVariables(),
        });
        const { svg, bindFunctions } = await mermaid.render(
          `mermaid-${rawId}-${seq}`,
          code,
        );
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = svg;
        bindFunctions?.(containerRef.current);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
    // `dark` isn't read directly, but its change means the resolved palette
    // (read fresh inside the effect) needs a re-render.
  }, [code, dark, rawId]);

  if (error) {
    return (
      <div className="not-prose my-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
        Couldn’t render this diagram: {error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="not-prose my-4 flex justify-center overflow-x-auto [&_svg]:max-w-full"
    />
  );
}
