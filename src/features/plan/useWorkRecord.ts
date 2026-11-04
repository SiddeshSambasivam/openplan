import { useEffect, useRef, useState } from "react";
import { isTauri } from "@/lib/platform";
import { newQuestionIds, readWorkRecord, type Question, type WorkRecord } from "@/lib/work";

/**
 * A plan's work record, kept in step with its sidecar. Agents write it
 * through the MCP server, so it is read again on every base change, the way
 * comments are. Nothing polls.
 *
 * `onNewQuestions` runs with the unanswered questions a read finds that the
 * last read of the same plan did not have. The first read after opening a
 * plan only sets what counts as known.
 */
export function useWorkRecord(
  path: string | null,
  onNewQuestions?: (path: string, questions: Question[]) => void,
): WorkRecord | null {
  const [record, setRecord] = useState<WorkRecord | null>(null);
  const onNewQuestionsRef = useRef(onNewQuestions);
  onNewQuestionsRef.current = onNewQuestions;

  useEffect(() => {
    setRecord(null);
    if (!isTauri || !path) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    let known: Question[] | null = null;
    const received = (next: WorkRecord | null) => {
      if (cancelled) return;
      const questions = next?.alignment?.questions ?? [];
      const fresh = new Set(newQuestionIds(known, questions));
      known = questions;
      setRecord(next);
      if (fresh.size > 0) {
        onNewQuestionsRef.current?.(
          path,
          questions.filter((question) => fresh.has(question.id)),
        );
      }
    };
    // A record that cannot be read shows as no record rather than an error
    // over the plan. It leaves the known questions as they were.
    const read = () =>
      void readWorkRecord(path)
        .then(received)
        .catch(() => !cancelled && setRecord(null));
    read();
    void (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const un = await listen("base-changed", read);
      if (cancelled) un();
      else unlisten = un;
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [path]);

  return record;
}
