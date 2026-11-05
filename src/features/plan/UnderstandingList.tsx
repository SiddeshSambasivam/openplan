import { Check, PencilLine } from "lucide-react";
import { Markdown } from "@/components/Markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { UnderstandingDrafts } from "@/lib/alignmentDrafts";
import { requiredAreas, understandingOf, type UnderstandingState } from "@/lib/alignmentScore";
import { cn } from "@/lib/utils";
import type { Understanding, UnderstandingDraft } from "@/lib/work";
import type { MediaContext } from "./AlignmentMessage";
import { WorkHeading } from "./WorkHeading";

const STATE_LABELS: Record<UnderstandingState, string> = {
  "not stated": "Not stated",
  stated: "Waiting for you",
  confirmed: "Confirmed",
  corrected: "Corrected",
};

/**
 * What the agent understands about each area the plan needs, one row each in
 * the order the areas are named. The person confirms a statement or writes
 * what is wrong with it. Both wait as drafts and go with Send.
 */
export function UnderstandingList({
  understanding,
  drafts,
  planType,
  onDraft,
  view,
}: {
  understanding: Understanding[];
  drafts: UnderstandingDrafts;
  planType: string | null;
  /** None clears the area's draft. */
  onDraft: (area: string, draft: UnderstandingDraft | null) => void;
  view: MediaContext;
}) {
  return (
    <section aria-label="What the agent understands" className="flex flex-col gap-2">
      <WorkHeading title="What the agent understands" />
      <ul className="flex flex-col gap-2">
        {requiredAreas(planType).map((area) => (
          <UnderstandingRow
            key={area}
            area={area}
            understanding={understanding}
            draft={drafts[area]}
            onDraft={(draft) => onDraft(area, draft)}
            view={view}
          />
        ))}
      </ul>
    </section>
  );
}

function UnderstandingRow({
  area,
  understanding,
  draft,
  onDraft,
  view,
}: {
  area: string;
  understanding: Understanding[];
  draft: UnderstandingDraft | undefined;
  onDraft: (draft: UnderstandingDraft | null) => void;
  view: MediaContext;
}) {
  const recorded = understandingOf(area, understanding, {});
  const shown = understandingOf(area, understanding, draft ? { [area]: draft } : {});
  const correcting = draft != null && "correct" in draft;
  const confirming = draft != null && "confirm" in draft;
  return (
    <li
      data-area={area}
      className={cn(
        "max-w-160 rounded-lg border border-border px-3 py-2.5",
        recorded.state === "not stated" ? "border-dashed" : "bg-muted/50",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-foreground">{area.charAt(0).toUpperCase() + area.slice(1)}</span>
        <StateBadge state={shown.state} />
      </div>
      {shown.statement && (
        <Markdown
          content={shown.statement}
          dark={view.dark}
          media={view.media}
          className="alignment-context mt-1.5 max-w-prose"
        />
      )}
      {recorded.state === "corrected" && (
        <p className="mt-1.5 border-l-2 border-border pl-2 text-sm whitespace-pre-wrap text-foreground">
          {recorded.correction}
        </p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">{stateLine(recorded, draft)}</p>
      {recorded.state === "stated" && (
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex gap-1.5">
            <Button
              size="xs"
              variant={confirming ? "default" : "outline"}
              aria-pressed={confirming}
              onClick={() => onDraft(confirming ? null : { confirm: true })}
            >
              <Check />
              Confirm
            </Button>
            <Button
              size="xs"
              variant={correcting ? "default" : "outline"}
              aria-pressed={correcting}
              onClick={() => onDraft(correcting ? null : { correct: "" })}
            >
              <PencilLine />
              Correct
            </Button>
          </div>
          {correcting && (
            <Textarea
              autoFocus
              rows={2}
              value={draft.correct}
              onChange={(event) => onDraft({ correct: event.target.value })}
              aria-label={`What the agent got wrong about ${area}`}
              placeholder="Say what the agent got wrong"
              className="min-h-14 resize-none bg-background text-sm"
            />
          )}
        </div>
      )}
    </li>
  );
}

function StateBadge({ state }: { state: UnderstandingState }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full px-2 font-normal",
        state === "confirmed"
          ? "border-transparent bg-success/15 text-success"
          : "text-muted-foreground",
      )}
    >
      {STATE_LABELS[state]}
    </Badge>
  );
}

/** What happens next on the row, in a few words. */
function stateLine(
  recorded: ReturnType<typeof understandingOf>,
  draft: UnderstandingDraft | undefined,
): string {
  if (recorded.state === "not stated") return "The agent has not stated its understanding yet.";
  if (recorded.state === "confirmed") return recorded.by ? `Confirmed by ${recorded.by}.` : "Confirmed.";
  if (recorded.state === "corrected") {
    return recorded.by ? `Corrected by ${recorded.by}. Waiting for the agent to restate.` : "Waiting for the agent to restate.";
  }
  if (draft && "confirm" in draft) return "Confirmed. Not sent yet.";
  if (draft && "correct" in draft) return "Your correction goes to the agent with Send.";
  return "Confirm it, or correct what is wrong.";
}
