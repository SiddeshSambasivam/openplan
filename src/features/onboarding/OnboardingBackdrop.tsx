import { useEffect, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

/** Each ray's angle in degrees, and whether it is a thin one. */
const RAYS: [number, boolean][] = [
  [-58, false],
  [-40, true],
  [-24, false],
  [-9, true],
  [7, true],
  [22, false],
  [39, true],
  [56, false],
];

/**
 * Soft rays from below the horizon, in the theme's own foreground. They
 * drift only while the window is visible and focused, and fade back once
 * the welcome is passed.
 */
export function OnboardingBackdrop({ dim }: { dim: boolean }) {
  const paused = useWindowIdle();
  return (
    <div
      aria-hidden
      data-paused={paused}
      className={cn("onboarding-rays transition-opacity duration-900", dim && "opacity-30")}
    >
      {RAYS.map(([angle, thin]) => (
        <div
          key={angle}
          className="onboarding-ray"
          data-thin={thin ? "" : undefined}
          style={{ "--angle": `${angle}deg` } as CSSProperties}
        />
      ))}
    </div>
  );
}

/** True while the window is hidden or another window has focus. Follows the
 * window's own events. */
function useWindowIdle(): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    const update = () => setIdle(document.hidden || !document.hasFocus());
    update();
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return idle;
}
