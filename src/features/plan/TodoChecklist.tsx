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
  todoTitle,
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
 * The plan's todos as agents move them, one line each. A row opens the
 * todo's detail. Nothing here changes a todo: the agents check items off.
 */
export function TodoChecklist({
  record,
  onOpen,
}: {
  record: WorkRecord | null;
  onOpen: (todo: Todo) => void;
}) {
  const todos = record?.todos ?? [];
  const counted = record ? progress(record) : { done: 0, total: 0 };
  // A todo that changes state is a new row, so the move fades in while the
  // rows that did not move stay still.
  const keyOf = (todo: Todo) => `${todo.id}:${todo.state}`;
  const mounted = useMountedKeys(todos.map(keyOf));

  return (
    <section data-tour="todos">
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
        <ul className="-mx-2">
          {todos.map((todo) => (
            <TodoRow
              key={keyOf(todo)}
              todo={todo}
              arrived={!mounted.has(keyOf(todo))}
              onOpen={() => onOpen(todo)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/** One todo in full: its title, its detail, where it stands and who moved
 * it last. */
export function TodoDetail({ todo }: { todo: Todo }) {
  const { title, detail } = todoTitle(todo);
  const who = SOURCE_LABELS[todo.by] ?? todo.by;
  const when = relativeTime(todo.at, new Date());
  const mark = TODO_MARKS[todo.state];
  const Glyph = GLYPHS[todo.state];
  return (
    <article className="flex flex-col gap-3">
      <h3 className="text-sm leading-snug font-medium">{title}</h3>
      {detail && (
        <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
          {detail}
        </p>
      )}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Glyph aria-hidden className={cn("size-3.5", mark.tone)} />
        <span>
          <span className="text-foreground">{mark.label}</span> · {who}
          {when && ` · ${when}`}
        </span>
      </p>
      {todo.state === "dropped" && todo.reason && (
        <p className="text-xs text-muted-foreground">Dropped: {todo.reason}</p>
      )}
    </article>
  );
}

function TodoRow({
  todo,
  arrived,
  onOpen,
}: {
  todo: Todo;
  arrived: boolean;
  onOpen: () => void;
}) {
  const { title } = todoTitle(todo);
  return (
    <li className={cn(arrived && "animate-in fade-in-0 duration-200")}>
      <button
        type="button"
        title={title}
        data-todo={todo.id}
        onClick={onOpen}
        className="flex w-full items-center gap-2.5 rounded-md px-2 py-1 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
      >
        <StateGlyph state={todo.state} />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm",
            todo.state === "dropped" && "text-muted-foreground line-through",
          )}
        >
          {title}
        </span>
      </button>
    </li>
  );
}

function StateGlyph({ state }: { state: TodoState }) {
  const mark = TODO_MARKS[state];
  const Glyph = GLYPHS[state];
  return (
    <span title={mark.label} className="shrink-0">
      <Glyph aria-hidden className={cn("size-3.5", mark.tone)} />
      <span className="sr-only">{mark.label}</span>
    </span>
  );
}
