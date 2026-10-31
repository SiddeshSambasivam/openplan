import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { belowTarget, type AlignmentArea, type AlignmentScore } from "@/lib/alignmentScore";
import { cn } from "@/lib/utils";
import { PERSONAS } from "@/lib/work";
import { PersonaAvatar } from "./PersonaAvatar";

const COUNT_MS = 600;
/* The ring's two halves, drawn from the top: down the left side, and down
 * the right side. Each turns into view inside its own half. */
const LEFT_HALF = "M29 53 A24 24 0 0 1 29 5";
const RIGHT_HALF = "M29 5 A24 24 0 0 1 29 53";

/** The alignment score on one line: a small ring, and how many areas are
 * settled. The areas and how the score adds up open from the count. A
 * `target` of 0 is no target. */
export function AlignmentScoreCard({ score, target }: { score: AlignmentScore; target: number }) {
  const shown = useCountUp(score.total);
  const settled = score.areas.filter((area) => area.settled).length;
  return (
    <section aria-label="Alignment score" className="flex shrink-0 items-center gap-2">
      <div role="img" aria-label={`Alignment score ${score.total} out of 100`} className="relative size-8 shrink-0">
        <ScoreRing value={shown} target={target} />
        <span className="absolute inset-0 grid place-items-center text-xs font-semibold tabular-nums">
          {Math.round(shown)}
        </span>
      </div>
      <p className="text-sm font-medium text-foreground">Alignment</p>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="xs" className="-ml-1 font-normal text-muted-foreground">
            {settled} of {score.counted} {score.counted === 1 ? "area" : "areas"} settled
            <ChevronDown />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-3">
          <ScoreDetails score={score} />
        </PopoverContent>
      </Popover>
      {belowTarget(score.total, target) && (
        <Badge variant="outline" className="rounded-full px-2 font-normal text-muted-foreground">
          {`Below your ${target}% target`}
        </Badge>
      )}
      {score.total === 100 && (
        <Badge className="rounded-full border-transparent bg-success/15 px-2 font-semibold text-success">
          Fully aligned
        </Badge>
      )}
    </section>
  );
}

/** How the score adds up, then a chip per area. */
export function ScoreDetails({ score }: { score: AlignmentScore }) {
  const settled = score.areas.filter((area) => area.settled).length;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-0.5 text-xs leading-normal text-muted-foreground">
        <p>
          {settled} of {score.counted} {score.counted === 1 ? "area" : "areas"} settled ·{" "}
          {score.coverage} of 80
        </p>
        <p>
          {score.reasoned} {score.reasoned === 1 ? "answer explains" : "answers explain"} why ·{" "}
          {score.reasoning} of 20
        </p>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {score.areas.map((area) => (
          <AreaChip key={area.name} area={area} />
        ))}
        {score.notAsked.map((name) => (
          <Chip key={name} tip="Every plan needs an answer here. It holds the score down until the agent asks and you answer." className="border-dashed">
            Not asked yet: {name}
          </Chip>
        ))}
      </ul>
    </div>
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
              "inline-flex items-center gap-1.5 rounded-full border border-border bg-background py-0.75 pr-2.25 pl-1 text-xs text-muted-foreground",
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

/** The share filled from the top, clockwise. Each half is an arc that turns
 * into its own half of the ring, so the fill moves by rotation alone. A dot
 * gives the start its round cap, which the clip would cut. A notch in the
 * ring marks the target. */
function ScoreRing({ value, target }: { value: number; target: number }) {
  const id = useId();
  const turn = (Math.min(Math.max(value, 0), 100) / 100) * 360;
  return (
    <svg viewBox="0 0 58 58" className="size-full" aria-hidden>
      <defs>
        <clipPath id={`${id}-right`}>
          <rect x="29" width="29" height="58" />
        </clipPath>
        <clipPath id={`${id}-left`}>
          <rect width="29" height="58" />
        </clipPath>
      </defs>
      <circle cx="29" cy="29" r="24" fill="none" strokeWidth="5" className="stroke-muted" />
      {turn > 0 && (
        <g fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-foreground">
          <circle cx="29" cy="5" r="2.5" className="fill-foreground stroke-none" />
          <g clipPath={`url(#${id}-right)`}>
            <path d={LEFT_HALF} transform={`rotate(${Math.min(turn, 180)} 29 29)`} />
          </g>
          {turn > 180 && (
            <g clipPath={`url(#${id}-left)`}>
              <path d={RIGHT_HALF} transform={`rotate(${turn - 180} 29 29)`} />
            </g>
          )}
        </g>
      )}
      {target > 0 && (
        <line
          x1="29"
          y1="1.5"
          x2="29"
          y2="8.5"
          strokeWidth="2"
          className="stroke-muted-foreground"
          transform={`rotate(${target * 3.6} 29 29)`}
        />
      )}
    </svg>
  );
}

/** Counts from the last score to this one, for the number and the ring. A
 * reader who asks for less motion sees the new score at once. */
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
      setShown(start + (target - start) * (1 - (1 - done) ** 3));
      if (done < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return shown;
}
