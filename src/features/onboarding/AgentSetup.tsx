import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import { AgentMark } from "@/components/AgentIcons";
import { Button } from "@/components/ui/button";
import type { SetupRow, SetupStatus } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

const STATUS_TEXT: Record<Exclude<SetupStatus, "failed">, string> = {
  waiting: "Waiting",
  running: "Setting up",
  ready: "Ready",
};

/**
 * One row per tool being set up: a dot while it waits, a spinner while it
 * runs, then a tick with the steps it took. A row that fails says so in
 * plain words with Retry, keeps the error underneath, and the other rows
 * carry on.
 */
export function AgentSetup({
  rows,
  agentName,
  onRetry,
}: {
  rows: SetupRow[];
  agentName: (id: string) => string;
  onRetry: (tool: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-2 short:gap-1.5">
      {rows.map((row) => (
        <li key={row.tool} className="rounded-lg border bg-card/80 p-3.5 short:px-3 short:py-2">
          <div className="flex items-center gap-2.5 text-sm font-medium">
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted">
              <AgentMark id={row.tool} className="size-4 text-foreground" />
            </span>
            {row.status === "failed" ? `Couldn't set up ${agentName(row.tool)}.` : agentName(row.tool)}
            {row.status === "failed" ? (
              <span className="ml-auto flex items-center gap-2">
                <CircleAlert className="size-3.5 text-destructive" />
                <Button variant="outline" size="xs" onClick={() => onRetry(row.tool)}>
                  Retry
                </Button>
              </span>
            ) : (
              <span
                className={cn(
                  "ml-auto flex items-center gap-2 text-xs font-normal text-muted-foreground",
                  row.status === "ready" && "text-success",
                )}
              >
                <StatusMark status={row.status} />
                {STATUS_TEXT[row.status]}
              </span>
            )}
          </div>
          {row.error && (
            <p className="mt-1.5 ml-9.5 line-clamp-2 text-xs text-muted-foreground" title={row.error}>
              {row.error}
            </p>
          )}
          {row.steps.length > 0 && (
            <ul className="mt-2 ml-9.5 flex flex-col gap-1 text-xs short:mt-1 short:gap-0">
              {row.steps.map((step, index) => (
                <li
                  key={step.label}
                  className="flex animate-in items-center gap-2 fade-in duration-300 fill-mode-backwards"
                  style={{ animationDelay: `${index * 80}ms` }}
                >
                  {step.done ? (
                    <Check className="size-3.5 shrink-0 text-success" strokeWidth={3} />
                  ) : (
                    <Dot />
                  )}
                  <span className="truncate" title={`${step.label}: ${step.detail}`}>
                    {step.label}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function StatusMark({ status }: { status: Exclude<SetupStatus, "failed"> }) {
  if (status === "waiting") return <Dot />;
  if (status === "running") return <LoaderCircle className="size-3.5 animate-spin" />;
  return <Check className="size-3.5 animate-in zoom-in-50 fade-in duration-300" strokeWidth={3} />;
}

function Dot() {
  return (
    <span className="grid size-3.5 shrink-0 place-items-center">
      <span className="size-1.5 rounded-full bg-border" />
    </span>
  );
}
