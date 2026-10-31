import { useEffect, useMemo, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { readTheme } from "@/features/plan/HtmlDoc";
import { frameHeight, fenceSrcDoc } from "@/lib/fences";
import { frameSrcDoc } from "@/lib/htmlDoc";

interface HtmlFenceProps extends HTMLAttributes<HTMLElement> {
  /** The fence body, run as a page inside the frame. */
  code: string;
  /** Re-reads the theme tokens when the app theme flips. */
  dark: boolean;
  /** The highlighted source, shown in place of the frame on request. */
  children: ReactNode;
}

/**
 * An `html` fence run as a small interactive page. The wrapper carries the
 * fence's source-line stamps, so comments anchor to it whichever view shows.
 */
export function HtmlFence({ code, dark, children, ...stamps }: HtmlFenceProps) {
  const [showCode, setShowCode] = useState(false);

  return (
    <div {...stamps}>
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => setShowCode((shown) => !shown)}>
          {showCode ? "Show result" : "Show code"}
        </Button>
      </div>
      {showCode ? children : <FenceFrame code={code} dark={dark} />}
    </div>
  );
}

function FenceFrame({ code, dark }: { code: string; dark: boolean }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  // `dark` is not read: it re-reads the tokens when the theme changes.
  const srcDoc = useMemo(() => frameSrcDoc(fenceSrcDoc(code), readTheme()), [code, dark]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const frame = frameRef.current;
      const height = frameHeight(event, frame?.contentWindow);
      // Written straight to the style: a frame that resizes often would
      // otherwise re-render on every report.
      if (frame && height !== null) frame.style.height = `${height}px`;
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <iframe
      ref={frameRef}
      // Scripts only. Without allow-same-origin the frame has an opaque
      // origin, so nothing in it can reach the app.
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      title="Interactive example"
      // A ring takes no space, so the reported height is the frame's height.
      className="block h-30 w-full rounded-lg bg-background ring-1 ring-border"
    />
  );
}
