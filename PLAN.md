# OpenPlan — Master Plan

> **This document drives the project.** It is the source of truth for every session and
> agent working on OpenPlan. Read it fully before making changes. When a decision here
> conflicts with an ad-hoc idea, this document wins; if a decision must change, update
> this document in the same PR and note it in the Decision Log (§9).

---

## 0. North star — what OpenPlan is (and is not)

**OpenPlan is simple, interoperable, and agent-first.** Every feature and decision is
tested against those three words. The point of the product is that you should **not**
have to manage the operational side of plans — filing them, formatting them, keeping
them current, **keeping them tidy**, chasing feedback — the agents and the app do
that; you read, comment, and decide.

**OpenPlan is an opinionated take** on managing plans and on how agents should work
on plans. We don't offer ten ways to do things; we encode one good way (the contract,
the standards, the lifecycle) and make it effortless.

**The convention is the product; the UI is a convenience.** OpenPlan's ambition is to
be the **interoperable convention for plans** — the file contract, lifecycle, and MCP
interface that any tool can adopt. The app is one (good) client of that convention,
never its gatekeeper. When a design choice trades contract quality against app
convenience, the contract wins.

**Why this matters — spatial awareness.** We used to have a sense of spatial
awareness over the code we wrote: you knew where things were and what was changing.
With more agents and spec-driven development, that sense is eroding at the code
level. OpenPlan rebuilds it **one level up**: your plans become the map of what is
changing in your codebase, who's changing it, and where it stands — the same
awareness, at the altitude where humans now operate.

**Not transient — integrated.** OpenPlan ties into workflows you already trust:
the base is a real git repo you can push to GitHub/GitLab, and its files are plain
markdown any tool (Drive included) can carry. If OpenPlan disappeared tomorrow, your
plans, history, and attribution all still work.

**OpenPlan is not Obsidian** (or Notion, or a second brain). The contrast is the
clearest way to state the product:

| | Obsidian | OpenPlan |
|---|---|---|
| What it manages | Your knowledge, forever, in a vault you tend | Your **plans** — living work artifacts with a lifecycle (draft → done) |
| Who writes | You | **Agents first**, you second |
| Operational burden | Yours: organize, link, tag, maintain | **Nobody's**: agents file plans to a standard; status and history are automatic |
| Extensibility model | Plugin ecosystem inside the app | **Interoperability outside it**: plain markdown + a documented contract + MCP; any tool can participate without OpenPlan running |
| Surface area | Huge, endlessly configurable | **Deliberately small**: view, comment, approve, track — and no more |

Discriminators for future decisions:

- If a feature asks the user to *organize or maintain* anything → wrong direction.
- If a feature only works when data lives inside our app → wrong direction.
- If a feature serves human authorship over agent authorship → probably out of scope.
- If removing a feature would go unnoticed by someone reviewing agent plans → remove it.

---

## 1. Vision

**Problem.** Plans for large changes are scattered across agent sessions, apps
(Claude Code, Codex), and repos. There is no one place to see, review, and steer them.

**Solution.** OpenPlan is the central place to manage all your plans: a local-first
markdown app where you and your agents — from any tool — collaborate on plans. Agents
file and update plans through a common interface; you read, comment, approve, and track
them in one UI.

**Product pillars**

1. **Plan base** — one canonical, user-chosen directory of plain markdown. No lock-in.
2. **Agent integration** — one CLI/MCP server that both Claude Code and Codex (and any
   MCP client) use to file plans, read feedback, and follow your standards.
3. **Feedback loop** — Notion-style comments on plans with resolve/reply/versioning,
   readable and answerable by agents.
4. **Onboarding auto-discovery** — first run finds your existing plans in
   `~/.claude` / `~/.codex` and imports them.

**Non-goals (v1):** accounts, server backend, telemetry, real-time multi-user sync,
Google Drive API integration (a synced folder covers cloud in v1), mobile.

---

## 2. Principles

### Codebase principles

- **Less code = better.** Prefer deleting/reusing over adding. No new dependency
  without a written justification in the PR. No speculative abstractions.
- **Descriptive code.** Names explain intent; comments state only constraints the code
  cannot express (match the existing comment style in `src/` — see `App.tsx`).
- **Tests first.** Write the failing test before the implementation, for every
  behavior in `src/lib/`, Rust crates, and Tauri commands. UI components get tests for
  logic-bearing behavior (not pixel snapshots).
- **Simple and easy to read.** Small components, flat control flow, one concept per
  file. If a file needs a tour guide, split it.
- **No stale-prone docstrings.** Never put information in code comments/docstrings
  that can silently go stale — file paths, counts, external URLs, feature lists,
  "see also" pointers. Comments state local constraints only; durable project facts
  live in this file.

### App principles

- **Works at every screen size.** Min window 720×480 → full screen. Panels overlay
  instead of squeeze below the 900px breakpoint (existing `NARROW_VIEWPORT_BREAKPOINT`
  pattern — keep using it).
