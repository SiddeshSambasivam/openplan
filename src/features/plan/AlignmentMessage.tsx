import { useState } from "react";
import { Markdown } from "@/components/Markdown";
import { Badge } from "@/components/ui/badge";
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
  onDraft,
  onReply,
  onChange,
  view,
}: {
  question: Question;
  draft: ReplyDraft | undefined;
  /** The reply waiting to be sent, when there is one. */
  answer: Answer | undefined;
  onDraft: (draft: ReplyDraft) => void;
  onReply: () => void;
  onChange: () => void;
  view: MediaContext;
}) {
  const replied = question.answer ?? answer;
  const persona = question.role ? PERSONAS[question.role] : null;
  return (
    <div className="flex flex-col gap-2" data-question={question.id}>
      <div className="flex gap-3">
        <PersonaAvatar role={question.role} className="mt-0.5 text-4xl" />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-foreground">{persona?.name ?? "Agent"}</span>
            {persona && <span className="text-xs text-muted-foreground">{persona.title}</span>}
            <Badge variant="secondary" className="font-normal">
              {question.aspect}
            </Badge>
            {question.mustAnswer && !replied && (
              <Badge variant="outline" className="font-normal">
                Must answer
              </Badge>
            )}
          </div>
          <div className="max-w-2xl rounded-lg rounded-tl-sm border border-border bg-card px-3.5 py-3">
            <p className="text-sm leading-snug font-medium text-pretty text-foreground">
              {question.question}
            </p>
            {!replied && (
              <Composer question={question} draft={draft} onDraft={onDraft} onReply={onReply} view={view} />
            )}
          </div>
        </div>
      </div>
      {replied && (
        <YourReply question={question} answer={replied} onChange={question.answer ? undefined : onChange} />
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
        <p className="mt-1.5 max-w-prose text-sm leading-snug text-muted-foreground">{question.context}</p>
      )}
      {question.illustration && (
        <Markdown
          content={question.illustration}
          dark={view.dark}
          media={view.media}
          className="mt-3 overflow-x-auto rounded-md border border-border bg-background p-3"
        />
      )}
      {hasOptions && (
        <RadioGroup
          value={draft?.option ?? ""}
          onValueChange={(option) => update({ option })}
          aria-label={question.question}
          className="mt-3 gap-1.5"
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
        <Button variant="outline" size="sm" onClick={reply}>
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
    <div className="rounded-md border border-border bg-background transition-colors hover:border-ring has-data-[state=checked]:border-primary">
      <label htmlFor={id} className="flex gap-2.5 p-2.5 text-sm leading-snug">
        <RadioGroupItem id={id} value={option.id} className="mt-0.5" />
        <span className="min-w-0">
          <span className="font-medium text-foreground">
            {option.label}
            {recommended && (
              <Badge className="ml-2 border-transparent bg-success/15 align-middle font-normal text-success">
                Recommended
              </Badge>
            )}
          </span>
          {option.consequence && (
            <span className="mt-0.5 block text-xs text-muted-foreground">{option.consequence}</span>
          )}
          {option.tradeoff && (
            <span className="mt-0.5 block text-xs text-muted-foreground">
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
          className="overflow-x-auto px-2.5 pb-2.5 pl-9"
        />
      )}
    </div>
  );
}

/** The person's own bubble. A reply not sent yet says so and can be
 * changed. */
function YourReply({
  question,
  answer,
  onChange,
}: {
  question: Question;
  answer: Answer;
  onChange?: () => void;
}) {
  const words = answerOf({ ...question, answer });
  return (
    <div className="flex justify-end">
      <div className="max-w-lg rounded-lg rounded-tr-sm bg-primary px-3 py-2 text-sm leading-snug text-primary-foreground">
        <p className={words.kind === "option" ? "font-medium" : "whitespace-pre-wrap"}>{words.text}</p>
        {words.note && <p className="mt-0.5 whitespace-pre-wrap">{words.note}</p>}
        {onChange && (
          <p className="mt-1 text-xs text-primary-foreground/70">
            Not sent yet ·{" "}
            <button type="button" onClick={onChange} className="underline underline-offset-2 hover:text-primary-foreground">
              Change
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
