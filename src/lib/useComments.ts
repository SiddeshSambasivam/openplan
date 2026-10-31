import { useCallback, useEffect, useRef, useState } from "react";
import {
  newCommentEntry,
  newCommentId,
  parseCommentsSidecar,
  serializeCommentsSidecar,
  type CommentThread,
} from "./comments";
import {
  deleteCommentsSidecar,
  isTauri,
  readCommentsSidecar,
  writeCommentsSidecar,
} from "./platform";

/**
 * Comment threads for the active document. Backed by a per-file JSON
 * sidecar on disk (path-backed docs, native only); inline docs (Welcome,
 * the browser demo) still get working in-memory comments, they just don't
 * survive a reload — consistent with how those docs don't persist edits
 * to disk either.
 */
export function useComments(docId: string | null, docPath: string | undefined) {
  const [threads, setThreads] = useState<CommentThread[]>([]);
  const pathRef = useRef(docPath);
  pathRef.current = docPath;

  useEffect(() => {
    let cancelled = false;
    setThreads([]); // don't flash the previous doc's threads while loading
    if (!docPath || !isTauri) return;
    void (async () => {
      try {
        const raw = await readCommentsSidecar(docPath);
        if (!cancelled) setThreads(parseCommentsSidecar(raw));
      } catch {
        // best-effort — comments are a nice-to-have, never block the doc
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docId, docPath]);

  const persist = useCallback((next: CommentThread[]) => {
    const path = pathRef.current;
    if (!path || !isTauri) return;
    if (next.length === 0) void deleteCommentsSidecar(path);
    else void writeCommentsSidecar(path, serializeCommentsSidecar(next));
  }, []);

  const addThread = useCallback(
    (quote: string, lineStart: number, lineEnd: number, text: string): string => {
      const thread: CommentThread = {
        id: newCommentId(),
        quote,
        lineStart,
        lineEnd,
        resolved: false,
        comments: [newCommentEntry(text)],
      };
      setThreads((prev) => {
        const next = [...prev, thread];
        persist(next);
        return next;
      });
      return thread.id;
    },
    [persist],
  );

  const addReply = useCallback(
    (threadId: string, text: string) => {
      setThreads((prev) => {
        const next = prev.map((t) =>
          t.id === threadId
            ? { ...t, comments: [...t.comments, newCommentEntry(text)] }
            : t,
        );
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const setResolved = useCallback(
    (threadId: string, resolved: boolean) => {
      setThreads((prev) => {
        const next = prev.map((t) => (t.id === threadId ? { ...t, resolved } : t));
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const updateComment = useCallback(
    (threadId: string, commentId: string, text: string) => {
      setThreads((prev) => {
        const next = prev.map((t) =>
          t.id === threadId
            ? {
                ...t,
                comments: t.comments.map((c) =>
                  c.id === commentId
                    ? { ...c, text, editedAt: new Date().toISOString() }
                    : c,
                ),
              }
            : t,
        );
        persist(next);
        return next;
      });
    },
    [persist],
  );

  // Deleting a comment that's the last one in its thread removes the whole
  // thread (and its highlight) — there's nothing left to anchor once every
  // comment/reply in it is gone, same as Notion collapsing an empty
  // discussion.
  const deleteComment = useCallback(
    (threadId: string, commentId: string) => {
      setThreads((prev) => {
        const next = prev
          .map((t) =>
            t.id === threadId
              ? { ...t, comments: t.comments.filter((c) => c.id !== commentId) }
              : t,
          )
          .filter((t) => t.comments.length > 0);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  return {
    threads,
    addThread,
    addReply,
    setResolved,
    updateComment,
    deleteComment,
  };
}
