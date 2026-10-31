import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { search, searchKeymap } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export interface EditorApi {
  getText(): string;
  focus(): void;
}

interface EditorProps {
  /** Content at mount time — remount (via key) to load a different doc. */
  initialDoc: string;
  /** Fires on every buffer change; keep it cheap (no React state per keystroke). */
  onDocChange: () => void;
}

// Single theme driven by the app's CSS variables, so it follows light/dark
// without recreating the editor.
const theme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "calc(var(--content-font-scale, 1) * 13.5px)",
    backgroundColor: "transparent",
    color: "var(--color-foreground)",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.75",
    overflow: "auto",
  },
  ".cm-content": {
    padding: "2.5rem 0 50vh 0", // trailing space so the last line isn't glued to the bottom
    maxWidth: "var(--content-max-width, 48rem)",
    transition: "max-width 200ms ease-in-out",
    margin: "0 auto",
    caretColor: "var(--color-foreground)",
  },
  ".cm-line": { padding: "0 2.5rem" },
  "&.cm-focused": { outline: "none" },
  ".cm-cursor": { borderLeftColor: "var(--color-foreground)" },
  ".cm-placeholder": { color: "var(--color-muted-foreground)" },
  // The built-in find/replace panel (⌘F while the editor has focus) —
  // restyled to match the app instead of CM6's bare default look.
  ".cm-panels": {
    backgroundColor: "var(--color-popover)",
    color: "var(--color-popover-foreground)",
  },
  ".cm-panel.cm-search": {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "0.375rem",
    padding: "0.5rem 0.75rem",
    borderBottom: "1px solid var(--color-border)",
    fontFamily: "var(--font-sans)",
    fontSize: "13px",
  },
  ".cm-search .cm-textfield": {
    height: "1.75rem",
    borderRadius: "0.375rem",
    border: "1px solid var(--color-border)",
    backgroundColor: "var(--color-background)",
    color: "var(--color-foreground)",
    padding: "0 0.5rem",
  },
  ".cm-search .cm-textfield:focus-visible": {
    outline: "2px solid var(--color-ring)",
    outlineOffset: "-1px",
  },
  ".cm-search .cm-button": {
    height: "1.75rem",
    borderRadius: "0.375rem",
    border: "1px solid var(--color-border)",
    backgroundImage: "none",
    backgroundColor: "var(--color-background)",
    color: "var(--color-foreground)",
    textShadow: "none",
    cursor: "default",
  },
  ".cm-search .cm-button:hover": { backgroundColor: "var(--color-accent)" },
  ".cm-search label": {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    color: "var(--color-muted-foreground)",
  },
  ".cm-search input[type=checkbox]": {
    accentColor: "var(--color-primary)",
  },
  ".cm-search .cm-panel.cm-search button[name=close]": {
    color: "var(--color-muted-foreground)",
  },
  ".cm-searchMatch": {
    backgroundColor: "color-mix(in oklch, var(--color-foreground) 20%, transparent)",
  },
  ".cm-searchMatch-selected": {
    backgroundColor: "color-mix(in oklch, var(--syntax-constant) 45%, transparent)",
  },
});

// Calm, shadcn-toned markdown highlighting.
const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: "600" },
  { tag: tags.strong, fontWeight: "600" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, color: "var(--syntax-constant)" },
  { tag: tags.url, color: "var(--syntax-comment)" },
  { tag: tags.monospace, color: "var(--syntax-string)" },
  { tag: tags.quote, color: "var(--color-muted-foreground)" },
  { tag: tags.meta, color: "var(--color-muted-foreground)" },
  { tag: tags.processingInstruction, color: "var(--color-muted-foreground)" },
  { tag: tags.labelName, color: "var(--syntax-variable)" },
  { tag: tags.comment, color: "var(--syntax-comment)" },
]);

export const Editor = forwardRef<EditorApi, EditorProps>(function Editor(
  { initialDoc, onDocChange },
  ref,
) {
  const container = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onDocChangeRef = useRef(onDocChange);
  onDocChangeRef.current = onDocChange;
  const initialDocRef = useRef(initialDoc);

  useEffect(() => {
    const view = new EditorView({
      state: EditorState.create({
        doc: initialDocRef.current,
        extensions: [
          history(),
          search({ top: true }),
          keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap, // binds Mod-f/Mod-g/Shift-Mod-g to open/next/previous
            indentWithTab,
          ]),
          markdown({ base: markdownLanguage }), // GFM tables, task lists, etc.
          syntaxHighlighting(markdownHighlight),
          EditorView.lineWrapping,
          placeholder("Start writing…"),
          theme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onDocChangeRef.current();
          }),
        ],
      }),
      parent: container.current!,
    });
    viewRef.current = view;
    view.focus();
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      getText: () => viewRef.current?.state.doc.toString() ?? "",
      focus: () => viewRef.current?.focus(),
    }),
    [],
  );

  return <div ref={container} className="h-full cursor-auto select-text" />;
});
