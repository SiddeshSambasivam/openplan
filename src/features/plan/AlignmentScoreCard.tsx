import { Check } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AlignmentArea, AlignmentScore } from "@/lib/alignmentScore";
import { cn } from "@/lib/utils";
import { PERSONAS } from "@/lib/work";
import { PersonaAvatar } from "./PersonaAvatar";

const RING_RADIUS = 24;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
const COUNT_MS = 600;

/** The alignment score as a ring, what it is made of, and a chip per area. */
export function AlignmentScoreCard({ score }: { score: AlignmentScore }) {
  const shown = useCountUp(score.total);
  const settled = score.areas.filter((area) => area.settled).length;
  return (
    <section
      aria-label="Alignment score"
      className="flex flex-wrap items-center gap-3.5 rounded-lg border border-border bg-card p-3"
    >
      <div role="img" aria-label={`Alignment score ${score.total} out of 100`} className="relative size-14 shrink-0">
        <svg viewBox="0 0 58 58" className="size-full -rotate-90">
          <circle cx="29" cy="29" r={RING_RADIUS} fill="none" strokeWidth="5" className="stroke-muted" />
          <circle
            cx="29"
            cy="29"
            r={RING_RADIUS}
            fill="none"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={RING_LENGTH}
            strokeDashoffset={RING_LENGTH * (1 - shown / 100)}
            className={cn("stroke-foreground", shown === 0 && "opacity-0")}
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-base font-semibold tabular-nums">
          {shown}
        </span>
      </div>
      <div className="flex min-w-40 flex-col gap-0.5 text-xs text-muted-foreground">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          Alignment
          {score.total === 100 && (
            <Badge className="border-transparent bg-success/15 text-success">Fully aligned</Badge>
          )}
        </p>
        <p>
          {settled} of {score.areas.length} {score.areas.length === 1 ? "area" : "areas"} settled ·{" "}
          {score.coverage} of 80
        </p>
        <p>
          {score.reasoned} of {score.answered} {score.answered === 1 ? "answer explains" : "answers explain"}{" "}
          why · {score.reasoning} of 20
        </p>
      </div>
      <ul className="flex min-w-0 flex-1 flex-wrap gap-1.5">
        {score.areas.map((area) => (
          <AreaChip key={area.name} area={area} />
        ))}
        {score.notAsked.map((name) => (
          <Chip key={name} tip="Ask the agent in a review comment if this plan needs it." className="border-dashed">
            Not asked yet: {name}
          </Chip>
        ))}
      </ul>
    </section>
  );
}

function AreaChip({ area }: { area: AlignmentArea }) {
  if (area.settled) {
    return (
      <Chip tip="Settled" className="border-transparent bg-muted text-foreground">
        <span className="grid size-4 place-items-center rounded-full bg-success/15 text-success">
          <Check className="size-2.5" strokeWidth={3} />
        </span>
        {area.label}
      </Chip>
    );
  }
  const asker = area.askedBy ? PERSONAS[area.askedBy].name : "The agent";
  return (
    <Chip tip={`${asker} is asking about this`}>
      <PersonaAvatar role={area.askedBy} className="text-base" />
      {area.label}
    </Chip>
  );
}

function Chip({ tip, className, children }: { tip: string; className?: string; children: ReactNode }) {
  return (
    <li>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border border-border bg-background py-0.5 pr-2 pl-1 text-xs text-muted-foreground",
              className,
            )}
          >
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {tip}
        </TooltipContent>
      </Tooltip>
    </li>
  );
}

/** Counts from the last score to this one, with the ring alongside. A
 * reader who asks for less motion sees the number at once. */
function useCountUp(target: number): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = from.current;
    from.current = target;
    if (start === target || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(target);
      return;
    }
    const began = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const done = Math.min(1, (now - began) / COUNT_MS);
      setShown(Math.round(start + (target - start) * (1 - (1 - done) ** 3)));
      if (done < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return shown;
}
