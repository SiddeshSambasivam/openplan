import { CornerUpLeft, SendHorizontal, X } from "lucide-react";
import type { KeyboardEvent, Ref } from "react";
import { TooltipButton } from "@/components/TooltipButton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PERSONAS, type Question } from "@/lib/work";

/** What the composer says beside Send: the count, or what a send did. */
export interface ComposerLine {
  text: string;
  error?: boolean;
}

/**
 * The message box under the thread. Enter queues a reply to the active
 * question, with its picked option when it has one. Send takes every queued
 * reply to the agent at once.
 */
export function AlignmentComposer({
  ref,
  question,
  text,
  missing,
  line,
  ready,
  busy,
  onText,
  onClear,
  onReply,
  onSend,
}: {
  ref: Ref<HTMLTextAreaElement>;
  /** The question a reply goes to. None once cleared or all have one. */
  question: Question | undefined;
  text: string;
  /** Enter found neither a pick nor words. */
  missing: boolean;
  line: ComposerLine;
  /** Replies queued to send. */
  ready: number;
  busy: boolean;
  onText: (text: string) => void;
  onClear: () => void;
  onReply: () => void;
  onSend: () => void;
}) {
  const name = question?.role ? PERSONAS[question.role].name : "the agent";
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" || event.shiftKey || event.metaKey || event.ctrlKey) return;
    if (event.nativeEvent.isComposing) return;
    event.preventDefault();
    onReply();
  };
  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      <div className="flex flex-col gap-1 rounded-lg border border-input bg-background p-1.5 shadow-xs transition-[color,box-shadow] has-[textarea:focus-visible]:border-ring has-[textarea:focus-visible]:ring-[3px] has-[textarea:focus-visible]:ring-ring/50 dark:bg-input/30">
        <p className="flex min-h-6 items-center gap-1.5 pl-1.5 text-xs text-muted-foreground">
          {question ? (
            <>
              <CornerUpLeft className="size-3.5 shrink-0" />
              <span className="min-w-0 truncate">
                Replying to <span className="font-medium text-foreground">{name}</span> ·{" "}
                {question.question}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Stop replying"
                onClick={onClear}
                className="ml-auto text-muted-foreground"
              >
                <X />
              </Button>
            </>
          ) : (
            "Pick a question in the thread to reply to it."
          )}
        </p>
        <div className="flex items-end gap-2">
          <Textarea
            ref={ref}
            value={text}
            disabled={!question}
            rows={1}
            onChange={(event) => onText(event.target.value)}
            onKeyDown={onKeyDown}
            aria-label={`Reply to ${name}`}
            aria-invalid={missing || undefined}
            placeholder={question ? `Reply to ${name}` : undefined}
            className="max-h-28 min-h-8 resize-none border-0 bg-transparent px-1.5 py-1.5 shadow-none focus-visible:ring-0 text-sm dark:bg-transparent"
          />
          <span
            role={line.error ? "alert" : "status"}
            className={
              line.error
                ? "max-w-60 pb-2 text-xs text-destructive"
                : "shrink-0 pb-2 text-xs text-muted-foreground tabular-nums"
            }
          >
            {line.text}
          </span>
          <TooltipButton
            size="sm"
            shortcut="sendReview"
            tooltip={ready === 0 ? "Queue a reply first" : `Send ${answerCount(ready)} to the agent`}
            tooltipSide="top"
            tooltipAlign="end"
            disabled={busy || ready === 0}
            onClick={onSend}
            className="tabular-nums"
          >
            {busy ? "Sending..." : ready === 0 ? "Send" : `Send ${ready}`}
            <SendHorizontal />
          </TooltipButton>
        </div>
      </div>
      {missing && (
        <p role="alert" className="pl-2 text-xs text-destructive">
          {question?.options.length ? "Pick an option or write a reply." : "Write a reply first."}
        </p>
      )}
    </div>
  );
}

function answerCount(count: number): string {
  return `${count} ${count === 1 ? "answer" : "answers"}`;
}
