import { Bot, Check, ChevronRight, Circle } from "lucide-react";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { Markdown } from "@/components/Markdown";
import { ShortcutLabel } from "@/components/ShortcutKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PLATFORM } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import {
  answerFromDraft,
  answerOf,
  answerQuestions,
  chosenOptions,
  PERSONAS,
  questionsByRound,
  sendAnswers,
  unusedRoles,
  unusedRolesText,
  type Answer,
  type AnswerDraft,
  type Choice,
  type Question,
  type RoundGroup,
  type WorkRecord,
} from "@/lib/work";
import { PersonaAvatar } from "./PersonaAvatar";
import { WorkHeading } from "./WorkHeading";

/** The registry gives mod+enter to Send review, so the form takes the key
 * itself while focus is inside it. */
const SUBMIT_KEYS = "mod+enter";

/** What the plan page needs to write answers and render illustrations. */
export interface AlignmentContext {
  path: string;
  id: string;
  dark: boolean;
  media: boolean;
}

type Notice = { kind: "sent"; reached: number } | { kind: "error"; message: string };

/**
 * The questions agents posted on the plan. The ones waiting for the person
 * come first, to answer here, then the answered ones, read-only. Each group
 * reads newest round first.
 */
export function AlignmentQuestions({
  record,
  plan,
}: {
  record: WorkRecord | null;
  plan: AlignmentContext;
}) {
  const [drafts, setDrafts] = useState<Record<string, AnswerDraft>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  // The record the write returned shows until the watcher reads it back.
  const [written, setWritten] = useState<{ from: WorkRecord | null; record: WorkRecord } | null>(
    null,
  );
  const shown = written && written.from === record ? written.record : record;
  const questions = shown?.alignment?.questions ?? [];

  if (questions.length === 0) {
    return (
      <section>
        <WorkHeading title="Alignment" />
        <p className="text-sm text-muted-foreground">No alignment yet.</p>
      </section>
    );
  }

  const pending = questions.filter((question) => !question.answer);
  const answered = questions.filter((question) => question.answer);
  const manyRounds = new Set(questions.map((question) => question.round ?? 1)).size > 1;
  const answers = pending.flatMap((question) => {
    const answer = answerFromDraft(question, drafts[question.id]);
    return answer ? [{ id: question.id, answer }] : [];
  });
  const unused = unusedRolesText(unusedRoles(questions));

  const submit = async () => {
    if (busy || answers.length === 0) return;
    setBusy(true);
    setNotice(null);
    const result = await submitAnswers(plan, answers);
    if (result.kind === "sent") {
      setWritten({ from: record, record: result.record });
      setDrafts({});
    }
    setNotice(result);
    setBusy(false);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" || !modHeld(event)) return;
    event.preventDefault();
    void submit();
  };

  return (
    <div className="flex flex-col gap-8">
      {pending.length > 0 && (
        <section onKeyDown={onKeyDown}>
          <WorkHeading title="Waiting for your answer" aside={pending.length} />
          <Rounds groups={questionsByRound(pending)} labelled={manyRounds}>
            {(question) => (
              <PendingQuestion
                key={question.id}
                question={question}
                draft={drafts[question.id]}
                onChange={(draft) => setDrafts((old) => ({ ...old, [question.id]: draft }))}
                dark={plan.dark}
                media={plan.media}
              />
            )}
          </Rounds>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" disabled={busy || answers.length === 0} onClick={submit}>
                  {busy ? "Submitting..." : `Submit ${answerCount(answers.length)}`}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={6}>
                <ShortcutLabel label="Send your answers to the agent" keys={SUBMIT_KEYS} />
              </TooltipContent>
            </Tooltip>
            <p className="text-xs text-muted-foreground">
              Questions you leave blank stay open for later.
            </p>
          </div>
          {notice && <NoticeLine notice={notice} className="mt-3" />}
        </section>
      )}
      {notice && pending.length === 0 && <NoticeLine notice={notice} />}
      {answered.length > 0 && (
        <section>
          <WorkHeading title={pending.length > 0 ? "Answered" : "Alignment"} />
          <Rounds groups={questionsByRound(answered)} labelled={manyRounds}>
            {(question) => <AnsweredQuestion key={question.id} question={question} />}
          </Rounds>
        </section>
      )}
      {unused && <p className="text-sm text-muted-foreground">{unused}</p>}
    </div>
  );
}

