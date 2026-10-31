import { ChevronLeft, ListTodo, PanelRightClose } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ARTICLE_CLASSES } from "@/components/Markdown";
import { TooltipButton } from "@/components/TooltipButton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { progress, showsWorkPanel, type Decision, type WorkRecord } from "@/lib/work";
import { AlignmentQuestions, type AlignmentContext } from "./AlignmentQuestions";
import { ReposAndPrs } from "./ReposAndPrs";
import { TodoChecklist, TodoDetail } from "./TodoChecklist";
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
  minimized,
  onClose,
  onToggleMinimized,
}: {
  record: WorkRecord | null;
  /** True when the main area has no room for a column, so the panel floats
   * over the content until dismissed, as the outline does. */
  overlay: boolean;
  open: boolean;
  /** The column folds into one floating button over the content's corner,
   * taking no width. A floating panel closes instead. */
  minimized: boolean;
  onClose: () => void;
  onToggleMinimized: () => void;
}) {
  if (!record || !showsWorkPanel(record)) return null;

  if (!overlay && minimized) {
    const { done, total } = progress(record);
    const label =
      total > 0 ? `Show the work panel. ${done} of ${total} todos done` : "Show the work panel";
    return (
      <aside aria-label="Work" className="absolute top-3 right-3 z-20">
        <TooltipButton
          variant="outline"
          size="icon"
          shortcut="workPanel"
          tooltip={label}
          tooltipSide="left"
          aria-label={label}
          onClick={onToggleMinimized}
          className="animate-in bg-card text-muted-foreground shadow-sm fade-in-0 duration-200"
        >
          <ListTodo />
        </TooltipButton>
      </aside>
    );
  }

  const body = (
    <PanelBody record={record} onMinimize={overlay ? onClose : onToggleMinimized} />
  );

  if (!overlay) {
    // The card is as tall as what it holds, and scrolls once that is taller
    // than the window.
    return (
      <aside aria-label="Work" className="flex w-72 shrink-0 flex-col py-3 pr-3">
        <div className="flex min-h-0 animate-in flex-col overflow-hidden rounded-lg border border-border bg-card fade-in-0 duration-200">
          {body}
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
        <div className="flex h-full w-72 flex-col overflow-hidden rounded-l-lg">{body}</div>
      </aside>
    </>
  );
}

/**
 * The header, then the list and one todo's detail side by side, so opening
 * a todo slides the panel over to it. The detail keeps the last todo while
 * the panel slides back, so it does not empty mid-slide.
 */
function PanelBody({ record, onMinimize }: { record: WorkRecord; onMinimize: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [shownId, setShownId] = useState<string | null>(null);
  const shown = record.todos.find((todo) => todo.id === shownId);
  const inDetail = openId != null && shown != null;
  const backRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus follows the slide, so the keyboard lands on what came into view.
  useEffect(() => {
    if (inDetail) backRef.current?.focus({ preventScroll: true });
    else if (shownId) {
      listRef.current
        ?.querySelector<HTMLElement>(`[data-todo="${CSS.escape(shownId)}"]`)
        ?.focus({ preventScroll: true });
    }
  }, [inDetail, shownId]);

  return (
    <>
      <header className="flex h-11 shrink-0 items-center gap-2 px-2">
        {inDetail ? (
          <Button
            ref={backRef}
            variant="ghost"
            size="xs"
            onClick={() => setOpenId(null)}
            className="font-normal text-muted-foreground"
          >
            <ChevronLeft />
            Todos
          </Button>
        ) : (
          <h2 className="px-2 text-sm font-medium">Work</h2>
        )}
        <TooltipButton
          variant="ghost"
          size="icon-xs"
          shortcut="workPanel"
          tooltip="Minimize"
          tooltipAlign="end"
          onClick={onMinimize}
          aria-label="Minimize the work panel"
          className="ml-auto text-muted-foreground"
        >
          <PanelRightClose />
        </TooltipButton>
      </header>
      <div className="flex min-h-0 overflow-hidden">
        <div
          className={cn(
            "flex w-full transition-transform duration-200 ease-in-out",
            inDetail && "-translate-x-full",
          )}
        >
          <div
            ref={listRef}
            inert={inDetail}
            className="flex w-full shrink-0 flex-col gap-6 overflow-y-auto px-4 pb-4"
          >
            {record.todos.length > 0 && (
              <TodoChecklist
                record={record}
                onOpen={(todo) => {
                  setShownId(todo.id);
                  setOpenId(todo.id);
                }}
              />
            )}
            {record.repos.length + record.prs.length > 0 && (
              <ReposAndPrs repos={record.repos} prs={record.prs} />
            )}
          </div>
          <div inert={!inDetail} className="w-full shrink-0 overflow-y-auto px-4 pb-4">
            {shown && <TodoDetail todo={shown} />}
          </div>
        </div>
      </div>
    </>
  );
}

/** The plan's Alignment tab: the questions the agents asked, to answer or
 * as answered, then the decisions the agents recorded. Keyed by the plan, so
 * a draft answer never carries over to another plan. */
export function AlignmentTab({ record, plan }: { record: WorkRecord | null; plan: AlignmentContext }) {
  const decisions = record?.decisions ?? [];
  return (
    <AlignmentQuestions key={plan.path} record={record} plan={plan}>
      {decisions.length > 0 && <RecordedDecisions decisions={decisions} />}
    </AlignmentQuestions>
  );
}

/** The record's decisions, as the same cards a body's decisions render as. */
function RecordedDecisions({ decisions }: { decisions: Decision[] }) {
  return (
    <section className="mt-4">
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
