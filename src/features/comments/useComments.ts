import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/lib/platform";
import { commitBase, sendComments } from "@/lib/planBase";
import { emitTourEvent } from "@/lib/tour";
import {
  isPending,
  markSent,
  newCommentEntry,
  newCommentId,
  reopenThread,
  resolveThread,
  type CommentThread,
  type Identity,
} from "@/lib/comments";

/** What a send did, for the line the top bar shows afterwards. */
export interface SendResult {
  threads: number;
  sessions: number;
}

/**
 * The threads on one document, kept in step with its sidecar. Agents write
 * the same file through the MCP server, so a reload on base changes is what
 * makes their replies appear without anything being clicked.
 *
 * A thread the person starts is written pending: on disk at once so the text
 * cannot be lost, and invisible to agents until the review is sent.
 */
export function useComments(
  path: string | null,
  identity: Identity | null,
  planId: string | null,
) {
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
    async (next: CommentThread[], commit: boolean) => {
      setThreads(next);
      if (!isTauri || !path) return;
      await invoke("save_comment_threads", { path, threads: next, commit });
    },
    [path],
  );

  const addThread = useCallback(
    (quote: string, lineStart: number, lineEnd: number, text: string) => {
      void save(
        [
          ...threads,
          {
            id: newCommentId(),
            quote,
            lineStart,
            lineEnd,
            resolved: false,
            pending: true,
            resolvedBy: null,
            resolvedAt: null,
            sentAt: null,
            comments: [newCommentEntry(text, identity)],
          },
        ],
        false,
      );
      emitTourEvent("comment-added");
    },
    [threads, save, identity],
  );

  /** A reply to a thread already sent goes straight out. A reply to one still
   * pending waits and travels with the rest of the review. */
  const reply = useCallback(
    (threadId: string, text: string) => {
      const target = threads.find((t) => t.id === threadId);
      const next = threads.map((t) =>
        t.id === threadId
          ? { ...t, comments: [...t.comments, newCommentEntry(text, identity)] }
          : t,
      );
      const stillPending = target != null && isPending(target);
      void save(next, !stillPending).then(() => {
        if (!stillPending && path) void sendComments(path, [threadId]);
      });
    },
    [threads, save, identity, path],
  );

  const setResolved = useCallback(
    (threadId: string, resolved: boolean) => {
      const now = new Date().toISOString();
      const next = threads.map((t) =>
        t.id !== threadId ? t : resolved ? resolveThread(t, now) : reopenThread(t),
      );
      if (resolved || !planId) {
        void save(next, true);
        return;
      }
      void save(next, false).then(() => commitBase(`reopen: ${planId}`));
    },
    [threads, save, planId],
  );

  const removeThread = useCallback(
    (threadId: string) => {
      void save(
        threads.filter((t) => t.id !== threadId),
        true,
      );
    },
    [threads, save],
  );

  const pendingCount = threads.filter(isPending).length;

  /** Writes the review, records it, then hands it to whoever is working on
   * the plan. Nothing leaves until the sidecar says it is no longer pending. */
  const sendReview = useCallback(async (): Promise<SendResult> => {
    if (pendingCount === 0 || !path) return { threads: 0, sessions: 0 };
    const ids = threads.filter(isPending).map((t) => t.id);
    await save(markSent(threads, new Date().toISOString()), false);
    emitTourEvent("review-sent");
    const label = ids.length === 1 ? "thread" : "threads";
    await commitBase(`review: ${planId ?? "plan"} (${ids.length} ${label})`);
    return { threads: ids.length, sessions: await sendComments(path, ids) };
  }, [threads, pendingCount, save, path, planId]);

  return {
    threads,
    pendingCount,
    addThread,
    reply,
    setResolved,
    removeThread,
    sendReview,
  };
}
