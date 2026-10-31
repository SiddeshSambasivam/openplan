import { Markdown } from "@/components/Markdown";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { ReplyDraft } from "@/lib/alignmentDrafts";
import { cn } from "@/lib/utils";
import { answerOf, PERSONAS, type Answer, type Choice, type Question } from "@/lib/work";
import { PersonaAvatar } from "./PersonaAvatar";

/** How the plan page renders illustrations. */
export interface MediaContext {
  dark: boolean;
  media: boolean;
}

/**
 * One question as a message from the persona who asks it. Until its answer
 * is sent the message holds the options, with the pick marked, and
 * clicking it makes it the one the composer replies to. Words written for
 * it sit under it as the person's draft. Once sent, it shrinks to the
 * question and the person's reply sits under it.
 */
export function AlignmentMessage({
  question,
  draft,
  answer,
  active,
  sent,
  onActivate,
  onPick,
  onChange,
  view,
}: {
  question: Question;
  draft: ReplyDraft | undefined;
  /** The answer drafted and not sent yet, when there is one. */
  answer: Answer | undefined;
  /** The composer replies to it. */
  active: boolean;
  /** Its answer went out in the last send. */
  sent: boolean;
  onActivate: () => void;
  onPick: (option: string) => void;
  onChange: () => void;
  view: MediaContext;
}) {
  const recorded = question.answer;
  const words = recorded ? "" : (draft?.text.trim() ?? "");
  const persona = question.role ? PERSONAS[question.role] : null;
  return (
    <div className="flex flex-col gap-3" data-question={question.id}>
      <div className="flex gap-2.5">
        <span className="w-8 shrink-0">
          <PersonaAvatar role={question.role} className="mt-0.5 text-3xl" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs">
            <span className="font-semibold text-foreground">{persona?.name ?? "Agent"}</span>
            {persona && <span className="text-muted-foreground">{persona.title}</span>}
            <span className="rounded-full bg-muted px-1.75 py-px text-muted-foreground">
              {question.aspect}
            </span>
            {question.mustAnswer && !recorded && !answer && (
              <span className="rounded-full border border-border px-1.75 text-muted-foreground">
                Must answer
              </span>
            )}
          </div>
          <div
            data-active={active || undefined}
            onClick={recorded ? undefined : onActivate}
            onFocus={recorded ? undefined : onActivate}
            tabIndex={!recorded && question.options.length === 0 ? 0 : undefined}
            className={cn(
              "max-w-160 rounded-lg rounded-tl-sm border border-border bg-muted/50 px-3 py-2.5 outline-none data-active:border-ring",
              !recorded && "cursor-pointer",
            )}
          >
            <p className="text-sm leading-normal font-medium text-pretty text-foreground">
              {question.question}
            </p>
            {!recorded && <Details question={question} draft={draft} onPick={onPick} view={view} />}
          </div>
        </div>
      </div>
      {recorded && <YourReply question={question} answer={recorded} status={sent ? "sent" : null} />}
      {words && (
        <YourReply
          question={question}
          answer={{ kind: "text", text: words }}
          status="draft"
          onChange={onChange}
        />
      )}
    </div>
  );
}

/** Why it was asked, what it looks like, and the options. */
function Details({
  question,
  draft,
  onPick,
  view,
}: {
  question: Question;
  draft: ReplyDraft | undefined;
  onPick: (option: string) => void;
  view: MediaContext;
}) {
  return (
    <>
      {question.context && (
        <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted-foreground">{question.context}</p>
      )}
      {question.illustration && (
        <Markdown
          content={question.illustration}
          dark={view.dark}
          media={view.media}
          className="alignment-illustration mt-2.5 overflow-x-auto rounded-md border border-border bg-background p-2.5"
        />
      )}
      {question.options.length > 0 && (
        <RadioGroup
          value={draft?.option ?? ""}
          onValueChange={onPick}
          aria-label={question.question}
          className="mt-2.5 gap-1.5"
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
      <label htmlFor={id} className="flex cursor-pointer gap-2.5 px-2.5 py-2 text-sm leading-normal">
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
          className="alignment-illustration overflow-x-auto px-2.5 pb-2 pl-9"
        />
      )}
    </div>
  );
}

/** The person's own bubble. Words not sent yet say so and can be changed.
 * A reply that just went out says it was sent. */
function YourReply({
  question,
  answer,
  status,
  onChange,
}: {
  question: Question;
  answer: Answer;
  status: "draft" | "sent" | null;
  onChange?: () => void;
}) {
  const words = answerOf({ ...question, answer });
  return (
    <div className="flex justify-end">
      <div className="max-w-130 rounded-lg rounded-tr-sm bg-primary px-3 py-2 text-sm leading-normal text-primary-foreground">
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
