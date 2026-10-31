import { FileWarning, Loader2, ScrollText } from "lucide-react";
import { useEffect, useMemo, useState, type RefObject } from "react";
import { HtmlDoc } from "../features/plan/HtmlDoc";
import { AlignmentTab } from "../features/plan/PlanWork";
import { isHtmlPath } from "../lib/htmlDoc";
import { shortcut } from "../lib/shortcuts";
import { ShortcutKeys } from "./ShortcutKeys";
import type { PlanSummary } from "../lib/planBase";
import type { PlanTab } from "../lib/planTab";
import type { WorkRecord } from "../lib/work";
import { PlanPage } from "../features/plan/PlanPage";
import type { DocFile, ViewMode } from "../lib/types";
import { TooltipButton } from "./TooltipButton";
import { Editor, type EditorApi } from "./Editor";
import { Markdown } from "./Markdown";

/**
 * Rendering markdown is O(document) on the main thread, so opening a huge doc
 * in preview would block for seconds. Above LARGE_PREVIEW_CHARS the preview
 * becomes opt-in (and even then renders at most PREVIEW_CHAR_LIMIT). The
 * editor is virtualized and always holds the full text instantly.
 */
const LARGE_PREVIEW_CHARS = 131_072; // 128 KB
const PREVIEW_CHAR_LIMIT = 262_144; // 256 KB

function truncateForPreview(content: string): string {
  let slice = content.slice(0, PREVIEW_CHAR_LIMIT);
  const lastNewline = slice.lastIndexOf("\n");
  if (lastNewline > 0) slice = slice.slice(0, lastNewline);
  // Don't leave a code fence dangling open.
  const fences = (slice.match(/^(```|~~~)/gm) ?? []).length;
  if (fences % 2 === 1) slice += "\n```";
  return slice;
}

function formatSize(chars: number): string {
  return chars >= 1_000_000
    ? `${(chars / 1_000_000).toFixed(1)} MB`
    : `${Math.round(chars / 1024)} KB`;
}

interface ViewerProps {
  doc: DocFile;
  /** The plan this document belongs to, or null for a loose file. */
  plan: PlanSummary | null;
  /** Which tab of the plan shows. Always the plan for a document of a set. */
  tab: PlanTab;
  record: WorkRecord | null;
  content: string | null;
  error: string | null;
  loading: boolean;
  view: ViewMode;
  canEdit: boolean;
  editorRef: RefObject<EditorApi | null>;
  /** Attached to the rendered preview's article wrapper — used for the TOC. */
  articleRef: RefObject<HTMLDivElement | null>;
  /** Re-renders mermaid diagrams with the matching neutral palette. */
  dark: boolean;
  /** Whether videos and `html` fences play, from the media setting. */
  media: boolean;
  onEditorChange: () => void;
  onEnterEdit: () => void;
  onRetry: () => void;
  onRemove: () => void;
}

export function Viewer({
  doc,
  plan,
  tab,
  record,
  content,
  error,
  loading,
  view,
  canEdit,
  editorRef,
  articleRef,
  dark,
  media,
  onEditorChange,
  onEnterEdit,
  onRetry,
  onRemove,
}: ViewerProps) {
  const html = isHtmlPath(doc.path);
  const isLarge = content != null && content.length > LARGE_PREVIEW_CHARS;
  // Rendering a large preview is opt-in, and the choice resets per document.
  const [renderLarge, setRenderLarge] = useState(false);
  useEffect(() => setRenderLarge(false), [doc.id]);

  const truncated = content != null && content.length > PREVIEW_CHAR_LIMIT;
  const previewContent = useMemo(
    () =>
      content == null ? null : truncated ? truncateForPreview(content) : content,
    [content, truncated],
  );

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="flex max-w-sm flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center shadow-sm">
          <div className="flex size-11 items-center justify-center rounded-lg bg-muted">
            <FileWarning className="size-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">Couldn’t open “{doc.name}”</p>
          <p className="max-w-full text-xs break-words text-muted-foreground">
            {error}
          </p>
          <div className="flex gap-2 pt-1">
            <TooltipButton
              size="sm"
              variant="outline"
              onClick={onRetry}
              tooltip="Read the file from disk again"
            >
              Try again
            </TooltipButton>
            <TooltipButton
              size="sm"
              variant="ghost"
              onClick={onRemove}
              tooltip="Remove from the sidebar. The file stays on disk"
            >
              Remove from list
            </TooltipButton>
          </div>
        </div>
      </div>
    );
  }

  if (content == null) {
    return (
      <div className="flex h-full items-center justify-center">
        {loading && (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        )}
      </div>
    );
  }

  if (view === "edit") {
    return (
      <Editor
        key={doc.id}
        ref={editorRef}
        initialDoc={content}
        plainText={html}
        onDocChange={onEditorChange}
      />
    );
  }

  const alignment = plan != null && tab === "alignment";
  if (isLarge && !renderLarge && !html && !alignment) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="flex max-w-sm flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center shadow-sm">
          <div className="flex size-11 items-center justify-center rounded-lg bg-muted">
            <ScrollText className="size-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">Large document</p>
          <p className="text-xs leading-5 text-muted-foreground">
            “{doc.name}” is {formatSize(content.length)}. The editor opens it
            instantly; rendering a preview this big can take a moment.
          </p>
          <div className="flex gap-2 pt-1">
            {canEdit && (
              <TooltipButton
                size="sm"
                onClick={onEnterEdit}
                shortcut="edit"
                tooltip="Fast, even at this size"
              >
                Open editor
              </TooltipButton>
            )}
            <TooltipButton
              size="sm"
              variant="outline"
              onClick={() => setRenderLarge(true)}
              tooltip="May take a few seconds"
            >
              Render preview
            </TooltipButton>
          </div>
        </div>
      </div>
    );
  }

  // The Alignment tab is a chat with a people rail beside it, so it takes
  // a wider column than the reading width, and the rest of the height,
  // since only its thread scrolls. Keyed apart, so the width does not
  // animate when the tab changes.
  return (
    <div
      key={alignment ? "alignment" : "page"}
      ref={articleRef}
      className={
        alignment
          ? "mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-10 pb-4"
          : "mx-auto w-full px-10 py-10 transition-[max-width] duration-200 ease-in-out"
      }
      style={alignment ? undefined : { maxWidth: "var(--content-max-width, 48rem)" }}
    >
      {truncated && !html && !alignment && (
        <div className="mb-8 flex items-center gap-2.5 rounded-lg border border-border bg-muted/50 px-3.5 py-2.5 text-xs text-muted-foreground">
          <ScrollText className="size-4 shrink-0" />
          <span>
            This is a large document. The preview shows the first{" "}
            {Math.round(PREVIEW_CHAR_LIMIT / 1024)} KB. Open the editor{" "}
            <ShortcutKeys keys={shortcut("edit").keys} /> for the full text.
          </span>
        </div>
      )}
      {alignment ? (
        <AlignmentTab
          record={record}
          plan={{ path: plan.path, id: plan.id, dark, media }}
        />
      ) : html ? (
        <HtmlDoc content={content} dark={dark} />
      ) : plan ? (
        // One document of a set is not the plan: it carries its own title and
        // the type's required sections are not asked of it.
        <PlanPage
          body={previewContent ?? ""}
          title={doc.path === plan.path ? plan.title : ""}
          type={doc.path === plan.path ? plan.type : null}
          docPath={doc.path}
          dark={dark}
          media={media}
        />
      ) : (
        <Markdown content={previewContent ?? ""} docPath={doc.path} dark={dark} media={media} />
      )}
    </div>
  );
}
