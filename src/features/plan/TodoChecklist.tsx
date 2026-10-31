import { Circle, CircleCheck, CircleDot, CircleMinus, type LucideIcon } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { relativeTime } from "@/lib/board";
import { useMountedKeys } from "@/lib/motion";
import { SOURCE_LABELS } from "@/lib/planBase";
import { cn } from "@/lib/utils";
import {
  progress,
  progressText,
  TODO_MARKS,
  type Todo,
  type TodoState,
  type WorkRecord,
} from "@/lib/work";
import { WorkHeading } from "./WorkHeading";

const GLYPHS: Record<TodoState, LucideIcon> = {
  open: Circle,
  doing: CircleDot,
  done: CircleCheck,
  dropped: CircleMinus,
};

/**
 * The plan's todos as agents move them. Nothing here is clickable: the
 * person reads the list, and the agents check items off.
 */
export function TodoChecklist({ record }: { record: WorkRecord | null }) {
  const todos = record?.todos ?? [];
  const counted = record ? progress(record) : { done: 0, total: 0 };
  // A todo that changes state is a new row, so the move fades in while the
  // rows that did not move stay still.
  const keyOf = (todo: Todo) => `${todo.id}:${todo.state}`;
  const mounted = useMountedKeys(todos.map(keyOf));
  const now = new Date();

  return (
    <section>
      <WorkHeading
        title="Todos"
        aside={counted.total > 0 && <span className="tabular-nums">{progressText(counted)}</span>}
      />
      {counted.total > 0 && (
        <Progress
          value={(counted.done / counted.total) * 100}
          aria-label={progressText(counted)}
          className="mt-1 mb-2 h-1"
        />
      )}
      {todos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No todos yet. The agent adds them after alignment.
        </p>
      ) : (
        <ul>
          {todos.map((todo) => (
            <TodoRow
              key={keyOf(todo)}
              todo={todo}
              now={now}
              arrived={!mounted.has(keyOf(todo))}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function TodoRow({ todo, now, arrived }: { todo: Todo; now: Date; arrived: boolean }) {
  const mark = TODO_MARKS[todo.state];
  const Glyph = GLYPHS[todo.state];
  const who = SOURCE_LABELS[todo.by] ?? todo.by;
  const when = relativeTime(todo.at, now);
  const dropped = todo.state === "dropped";
  return (
    <li
      className={cn(
        "flex gap-2.5 py-1.5",
        arrived && "animate-in fade-in-0 duration-200",
      )}
    >
      <span title={mark.label} className="mt-0.5 shrink-0">
        <Glyph aria-hidden className={cn("size-3.5", mark.tone)} />
        <span className="sr-only">{mark.label}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm leading-snug",
            dropped && "text-muted-foreground line-through",
          )}
        >
          {todo.text}
        </p>
        <p className="text-xs text-muted-foreground">
          {dropped && todo.reason && <span>Dropped: {todo.reason} · </span>}
          {who}
          {when && ` · ${when}`}
        </p>
      </div>
    </li>
  );
}
