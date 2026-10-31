import { useState } from "react";
import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { ReplyDraft } from "@/lib/alignmentDrafts";
import { answerOf, PERSONAS, type Answer, type Choice, type Question } from "@/lib/work";
import { PersonaAvatar } from "./PersonaAvatar";

/** How the plan page renders illustrations. */
export interface MediaContext {
  dark: boolean;
  media: boolean;
}

/**
 * One question as a message from the persona who asks it. Until it has an
 * answer the message holds the options and a reply box. Once answered, sent
 * or not, it shrinks to the question and the person's reply sits under it.
 */
export function AlignmentMessage({
  question,
  draft,
  answer,
  sent,
  onDraft,
  onReply,
  onChange,
  view,
}: {
  question: Question;
  draft: ReplyDraft | undefined;
  /** The reply waiting to be sent, when there is one. */
  answer: Answer | undefined;
  /** Its answer went out in the last send. */
  sent: boolean;
  onDraft: (draft: ReplyDraft) => void;
  onReply: () => void;
  onChange: () => void;
  view: MediaContext;
}) {
  const replied = question.answer ?? answer;
  const persona = question.role ? PERSONAS[question.role] : null;
  return (
    <div className="flex flex-col gap-4.5" data-question={question.id}>
      <div className="flex gap-3">
        <span className="w-11 shrink-0">
          <PersonaAvatar role={question.role} className="mt-0.5 text-4xl" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-foreground">{persona?.name ?? "Agent"}</span>
            {persona && <span className="text-xs text-muted-foreground">{persona.title}</span>}
            <span className="rounded-full bg-muted px-1.75 py-px text-xs text-muted-foreground">
              {question.aspect}
            </span>
            {question.mustAnswer && !replied && (
              <span className="rounded-full border border-border px-1.75 text-xs text-muted-foreground">
                Must answer
              </span>
            )}
          </div>
          <div className="max-w-160 rounded-lg rounded-tl-sm border border-border bg-muted/50 px-3.5 py-3">
            <p className="mb-1.5 text-base leading-normal font-medium text-pretty text-foreground">
              {question.question}
            </p>
            {!replied && (
              <Composer question={question} draft={draft} onDraft={onDraft} onReply={onReply} view={view} />
            )}
          </div>
        </div>
      </div>
      {replied && (
        <YourReply
          question={question}
          answer={replied}
          status={sent ? "sent" : question.answer ? null : "draft"}
          onChange={onChange}
        />
      )}
    </div>
  );
}

/** Why it was asked, what it looks like, the options and a reply box. A
 * reply needs a pick or some words. */
function Composer({
  question,
  draft,
  onDraft,
  onReply,
  view,
}: {
  question: Question;
  draft: ReplyDraft | undefined;
  onDraft: (draft: ReplyDraft) => void;
  onReply: () => void;
  view: MediaContext;
}) {
  const [missing, setMissing] = useState(false);
  const text = draft?.text ?? "";
  const update = (next: Partial<ReplyDraft>) => {
    setMissing(false);
    onDraft({ text, option: draft?.option, ...next, replied: false });
  };
  const reply = () => {
    if (!draft?.option && !text.trim()) setMissing(true);
    else onReply();
  };
  const name = question.role ? PERSONAS[question.role].name : "the agent";
  const hasOptions = question.options.length > 0;
  return (
    <>
      {question.context && (
        <p className="mb-2.5 max-w-prose text-sm leading-normal text-muted-foreground">{question.context}</p>
      )}
      {question.illustration && (
        <Markdown
          content={question.illustration}
          dark={view.dark}
          media={view.media}
          className="alignment-illustration mb-3 overflow-x-auto rounded-md border border-border bg-background p-3"
        />
      )}
      {hasOptions && (
        <RadioGroup
          value={draft?.option ?? ""}
          onValueChange={(option) => update({ option })}
          aria-label={question.question}
          className="gap-1.5"
        >
          {question.options.map((option) => (
            <OptionChoice
              key={option.id}
              questionId={question.id}
              option={option}
              recommended={option.id === question.recommended}
              view={view}
            />
          ))}
        </RadioGroup>
      )}
      <div className="mt-2.5 flex items-end gap-2">
        <Textarea
          value={text}
          onChange={(event) => update({ text: event.target.value })}
          rows={1}
          aria-label={hasOptions ? `Reply to ${name}, optional` : `Reply to ${name}`}
          placeholder={hasOptions ? `Reply to ${name}, optional` : `Reply to ${name}`}
          className="min-h-9 resize-y bg-background"
        />
        <Button variant="outline" onClick={reply}>
          Reply
        </Button>
      </div>
      {missing && (
        <p role="alert" className="mt-1.5 text-xs text-destructive">
          {hasOptions ? "Pick an option or write a reply." : "Write a reply first."}
        </p>
      )}
    </>
  );
}

/** An option the person can pick, with what it does and what it costs. The
 * illustration sits outside the label, so its links and frames stay
 * usable. */
function OptionChoice({
  questionId,
  option,
  recommended,
  view,
}: {
  questionId: string;
  option: Choice;
  recommended: boolean;
  view: MediaContext;
}) {
  const id = `option-${questionId}-${option.id}`;
  return (
    <div className="rounded-md border border-border bg-background transition-transform duration-120 hover:border-ring active:scale-99.5 has-data-[state=checked]:border-primary">
      <label htmlFor={id} className="flex cursor-pointer gap-2.5 px-3 py-2.5 text-sm leading-normal">
        <RadioGroupItem id={id} value={option.id} className="mt-0.5 cursor-pointer" />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2 font-medium text-foreground">
            {option.label}
            {recommended && (
              <span className="rounded-full bg-success/15 px-1.75 py-px text-xs font-medium text-success">
                Recommended
              </span>
            )}
          </span>
          {option.consequence && (
            <span className="mt-0.5 block text-xs leading-normal text-muted-foreground">{option.consequence}</span>
          )}
          {option.tradeoff && (
            <span className="mt-0.5 block text-xs leading-normal text-muted-foreground">
              Trade-off: {option.tradeoff}
            </span>
          )}
        </span>
      </label>
      {option.illustration && (
        <Markdown
          content={option.illustration}
          dark={view.dark}
          media={view.media}
          className="overflow-x-auto px-3 pb-2.5 pl-9.5"
        />
      )}
    </div>
  );
}

/** The person's own bubble. A reply not sent yet says so and can be
 * changed. One that just went out says it was sent. */
function YourReply({
  question,
  answer,
  status,
  onChange,
}: {
  question: Question;
  answer: Answer;
  status: "draft" | "sent" | null;
  onChange: () => void;
}) {
  const words = answerOf({ ...question, answer });
  return (
    <div className="flex justify-end">
      <div className="max-w-130 rounded-lg rounded-tr-sm bg-primary px-3.25 py-2.25 text-sm leading-normal text-primary-foreground">
        <p className={words.kind === "option" ? "font-medium" : "whitespace-pre-wrap"}>{words.text}</p>
        {words.note && <p className="whitespace-pre-wrap">{words.note}</p>}
        {status === "sent" && <p className="mt-0.75 text-xs text-primary-foreground/70">Sent</p>}
        {status === "draft" && (
          <p className="mt-0.75 text-xs text-primary-foreground/70">
            Not sent yet ·{" "}
            <button
              type="button"
              onClick={onChange}
              className="cursor-pointer underline hover:text-primary-foreground"
            >
              Change
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
