# OpenMarkdown

A fast, minimal, cross-platform Markdown **viewer** for Windows, macOS, and Linux.

Think of it like a word processor, but for reading Markdown: no vaults, no projects, no
indexing. Drag a `.md` file onto the window — it appears in the left sidebar and renders
instantly. Your list of documents sticks around between launches, like recent files in
Word or LibreOffice, while the files themselves stay exactly where they are on disk.

## Features

- **Drag & drop** Markdown files — *or entire folders* — into the window; folders appear
  as a collapsible nested tree (markdown files only, hidden folders skipped)
- **Search the library** — filter files and folders by name as you type; matches inside
  folders auto-reveal regardless of their collapsed state, `Esc` clears
- **Resizable sidebar** — drag the edge to resize (capped at 40% of the window width so it
  can't swallow the reading pane), double-click the edge to reset
- **Preview by default** — GitHub-flavored Markdown with tables, task lists, footnotes,
  strikethrough, syntax-highlighted code blocks, and images (including relative paths)
- **Mermaid diagrams** — fenced ` ```mermaid ` blocks render as SVG (flowcharts, sequence,
  class, state, ER, and more), themed neutral-grayscale to match the app and re-rendered
  automatically when you switch light/dark
- **Editing built in** — `⌘E`/`Ctrl+E` opens a fast CodeMirror source editor with markdown
  highlighting; changes autosave back to the file (atomic writes), `⌘S` saves on demand.
  Typing stays instant even in multi-megabyte files, and huge documents open straight
  into the editor rather than blocking on a preview render
- **Find in document** — `⌘F`/`Ctrl+F` searches the preview with a match-case toggle,
  match count, and next/previous navigation; the same shortcut opens the editor's own
  find & replace panel while editing
- **Comments, Notion-style** — select any text in preview (or press `⇧⌘C`/`Ctrl+Shift+C`)
  to leave a comment, no vault or account needed; a composer drops in directly below your
  selection, and the document can't scroll out from under it while it's open. Once
  submitted, a subtle blue highlight on the text is the only trace left behind — click it
  to reopen that thread in a popover right there, with per-comment edit and delete, an
  "(edited)" marker, and a persistent reply box. Resolving a thread removes its highlight
  and dims it in the list; deleting a thread's last comment removes the highlight
  entirely. Open the comments icon in the header for an "All discussions" list of every
  thread in document order — clicking a highlight while that list is open just scrolls to
  it there instead of opening a popover, the two are mutually exclusive. Threads live in
  a hidden JSON file next to the doc (`.name.md.omd-comments.json`, atomic writes, never
  touches the doc itself) and travel with it if you move or share the file. Below 900px
  window width the list floats over the content instead of claiming layout space.
  **Copy for AI** turns open threads into an LLM-ready Markdown review — file path,
  quoted text, line numbers, and the full comment/reply thread for each — paste it
  straight into Claude, Cursor, or Codex
- **Light & dark themes** — follows your system on first launch, `⇧⌘L`/`Ctrl+Shift+L` to toggle
- **Adjustable font size** — Small, Normal, or Large, picked from the header; scales both
  the preview prose and the editor together
- **Outline** — an "on this page" nav for long documents in preview, click a section to jump.
  Cycle it always-shown, auto-hide (hover to reveal), or hidden with `⇧⌘T`/`Ctrl+Shift+T`
  (or the header icon), and flip it to the other side any time. At full reading width it
  becomes a real side panel instead of floating over the text, so it never overlaps a line
- **Adjustable reading width** — Compact, Spaced, or Full width, picked from the header;
  applies instantly to both preview and the editor, even mid-edit on a huge file
- **No vault, no lock-in** — files are read in place, never copied, moved, or indexed;
  folders re-scan automatically when the window regains focus
- **Word count**, `⌘O`/`Ctrl+O` to open a file, `⇧⌘O`/`Ctrl+Shift+O` to open a folder,
  `⌘B`/`Ctrl+B` to toggle the sidebar, click the open file to re-read it from disk
- Tooltips on every button — hover to see what it does and its shortcut; a long file name
  (in the header or the sidebar) truncates and scrolls smoothly into view on hover
- Clean, [shadcn/ui](https://ui.shadcn.com)-inspired interface

## Tech

[Tauri 2](https://tauri.app) (Rust) + React + TypeScript + Tailwind CSS v4 +
[react-markdown](https://github.com/remarkjs/react-markdown) +
[CodeMirror 6](https://codemirror.net) + [Mermaid](https://mermaid.js.org). Ships as a
small native binary with the system webview — no bundled Chromium.

## Development

Prerequisites: [Node.js](https://nodejs.org) 20+, [Rust](https://rustup.rs) (stable), and
on Linux the [Tauri system dependencies](https://tauri.app/start/prerequisites/#linux)
(`libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libappindicator3-dev`, `librsvg2-dev`,
`patchelf`).

```sh
pnpm install
pnpm tauri dev         # run the desktop app with hot reload
pnpm dev               # UI only, in a browser (uses an in-memory file fallback)
```

## Building installers

```sh
pnpm tauri build
```

Produces platform bundles under `src-tauri/target/release/bundle/`:
`.dmg`/`.app` on macOS, `.msi`/`.exe` on Windows, `.deb`/`.rpm`/`.AppImage` on Linux.

CI builds for all three platforms are set up in
[.github/workflows/build.yml](.github/workflows/build.yml) — pushing a `v*` tag creates a
draft GitHub release with installers attached.

## App icon

`src-tauri/icons/` is generated from [source.svg](src-tauri/icons/source.svg):

```sh
npx tauri icon src-tauri/icons/source.svg
```
