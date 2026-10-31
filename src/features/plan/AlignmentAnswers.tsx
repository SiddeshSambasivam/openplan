import { Bot } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  answerOf,
  questionsByAspect,
  type Alignment,
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

function QuestionRow({ question }: { question: Question }) {
  const answer = answerOf(question);
  return (
    <li className="py-1.5">
      <p className="text-sm leading-snug text-muted-foreground">
        {question.question}
        {question.mustAnswer && (
          <Badge variant="outline" className="ml-2 align-middle font-normal">
            Must answer
          </Badge>
        )}
      </p>
      {answer.kind === "agent" ? (
        <Badge variant="secondary" className="mt-1 font-normal">
          <Bot />
          {answer.text}
        </Badge>
      ) : (
        <p
          className={cn(
            "text-sm leading-snug",
            answer.kind === "none" ? "text-muted-foreground" : "font-medium text-foreground",
          )}
        >
          {answer.text}
        </p>
      )}
    </li>
  );
}
