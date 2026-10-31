export const WELCOME_DOC_ID = "__welcome__";

export const WELCOME_MARKDOWN = `# Welcome to OpenPlan

One place to manage the plans you and your coding agents collaborate on — instead of
losing them across sessions, tools, and repos.

## Getting started

- **Drag & drop** Markdown anywhere onto this window — a whole directory appears as a collapsible tree
- Or press \`⌘O\` / \`Ctrl+O\` to browse (\`⇧⌘O\` / \`Ctrl+Shift+O\` for a directory)
- Your library sticks around between sessions

> OpenPlan never copies, moves, or indexes your files. It reads them from wherever they already live.

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

- [x] Install OpenPlan
- [x] Read the welcome page
- [ ] Drop in a plan of your own

Code, with highlighting:

\`\`\`ts
type Plan = { title: string; status: "draft" | "approved" };

function summarize(plan: Plan): string {
  return \`\${plan.title} — \${plan.status}\`;
}
\`\`\`

And diagrams, via \`\`\`mermaid fenced blocks — themed to match the app, in both light and dark:

\`\`\`mermaid
flowchart LR
  A[Agent writes a plan] --> B[Filed into your plan base]
  B --> C[You read and comment]
  C --> D[Agent picks up the feedback]
  D --> B
\`\`\`

## Tips

1. Press \`⌘E\` / \`Ctrl+E\` (or the pencil in the header) to **edit** a document — changes save back to the file automatically, and \`⌘S\` saves on demand
2. Press \`⌘F\` / \`Ctrl+F\` to **find** text in the document — cycle matches with the arrows or \`↵\`/\`⇧↵\`, and toggle **match case** with the "Aa" button. Works in the editor too, with full find & replace
3. Press \`⇧⌘L\` / \`Ctrl+Shift+L\` (or the sun/moon icon) to switch between **light and dark** themes
4. Press \`⌘B\` / \`Ctrl+B\` to hide the sidebar for distraction-free reading — drag its right edge to **resize** it, double-click the edge to reset
5. Type in the **Search** box at the top of the sidebar to filter your library by name — matches inside folders reveal themselves automatically
6. Use the **AA** icon in the header to adjust reading font size, and the width icon to pick **Compact**, **Spaced**, or **Full width** columns
7. Long document? An **outline** sits beside the text in preview — press \`⇧⌘T\` / \`Ctrl+Shift+T\` (or the header icon) to show or hide it. On a narrow window it floats over the page instead, and closes as soon as you pick a heading
8. Remove a file or folder from the sidebar by hovering over it — this never touches anything on disk
9. Folders re-scan automatically when you return to the window, so new files just show up

---

Coming next: a plan base your agents write into directly, with version history,
comments, and one-command setup for Claude Code, Codex, and Cursor.
`;