function Rounds({
  groups,
  labelled,
  children,
}: {
  groups: RoundGroup[];
  /** Names each round, worth it only once there is more than one. */
  labelled: boolean;
  children: (question: Question) => ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group.round} className="flex flex-col gap-3">
          {labelled && (
            <p className="text-xs font-medium text-muted-foreground">Round {group.round}</p>
          )}
          {group.questions.map(children)}
        </div>
      ))}
    </div>
  );
}

/** Who asks, and what about. A question from before roles shows its aspect
 * alone. */
function Asker({ question }: { question: Question }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {question.role && (
        <>
          <PersonaAvatar role={question.role} className="size-6" />
          <span className="text-sm font-medium text-foreground">
            {PERSONAS[question.role].name}
          </span>
        </>
      )}
      <Badge variant="secondary" className="font-normal">
        {question.aspect}
      </Badge>
      {question.mustAnswer && (
        <Badge variant="outline" className="font-normal">
          Must answer
        </Badge>
      )}
    </div>
  );
}

/** One question to answer: pick an option, write an answer, or both. */
function PendingQuestion({
  question,
  draft,
  onChange,
  dark,
  media,
}: {
  question: Question;
  draft: AnswerDraft | undefined;
  onChange: (draft: AnswerDraft) => void;
  dark: boolean;
  media: boolean;
}) {
  const text = draft?.text ?? "";
  const picked = draft?.option ?? "";
  const textId = `answer-${question.id}`;
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <Asker question={question} />
      <div>
        <p className="text-sm leading-snug font-medium text-foreground">{question.question}</p>
        {question.context && (
          <p className="mt-1 text-sm leading-snug text-muted-foreground">{question.context}</p>
        )}
      </div>
      {question.illustration && (
        <Markdown content={question.illustration} dark={dark} media={media} />
      )}
      {question.options.length > 0 && (
        <RadioGroup
          value={picked}
          onValueChange={(option) => onChange({ text, option })}
          aria-label={question.question}
          className="gap-2"
        >
          {question.options.map((option) => (
            <OptionChoice
              key={option.id}
              questionId={question.id}
              option={option}
              recommended={option.id === question.recommended}
              dark={dark}
              media={media}
            />
          ))}
        </RadioGroup>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={textId} className="text-xs text-muted-foreground">
          {question.options.length > 0 ? "Your reasoning, or your own answer" : "Your answer"}
        </label>
        <Textarea
          id={textId}
          value={text}
          onChange={(event) => onChange({ option: draft?.option, text: event.target.value })}
          rows={2}
          className="min-h-14 resize-none bg-background"
        />
      </div>
      {(picked || text) && (
        <Button
          variant="ghost"
          size="xs"
          onClick={() => onChange({ text: "" })}
          className="-ml-2 self-start text-muted-foreground"
        >
          Clear this answer
        </Button>
      )}
    </article>
  );
}

/** An option the person can pick, with what it does and what it costs. The
 * illustration sits outside the label, so its links and frames stay
 * usable. */
function OptionChoice({
  questionId,
  option,
  recommended,
  dark,
  media,
}: {
  questionId: string;
  option: Choice;
  recommended: boolean;
  dark: boolean;
  media: boolean;
}) {
  const id = `option-${questionId}-${option.id}`;
  return (
    <div className="rounded-md border border-border transition-colors has-data-[state=checked]:border-primary has-data-[state=checked]:bg-accent/50">
      <label htmlFor={id} className="flex gap-3 p-3 text-sm leading-snug">
        <RadioGroupItem id={id} value={option.id} className="mt-0.5" />
        <span className="min-w-0">
          <span className="font-medium text-foreground">
            {option.label}
            {recommended && (
              <Badge variant="outline" className="ml-2 align-middle font-normal">
                Recommended
              </Badge>
            )}
          </span>
          {option.consequence && (
            <span className="mt-0.5 block text-muted-foreground">{option.consequence}</span>
          )}
          {option.tradeoff && (
            <span className="mt-0.5 block text-muted-foreground">
              Trade-off: {option.tradeoff}
            </span>
          )}
        </span>
      </label>
      {option.illustration && (
        <Markdown
          content={option.illustration}
          dark={dark}
          media={media}
          className="px-3 pb-3 pl-10"
        />
      )}
    </div>
  );
}

/** Under the Submit button while questions remain, at the top once none
 * do. */
function NoticeLine({ notice, className }: { notice: Notice; className?: string }) {
  if (notice.kind === "error") {
    return (
      <p role="alert" className={cn("text-sm text-destructive", className)}>
        Your answers were not saved. {notice.message}
      </p>
    );
  }
  return (
    <p
      role="status"
      className={cn("flex items-center gap-1.5 text-sm text-muted-foreground", className)}
    >
      <Check className="size-3.5 shrink-0" />
      {notice.reached > 0
        ? "The agent has your answers."
        : "The agent will see your answers on its next message."}
    </p>
  );
}

/** The question, why it was asked, and the answer. The options that were
 * not chosen stay folded so a long alignment still reads at a glance. */
function AnsweredQuestion({ question }: { question: Question }) {
  const [showOthers, setShowOthers] = useState(false);
  const answer = answerOf(question);
  const chosen = chosenOptions(question);
  const others = question.options.filter((option) => !chosen.includes(option));
  return (
    <div className="flex flex-col gap-1.5 py-1">
      <Asker question={question} />
      <p className="text-sm leading-snug font-medium text-foreground">{question.question}</p>
      {question.context && (
        <p className="text-sm leading-snug text-muted-foreground">{question.context}</p>
      )}
      <div className="space-y-1.5">
        {answer.kind === "agent" && (
          <Badge variant="secondary" className="font-normal">
            <Bot />
            {answer.text}
          </Badge>
        )}
        {answer.kind === "text" && <AnswerLine chosen label={answer.text} />}
        {chosen.map((option) => (
          <OptionRow key={option.id} option={option} chosen question={question} />
        ))}
      </div>
      {others.length > 0 && (
        <>
          <Button
            variant="ghost"
            size="xs"
            aria-expanded={showOthers}
            onClick={() => setShowOthers((shown) => !shown)}
            className="-ml-2 self-start text-muted-foreground"
          >
            <ChevronRight className={cn("transition-transform", showOthers && "rotate-90")} />
            {showOthers ? "Hide the other options" : "Show the other options"}
          </Button>
          {showOthers && (
            <div className="animate-in space-y-1.5 fade-in-0 duration-200">
              {others.map((option) => (
                <OptionRow key={option.id} option={option} chosen={false} question={question} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** One option with what picking it does and what it costs. */
function OptionRow({
  option,
  chosen,
  question,
}: {
  option: Choice;
  chosen: boolean;
  question: Question;
}) {
  return (
    <AnswerLine
      chosen={chosen}
      label={option.label}
      recommended={option.id === question.recommended}
    >
      {option.consequence && <p>{option.consequence}</p>}
      {option.tradeoff && <p>Trade-off: {option.tradeoff}</p>}
    </AnswerLine>
  );
}

function AnswerLine({
  chosen,
  label,
  recommended = false,
  children,
}: {
  chosen: boolean;
  label: string;
  recommended?: boolean;
  children?: ReactNode;
}) {
  const Mark = chosen ? Check : Circle;
  return (
    <div className="flex gap-2 text-sm leading-snug">
      <Mark
        aria-label={chosen ? "Chosen" : undefined}
        className={cn(
          "mt-0.5 size-3.5 shrink-0",
          chosen ? "text-foreground" : "text-muted-foreground",
        )}
      />
      <div className="min-w-0">
        <p className={cn("text-foreground", chosen && "font-medium")}>
          {label}
          {recommended && (
            <Badge variant="outline" className="ml-2 align-middle font-normal">
              Recommended
            </Badge>
          )}
        </p>
        <div className="text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

function answerCount(count: number): string {
  if (count === 0) return "answers";
  return `${count} ${count === 1 ? "answer" : "answers"}`;
}

function modHeld(event: KeyboardEvent): boolean {
  return PLATFORM === "mac" ? event.metaKey : event.ctrlKey;
}

/** Writes the answers, then tells the agent. A failed write comes back in
 * the person's words. A failed tell only means no session heard it now:
 * the agent reads the record on its next message. */
async function submitAnswers(
  plan: AlignmentContext,
  answers: { id: string; answer: Answer }[],
): Promise<{ kind: "sent"; reached: number; record: WorkRecord } | Extract<Notice, { kind: "error" }>> {
  let record: WorkRecord;
  try {
    record = await answerQuestions(plan.path, answers);
  } catch (error) {
    return { kind: "error", message: errorText(error) };
  }
  const reached = await sendAnswers(plan.id).catch(() => 0);
  return { kind: "sent", reached, record };
}

function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.trim() || "Try again.";
}
