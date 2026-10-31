import { Bot, Check, ChevronRight, Circle } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  answerOf,
  chosenOptions,
  questionsByAspect,
  type Alignment,
  type Choice,
  type Question,
} from "@/lib/work";
import { WorkHeading } from "./WorkHeading";

/** The questions the agent asked before starting, and what was chosen.
 * Read-only: the answers were given in the agent's session. */
export function AlignmentAnswers({ alignment }: { alignment: Alignment | undefined }) {
  if (!alignment) {
    return (
      <section>
        <WorkHeading title="Alignment" />
        <p className="text-sm text-muted-foreground">No alignment yet.</p>
      </section>
    );
  }

  return (
    <section>
      <WorkHeading title="Alignment" />
      <div className="space-y-3">
        {questionsByAspect(alignment.questions).map((group) => (
          <div key={group.aspect}>
            <Badge variant="secondary" className="font-normal">
              {group.aspect}
            </Badge>
            <ul>
              {group.questions.map((question) => (
                <QuestionRow key={question.id} question={question} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/** The question, why it was asked, and the answer. The options that were
 * not chosen stay folded so a long alignment still reads at a glance. */
function QuestionRow({ question }: { question: Question }) {
  const [showOthers, setShowOthers] = useState(false);
  const answer = answerOf(question);
  const chosen = chosenOptions(question);
  const others = question.options.filter((option) => !chosen.includes(option));
  return (
    <li className="py-2">
      <p className="text-sm leading-snug font-medium text-foreground">
        {question.question}
        {question.mustAnswer && (
          <Badge variant="outline" className="ml-2 align-middle font-normal">
            Must answer
          </Badge>
        )}
      </p>
      {question.context && (
        <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{question.context}</p>
      )}
      <div className="mt-1.5 space-y-1.5">
        {answer.kind === "agent" && (
          <Badge variant="secondary" className="font-normal">
            <Bot />
            {answer.text}
          </Badge>
        )}
        {answer.kind === "text" && <AnswerLine chosen label={answer.text} />}
        {answer.kind === "none" && (
          <p className="text-sm text-muted-foreground">{answer.text}</p>
        )}
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
            className="mt-1 -ml-2 text-muted-foreground"
          >
            <ChevronRight className={cn("transition-transform", showOthers && "rotate-90")} />
            {showOthers ? "Hide the other options" : "Show the other options"}
          </Button>
          {showOthers && (
            <div className="mt-1 animate-in space-y-1.5 fade-in-0 duration-200">
              {others.map((option) => (
                <OptionRow key={option.id} option={option} chosen={false} question={question} />
              ))}
            </div>
          )}
        </>
      )}
    </li>
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
