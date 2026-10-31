export const WELCOME_DOC_ID = "__welcome__";

export const WELCOME_MARKDOWN = `# Welcome to OpenMarkdown

A fast, minimal viewer for Markdown — no vaults, no projects, no setup. Open a file and read.

## Getting started

- **Drag & drop** Markdown files — or **entire folders** — onto this window; folders appear as a collapsible tree
- Click **File** or **Folder** in the sidebar (or press \`⌘O\` / \`Ctrl+O\`, and \`⇧⌘O\` / \`Ctrl+Shift+O\` for folders)
- Your library sticks around between sessions, like recent documents in a word processor

> OpenMarkdown never copies, moves, or indexes your files. It simply reads them from wherever they already live.

## What renders

Everything in GitHub-flavored Markdown, including tables:

| Element | Support |
| --- | :---: |
| Headings, lists, quotes | ✓ |
| Tables & task lists | ✓ |
| Code with syntax highlighting | ✓ |
| Mermaid diagrams | ✓ |
| Images & links | ✓ |
| Footnotes & strikethrough | ✓ |

Task lists:

- [x] Install OpenMarkdown
- [x] Read the welcome page
- [ ] Drop in a Markdown file of your own

Code, with highlighting:

\`\`\`ts
type Doc = { name: string; path: string };

function greet(doc: Doc): string {
  return \`Now reading \${doc.name} — enjoy.\`;
}
\`\`\`

And diagrams, via \`\`\`mermaid fenced blocks — always themed to match the app, in both light and dark:

\`\`\`mermaid
flowchart LR
  A[Write Markdown] --> B{Has a diagram?}
  B -->|Yes| C[Rendered as neutral SVG]
  B -->|No| D[Rendered as text]
  C --> E[Read it]
  D --> E
\`\`\`

## Tips

1. Press \`⌘E\` / \`Ctrl+E\` (or the pencil in the header) to **edit** a document — changes save back to the file automatically, and \`⌘S\` saves on demand
2. Press \`⌘F\` / \`Ctrl+F\` to **find** text in the document — cycle matches with the arrows or \`↵\`/\`⇧↵\`, and toggle **match case** with the "Aa" button. Works in the editor too, with full find & replace
3. **Select any text** to leave a **comment** (or press \`⇧⌘C\` / \`Ctrl+Shift+C\`) — a small composer drops in right below it (scrolling pauses while it's open); submitting leaves just a subtle highlight behind, no panel forced open. Click any highlighted passage to reopen it in a popover right there — reply, edit, delete, or resolve — or open the comments icon in the header for an "All discussions" list of every thread (clicking a highlight while that list is open just scrolls to it there instead). **Copy for AI** turns open threads into a file-path-and-line-numbered review, ready to paste into Claude, Cursor, or Codex
4. Press \`⇧⌘L\` / \`Ctrl+Shift+L\` (or the sun/moon icon) to switch between **light and dark** themes
5. Press \`⌘B\` / \`Ctrl+B\` to hide the sidebar for distraction-free reading — drag its right edge to **resize** it, double-click the edge to reset
6. Type in the **Search** box at the top of the sidebar to filter your library by name — matches inside folders reveal themselves automatically
7. Use the **AA** icon in the header — or pick **Small**, **Normal**, or **Large** — to adjust reading font size
8. Long document? An **outline** appears on the side in preview — press \`⇧⌘T\` / \`Ctrl+Shift+T\` (or the outline icon) to cycle it between always shown, auto-hide, and hidden
9. Use the width icon in the header to pick **Compact**, **Spaced**, or **Full width** reading columns — at full width the outline becomes its own side panel instead of floating over the text
10. Remove a file or folder from the sidebar by hovering over it — this never touches anything on disk
11. Folders re-scan automatically when you return to the window, so new files just show up
12. Hover any button for a moment to see what it does and its shortcut
13. A long file name — in the header or the sidebar — truncates; hover over it to scroll smoothly through the rest

---

Made for people who just want to *read* their Markdown.
`;
