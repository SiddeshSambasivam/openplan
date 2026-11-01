import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { follow, isSettled, type Follow } from "@/lib/follow";
import { cn } from "@/lib/utils";

/** Each ray's angle and how far it sways, in degrees, its sway's period in
 * seconds, and whether it is a thin one. The periods all differ, so
 * the rays drift out of step. */
const RAYS: [number, number, number, boolean][] = [
  [-58, 4, 13, false],
  [-40, -5.5, 11, true],
  [-24, 3, 17, false],
  [-9, -4.5, 12, true],
  [7, 5, 16, true],
  [22, -3.5, 14, false],
  [39, 6, 19, true],
  [56, -4, 15, false],
];

/**
 * Soft rays from below the horizon, in the theme's own foreground. They
 * sway on every step and lean toward the pointer, only while the window is
 * visible and focused, and fade back once the welcome is passed.
 */
export function OnboardingBackdrop({ dim }: { dim: boolean }) {
  const paused = useWindowIdle();
  const ref = useRef<HTMLDivElement>(null);
  useLeanToPointer(ref, paused);
  return (
    <div
      ref={ref}
      aria-hidden
      data-paused={paused}
      className={cn("onboarding-rays transition-opacity duration-900", dim && "opacity-85")}
    >
      <div className="onboarding-fan">
        {RAYS.map(([angle, sway, period, thin]) => (
          <div
            key={angle}
            className="onboarding-ray"
            data-thin={thin ? "" : undefined}
            style={
              { "--angle": `${angle}deg`, "--sway": `${sway}deg`, "--period": `${period}s` } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Writes `--lean-x` and `--lean-y`, from -1 to 1, on the element: where the
 * pointer is in the window, eased so the light follows it. One frame at
 * most per pointer move, and the frames stop once the lean settles. Nothing
 * runs while paused or under reduced motion.
 */
function useLeanToPointer(ref: RefObject<HTMLDivElement | null>, paused: boolean): void {
  const lean = useRef({ x: AT_REST, y: AT_REST });
  useEffect(() => {
    const element = ref.current;
    if (paused || !element) return;
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const target = { x: 0, y: 0 };
    let frame = 0;
    let last = 0;

    const step = (now: number) => {
      const seconds = (now - last) / 1000;
      last = now;
      const x = follow(lean.current.x, target.x, seconds);
      const y = follow(lean.current.y, target.y, seconds);
      lean.current = { x, y };
      element.style.setProperty("--lean-x", x.value.toFixed(4));
      element.style.setProperty("--lean-y", y.value.toFixed(4));
      frame = isSettled(x, target.x) && isSettled(y, target.y) ? 0 : requestAnimationFrame(step);
    };
    const aim = (x: number, y: number) => {
      target.x = x;
      target.y = y;
      if (frame || reducedMotion.matches) return;
      last = performance.now();
      frame = requestAnimationFrame(step);
    };
    const onMove = (event: PointerEvent) =>
      aim((event.clientX / window.innerWidth) * 2 - 1, (event.clientY / window.innerHeight) * 2 - 1);
    // The pointer leaving the window lets the light drift back to centre.
    const onOut = (event: PointerEvent) => event.relatedTarget == null && aim(0, 0);

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerout", onOut);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerout", onOut);
      cancelAnimationFrame(frame);
    };
  }, [ref, paused]);
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

const AT_REST: Follow = { value: 0, speed: 0 };
