import { ARTICLE_CLASSES } from "@/components/Markdown";
import type { Status } from "@/lib/planBase";
import type { Decision, WorkRecord } from "@/lib/work";
import { AlignmentAnswers } from "./AlignmentAnswers";
import { ReposAndPrs } from "./ReposAndPrs";
import { TodoChecklist } from "./TodoChecklist";
import { WorkHeading } from "./WorkHeading";

/** The stages where todos are expected, so saying there are none yet tells
 * the reader something. */
const TODO_STAGES: Status[] = ["alignment", "in-progress"];

/**
 * What the agents recorded about the work, above the plan's body: the
 * alignment and the todos first, since those are what a reader checks, then
 * the decisions, then where the work lives. One column at every width.
 *
 * Nothing here carries a source-line stamp, so comments never anchor to it.
 */
export function PlanWork({ record, status }: { record: WorkRecord | null; status: Status }) {
  const showAlignment = record?.alignment != null || status === "alignment";
  const showTodos = (record?.todos.length ?? 0) > 0 || TODO_STAGES.includes(status);
  const decisions = record?.decisions ?? [];
  const repos = record?.repos ?? [];
  const prs = record?.prs ?? [];

  if (!showAlignment && !showTodos && decisions.length + repos.length + prs.length === 0) {
    return null;
  }

  return (
    <div className="mb-10 flex flex-col gap-6 border-b border-border pb-8">
      {showAlignment && <AlignmentAnswers alignment={record?.alignment} status={status} />}
      {showTodos && <TodoChecklist record={record} />}
      {decisions.length > 0 && <RecordedDecisions decisions={decisions} />}
      {repos.length + prs.length > 0 && <ReposAndPrs repos={repos} prs={prs} />}
    </div>
  );
}

/** The record's decisions, as the same cards a body's decisions render as. */
function RecordedDecisions({ decisions }: { decisions: Decision[] }) {
  return (
    <section>
      <WorkHeading title="Decisions" />
      {decisions.map((decision) => (
        <div key={decision.id} className="plan-decision">
          <div className={ARTICLE_CLASSES}>
            {/* One paragraph under the title, the way a body's decision reads. */}
            <p>
              <strong>{`${decision.id}. ${decision.decision}`}</strong>
              {decision.context}
              {decision.options.length > 0 && ` Options: ${decision.options.join(", ")}.`}
              {` Why: ${decision.why}`}
              {decision.revisitWhen && ` Revisit when ${decision.revisitWhen}.`}
            </p>
          </div>
        </div>
      ))}
    </section>
  );
}
