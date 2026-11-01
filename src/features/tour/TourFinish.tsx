import { useEffect, useState, type AnimationEvent } from "react";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { PersonaAvatar } from "@/features/plan/PersonaAvatar";
import { readPanel } from "@/lib/personRoles";
import { isTypingTarget } from "@/lib/shortcuts";
import type { TourAction } from "@/lib/tour";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/work";

/**
 * The moment after the tour's last step: the tour's dimming fades out
 * behind a lockup, and the person's reviewers come in one by one and hop.
 * Get started and Enter, or Esc and a click outside, play it out and then
 * close the tour. It moves on animation events only.
 */
export function TourFinish({ dispatch }: { dispatch: (action: TourAction) => void }) {
  const [leaving, setLeaving] = useState<TourAction | null>(null);
  const [panel, setPanel] = useState<Role[] | null>(null);
  useEffect(() => void readPanel().then(setPanel), []);

  // In the capture phase, so the app's own Esc and Enter keys never see it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || isTypingTarget(event.target)) return;
      const onPage = event.target === document.body || event.target === document.documentElement;
      const action =
        event.key === "Escape" ? "skip" : event.key === "Enter" && onPage ? "next" : null;
      if (!action) return;
      event.preventDefault();
      setLeaving((old) => old ?? { type: action });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const leave = (action: TourAction) => setLeaving((old) => old ?? action);
  const onLockupEnd = (event: AnimationEvent<HTMLDivElement>) => {
    if (leaving && event.target === event.currentTarget) dispatch(leaving);
  };

  return (
    <div
      className={cn("fixed inset-0 z-50 grid place-items-center p-4", leaving && "pointer-events-none")}
      onPointerDown={(event) => event.target === event.currentTarget && leave({ type: "skip" })}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 animate-out bg-(--tour-scrim) fade-out-0 duration-700 ease-out fill-mode-forwards"
      />
      <div
        role="dialog"
        aria-modal
        aria-labelledby="tour-finish-title"
        onAnimationEnd={onLockupEnd}
        className={cn(
          "relative flex w-full max-w-sm flex-col items-center rounded-xl border border-border bg-popover px-8 py-7 text-center text-popover-foreground shadow-lg short:py-5",
          leaving
            ? "animate-out fade-out-0 zoom-out-95 duration-300 ease-in fill-mode-forwards"
            : "animate-in fade-in-0 slide-in-from-bottom-4 duration-600 ease-out",
        )}
      >
        <BrandMark className="mb-4 size-8 short:mb-3" />
        <h2 id="tour-finish-title" className="mb-2 font-serif text-4xl leading-tight short:text-3xl">
          You're ready
        </h2>
        <p className="mb-6 text-sm text-balance text-muted-foreground short:mb-4">
          Your agents can file plans now. They show up on this board.
        </p>
        <Button
          size="lg"
          autoFocus
          onClick={() => leave({ type: "next" })}
          className="gap-2.5 pr-3 pl-4.5 active:scale-98"
        >
          Get started
          <Kbd className="bg-primary-foreground/15 text-primary-foreground">↵</Kbd>
        </Button>
        <div aria-hidden className="mt-6 flex h-9 gap-3 text-4xl short:mt-4">
          {panel?.map((role, index) => <Reviewer key={role} role={role} index={index} />)}
        </div>
      </div>
    </div>
  );
}

/** Comes in after the ones before it, and hops once it lands. */
function Reviewer({ role, index }: { role: Role; index: number }) {
  const [landed, setLanded] = useState(false);
  return (
    <span
      className="animate-in fade-in-0 slide-in-from-bottom-3 duration-400 ease-out fill-mode-backwards"
      style={{ animationDelay: `${REVIEWERS_AFTER_MS + index * REVIEWER_GAP_MS}ms` }}
      onAnimationEnd={(event) => event.target === event.currentTarget && setLanded(true)}
    >
      <PersonaAvatar role={role} hop={landed} />
    </span>
  );
}

const REVIEWERS_AFTER_MS = 450;
const REVIEWER_GAP_MS = 120;
