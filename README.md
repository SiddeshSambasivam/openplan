# OpenPlan

One place to manage the plans you and your coding agents collaborate on.

Plans for large changes get scattered — across agent sessions, across tools (Claude
Code, Codex, Cursor), across repos. OpenPlan gives them a home: a local, versioned
**plan base** that agents file into and you review, on a plain-Markdown contract any
tool can adopt.

- **Agent-first** — agents write plans to a shared standard through one MCP server;
  you read, comment, and approve
- **Interoperable** — the plan base is plain Markdown in a git repo, hidden at
  `~/.openplan`. No database, no lock-in, no accounts
- **Simple** — no vault to tend and no organizing to do; the agents keep it tidy

## Status

0.2.0, in active development. The plan base, version history, onboarding, the MCP
server and its installers, the status board, rendered plan pages, and comments as a
review are all built. Plans hold one status: Draft, In progress, In review, or
Completed. Agents set the first three with `set_status`; Completed is yours. While
the app window is open it listens on `127.0.0.1` so a running agent session can
register the plan it is working on and pick up your comments without copy and paste.
Sync and remotes are the next phase.

**[PLAN.md](PLAN.md) is the source of truth** for requirements, architecture,
decisions, and the phased backlog. Agents working in this repo should start there
(see [CLAUDE.md](CLAUDE.md)).

## Tech

[Tauri 2](https://tauri.app) (Rust) + React + TypeScript + [shadcn/ui](https://ui.shadcn.com)
+ [react-markdown](https://github.com/remarkjs/react-markdown) +
[CodeMirror 6](https://codemirror.net) + [Mermaid](https://mermaid.js.org). Ships as a
small native binary using the system webview — no bundled Chromium.

## Development

Prerequisites: [Node.js](https://nodejs.org) 20+, [pnpm](https://pnpm.io),
[Rust](https://rustup.rs) (stable), and on Linux the
[Tauri system dependencies](https://tauri.app/start/prerequisites/#linux).

```sh
pnpm install
pnpm tauri dev         # run the desktop app with hot reload
pnpm dev               # UI only, in a browser (uses an in-memory file fallback)
pnpm test              # TypeScript tests
cargo test             # Rust tests (from src-tauri/)
```

## Building installers

```sh
pnpm tauri build
```

Produces platform bundles under `src-tauri/target/release/bundle/`:
`.dmg`/`.app` on macOS, `.msi`/`.exe` on Windows, `.deb`/`.rpm`/`.AppImage` on Linux.

CI builds all three platforms; pushing a `v*` tag creates a draft GitHub release with
installers attached.

## App icon

`src-tauri/icons/` is generated from its `source.svg`:

```sh
pnpm tauri icon src-tauri/icons/source.svg
```
