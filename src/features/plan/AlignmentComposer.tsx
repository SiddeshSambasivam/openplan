import { SendHorizontal } from "lucide-react";
import type { KeyboardEvent, Ref } from "react";
import { TooltipButton } from "@/components/TooltipButton";
import { Textarea } from "@/components/ui/textarea";
import { persona, type Question } from "@/lib/work";

/** What the composer says beside Send: the count, or what a send did. */
export interface ComposerLine {
  text: string;
  error?: boolean;
}

/**
 * The message box under the thread. Words typed here are the active
 * question's answer, or the note beside its pick. Enter moves on to the
 * next question waiting. Send takes every drafted answer to the agent at
 * once. With no question to reply to, the box keeps only the count and
 * Send, or a hint while some still wait.
 */
export function AlignmentComposer({
  ref,
  sendRef,
  question,
  text,
  missing,
  line,
  ready,
  busy,
  hint,
  onText,
  onReply,
  onSend,
}: {
  ref: Ref<HTMLTextAreaElement>;
  sendRef: Ref<HTMLButtonElement>;
  /** The question a reply goes to. None once cleared or all have one. */
  question: Question | undefined;
  text: string;
  /** Enter found neither a pick nor words. */
  missing: boolean;
  line: ComposerLine;
  /** Answers drafted to send. */
  ready: number;
  busy: boolean;
  /** Says how to reply when no question is active and some still wait. */
  hint: string | null;
  onText: (text: string) => void;
  onReply: () => void;
  onSend: () => void;
}) {
  const name = question?.role ? persona(question.role).name : "the agent";
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" || event.shiftKey || event.metaKey || event.ctrlKey) return;
    if (event.nativeEvent.isComposing) return;
    event.preventDefault();
    onReply();
  };
  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      <div className="flex items-end gap-2 rounded-lg border border-input bg-background p-1.5 shadow-xs transition-[color,box-shadow] has-[textarea:focus-visible]:border-ring has-[textarea:focus-visible]:ring-[3px] has-[textarea:focus-visible]:ring-ring/50 dark:bg-input/30">
        {question ? (
          <Textarea
            ref={ref}
            value={text}
            rows={1}
            onChange={(event) => onText(event.target.value)}
            onKeyDown={onKeyDown}
            aria-label={`Reply to ${name}`}
            aria-invalid={missing || undefined}
            placeholder={`Reply to ${name}, or say why`}
            className="max-h-28 min-h-8 resize-none border-0 bg-transparent px-1.5 py-1.5 shadow-none focus-visible:ring-0 text-sm dark:bg-transparent"
          />
        ) : (
          <p className="min-w-0 flex-1 px-1.5 pb-2 text-sm text-muted-foreground">{hint}</p>
        )}
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
          ref={sendRef}
          size="sm"
          shortcut="sendReview"
          tooltip={ready === 0 ? "Answer a question first" : `Send ${answerCount(ready)} to the agent`}
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