- **No UI bugs; every interaction 60fps.** Animate only `transform`/`opacity`; never
  animate layout properties. No jank on multi-MB documents (the editor is already
  tuned for this — don't regress it). Debounce disk/watch events, never the pointer.
- **Copy is plain and friendly.** No em dashes in user-facing text. Short
  sentences, plain words, say what happens ("Importing makes a copy. Your
  files stay where they are.") rather than describing the mechanism. Code
  comments and plan documents are not copy; this rule is for the interface.
- **Lightweight on the system.** A really old machine must run OpenPlan without
  issues. Concretely: ~0% CPU when idle (event-driven watching, never polling; no
  background indexing), modest memory (system webview, no bundled Chromium — keep it
  that way), instant wake from idle, and no work done for plans that aren't open.
  Any feature that needs a persistent background process or periodic scan is
  mis-designed — find the event-driven shape instead.
- **Local-first, files-first.** Everything on disk in a documented plain format.
  The app must remain useful if the user never installs the agent integration.

### Design system

- **One design system: [shadcn/ui](https://ui.shadcn.com).** Components vendored via
  its CLI into `src/components/ui/`; all colors, spacing, radii, and typography come
  from shadcn's theme tokens. **Never maintain a second, parallel design language**:
  no hand-rolled component styling, no bespoke CSS beyond what a vendored component
  ships with, no raw color/size values in class strings — if a primitive is missing,
  vendor it from shadcn (or compose from vendored ones), don't invent it. Tailwind
  remains only as shadcn's underlying utility engine, used through the tokens.
  Existing ad-hoc primitives (Button, Tooltip, menus, custom CSS in `index.css`)
  are migrated to shadcn as files are touched — no big-bang rewrite, but new code
  never adds to the old system.
- **[beautifului.dev](https://www.beautifului.dev/)** patterns for AI-facing surfaces:
  - Discovery scan: shimmer loading + elapsed time + expandable trace of scan steps.
  - Import review: approval cards per found plan.
  - Plan history: diff-table treatment for revisions.
  - Agent activity: tool-chip/status-row treatment for "plan filed by Claude Code".

### Process

- TDD loop: red → green → refactor, per task in §8.
- Every task in §8 is sized for one focused session; check it off in this file when done.
- Conventional, atomic commits; one logical change per commit.
- **Manual QA gates are hard stops.** Each phase in §8 ends in a **GATE** item:
  Sid runs manual QA and explicitly approves before ANY work on the next phase
  starts. This rule is deliberately self-binding — it holds **even if a later
  instruction says to skip ahead**; in that case, remind Sid of this gate and get an
  explicit "gate waived for phase N" acknowledgment recorded in the Decision Log
  before proceeding. Sessions must never silently start a gated phase.

---

## 3. Requirements

### Functional

| ID | Requirement |
|---|---|
| FR-1 | **Plan base**: single directory at **`~/.openplan`** (hidden; created automatically with `0700` permissions and `git init` on first launch — no picker, no questions). All markdown under it is a plan. Relocatable later from settings (settings rewrites the stored path; files moved by the user, app re-points). |
| FR-2 | **Plan contract**: plans are markdown or HTML (§6.1) with optional flat frontmatter (`id, title, status, type, source, project, pr, created, updated`). Missing frontmatter degrades gracefully (derived title, `status: draft`). `status` is stored and is the one field anyone sets; the derived lifecycle and free tags are gone (0.2.0). |
| FR-3 | **Library UI**: sidebar lists the base tree plus any extra files/folders the user added (drag-drop and pickers — already built). Plans show a status badge; group/sort by status, project, or updated; existing name-filter search extends to status/project. |
| FR-4 | **View/edit**: GFM preview with Mermaid, TOC, find (built). Frontmatter never renders as body text — it renders as a metadata header (status chip, source, dates). `⌘E` editing with autosave (built). Status editable from the header, writes frontmatter. |
| FR-5 | **Comments (v2 — rebuilt)**: threads anchored to plan text with reply/edit/delete/resolve and `author` per comment (`user` or agent name), rendered distinctly. ⚠️ The existing comments/highlight implementation is **buggy and will NOT be reused** — the interactive layer (selection → anchor → highlight → popovers) is rebuilt test-first on a sturdier anchoring model (§6.2b). The sidecar **data format** (§6.2) and the agent-export **output format** survive as specs. "Copy for AI" export re-implemented against them. |
| FR-6 | **Versioning & attribution**: every write to the base auto-commits **with the writer as git author** (`user`, `claude-code`, `codex`, `cursor`) — history always answers *who changed what, when*. Per-plan history view: revision list with authors, diff between any revision and current, and **[Restore this version]** (creates a new commit — history is never rewritten). |
| FR-7 | **Live updates**: external changes to the base (agent writes) appear in the UI within 1s, without focus change. New-plan toast: "New plan from claude-code". |
| FR-8 | **`openplan` CLI + MCP server**: one binary; MCP tools `create_plan, update_plan, read_plan, list_plans, set_status, get_comments, reply_comment, resolve_comment, get_standards`; CLI verbs mirror them. Reads the same base config the app writes. |
| FR-9 | **Agent installers**: `openplan install claude-code` (MCP registration + plugin with skill and optional ExitPlanMode hook), `openplan install codex` (`config.toml` MCP entry + AGENTS.md snippet), and `openplan install cursor` (`~/.cursor/mcp.json` entry + rules snippet). App onboarding has Connect buttons that run these and verify. |
| FR-10 | **Standards**: the house style ships **with the app**, not in the plan base — a base is plans and their history, and a copy per base would drift. Settings expose additions that layer on top, so a new build's improvements still reach someone who wrote their own rules. Served to agents via `get_standards` and summarized into the `create_plan` tool description. |
| FR-11 | **Auto-discovery import**: onboarding (re-runnable from settings) scans `~/.claude/plans/*.md` (loose markdown — verified) and best-effort `~/.codex/sessions/**/rollout-*.jsonl` (`update_plan` payloads). Shows candidates with preview; selected ones are copied into the base with synthesized frontmatter; imported hashes remembered to prevent duplicates. |
| FR-12 | **Sync & remotes**: connect the base to a GitHub/GitLab remote from settings (URL + push/pull; git2 already bundled) — this is the primary "save to my existing workflow" path. Drive/iCloud users can instead relocate the base into a synced folder (FR-1 relocation). No cloud-provider APIs. |
| FR-13 | **Agent curation**: agents keep the base tidy so it stays easy for the human to review and follow — consistent naming per STANDARDS, stale `done` plans archived, near-duplicates flagged/merged. Driven by the integration skill + explicit MCP tools (`archive_plan`, `rename_plan`); never a background process (NFR-8). Every curation action is a normal attributed commit (FR-6), so the human can always see and roll back what the janitor did. |
| FR-14 | **Settings page**: a single settings surface (Claude Code-style) for user preferences — light/dark theme, font type + font size, layout/width (compact/spaced/full) — plus the power-user items already assigned there (base location/relocation, remotes, re-run discovery). Header keeps only quick toggles; settings is canonical. Preferences persist across launches. |
| FR-16 | **Status board** (0.2.0): plans move through Draft, In progress, In review, Completed. A board view groups by status; a list view groups or sorts by status, project, or updated; "For you" lists what waits on the person (In review, or an agent's reply is the last message in an open thread they started). Completed folds away. |
| FR-17 | **Loopback server** (0.2.0): while the app is open it listens on 127.0.0.1 only. The stdio MCP server connects when it is up: it registers the session and the plan it works on (that is what "2 sessions" means and what moves a plan to In progress), and receives comments as they are sent. With the app closed everything still works against files. Not a daemon: it lives and dies with the window. |
| FR-18 | **Projects** (0.2.0): a project is the git remote (owner/repo) of the directory an agent filed or updated the plan from, recorded by the agent. Nothing to set up. The app groups by it, filters the board and list to it, shows the owner's GitHub avatar (fetched once, cached on disk), and a one-line description the first agent that files into it writes. |
| FR-19 | **Authoring modes** (0.2.0): a setting, markdown or HTML, that `get_standards` and the `create_plan` description follow automatically. Markdown is token-efficient; HTML gives rich, reviewable pages. Both are plans under the same contract, comments included. |
| FR-15 | **Search, global and local**: local find-in-document (exists — keep) plus **global search across all plans in the base** (title + content, results grouped by plan, jump-to-match). On-demand scan in Rust when invoked — **no persistent index, no background indexing** (NFR-8); the base is small enough that a cold scan is instant. |

### Non-functional

| ID | Requirement |
|---|---|
| NFR-1 | Cold start < 2s; plan open < 100ms (typical size); library of 500+ plans stays smooth. |
| NFR-2 | 60fps interactions and animations throughout (see App principles). |
| NFR-3 | Data safety: atomic writes only (existing temp+rename pattern); user text (edits, comments) is never lost — worst case it's in git history. Last-write-wins on conflict, history as the safety net. |
| NFR-4 | Portability: no database; the base is fully usable by other tools; contract documented in this file. |
| NFR-5 | Offline, local-only, zero telemetry, zero accounts. |
| NFR-6 | Cross-platform: macOS, Windows, Linux (existing CI matrix). Watch out: paths (existing code handles `\\`), and git availability (§5.3 — we bundle libgit2, no system git needed). |
| NFR-7 | All `src/lib/` modules, Rust crates, and Tauri commands have tests written before implementation. |
| NFR-8 | **Resource budget**: usable on old hardware. ~0% CPU idle; watcher is OS-event-driven (no polling); no background indexing or periodic scans; memory stays modest (system webview; large docs only cost while open); battery-invisible when idle. |
| NFR-9 | **Security**: base dir created `0700`; MCP server is stdio-only (no listening ports); zero network traffic except explicit user-initiated remote push/pull (FR-12); every change attributed via git author (FR-6); history is append-only from the UI (restore commits, never rewrites). |

---

## 4. User flows

### 4.1 First-run onboarding (designed with Sid, 2026-08-16 — P3.0; built)

Three stages, every one skippable. Detection runs during the hello, so each
screen is answered before it is reached. A dev-only "Replay onboarding" button in
Settings resets the flag for testing; imported plans stay, and re-importing skips
what is already filed.

1. **Hello** — the wordmark rises in (staggered entrances), asks what to call
   them, and shows the agent tools found on this machine (Claude Code / Codex /
   Cursor) as Detected / Not found, pre-selected when installed.
2. **Import** — what discovery found: each agent's loose plans, and folders that
   look like plans (by name and markdown content, 400ms scan budget). Importing
   **copies** — the originals stay put — and the copy states it plainly. Result
   line: "9 plans filed (94 documents) · 1 already there".
3. **Connect** — for each selected tool: register the `openplan` MCP server and
   add the conventions block to its instruction file (managed block, its own
   text untouched). Per-step results shown; then into the app.

### 4.2 Reading & tracking

Open app → sidebar groups plans (default: by status, `in-review` pinned first) →
click plan → preview with metadata header (status chip, source badge, project,
updated) → TOC / find / width / font-size as today.

### 4.3 Review & feedback

Select text → floating [Comment] → thread created (author `user`) → header shows
open-comment count. Setting status to `in-review` from the header is the "requesting
changes" signal. [Copy for AI] copies the agent-ready review (existing formatter) for
pasting into any session; agents with the MCP integration instead call
`get_comments` themselves.

### 4.4 Agent files a plan (external, app open or closed)

Agent finishes planning → calls `create_plan` (MCP) → CLI validates against
STANDARDS, writes `plans/<id>.md` with frontmatter, commits → app watcher fires →
sidebar updates, toast "New plan from claude-code" → click opens it.

### 4.5 Agent responds to feedback

Agent calls `get_comments` (gets open threads with quotes + line ranges) → edits the
plan via `update_plan` and/or replies via `reply_comment` (author = agent name) →
commits → UI live-updates: new revision in history, agent replies badged in threads →
you resolve threads → set status `approved`.

### 4.6 Editing & history

`⌘E` edit → autosave (existing) → auto-commit on flush. Header [History] opens a
panel listing revisions (time, author-ish message); selecting one shows a read-only
diff vs current. No restore button in v1 (git users can; the UI stays read-only).

### 4.7 Adding existing material

Drag-drop files/folders (existing flow). If dropped items are outside the base:
prompt "Copy into your plan base?" [Copy in] (becomes a tracked plan) / [Just view]
(current behavior: linked in place, no plan features beyond viewing/comments).

### 4.8 Standards

Settings → Standards shows what ships with OpenPlan and a field for your own
additions. Saved additions are what agents get on their next
`get_standards`/`create_plan` call, layered under the built-in ones.

---

## 5. Architecture

### 5.1 High level

```
                                ┌────────────────────────────────┐
 Claude Code ──┐                │           Plan base            │
               │   openplan     │  ~/OpenPlan  (user-chosen)     │      ┌─────────────────┐
 Codex ────────┼── CLI + MCP ──▶│   plans/*.md  (+frontmatter)   │◀────▶│  OpenPlan app   │
               │   (stdio)      │   .<name>.oplan-comments.json  │      │  (Tauri 2)      │
 Any MCP ──────┘                │   STANDARDS.md  openplan.json  │      │  watch + git    │
 client                         │   .git/  (every write = commit)│      └─────────────────┘
       You (drag-drop, edit) ──▶└────────────────────────────────┘
```

The **filesystem is the API**. App and CLI never talk to each other directly; they
meet at the base directory. Coordination = atomic writes + git commits + file
watching. Consequence worth stating: **neither side needs the other to be running.**
MCP clients spawn the CLI themselves; agents can file plans with the app closed, and
the app shows everything (with full history) the moment it opens. There is no
daemon and no autostart anywhere in the system.

### 5.2 Repo layout (target)

```
openplan/
├── PLAN.md                  ← this file
├── CLAUDE.md                ← pointer here + working rules for agent sessions
├── src/                     ← React app
│   ├── components/          ← feature components (existing)
│   │   └── ui/              ← vendored shadcn/ui primitives
│   ├── features/            ← new multi-component features get a folder
│   │   ├── onboarding/
│   │   └── history/
│   └── lib/                 ← pure TS logic (existing) — all TDD'd
├── src-tauri/               ← Rust workspace
│   ├── crates/
│   │   └── openplan-core/   ← THE contract: frontmatter, sidecar schema, base
│   │                          config, git ops, discovery scanners. No Tauri deps.
│   ├── src/                 ← thin Tauri commands over openplan-core + watcher
│   └── Cargo.toml           ← workspace root
└── cli/                     ← `openplan` binary crate (CLI + MCP server) in the
                               same Cargo workspace, depends on openplan-core
```

### 5.3 Key components

**`openplan-core` (Rust crate — the heart).** Single source of truth for the file
contract, used by both app and CLI so they can never drift:
- `plan.rs` — parse/serialize frontmatter (`serde_yaml` on a manually split
  document; body passes through byte-identical), derive metadata for files without
  frontmatter.
- `sidecar.rs` — comments schema v2 (port of `src/lib/comments.ts` validation +
  `author` field), read/write/delete, atomic writes (port of existing `atomic_write`).
- `base.rs` — locate/validate base via config file `~/.config/openplan/config.json`
  (base path) + `openplan.json` inside the base (base-local settings, schema version).
- `repo.rs` — git via **`git2`** (libgit2 bindings; no system git needed — NFR-6):
  init, auto-commit(path, message), log(file), diff(file, rev). Nothing else.
- `discovery.rs` — Claude Code scanner (read `~/.claude/plans/*.md`), Codex scanner
  (stream rollout JSONL, extract final `update_plan` per session), content-hash
  dedupe ledger.
- `agent_export.rs` — the agent-review export format (spec'd from today's
  `formatThreadsForAgent` output; that TS code is otherwise retired with the old
  comments system). The rebuilt UI's export and the CLI serve the same format —
  a shared golden-file test keeps them identical.

**Tauri layer (`src-tauri/src/`).** Thin commands wrapping openplan-core (existing 7
commands stay, renamed sidecar), plus:
- `watch_base` — `notify` watcher on the base, 300ms debounce, emits
  `base-changed { paths }` events; UI invalidates only affected plans/sidecars.
- `scan_base`, `read_plan_meta`, `set_plan_status`, `plan_history`, `plan_diff`,
  `run_discovery`, `import_plans`, `install_agent` — all logic in core, commands stay
  ~10 lines.

**`openplan` CLI (`cli/`).** One binary, two faces:
- `openplan mcp` — MCP server over stdio using the official Rust SDK (**rmcp**).
  Tools listed in FR-8; `create_plan`'s description embeds a digest of STANDARDS.md.
- Human verbs: `openplan init|add|list|install claude-code|install codex|doctor`.
- Distribution: built and released with the app (CI attaches binaries); the app
  bundles it as a sidecar binary so "Connect agent" works with zero extra installs.

**Frontend.** No new state library — continue with hooks; extract from `App.tsx` as
features land: `usePlanBase` (base tree + watcher subscription), `usePlanMeta`. New
feature folders: `onboarding/` (wizard, discovery UI), `history/` (revision list +
diff view), `comments/` (the v2 rebuild — §6.2b; the six existing `Comment*`
components, `useComments`, `domRange.ts`, and `comments.ts` are **deleted** when it
lands, not refactored). Vendored shadcn primitives replace `Button.tsx`,
`Tooltip.tsx`, `IconMenu.tsx` as those files are next touched.

### 5.4 Framework decisions

| Decision | Choice | Why (and why not the alternative) |
|---|---|---|
| App shell | **Keep Tauri 2** | Already built and tuned; small binaries; Rust side is where all new native work lands anyway. Electron: 10× size, nothing gained. |
| UI | **Keep React 19 + Tailwind v4; adopt shadcn/ui** | Codebase is already shadcn-styled; vendored components = no runtime dep, full control. |
| State | **React hooks only** | Current scale doesn't justify a store; "less code". Revisit only if prop-drilling measurably hurts. |
| Routing | **None** (overlays/panels) | Single-window desktop app; onboarding is a full-screen overlay, not a route. |
| Contract logic | **Rust crate `openplan-core`** shared by app + CLI | One implementation of the file contract; TS duplicates nothing except what the browser needs. Node CLI would mean two implementations forever. |
| Versioning | **git via `git2`** | Free history/diff/blame semantics; no bespoke snapshot format; libgit2 bundled so users don't need git installed. `gix` is less battle-tested for our needs. |
| Watching | **`notify` crate** | Standard, cross-platform; debounced in our layer. |
| MCP | **rmcp (official Rust SDK), stdio** | Official SDK; stdio is what Claude Code and Codex both spawn. |
| Frontmatter | **Parsed in Rust**, UI receives structured meta | Single parser; TS never re-implements YAML. |
| TS tests | **Vitest** (+ Testing Library for components) | Vite-native, fast. |
| Rust tests | **cargo test** (unit in-crate; existing style) | Already the pattern in `lib.rs`. |
| E2E | **Deferred**; manual QA checklist per release | `tauri-driver` is flaky cross-platform; component + crate tests carry correctness. |

---

## 6. Implementation details

### 6.1 Plan file contract

```markdown
---
id: 2026-08-15-auth-refactor      # stable slug; filename = <id>.md for created plans
title: Auth refactor
status: draft                     # draft | in-progress | in-review | completed (0.2.0)
type: feature                     # feature | bug | migration | research | audit; drives the page layout
source: claude-code               # claude-code | codex | cursor | manual | import
project: github.com/owner/repo    # the git remote of where the agent worked; folder name without one
pr: https://github.com/owner/repo/pull/12   # set with in-review
created: 2026-08-15T10:00:00Z
updated: 2026-08-15T12:30:00Z     # bumped by whoever writes
---
# Auth refactor
...body is never touched by tooling...
```

Rules: unknown frontmatter keys are preserved verbatim; a file with no frontmatter is
still a plan (`title` from first H1 or filename, `status: draft`, `source: manual`);
tools may add frontmatter only when the user/agent edits the plan (no mass rewrites).

**Status (0.2.0).** Stored, never derived. Draft when filed. In progress once a
session registers work on it through the loopback server (FR-17) or an agent calls
`set_status`. In review when the agent opens a PR, passed as `pr`. Completed is set by
the person; `set_status` refuses it. Reading a pre-0.2.0 file: `tags: archived` reads
as completed, the old `status:` vocabulary maps (`done`/`archived` to completed,
`approved` to in-review), and the `tags:` line is kept as an uninterpreted key.

**HTML plans (FR-19).** `<id>.html` is a plan exactly as `<id>.md` is: the same
frontmatter in an HTML comment at the top of the file, the same sidecar, the same
history. The app renders it in a sandboxed frame (no scripts, no network). A plan set
may mix both, so a markdown plan can carry an HTML illustration.

### 6.2 Comments sidecar v2

`.<filename>.oplan-comments.json` next to the plan (reader also accepts the legacy
`.omd-comments.json` name and migrates on next write):

```jsonc
{
  "version": 2,
  "threads": [ {
      "id": "uuid", "quote": "...", "lineStart": 12, "lineEnd": 14,
      "resolved": false,
      "comments": [ { "id": "uuid", "text": "...", "createdAt": "ISO",
                      "editedAt": "ISO?", "author": "user" } ]  // author NEW in v2
  } ]
}
```

v1 sidecars parse fine (`author` defaults to `"user"`). Agents set `author` to their
tool name (`claude-code`, `codex`, `cursor`).

### 6.2b Comments v2 — anchoring model (the rebuild)

The old system anchored by re-finding the quote's text inside the rendered DOM
(`domRange.ts`) and painting overlay rectangles — fragile against markdown
transformations, duplicate text, and re-renders; this is the source of the bugs and
none of it comes back.

The rebuild anchors in **source space** and maps to the DOM through render-time
position stamps:

1. **Anchor = source truth.** A thread stores `lineStart/lineEnd` (+ `quote` for
   display and drift detection), exactly as the sidecar already defines.
2. **Render stamps positions.** A small remark plugin stamps each top-level rendered
   block with its source range (`data-line-start/end` from mdast `node.position`) —
   deterministic, no text searching, works with GFM/Mermaid since block boundaries
   come from the parser.
3. **Selection → anchor** walks up to the stamped block(s) to get exact source lines.
4. **Highlights** attach at block granularity via the stamps, refined within a block
   only when the quote matches uniquely; on ambiguity, degrade to a block-edge
   marker (a gutter/margin indicator) rather than guessing — **no wrong highlights,
   ever**. A stale anchor (lines gone after an edit) shows in the panel as
   "reference outdated" instead of floating anywhere.
5. **One positioning system.** Popovers/composer anchor to the same stamped blocks;
   no independent rect math per component.

Build order is logic-first, test-first: pure functions for selection→lines,
lines→blocks, drift detection — all Vitest'd before any component exists.

### 6.3 Base config

- `~/.config/openplan/config.json` (via `dirs` crate; Windows/macOS equivalents):
  `{ "basePath": "~/.openplan" }` — how app AND CLI find the base. Default base is
  the hidden `~/.openplan`, created `0700`.
- `<base>/openplan.json`: `{ "schemaVersion": 1 }` + future base-local settings.
- Standards are **not** a file in the base. They ship with the app
  (`openplan-core::standards::BUILT_IN`); the user's additions live in the
  settings file above and are layered on top when agents ask.

### 6.4 Watcher & auto-commit flow

```
agent/CLI writes plan ─▶ commit ─▶ notify event ─▶ debounce 300ms ─▶ emit base-changed
app writes (flushSave) ─▶ commit("edit: <id>") ─▶ (watcher event ignored: hash match)
external write w/o commit (user's editor) ─▶ watcher sees dirty repo ─▶ commit("external: <path>")
```

Commit messages: `agent(<name>): create|update|archive|rename <id>`, `edit: <id>`,
`external: <path>`, `import: <n> plans`, `restore: <id> to <rev>`. **Attribution is
the git author**, set per writer: `user <user@openplan.local>` for app edits,
`claude-code <claude-code@openplan.local>` (etc.) for MCP writes — so `git log`
answers "who did this" with no extra metadata. The app never blocks UI on git —
commits run on the Rust side off the main thread.

### 6.5 MCP tool sketch

`create_plan{title, body, project?, source}` → validates body against STANDARDS
headings (warn, don't reject), slugs an id, writes, commits, returns path+id.
`get_comments{id}` → agent-export format (§5.3). `reply_comment{id, threadId, text}` →
appends with `author` = client name from MCP handshake. `list_plans{status?}` →
metadata array. **Curation tools (FR-13)**: `archive_plan{id}` (status → archived,
optionally moves under `archive/`), `rename_plan{id, newId}` (git-mv, preserves
history) — the integration skill instructs agents to tidy after filing (naming per
STANDARDS, archive stale `done` plans, flag near-duplicates in their summary). All
tools resolve the base via §6.3; if no base exists yet, the server **auto-creates
it** (same path as the app's first launch — §4.1 step 1), so the integration works
even if the app has never been opened. **The app is never required for MCP to
function**: clients spawn `openplan mcp` themselves per session (stdio), and all
effects land in the base as attributed commits — the app is a viewer that catches up
the moment it's opened. No daemon, no autostart (NFR-8).

### 6.6 Agent installers

- **Claude Code**: `openplan install claude-code` registers the MCP server
  (`claude mcp add openplan -- openplan mcp`) and installs a plugin containing:
  a skill ("filing plans with OpenPlan" — when a plan is accepted, call
  `create_plan`; check `get_comments` when resuming plan work) and an optional
  PostToolUse hook on ExitPlanMode that reminds/automates filing. Plugin lives in
  this repo under `integrations/claude-code/`.
- **Codex**: `openplan install codex` appends `[mcp_servers.openplan]` to
  `~/.codex/config.toml` and prints/offers an AGENTS.md snippet.
- **Cursor**: `openplan install cursor` adds the server to `~/.cursor/mcp.json`
  (global) and prints/offers a rules snippet (`.cursor/rules/` or AGENTS.md) telling
  Cursor's agent to file plans via `create_plan`. (Verify current config paths at
  implementation time — Cursor's MCP config format has moved before.)
- All verified by `openplan doctor` (used by the app's Connect buttons).
- **Root startup files**: installers also update each app's root instruction file so
  agents *default* to OpenPlan for plans — `~/.claude/CLAUDE.md` (Claude Code),
  AGENTS.md (Codex), Cursor rules — e.g. "file plans via OpenPlan's `create_plan`,
  not the default plans location". Exact wording and placement is part of the P3.0
  onboarding design session; installers must be idempotent and clearly-delimited
  (managed block markers) so re-runs and uninstalls are clean.

### 6.7 Discovery import

**Measured on Sid's machine, 2026-08-15 — the premise is weaker than assumed.**

| source | found | usable |
|---|---|---|
| `~/.claude/plans/*.md` | 1 file | 1 |
| Claude Code session transcripts | 483 JSONL across 65 projects | **4 payloads, 3 sessions** (2026-05-26 → 2026-08-14) |
| Codex `rollout-*.jsonl` | 14 files, 24 `update_plan` calls | **0** — see below |
| `~/Desktop/Hypo Fable Plans/` | 10 plan sets, 14,737 lines | **all of it** |

A grep for `ExitPlanMode` matches 1,110 times across 232 files, which reads like
a rich seam and is not: 523 are `attachment` records (the tool list in a session's
own context), 12 are tool results, 5 are the assistant mentioning the tool. Only 4
are real `tool_use` payloads carrying a `plan`. Counting by grep would have
overstated the yield by ~270×.

Codex's `update_plan` is a **TODO checklist**, not a document — `[{status,
step}]`, e.g. "Inspect modal component and related hook". Importing those as
plans produces three-line stubs, not plans. Codex has no prose-plan artifact to
discover.

What the transcripts *do* carry, for the 4 that exist, is good metadata:
`timestamp`, `cwd` (→ `project:`), `gitBranch`, `sessionId`, and a body that
already opens with an H1 and `## Context`.

**Importing Sid's real folder, measured 2026-08-15.** `openplan add` over
`~/Desktop/Hypo Fable Plans/` filed 11 plans and refused none. It also showed
what a file-at-a-time importer cannot do:

- The folder holds **109 documents**; 11 were captured. A plan set is 2–38
  documents (`pdb-search-v1` is 38) and only its entry point came across.
- `pdb-projects-overhaul` became **two** plans — its README and its PLAN — which
  are the same plan.
- Every import landed as `draft`, though the bodies carry their own status
  (`**Status:** PLANNING (2026-07-29)`, `documented, not yet fixed`).
- One slug truncated mid-word at 60 characters (`…coerce-to-date`).

**A plan can be a folder — now implemented.** A directory whose entry point is
`README.md`, or failing that a `00-*.md`, is one plan; `scan` lists it once and
reports how many documents it holds, and `openplan add <dir>` copies the whole
set in. Re-running the import over the same corpus gives 9 plans instead of 11,
with `pdb-projects-overhaul` no longer arriving twice as its README and its PLAN.

**Importing copies.** The original stays where it is; nothing is moved out of
the folder someone already keeps. Under test and verified against the real
corpus, which still holds all 109 documents afterwards.

**The "hang" was the wrong binary.** The Tauri package is named `openplan` and
the CLI declared `[[bin]] name = "openplan"`, and they share one workspace
target directory — so `target/debug/openplan` was whichever built last.
Every "hang" was the desktop app starting a webview and ignoring its arguments.
The app's binary is now `openplan-app` (`mainBinaryName` in `tauri.conf.json`),
leaving `openplan` to the CLI. The same import that appeared to hang for five
minutes finishes in **0.41s** for 10 plans across 109 documents.

Worth remembering: it presented exactly like a deadlock — blocked, ~0% CPU,
worse as state grew. What identified it was sampling the stuck process, which
showed `NSEventThread`, `JavaScriptCore` and `WebCore: Scrolling` in something
that was supposed to be a command line tool.

The contract (§6.1) previously assumed one plan is one file,
but the standards tell people to use a directory for anything large, and Sid's
own corpus is six sets and four loose files. Import must treat a directory with
a `README.md` as one plan with many documents, and `library::scan` must list it
once rather than 38 times. This is a change to the contract, not just the
importer.

**Importing is never automatic.** It runs as a step of onboarding, or when
someone asks for it — `openplan add`, or the app's import action. Nothing scans
and files on its own: the base is the user's, and a tool that copies things into
it unbidden is one they stop trusting.

**Consequence for onboarding (P3.0):** auto-discovery of agent internals is a
garnish, not the main course. The plans a person already has live in a folder
they maintain by hand. Onboarding should lead with *"point us at where you keep
plans"* and *"connect your agents so the next one lands here"*, with transcript
discovery offered quietly for the handful it finds.


- Claude Code: read `~/.claude/plans/*.md` (verified format: plain md, H1 title).
  Candidate = {title from H1, mtime, content}.
- Codex: for each `rollout-*.jsonl`, stream-parse, keep the **last** `update_plan`
  payload; skip sessions without one. Feature-flagged best-effort — format is
  unversioned, so failures degrade to "0 found", never errors.
- Import: copy content into `plans/<slugified-title>.md` + synthesized frontmatter
  (`source`, `created` from mtime, `status: draft`); append content-hash to
  `<base>/.oplan-imported` ledger; single commit.

### 6.8 Migrations (Phase 0)

- Product rename: `tauri.conf.json` (productName, identifier
  `com.siddeshsambasivam.openplan`), `package.json`, window title, welcome doc, README.
- localStorage keys `openmarkdown:*` → `openplan:*` with one-time migration read.
- Sidecar rename handled by dual-read (§6.2).

---

## 7. Testing strategy

- **Order is law:** failing test → implementation → refactor. PRs show test commits
  first (or same commit, test-visible).
- **Rust (`openplan-core`)**: unit tests per module; frontmatter round-trip
  (byte-identical body), sidecar v1→v2 compat, git ops against temp repos, discovery
  against fixture trees (`tests/fixtures/fake-claude-home/`, JSONL samples).
- **Rust (Tauri commands)**: existing async test style in `lib.rs` continues.
- **CLI/MCP**: spawn `openplan mcp` in-process, drive tools over stdio, assert file +
  git effects in a temp base.
- **TS (`src/lib/`)**: Vitest for every module (pure logic, no mocks needed).
- **TS (components)**: Testing Library for behavior (onboarding wizard steps, status
  changes write-through, comment author rendering). No snapshot tests.
- **Golden file**: agent-export format has one fixture shared by the TS and Rust
  implementations so they can't drift.
- **Manual QA** happens at every phase GATE (§8) — the implementing session prepares
  a phase-specific QA script. The recurring baseline checks: resize sweep 720px→full,
  theme toggle, 60fps scroll on a 2MB plan, watcher latency, idle CPU ~0% (NFR-8),
  drag-drop matrix, all three OS builds.

---

## 8. Todos

Work top-to-bottom within a phase; phases are strictly ordered. Check items off here
as they complete. Each item = one session or less. **(T)** = has test-first deliverable.

**Every phase ends with a GATE: Sid's manual QA + explicit approval. A gated phase
must not be started until the previous GATE is checked off — no exceptions without a
Decision-Log-recorded waiver (§2 Process).** When a GATE is reached, prepare a short
QA script for Sid: what to click, what to look for, which requirements it exercises.

### Phase 0 — Rebrand & workspace scaffolding
- [x] P0.1 **Complete rebrand** OpenMarkdown → OpenPlan (§6.8): product config,
      docs, README, welcome doc, code comments, identifiers, CSS/event names,
      error strings — a repo-wide grep for `openmarkdown`/`OpenMarkdown`/`omd`
      must come back empty (legacy sidecar dual-read in P0.3 is the one exception);
      migrate localStorage keys **(T: migration logic in `src/lib/`)**
- [x] P0.2 Convert `src-tauri` to a Cargo workspace; create empty `openplan-core`
      crate; move `atomic_write` + sidecar fs helpers into it **(T: ports existing tests)**
- [x] P0.3 Sidecar dual-read rename `.omd-` → `.oplan-` with v2 `author` field
      **(T: v1 parse compat, migration on write)**
- [x] P0.4 Tests for the remaining pure helpers in `src/lib/` — `tree.ts`,
      `platform.ts` (`comments.ts` is retired in Phase 4, so skip it) **(T)**
      — Vitest itself was set up in P0.1, which needed it for its test
- [x] P0.5 Adopt shadcn/ui across the app: vendor `button`, `tooltip`,
      `dropdown-menu`, `input` into `components/ui/`; delete the hand-rolled
      `Button`, `Tooltip`, `IconMenu`; rewrite every call site (header, sidebar,
      folder tree, find bar, viewer, empty state, menus). `@/` alias added
- [x] P0.6 Remove the comments UI outright — the 6 `Comment*` components,
      `useComments`, the popover positioning hook, and quote anchoring in
      `domRange.ts` (find-in-document keeps the rest). `lib/comments.ts` stays
      as the sidecar + agent-export spec, now under test. Phase 4 rebuilds the
      UI on source-line anchoring (§6.2b)
- [x] P0.7 Outline (was "table of contents") rebuilt as an in-flow column that
      cannot overlap the text, collapsing to a dismissable floating panel only
      when the main area is too narrow; sidebar file/folder footer removed;
      defaults changed to small font + compact width **(T: `outline.ts`)**
- [x] P0.8 Motion layer (`animate-*` utilities + reduced-motion guard) and
      animated reading-width changes; app shell no longer scrolls vertically
- [ ] **GATE 1 waived for Phase 2** — Sid, 2026-08-15: "gate waived for phase 2".
      Phase 1 remains unverified at runtime; its QA is still owed before a release.
- [x] **GATE 0 — Sid manual QA & approval** — approved 2026-08-15 on macOS.
      Windows and Linux were not exercised; the rename is config-level, so CI
      on the first `v*` tag is the real check for those

### Phase 1 — Plan base & plans as first-class
- [x] P1.1 `openplan-core::base` — config discovery, auto-creation of hidden
      `~/.openplan` (0700), `openplan.json`, default `STANDARDS.md` **(T)**
- [x] P1.2 `openplan-core::plan` — frontmatter parse/serialize, meta derivation
      **(T: round-trip byte-identical body)**
- [x] P1.3 `openplan-core::repo` — git2 init/commit/log/diff **(T: temp repos)**
- [x] P1.4 Tauri commands: `get_base`, `create_base`, `scan_base` (meta included),
      `set_plan_status` **(T)**
- [x] P1.5 First-run silent base creation wired into app startup (no UI — §4.1
      step 1; the sync screen comes in P3)
- [x] P1.6 Sidebar: base as root, status badges, group-by-status, filter extension
- [x] P1.7 Metadata header in preview (status chip editable, source, dates);
      frontmatter hidden from body **(T: lib logic)**
- [x] P1.8 Watcher: `notify` + debounce + `base-changed` event; `usePlanBase` hook
      subscribes; toast on new plan **(T: Rust debounce/queue logic)**
- [x] P1.9 Auto-commit on app writes + external-write catch-up commits **(T)**
- [x] P1.10 History panel: revision list (with git-author attribution), a
      real green/red diff since each revision (git2 `diff_blobs`),
      [Restore this version] as a new commit **(T: diff + restore commands)**
- [x] P1.11 Settings page (FR-14): theme, font type/size, layout width, base
      location, re-run discovery entry point; header reduced to quick toggles
      **(T: preference persistence logic)**
- [x] P1.12 Global search (FR-15): Rust on-demand scan command + search UI
      (grouped results, jump-to-match) **(T: scan command)**
- [ ] **GATE 1 — Sid manual QA & approval** (base setup flow, statuses, live watcher
      updates, history; idle CPU ~0% with watcher running — NFR-8)

### Phase 2 — Agent integration
- [x] P2.1 `cli/` crate scaffold: `openplan init|list|add|doctor` **(T: temp base)**
- [x] P2.2 MCP server (stdio): `create_plan`, `read_plan`, `list_plans`,
      `get_standards` **(T: real-binary stdio session)**. `update_plan` and
      `set_status` still to come. Hand-rolled sync JSON-RPC, not rmcp — see log
- [x] P2.3 MCP comment tools: `get_comments` (golden-file format), `reply_comment`,
      `resolve_comment` **(T: real-binary session, agent replies land with their author)**
- [x] P2.4 `get_standards` (built-in + overrides) + standards guidance in
      `create_plan`'s description; standards editor already in Settings **(T)**
- [ ] P2.4b Curation tools `archive_plan`, `rename_plan` (git-mv) + tidy-up
      instructions in the integration skill (FR-13) **(T)**
- [x] P2.5 `openplan install claude-code` — `claude mcp add-json` + managed
      block in `~/.claude/CLAUDE.md` **(T: dry-run writes nothing)**. Verified
      live: `claude mcp get openplan` → ✓ Connected
- [x] P2.6 `openplan install codex` — `config.toml` entry + managed block in
      `~/.codex/AGENTS.md` **(T: idempotent)**. Run live
- [x] P2.7 `openplan install cursor` — merged into `~/.cursor/mcp.json`,
      existing servers preserved **(T)**. Run live. Rules snippet still open
- [x] P2.8 Bundle CLI as Tauri sidecar binary; app "Connect agent" cards run
      installers + `doctor` verification. Verified live: installed app's
      onboarding registered `/Applications/OpenPlan.app/Contents/MacOS/openplan`,
      Claude Code connected and filed a plan through it
- [ ] P2.9 CI: build + attach CLI binaries alongside app installers
- [ ] **GATE 2 — Sid manual QA & approval** (file a real plan from Claude Code,
      Codex, and Cursor; live appearance in app; standards served)

### Phase 3 — Onboarding & auto-discovery
- [x] **P3.0 Onboarding design session** — Sid dictated the flow 2026-08-16;
      recorded in §4.1 and built the same day. Round-trip verification (4) is
      the piece not yet in the wizard: installs report their steps, but nothing
      yet drives the connected tool end-to-end. GATE 2's manual check covers it.
- [x] P3.1 `openplan-core::discovery` — agent detection + loose-plan listing
      **(T: fixture home dir)**
- [ ] P3.2 Codex rollout scanner, feature-flagged **(T: fixture JSONL)**
- [x] P3.3 Import executor (`core::import`) — copy, frontmatter synth, the
      document's own dates, dedupe by id **(T)**
- [x] P3.4 Onboarding wizard (full-screen overlay, three stages, every one
      skippable, dev-only replay from Settings)
- [ ] P3.5 Discovery UI: shimmer scan progress + expandable trace + approval cards
      (beautifului patterns), 60fps
- [ ] P3.6 Wire Connect-agents step (reuses P2.8); final onboarding polish pass
- [ ] **GATE 3 — Sid manual QA & approval** (fresh-machine onboarding run end-to-end;
      re-run discovery idempotent; skip paths all work)

### Phase 4 — Comments v2 (full rebuild — replaces the buggy system)
- [x] P4.1 Delete old comments code — done early in P0.6, so that the shadcn
      migration had no dead components to carry
- [x] P4.2 Position stamps (`data-line`/`data-line-end`) — already emitted by
      the renderer; sanitize schema carries them through
- [x] P4.3 Anchoring lib (`anchors.ts`): selection→lines, lines→blocks, stale
      detection; ambiguity degrades per §6.2b
- [x] P4.4 Highlights drawn as elements (`CommentsLayer`), unique-match text
      highlight, gutter bar fallback, "reference outdated" in the panel
- [x] P4.5 Composer on selection + panel with author marks, reply, resolve,
      delete; agents reply through MCP under their own name
- [x] P4.6 Copy for agents — same format the MCP `get_comments` serves; the
      golden test exists on both sides (TS and Rust)
- [ ] P4.7 Thread↔revision stamp: record base commit hash on thread creation; show
      "plan changed since comment" hint **(T)**
- [ ] P4.8 Status-driven review flow copy (in-review affordances, approve action)
- [ ] **GATE 4 — Sid manual QA & approval** (the bar: comment on tricky docs —
      duplicate text, tables, mermaid, huge files — zero wrong highlights; then cut
      v0.2.0 release)

### Phase 5 — Sync & remotes
- [x] P5.0a Real author identity: name + email resolved from settings, then
      git config, then an anonymous fallback; agents commit under their tool
      name with the person's email. Landed ahead of the phase because history
      is never rewritten **(T)**
- [x] P5.0b Comments carry the person too (`authorName`/`authorEmail` beside
      the existing role token), so a shared thread shows who said what
      instead of "You" for everyone **(T: golden format stays in step on both
      sides)**
- [x] P5.0c Lifecycle (draft / active / archived), derived from agent
      activity plus the archived tag, in the sidebar groups, the meta bar,
      `list_plans`, and `openplan list` **(T)**
- [ ] P5.0d Remaining derived signals on plan rows: last mover, when, and
      open comment count, from the same history walk the lifecycle uses **(T)**
- [ ] P5.1 Base relocation setting (for Drive/iCloud users who want a visible synced
      folder) **(T: relocation logic)**
- [ ] P5.2 Connect GitHub/GitLab remote from settings: set URL, push/pull via git2,
      surface conflicts plainly **(T: against a local bare remote)**
- [ ] **GATE 5 — Sid manual QA & approval** (push base to a real GitHub repo, pull
      from second machine/clone; relocation into a synced folder works)

### Phase 6 — 0.2.0: status, board, rendered plans, loopback server
Started 2026-09-22 ahead of Phase 5 and without gates 1 to 4, on Sid's recorded
waiver (§9). Prototype and decisions: the filed plan "OpenPlan 0.2.0" in the base.
- [x] P6.1 Contract: stored `status`, `type`, `pr`; tags removed from the contract,
      the UI, the CLI and the MCP (`tag_plan` becomes `set_status`); legacy reads
      map (§6.1); `lifecycle.rs` deleted **(T)**
- [x] P6.2 Projects as git remotes: `project` normalised to `owner/repo`, project
      descriptions in `<base>/projects.json` via `describe_project`, owner avatar
      fetched once and cached **(T)**
- [x] P6.3 Standards: unslop writing rules built in and in the installers' managed
      block; plan types with required sections, warned on by `create_plan`;
      authoring mode setting served by `get_standards` and the tool description **(T)**
- [ ] P6.4 Loopback server in the app; MCP server registers sessions and plans,
      receives comments; session presence drives In progress and the live count
      **(T: server and client against a local port)**
- [x] P6.5 Shell: nav (Board, All plans, For you, Projects, Recent), top bar with
      the plan title and a status picker, spaced width 60rem
- [x] P6.6 Board, list and For you views; project filter; repo marks
- [x] P6.7 Rendered plan page: section-aware layout by type for markdown; HTML plans
      and HTML documents in a set rendered in a sandbox **(T: section parsing)**
- [ ] P6.8 Comments as a review: threads accumulate as pending, one Send delivers
      them to the session; thread states open, answered, resolved; who resolved
      and when in the sidecar **(T)**
- [ ] P6.9 Motion pass: transform and opacity only, reduced-motion guard, 60fps on
      a 2MB plan
- [ ] P6.10 Version 0.2.0 across `package.json`, Cargo, `tauri.conf.json`; release
- [ ] **GATE 6 — Sid manual QA & approval** (board and status flow end to end with
      a live session; comments reach the session without copy and paste; HTML and
      markdown plans; idle CPU ~0% with the loopback server up)

---

## 9. Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-08-15 | Plan base = plain directory + git; no database | Portability (NFR-4); versioning for free; sync = folder sync |
| 2026-08-15 | Shared Rust crate `openplan-core` for app + CLI | One implementation of the file contract |
| 2026-08-15 | MCP as the durable agent interface; discovery of `~/.claude`/`~/.codex` internals is best-effort import only | Those internals are unversioned; MCP is the stable contract |
| 2026-08-15 | Comments stay in JSON sidecars (v2 adds `author`) | Already built, portable, agent-editable |
| 2026-08-15 | git2 (libgit2) over system git or gix | No runtime dependency on user's git; battle-tested |
| 2026-08-15 | No state library, no router | Scale doesn't justify them; less code |
| 2026-08-15 | shadcn/ui vendored, migrated incrementally | Already shadcn-styled; no big-bang rewrite |
| 2026-08-15 | E2E deferred in favor of crate/component tests + manual QA checklist | tauri-driver flakiness; test effort goes where it pays |
| 2026-08-15 | Existing comments/highlight system will NOT be reused; full rebuild in Phase 4 on source-space anchoring (§6.2b) | Sid: current system is super buggy; DOM-text-search anchoring is the root cause. Data + export formats survive as specs |
| 2026-08-15 | Hard manual-QA gates between phases, self-binding (waiver must be recorded here) | Sid's explicit process requirement |
| 2026-08-15 | Cursor added as a first-class integration alongside Claude Code and Codex | MCP makes it nearly free; same server, one more installer |
| 2026-08-15 | Resource frugality is a hard requirement (NFR-8): event-driven only, no polling/indexing | Must run well on old hardware |
| 2026-08-15 | pnpm is the package manager (pinned via `packageManager`; migrated same day — lockfile imported, CI + Tauri hooks + launch.json updated) | Sid's choice; faster installs, stricter node_modules |
| 2026-08-15 | Default base is hidden `~/.openplan`, auto-created (no picker) | Sid: keep it hidden; zero-question onboarding |
| 2026-08-15 | Onboarding golden path = sync-from-agents on first screen; base/remote config lives in settings | Sid: low-effort, high-quality onboarding — never an empty base |
| 2026-08-15 | Agent curation is a feature (FR-13): skill-driven tidy via explicit tools, attributed commits, no background process | Sid: agents clean up so humans can follow along; NFR-8 forbids daemons |
| 2026-08-15 | Attribution = git author per writer; history append-only from UI (restore = new commit) | Sid: always know who made a change; always able to roll back |
| 2026-08-15 | GitHub/GitLab remote is the primary sync path (Phase 5); Drive via base relocation | Sid: integrate with existing workflows, not transient |
| 2026-08-15 | Project code hosted at github.com/SiddeshSambasivam/openplan (origin) | Sid provided the remote |
| 2026-08-15 | Outline is a column or a dismissable overlay — never a floating layer over text; side-switching, auto-hide, and the 3-state cycle were deleted | Sid: it overlapped content; those were concepts we don't need |
| 2026-08-15 | Panels mount/unmount rather than parking off-screen | An element translated outside its container widens the scrollable area and can scroll the whole layout sideways |
| 2026-08-15 | Default reading settings: small font, compact width | Sid's preference |
| 2026-08-15 | Shared motion utilities in `index.css` (transform/opacity entrances, `prefers-reduced-motion` guard) | Sid: interactions felt too sudden; keeps motion consistent instead of per-component ad hoc |
| 2026-08-15 | App shell never scrolls: `overflow: hidden` on html/body, only inner panes scroll | Sid: the whole app could be scrolled vertically |
| 2026-08-15 | GATE 1 waived so Phase 2 could start; Phase 1 QA still owed | Sid, explicitly. Recorded per §2 Process, which requires a waiver be logged rather than assumed |
| 2026-08-15 | Onboarding leads with importing an existing folder, not with mining agent transcripts | Measured (§6.7): agent internals yield 4 plans on a machine whose real corpus is a 10-set folder. Codex has no prose plan to find |
| 2026-08-16 | Status lifecycle removed; free tags replace it, settable by user and agents alike | Sid: keep it simple. Six fixed states was a workflow imposed on everyone; a tag means whatever its author meant. Old `status:` lines survive as preserved unknown keys |
| 2026-08-16 | MCP server is a hand-rolled synchronous JSON-RPC loop over stdio, not rmcp | At this surface (handshake, tool list, dispatch) the SDK buys an async runtime and little else; verified against the real client — `claude mcp get openplan` reports Connected. Revisit if the protocol surface grows |
| 2026-08-16 | Installers write only inside a marked block in files other tools own; dry-run writes nothing | An install that rewrites someone's CLAUDE.md, or a dry-run that writes at all (caught in testing), is how trust is lost |
| 2026-08-16 | Onboarding: hello → import → connect, each skippable, detection during the hello | Sid's design, P3.0 |
| 2026-08-15 | Standards belong to the app, not the plan base; settings expose additions that layer on top | Sid: standards are a settings concept. A copy per base drifts, and nobody edits the one that shipped. Interoperability is preserved through `get_standards` rather than a file |
| 2026-08-15 | Settings is a modal with its own section nav, opened from the sidebar's footer | Sid; matches where people look for it |
| 2026-08-15 | Find (and later comment) highlights are drawn as positioned elements, not via the CSS Custom Highlight API | The desktop WebView keeps painting registered highlights after the registry is emptied and the colour removed; scrolling does not repaint them away. Verified in the app: registry `[]`, colour unset, still lit. Elements React unmounts are repainted by definition |
| 2026-08-15 | Motion comes from `tw-animate-css`, not hand-written keyframes | shadcn's generated components already reference its classes (`animate-in`, `fade-in-0`, `zoom-in-95`); without it they were dead classes and menus/tooltips did not animate |
| 2026-08-15 | The wordmark uses EB Garamond from the marketing site, with no icon | Sid: match the marketing material; fonts vendored into `public/fonts` |
| 2026-08-15 | `color-scheme` is declared per theme | Without it the browser keeps painting native surfaces in the old palette, which is the artifact left behind when toggling |
| 2026-08-15 | Shortcuts require exactly the platform modifier | `⌃⌘F` was matching the find shortcut and swallowing macOS full-screen |
| 2026-08-15 | Tooltips are now Radix (shadcn) rather than CSS hover labels, and menus are `dropdown-menu` | Real focus/keyboard/portal behaviour, and it retires three hand-rolled primitives |
| 2026-08-15 | `TooltipButton` and `SettingMenu` are app-level compositions of shadcn primitives, not new primitives | shadcn ships no tooltip-button or preference-menu; composing beats repeating the pairing at ~15 call sites |
| 2026-08-15 | The comments UI was deleted in P0.6 rather than merely disabled (P4.1 pulled forward) | Keeping ~1400 lines of unreachable code through three phases fights "less code", and it would have had to be migrated to shadcn for no reason |
| 2026-08-15 | No autostart/daemon for MCP; instead the MCP server is self-sufficient (auto-creates the base if missing) | Clients spawn `openplan mcp` per session over stdio — the app is never a runtime dependency; autostart would violate NFR-8 |
| 2026-08-15 | Single design system: shadcn components + tokens only; Tailwind is plumbing, never a second design language | Sid: don't maintain two design systems |
| 2026-08-15 | Settings page (FR-14) is the canonical preference surface; header keeps quick toggles only | Sid's request; Claude Code-style settings |
| 2026-08-15 | Global search is on-demand scan, never indexed (FR-15) | NFR-8: no background indexing; base size makes cold scans instant |
| 2026-08-15 | North star addition: OpenPlan is the interoperable *convention* for plans; the app is a convenience client | Sid's vision note |
| 2026-08-15 | Marketing site is a standalone static page in `site/` (no build step, no deps), with positioning and copy owned by MARKETING.md | Sid: landing page + marketing content; keeps the app's toolchain untouched and "less code" intact. Site design is deliberately NOT the app's shadcn system — it is a separate marketing surface (§2 Design system governs the app only) |
| 2026-08-16 | Renaming a set document keeps its numeric prefix unless the new name starts with digits; the entry document (README/00-*) refuses rename and points at the plan row | The prefix is the set's reading order and must survive casual renames; the entry file IS the plan's identity, so renaming it goes through `rename_plan` |
| 2026-08-17 | A dev build is a separate profile: `~/.openplan-dev`, its own settings file, an `openplan-dev` MCP server, and its own managed block in CLAUDE.md/AGENTS.md. Keyed off `debug_assertions`, not an environment variable | Working on OpenPlan must never disturb the plans kept in it (a dev reset already wiped a real base once). An agent spawns the CLI itself, so a variable exported in a shell would not reach it, but a debug binary stays a debug binary wherever it runs |
| 2026-08-17 | Comments carry `authorName` (the person who typed it, unset for agents) and `authorEmail` (whose base it was written against) beside the existing role token | The token drives the icon and the MCP contract, so it stays; identity is added rather than substituted. Agents keep their tool name because that is who wrote the words, while the email says whose machine it ran on |
| 2026-08-17 | Author identity resolves settings → git config → anonymous fallback; agents keep their tool name and carry the person's email | Multi-teammate is near-term and restore never rewrites history, so every commit written as the literal `user` would stay ambiguous forever. Email tells people apart, name says which actor moved it |
| 2026-08-17 | Agents must answer every open comment thread with `reply_comment`, in the thread, in one or two lines | A review answered only in chat leaves teammates no record; long replies bury the decision. Enforced in the managed CLAUDE.md/AGENTS.md block and the MCP tool descriptions |
| 2026-08-17 (later, supersedes the row below) | Lifecycle reinstated as draft / active / archived, **derived** rather than stored, sitting alongside free tags | Sid's call. The north star and the marketing page already promised "living work artifacts with a lifecycle (draft → done)", so the copy was ahead of the data model. Deriving it answers the staleness objection that killed the old status field, and counting a plan's `source` as agent work (not just commit authors) fixes the import false-negative. Free tags stay for subject matter; `archived` remains the one declared state |
| 2026-08-17 | ~~No Draft/Active lifecycle; derive last-mover, recency, and open-comment count instead~~ (superseded above) | The proposed rule is one-way, so everything ends up Active and stops sorting; it also measures provenance not liveness (a dead agent-written plan reads Active, a plan being hand-drafted today reads Draft). Derived-from-git state also merges without conflict for teams, and needs no agent prompt surface to keep accurate |
| 2026-08-17 | Sidebar scales by memoization + lazy mounting (memoized plan rows, set trees not built/mounted until first expand, memoized Sidebar), NOT list virtualization | Keeps DOM at O(plans + expanded docs) with zero new dependencies (rule 5); virtualization only becomes worth its complexity if flat plan count itself reaches thousands |
| 2026-09-22 | **Gates 1 to 4 waived and Phase 6 (0.2.0) starts ahead of Phase 5** | Sid, 2026-09-22: "No QA. Get started." Recorded per §2 Process. GATE 6 remains |
| 2026-09-22 | Status is a stored field with four values (draft, in-progress, in-review, completed); the derived lifecycle and free tags are removed (supersedes 2026-08-16 and 2026-08-17 rows) | Plans were landing in Archived because agents called `tag_plan` with "archived" when filing a new revision, which the tool allowed. Four explicit states match how Sid tracks work; Completed is reserved for the person |
| 2026-09-22 | In progress comes from session presence (loopback server) or `set_status`; In review is set when the agent opens a PR and carries the PR link | Sid: "In review, when it's PR-ed". Presence is real, not a field someone forgets to update |
| 2026-09-22 | The app runs a loopback-only server while open; the stdio MCP server connects to it when present and falls back to files when not | Sid: comments must reach the session without copy and paste. Not a daemon under NFR-8: it lives and dies with the window and does no work idle. Filing a plan never depends on the app |
| 2026-09-22 | Plans can be authored in markdown or HTML; the mode is a setting the MCP follows through `get_standards` and the `create_plan` description | Sid: HTML is richer and easier to review, markdown is token-efficient. Both stay under one contract so history, comments and the sidecar work the same |
| 2026-09-22 | A project is the git remote of the directory the agent worked in, recorded by the agent; descriptions written by the first agent that files into it | Nothing for the person to organise (north star); a repo is what a plan is really about |
| 2026-09-22 | Comments are sent as a review: pending threads go to the session in one Send; replies inside a thread go at once; resolution records who and when | Sid asked how submission and resolution work. A reviewer writes several comments and wants the agent to take them together |
| 2026-09-22 | No accounts, no hosted sharing in 0.2.0; the Google-auth share page from the first prototype is dropped | Sid: local-first, no accounts for now. Sharing stays with the Phase 5 git remote |
| 2026-09-22 | Unslop writing rules ship in the built-in standards and in the installers' managed block, covering plan bodies and agent comment replies | Sid: the default writing style, set up as part of installing the MCP, not a skill each machine may lack |
| 2026-09-22 | `project` is normalised on write to `host/owner/repo`; text that is not a remote (a folder name, a path) is stored exactly as the agent sent it | One repo is one project however the agent read its remote. Keeping non-remote text untouched means a plan filed outside a repo still groups under something a person recognises |
| 2026-09-22 | The owner avatar is one `<img>` the webview loads and caches, not a fetch in Rust; only `github.com` remotes get one | No HTTP dependency, no cache to keep current, one request per owner. The app sets no CSP today, so nothing blocks the image; if one is ever added it has to allow `img-src` from `https://github.com` and `https://avatars.githubusercontent.com`. Other hosts serve no equivalent per-owner image |
| 2026-09-22 | Project descriptions live in `<base>/projects.json`, written by `describe_project` as an attributed commit; `create_plan` asks for one when the project has none | The description travels with the plans it describes and has its own history. Asking in the reply is the only prompt an agent needs, so nothing new has to be remembered |
| 2026-09-22 | A plan type's missing sections are a warning on the `create_plan` reply, never a refusal | A plan short of a section is still worth having on disk, and the agent can add it in the next revision. Refusing would lose the body |
| 2026-09-22 | An HTML plan carries the same frontmatter inside an HTML comment, and the file extension is the only signal | The file still opens as a page in any browser, and one parser reads both kinds. Nothing else in the contract changes, so sets, sidecars, search and history work the same |
| 2026-09-22 | The main area is one of four surfaces (board, all plans, For you, plan page) chosen by a stored `view` in `App.tsx`; the sidebar's plan tree, the loose files and the folders move into All plans | No router (§5.4), and the nav has to be the only way around. Keeping the tree means nothing that worked before is lost, and the plan page keeps its breadcrumb back to the board |
| 2026-09-22 | Open and answered threads for every plan come from one `review_summaries` command, not a `comment_threads` call per plan | "For you" needs a fact about every plan in the base. One read per base change stays event-driven (NFR-8); a call per plan is O(plans) round trips each time an agent writes |
| 2026-09-22 | A project is shown as `owner/repo` everywhere, through one `projectName` helper over the stored remote | The stored key carries the host so tools can find the repo; people read the owner and the repo. One helper keeps the board, the list, the sidebar and the plan header saying the same thing |
| 2026-09-22 | The plan page renders one markdown slice per section and offsets its source-line stamps back into body lines, rather than restyling one whole render | Section treatments need a wrapper per section, and a wrapper cannot be added to one render without moving stamped blocks. Slicing keeps every treatment as CSS over untouched markdown output, which is what §6.2b requires. Cost: link references and footnotes only resolve inside the section that defines them, and heading slugs are unique per section rather than per document |
| 2026-09-22 | A section's level is the shallowest heading left once the title heading is gone, not the most common one | Measured against the base: counting levels picks H3 on plans that are written in numbered H1 sections. The shallowest level reads H1-sectioned and H2-sectioned plans the same way |
| 2026-09-22 | The body's first H1 is the title when either title is the other's opening words, or when it is the only H1 in the body | Plans shorten the title in the file and extend it in the heading, both ways round. The lone-H1 rule catches the rest, where the alternative is a page of one section holding the whole plan |
| 2026-09-22 | A decision card wraps the whole `D<n>` run, heading and all, instead of lifting the id and the labels into a grid | The card's own label column would have to rebuild the paragraph the comments anchor to. Real plans write the labels four different ways, so the grid would fit one of them and break the rest |
| 2026-09-22 | An HTML plan's frame gets a viewport-height minimum and scrolls inside the article, rather than growing to its content | `sandbox=""` is what keeps scripts, network and forms out, and it also blocks `contentDocument`, so the height cannot be read. A fixed minimum is the honest version of the same page |
| 2026-09-22 | Comments are hidden for HTML plans, and the editor opens them as plain text | Anchors are markdown source lines (§6.2b), which an HTML page does not have. The editor package ships no HTML grammar and one is not worth adding |

---

## 10. Future considerations (explicitly not v1)

**Remote / web agents.** Agents running in the cloud (Claude Code on the web, remote
workers, CI agents) can't touch `~/OpenPlan` on your disk. The architecture already
contains the answer — don't invent a new one when the time comes:

- The base is a **git repo**, so a private remote (e.g. GitHub) is the natural
  bridge: the app gains push/pull (git2 already bundled); a remote agent clones the
  base, uses the **same CLI/MCP tools** against its clone, and pushes. The file
  contract doesn't change at all; conflicts surface as git conflicts, which the
  history UI can learn to show.
- Alternative (bigger): a hosted MCP endpoint (HTTP transport) in front of a synced
  base. Only worth it if the git-remote path proves too clunky for non-git-savvy
  users.
- Constraint to preserve until then: **nothing in v1 may assume it is the only
  writer**, and all coordination stays at the filesystem/git layer — that's what
  keeps the remote story cheap later.
