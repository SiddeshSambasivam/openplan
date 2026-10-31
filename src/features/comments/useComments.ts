import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/lib/platform";
import {
  newCommentEntry,
  newCommentId,
  type CommentThread,
  type Identity,
} from "@/lib/comments";

/**
 * The threads on one document, kept in step with its sidecar. Agents write
 * the same file through the MCP server, so a reload on base changes is what
 * makes their replies appear without anything being clicked.
 */
export function useComments(path: string | null, identity: Identity | null) {
  const [threads, setThreads] = useState<CommentThread[]>([]);

  const reload = useCallback(() => {
    if (!isTauri || !path) {
      setThreads([]);
      return;
    }
    void invoke<CommentThread[]>("comment_threads", { path }).then(setThreads);
  }, [path]);

  useEffect(reload, [reload]);

  useEffect(() => {
    if (!isTauri || !path) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const un = await listen("base-changed", () => reload());
      if (cancelled) un();
      else unlisten = un;
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [path, reload]);

  const save = useCallback(
    (next: CommentThread[]) => {
      setThreads(next);
      if (!isTauri || !path) return;
      void invoke("save_comment_threads", { path, threads: next });
    },
    [path],
  );

  const addThread = useCallback(
    (quote: string, lineStart: number, lineEnd: number, text: string) => {
      save([
        ...threads,
        {
          id: newCommentId(),
          quote,
          lineStart,
          lineEnd,
          resolved: false,
          comments: [newCommentEntry(text, identity)],
        },
      ]);
    },
    [threads, save, identity],
  );

  const reply = useCallback(
    (threadId: string, text: string) => {
      save(
        threads.map((t) =>
          t.id === threadId
            ? { ...t, comments: [...t.comments, newCommentEntry(text, identity)] }
            : t,
        ),
      );
    },
    [threads, save, identity],
  );

  const setResolved = useCallback(
    (threadId: string, resolved: boolean) => {
      save(threads.map((t) => (t.id === threadId ? { ...t, resolved } : t)));
    },
    [threads, save],
  );

  const removeThread = useCallback(
    (threadId: string) => {
      save(threads.filter((t) => t.id !== threadId));
    },
    [threads, save],
  );

  return { threads, addThread, reply, setResolved, removeThread };
}
