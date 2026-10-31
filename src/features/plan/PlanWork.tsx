import { ARTICLE_CLASSES } from "@/components/Markdown";
import { cn } from "@/lib/utils";
import { showsWorkPanel, type Decision, type WorkRecord } from "@/lib/work";
import { AlignmentAnswers } from "./AlignmentAnswers";
import { ReposAndPrs } from "./ReposAndPrs";
import { TodoChecklist } from "./TodoChecklist";
import { WorkHeading } from "./WorkHeading";

/** The column the panel takes, its `w-72`, so the layout can tell when it
 * fits. */
export const WORK_PANEL_PX = 288;

/**
 * What the agents recorded about the work, beside the plan: the todos
 * first, since they are what a reader checks, then where the work lives.
 * Nothing at all until one of them is recorded.
 *
 * Nothing here carries a source-line stamp, so comments never anchor to it.
 */
export function WorkPanel({
  record,
  overlay,
  open,
  onClose,
}: {
  record: WorkRecord | null;
  /** True when the main area has no room for a column, so the panel floats
   * over the content until dismissed, as the outline does. */
  overlay: boolean;
  open: boolean;
  onClose: () => void;
}) {
  if (!record || !showsWorkPanel(record)) return null;

  const blocks = (
    <>
      {record.todos.length > 0 && <TodoChecklist record={record} />}
      {record.repos.length + record.prs.length > 0 && (
        <ReposAndPrs repos={record.repos} prs={record.prs} />
      )}
    </>
  );

  if (!overlay) {
    // The card is as tall as what it holds, and scrolls once that is taller
    // than the window.
    return (
      <aside aria-label="Work" className="flex w-72 shrink-0 flex-col py-3 pr-3">
        <div className="flex min-h-0 animate-in flex-col gap-6 overflow-y-auto rounded-lg border border-border bg-card p-4 fade-in-0 duration-200">
          {blocks}
        </div>
      </aside>
    );
  }

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          aria-hidden
          className="absolute inset-0 z-20 animate-in bg-background/70 fade-in duration-200"
        />
      )}
      <aside
        aria-label="Work"
        aria-hidden={!open}
        inert={!open}
        className={cn(
          "absolute inset-y-0 right-0 z-30 rounded-l-lg border-l border-border bg-background shadow-lg transition-transform duration-200 ease-in-out",
          open ? "translate-x-0" : "pointer-events-none translate-x-full",
        )}
      >
        <div className="flex h-full w-72 flex-col gap-6 overflow-y-auto p-5">{blocks}</div>
      </aside>
    </>
  );
}

/** The plan's Alignment tab: the questions the agent asked and what was
 * chosen, then the decisions the agent recorded. */
export function AlignmentTab({ record }: { record: WorkRecord | null }) {
  const decisions = record?.decisions ?? [];
  return (
    <div className="flex flex-col gap-8">
      <AlignmentAnswers alignment={record?.alignment} />
      {decisions.length > 0 && <RecordedDecisions decisions={decisions} />}
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
