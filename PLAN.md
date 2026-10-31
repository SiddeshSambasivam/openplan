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
- **Semi-rounded edges everywhere.** Every surface uses the radius tokens (`rounded-md`,
  `rounded-lg`): rows, cards, inputs, frames, panels, popovers, active nav rows. No
  square corners. Sid, 2026-10-29.
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
| FR-8 | **`openplan` CLI + MCP server**: one binary; MCP tools `create_plan, update_plan, read_plan, list_plans, set_status, get_comments, reply_comment, resolve_comment, describe_project, get_standards`; CLI verbs mirror them. Reads the same base config the app writes. |
| FR-9 | **Agent installers**: `openplan install claude-code` (MCP registration + plugin with skill and optional ExitPlanMode hook), `openplan install codex` (`config.toml` MCP entry + AGENTS.md snippet), and `openplan install cursor` (`~/.cursor/mcp.json` entry + rules snippet). App onboarding has Connect buttons that run these and verify. |
| FR-10 | **Standards**: the house style ships **with the app**, not in the plan base — a base is plans and their history, and a copy per base would drift. Settings expose additions that layer on top, so a new build's improvements still reach someone who wrote their own rules. Served to agents via `get_standards` and summarized into the `create_plan` tool description. |
| FR-11 | **Auto-discovery import**: onboarding (re-runnable from settings) scans `~/.claude/plans/*.md` (loose markdown — verified) and best-effort `~/.codex/sessions/**/rollout-*.jsonl` (`update_plan` payloads). Shows candidates with preview; selected ones are copied into the base with synthesized frontmatter; imported hashes remembered to prevent duplicates. |
| FR-12 | **Sync & remotes**: connect the base to a GitHub/GitLab remote from settings (URL + push/pull; git2 already bundled) — this is the primary "save to my existing workflow" path. Drive/iCloud users can instead relocate the base into a synced folder (FR-1 relocation). No cloud-provider APIs. |
| FR-13 | **Agent curation**: agents keep the base tidy so it stays easy for the human to review and follow — consistent naming per STANDARDS, stale `done` plans archived, near-duplicates flagged/merged. Driven by the integration skill + explicit MCP tools (`archive_plan`, `rename_plan`); never a background process (NFR-8). Every curation action is a normal attributed commit (FR-6), so the human can always see and roll back what the janitor did. |
| FR-14 | **Settings page**: a single settings surface (Claude Code-style) for user preferences — light/dark theme, font type + font size, layout/width (compact/spaced/full) — plus the power-user items already assigned there (base location/relocation, remotes, re-run discovery). Header keeps only quick toggles; settings is canonical. Preferences persist across launches. |
| FR-16 | **Status board** (0.2.0): plans move through Draft, In progress, In review, Completed. A board view groups by status; a list view groups or sorts by status, project, or updated; "For you" lists what waits on the person (In review, or an agent's reply is the last message in an open thread they started). Completed folds away. |
| FR-17 | **Loopback server** (0.2.0): while the app is open it listens on 127.0.0.1 only. The stdio MCP server connects when it is up: it registers the session and the plan it works on (that is what "2 sessions" means and what moves a plan to In progress), and receives comments as they are sent. With the app closed everything still works against files. Not a daemon: it lives and dies with the window. |
| FR-18 | ~~**Projects**~~ (0.2.0, removed in 0.3.0 by FR-21): a project is the git remote (owner/repo) of the directory an agent filed or updated the plan from, recorded by the agent. Nothing to set up. The app groups by it, filters the board and list to it, shows the owner's GitHub avatar (fetched once, cached on disk), and a one-line description the first agent that files into it writes. |
| FR-19 | **Authoring modes** (0.2.0): a setting, markdown or HTML, that `get_standards` and the `create_plan` description follow automatically. Markdown is token-efficient; HTML gives rich, reviewable pages. Both are plans under the same contract, comments included. |
| FR-20 | **Alignment** (0.3.0): a stage between draft and in-progress. The person finishes reviewing by setting Alignment; the agent asks its questions in the harness, with a recommended option and a "Let the agent decide" option on each, and records questions and answers through `record_alignment`. `set_status` refuses in-progress until every question is answered and at least one todo exists. Mandatory for every plan type. |
| FR-21 | **Work record** (0.3.0): `.<name>.oplan-work.json` beside the plan holds repos (with branches, or a plain folder when there is no repo), the alignment, decisions, todos and PRs. Agents write it through `add_todos`, `update_todo`, `add_decisions`, `record_pr`, `set_repos`. The plan page renders todos live with who moved each one and when; `pr_body` returns the reviewer's version of the plan for the PR description. Projects (FR-18) are removed. |
| FR-22 | **Folders and archive** (0.3.0): a plan carries zero or more folders in frontmatter, set by the person; the board filters by them and shows every plan by default. Archived is a status, set by the person or by the app N days after completed (setting, default 7, checked on launch and board show, never on a timer). Harness delivery adds a Stop and a UserPromptSubmit hook for Claude Code and Cursor, and the app says after Send whether the session heard or will hear on its next keystroke. |
| FR-23 | **Rich pages and interaction** (0.3.0): LaTeX, video files inside the plan set, and `html` fences in a sandboxed frame with scripts and no network, behind a media setting served through `get_standards`. Every action has a shortcut from one registry and a tooltip showing the key. |
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
| NFR-9 | **Security**: base dir created `0700`; MCP server is stdio-only (no listening ports); zero network traffic except explicit user-initiated remote push/pull (FR-12), the owner avatar `<img>`, and reads of pull request state through the person's own `gh` CLI on plan open, a board refresh, or a plan's last session leaving (R4.5); every change attributed via git author (FR-6); history is append-only from the UI (restore commits, never rewrites). |

---

## 4. User flows

### 4.1 First-run onboarding (designed with Sid, 2026-08-16 — P3.0; built; import moved out in 0.3.0)

Two stages, both skippable. Detection runs during the hello, so the screen is
answered before it is reached. A dev-only "Replay onboarding" button in Settings
resets the flag for testing.

1. **Hello** — the wordmark rises in (staggered entrances), asks what to call
   them, and shows the agent tools found on this machine (Claude Code / Codex /
   Cursor) as Detected / Not found, pre-selected when installed.
2. **Connect** — for each selected tool: register the `openplan` MCP server and
   add the conventions block to its instruction file (managed block, its own
   text untouched). Per-step results shown; then into the app.

Importing existing plans lives in Settings > Import plans (0.3.0): it runs
discovery each time the section opens, lists each agent's loose plans and folders
that look like plans, and importing **copies** (the originals stay put). Imported
hashes are remembered, so a second import skips what is already filed.

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

**0.3.0 (FR-20 to FR-22).** `status` adds `alignment` and `archived`. Frontmatter
adds `folders` (a list) and `completed` (set with the status, drives auto-archive) and
stops writing `project` and `pr`; both are kept as unknown keys when read, and `pr` is
copied into the work record on the first agent write. Session presence no longer
changes status. The work record schema and the guarded transitions are in the filed
plan "OpenPlan 0.3.0" in the base.

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
- [x] P6.4 Loopback server in the app; MCP server registers sessions and plans,
      receives comments; session presence drives In progress and the live count
      **(T: server and client against a local port)**
- [x] P6.5 Shell: nav (Board, All plans, For you, Projects, Recent), top bar with
      the plan title and a status picker, spaced width 60rem
- [x] P6.6 Board, list and For you views; project filter; repo marks
- [x] P6.7 Rendered plan page: section-aware layout by type for markdown; HTML plans
      and HTML documents in a set rendered in a sandbox **(T: section parsing)**
- [x] P6.8 Comments as a review: threads accumulate as pending, one Send delivers
      them to the session; thread states open, answered, resolved; who resolved
      and when in the sidecar **(T)**
- [x] P6.9 Motion pass: transform and opacity only, reduced-motion guard, 60fps on
      a 2MB plan **(T: stagger cap and what a group mounted with)**
- [x] P6.10 Version 0.2.0 across `package.json`, Cargo, `tauri.conf.json`; release
- [ ] **GATE 6 — Sid manual QA & approval** (board and status flow end to end with
      a live session; comments reach the session without copy and paste; HTML and
      markdown plans; idle CPU ~0% with the loopback server up)

#### GATE 6 QA script

Run the installed 0.2.0 build against the real base, not a debug build.

1. Old plans (FR-2, P6.1). A plan whose frontmatter still says `tags: archived`
   reads Completed; every other old plan reads Draft. No tag shows anywhere.
2. Board (FR-16, P6.6). Four columns, Completed folded away until opened, counts
   matching All plans. All plans groups and sorts by status, project and updated.
3. For you (FR-16). Only what waits on you: In review, or a thread the agent
   replied to last.
4. Projects (FR-18, P6.2). Filter the board to one project. A `github.com` repo
   shows the owner's avatar, others the fallback mark, and the name reads
   `owner/repo` in the board, the list, the sidebar and the plan header.
5. Plan page (P6.5). Open a plan from a card. The breadcrumb returns to the view
   you came from. The status picker ticks the current status and only that one;
   changing it rewrites the file's frontmatter.
6. Rendered page (FR-4, P6.7). Read a real feature plan and a real bug plan:
   sections laid out by type, decision runs in cards, Mermaid still draws.
7. HTML plan (FR-19). Set authoring to HTML, have an agent file one, open it. It
   renders in the frame and scrolls inside the article.
8. Live session (FR-17, P6.4). Have a Claude Code session read a draft plan. The
   top bar reads "1 session" and the plan moves to In progress. End the session:
   the count goes, the status stays.
9. Review (FR-5, P6.8). Two comments on that plan, so the panel reads "Send
   review (2)". Send, and the session picks them up on its next tool call.
10. Threads (P6.8). The agent replies in both, which reads as answered. Resolve
    one from the app and one from the agent; each says who closed it.
11. Reduced motion (NFR-2, P6.9). Turn on Reduce Motion in macOS Accessibility.
    Views and cards appear at once, with no stagger and no hold.
12. 720x480 and both themes (NFR-1). Nothing clips or scrolls sideways, the nav
    and the picker still work, and no surface keeps the old palette after a toggle.
13. Idle cost (NFR-8). App open, a session connected, nothing happening: watch
    OpenPlan in Activity Monitor for a minute. CPU should sit near 0%.

Known and decided, not bugs: HTML plans carry no comments, because anchors are
markdown source lines; and a comment reaches the agent on its next tool call
rather than at once, because MCP gives a server no way to speak first.

### Phase 7 — 0.3.0: alignment, work record, folders, rich pages
Entity model agreed with Sid 2026-10-28. Specification and decisions D1 to D13: the
filed plan "OpenPlan 0.3.0" in the base. Started 2026-10-28 on Sid's recorded GATE 6 waiver (§9).
- [x] P7.1 Contract: `Status` gains alignment and archived; frontmatter gains
      `folders` and `completed`, stops writing `project` and `pr`; legacy reads **(T)**
- [x] P7.2 Work record: schema, atomic read-modify-write under the base lock,
      `pr` migrated on first write **(T)**
- [x] P7.3 MCP: `update_plan`, `record_alignment`, `add_decisions`, `add_todos`,
      `update_todo`, `record_pr`, `pr_body`, `set_repos`; `create_plan` takes
      `repos`; guards on `set_status`; presence no longer sets status **(T)**
- [x] P7.4 Delete projects: `project.rs`, `projects.json`, `describe_project`,
      `list_projects`, avatars, project filter; folders replace them in every view
- [x] P7.5 Plan page: alignment Q&A, decision cards, live todo checklist, repos and
      PRs block; board card progress **(T: record parsing and progress)**
- [x] P7.6 Align event through the loopback server; the picker's Alignment entry;
      the delivery line after Send; auto-archive on launch and board show with the
      days setting **(T)**
- [x] P7.7 Installers: Claude Code and Cursor Stop and UserPromptSubmit hooks,
      `openplan pending`, managed block text **(T)**
- [x] P7.8 Standards: question bank per type, alignment procedure, media rule,
      confirmation-on-merge rule
- [x] P7.9 Rendering: LaTeX, video, sandboxed `html` fences with the height message,
      the media setting **(T: fence extraction and CSP)**
- [x] P7.10 Onboarding without the import step; version 0.3.0
- [x] P7.11 Shortcut registry feeding keys, `kbd` tooltips and a command palette on
      shadcn `command`; the `?` shortcut sheet; measured on the 2MB plan **(T)**
- [x] P7.12 Shell: Linear-style navbar with open, minimized and hidden modes
      (`cmd+b` open or hidden, `cmd+shift+b` minimized, edge hover reveals it when
      hidden); labelled sections (Views, Folders, Recent); a basic Folders section;
      an empty state instead of the welcome document; Inter as the body typeface,
      vendored **(T: mode cycling and the sections' pure helpers)**
- [ ] **GATE 7 — Sid manual QA & approval** (draft to alignment in Claude Code
      desktop; todos moving live; a PR recorded with the plan in its body; folders
      and archive; video and LaTeX; every action by shortcut with the key in its
      tooltip; idle CPU ~0%)

#### GATE 7 findings, round 1 (Sid, 2026-10-29)
- [x] R1.1 Plan page: Alignment gets its own tab; todos move to a panel beside the
      content; a back button returns to where the plan was opened from
- [x] R1.2 Standards: no "Status, Owner, Repo" header line in the body; the
      frontmatter and the work record carry it
- [x] R1.3 Navbar: two modes only, expanded and minimized, with a smooth transition;
      the toggle morphs over the OpenPlan mark on hover; no new-plan button; the
      wordmark in EB Garamond, no name or base line
- [x] R1.4 Cards show repos; a Display menu on the board picks which attributes a
      card shows, persisted
- [x] R1.5 Settings: an app font size separate from the plan text size; the default
      app text one step smaller
- [x] R1.6 Segmented tabs: the selected item keeps its background on hover in dark mode
- [x] R1.7 Video: confirm playback in the desktop app (the media setting was turned
      on after the app had launched); standards ask for Remotion explainers in a
      clean, minimal, Apple-like style with smooth motion
- [x] R1.8 Cards: a Display option clamps the title to two lines
- [x] R1.9 Cards: a plan filed in the last few minutes carries a "New" tag
- [x] R1.10 Navbar: the macOS traffic lights no longer overlap the minimized rail or
      the top bar's first control
- [x] R1.11 Folders: a "+" on the navbar's Folders section creates one; empty folders
      live in the base's `openplan.json` and the navbar lists the union with frontmatter
- [x] R1.12 Navbar: `cmd+shift+[` and `cmd+shift+]` step through the navbar rows

#### GATE 7 findings, round 2 (Sid, 2026-10-29)
- [x] R2.1 Plans can be selected by dragging a box over them, and archived in bulk
- [x] R2.2 The webview's own context menu (with Reload) never shows; plans get an
      app context menu instead
- [x] R2.3 A plan can be deleted, alone or in bulk, behind a two-step confirmation
- [x] R2.4 Minimized navbar: the top bar spans the full width above the rail, so the
      traffic lights sit in the top bar and nothing crowds them
- [x] R2.5 Every clickable control shows the pointer cursor
- [x] R2.6 Pull request state has its own icon: open, draft, merged, closed, and none
- [x] R2.7 Alignment questions carry more detail: why the question matters, what the
      agent found, and each option's trade-off
- [x] R2.8 Profile: one profile, the app's existing identity, shown as a generated
      avatar at the bottom of the navbar; its menu holds Settings, the theme switch
      and the shortcut list; the theme toggle leaves the top bar

#### GATE 7 findings, round 3 (Sid, 2026-10-29)
- [x] R3.1 Minimized navbar: the gaps around the section dividers are too large
- [x] R3.2 A board with no plans in its open columns shows the animated empty state
- [x] R3.3 Profile: the person sets a picture, a display name and an email

#### GATE 7 findings, round 4 (Sid, 2026-10-30)
Specification and answers q1 to q17: the filed plan "Ask alignment questions during
review, slim the todo panel, and drop dead sessions (GATE 7 round 4)". Work lands on
main with no PRs (q10).
- [x] R4.1 Alignment runs alongside review: the first sent review moves a draft to
      alignment, `record_alignment` merges rounds by question id, and a Build button
      sends a `Build` event that carries unsent comments
- [x] R4.2 Questions come from four personas (product owner, tech lead, designer,
      on-call) with vendored avatars, go easy to hard, always offer options with one
      recommendation, and cover errors, edge cases and scale; no "Accept all" or
      "Let the agent decide"
- [x] R4.3 Todos have a one-line title and a detail; a row opens its detail with a
      slide; the panel minimizes to a rail on its edge; old todos split on the first
      sentence
- [x] R4.4 A `github.com` repo shows its owner's avatar
- [x] R4.5 The app reads unmerged PRs with `gh` on plan open, when the last session
      leaves, and from a board refresh button; "All PRs merged. Mark completed?"
- [x] R4.6 A session whose process dies mid-poll leaves the session list at once
- [x] R4.7 A sent review or Build wakes an idle Claude Code session through its inbox
      socket, with a fallback line and a setting
- [x] R4.8 Agents post questions with `ask_questions`; the person answers on the
      Alignment tab; questions carry illustrations; cards show pending counts
- [x] R4.9 The Alignment tab reads as a group chat: Mila, Theo, Iris and Kai are
      matte 3D blob personas that blink and turn their heads, one tab per persona,
      replies queue and go out together, and an alignment score (80 for coverage, 20
      for reasoning) never gates Build
- [x] R4.10 Alignment tab polish (Sid, 2026-10-31): the app's type scale; only the
      thread scrolls, with a hidden scrollbar and up and down arrows; the score row at
      the top with its areas in a popover; the people rail on the left, hidden by
      default, sliding in and out; short round dividers; a chat composer where picking
      an option is the answer, "Answered 2/3", and one Send for every answer
- [x] R4.11 Plan and Alignment are full-height square tabs at the top of the plan
      area; the work panel shows on the Plan tab only; `mod+alt+arrowleft` and
      `mod+alt+arrowright` step between the tabs, and each tab's tooltip shows its key
- [x] R4.12 An "Alignment target" setting, 80 by default and 0 for none: the score
      card reads "Below your 80% target" and the Build tooltip names the gap, but Build
      always works

Round 4 QA, on a release build with Claude Code connected:
1. Kill a session's `openplan mcp` process: its plan's session count drops at once.
   Archive a Claude Code desktop session: check whether the count drops too (t2).
2. File a plan, send one review: it moves from Draft to Alignment. The agent posts
   one to three questions and ends its turn. Answer on the Alignment tab and send:
   an idle session starts a turn by itself and the top bar reads "Agent woken."
3. Personas blink, turn and hop. Blur the window: Activity Monitor shows the app
   near 0% CPU. Reduced motion stills them.
4. The score rises as you reply and rises more with a written reason. Build works
   below 100 and its tooltip names the open areas.
5. Press Build with an unsent comment: the agent answers it, asks what is left,
   then moves the plan to In progress.
6. Todos show one line each, open their detail with a slide, and the panel folds to
   a rail with `mod+shift+t`.
7. A `github.com` repo shows its owner's avatar. Merge a recorded PR on GitHub,
   press Refresh on the board: "All PRs merged." and "Mark completed?" appear.

#### GATE 7 findings, round 5 (Sid, 2026-10-31)
Specification and answers q1 to q6: the filed plan "Make the alignment score only
rise, gate Build on the target, and bring the person to new questions". Work lands
on main with no PRs (q6).
- [x] R5.1 The score only rises: coverage counts the required areas from the start
      plus every settled area, and each answer with a reason gives 5 points, up to 20
- [x] R5.2 Build is disabled below the alignment target (80 by default, 0 for none),
      and its tooltip names the score, the target and any required area not asked
- [x] R5.3 Every question with options ends with "Write my own", which focuses the
      composer for a free-text answer
- [x] R5.4 The standards and `ask_questions` tell agents to aim for 100 and settle
      edge cases, error handling and scale
- [x] R5.5 New questions on the open plan switch it to the Alignment tab, and a
      window in the background requests attention once until it is focused

Round 5 QA, on a release build with Claude Code connected:
1. Answer round one of a new plan: the score reads 40 or so, not 80. A second
   round arrives: the score holds. Answer it: the score rises.
2. Below 80, Build is greyed out and its tooltip reads "Align with the agent first.
   Alignment is 67%, and Build opens at 80%." `mod+shift+enter` does nothing. Set the
   target to 0 in Settings: Build works.
3. Every question with options shows "Write my own" last. Pick it, type, press
   Enter: the reply shows as your own words.
4. With the plan open on its Plan tab, have the agent post a round: the app
   switches to the Alignment tab. With another app in front, have two sessions
   post rounds: the Dock icon bounces once. Click OpenPlan, then post again from
   the background: it bounces once more.
5. Idle cost (NFR-8): with the window in the background and nothing posting, CPU
   stays near 0%.

#### GATE 7 QA script

Run a release build of 0.3.0 against the real base, with Claude Code connected
through `openplan install claude-code` (which now writes the two hooks).

1. First launch (P7.10, P7.12). Reset onboarding from Settings. Hello then Connect,
   no import step. The app lands on the empty state, "No plan open". Settings >
   Import plans lists what discovery finds and imports a copy.
2. Shell (P7.12). `cmd+b` hides and shows the navbar, `cmd+shift+b` gives the icon
   rail with tooltips. Hidden mode: resting the pointer on the left edge reveals the
   navbar as an overlay, which leaves with the pointer. Sections fold and stay
   folded after a relaunch. The body typeface is Inter, the wordmark EB Garamond.
   Every surface has rounded corners.
3. Board (P7.1, P7.4). Columns Draft, Alignment, In progress, In review, then one
   Hidden control that opens into Completed and Archived. The folder filter lists
   every folder. A card's folder picker adds a folder, and the Folders section in
   the navbar shows it. Hovering a card lifts it without clipping its top edge.
4. Draft to alignment (P7.3, P7.6, P7.7). Have Claude Code file a plan and revise
   it with `update_plan` (no duplicate plan appears). Set Alignment from the
   picker. The top bar reads "Delivered to 1 session." The session asks its
   questions with AskUserQuestion, the first being "Accept all N recommendations".
   Answer, and the session calls `record_alignment`, `add_todos` and `set_status`.
   The plan moves to In progress and the page shows the Q&A and the todos.
5. Guards (P7.3). In the session, ask it to call `set_status in-progress` on a draft
   plan without alignment: the server refuses with a reason that names
   `record_alignment`. Ask it to set In review with a todo open: refused, listing
   the todo.
6. Live todos (P7.5). While the session works, `update_todo` moves items and the
   checklist updates with who and when. The board card reads `n/m` with a bar.
   Adding a todo to an In review plan moves it back to In progress.
7. Hooks (P7.7). Send a review while the session is idle. The top bar reads
   "Waiting for the session. Type anything in it to deliver." Type anything in
   the session: the comments arrive as context before the agent answers. Send a
   review while the agent is mid-turn: the Stop hook keeps it going and it calls
   `get_comments` on its own.
8. PRs (P7.3, P7.6). The session calls `pr_body`, opens a PR with that text, and
   `record_pr`. The plan page shows the PR with its badges. Report it merged
   through `record_pr`: the top bar offers "Mark completed", one click sets it, and
   `completed` is written to the frontmatter.
9. Archive (P7.6). Set "Archive completed plans after" to 0 days, relaunch: nothing
   archives. Set 1 day, change a completed plan's `completed` to two days ago,
   open the board: it moves to Archived with one `archive: 1 plan` commit by
   `openplan`.
10. Rendering (P7.9). A plan with `$$E = mc^2$$` inline, a `$$` block, "$5 to $10"
    in prose, a `media/clip.mp4` video and an `html` fence with a button that
    changes its own text. With Media off, the fence shows as code and the video as
    a link. With Media on, all render, the price stays text, a `fetch` in the
    fence fails, and the frame cannot navigate away.
11. Shortcuts (P7.11). `?` lists every binding. `cmd+k` opens the palette, finds a
    plan by a fuzzy title and opens it. Every action button shows its key in its
    tooltip. `cmd+1` to `cmd+4`, `[` and `]`, `cmd+shift+a`, `cmd+shift+s` and
    `cmd+enter` do what the sheet says. None fire while typing in a field, except
    `cmd+e` and `cmd+s` from the editor. Check `cmd+h` in the real window: Tauri's
    default macOS menu may take ⌘H to hide the app before the page sees it.
12. 720x480 and both themes (NFR-1). Nothing clips or scrolls sideways; the navbar
    floats below 900px; the switch in settings is legible in dark mode.
13. Idle cost (NFR-8). App open, a session connected, nothing happening: CPU near
    0% for a minute in Activity Monitor. Entering the board with no stale plans
    writes no commit.

Known and decided, not bugs: an idle session hears about a review on its next
keystroke, not at once (D11, superseded 2026-10-31 by the inbox wake-up); record decisions render as plain text; only the
upright Inter face is vendored, so italics are synthesised.

### Phase 8 — 0.6.0: builds on S3 and updates in the app
Specification and decisions q1 to q6: the filed plan "Ship OpenPlan builds from S3 and
update the app in place". Started 2026-10-31 on Sid's recorded GATE 7 waiver (§9).
- [ ] P8.1 Updater key pair in GitHub secrets and the password manager (Sid)
- [ ] P8.2 AWS: private bucket, CloudFront with origin access control, GitHub OIDC
      role, monthly budget alarm; the commands and the host recorded here
- [ ] P8.3 `latest.json` from the `.sig` files and the host **(T)**
- [ ] P8.4 CI: updater artifacts, signing secrets, a `publish` job that uploads
      `releases/<version>/` and then `latest.json`
- [ ] P8.5 Updater and process plugins, endpoint and public key, `checkUpdates`
      setting **(T)**
- [ ] P8.6 Settings > Updates, the top bar notice, the package-install hint, the
      unsaved-edits guard; checks at launch and on focus after 24 hours **(T)**
- [ ] P8.7 Release 0.6.0 by hand, then update it to 0.6.1 on each platform
- [ ] **GATE 8 — Sid manual QA & approval** (0.6.0 updates to 0.6.1 on macOS,
      Windows with a live agent session, and Linux AppImage; a `.deb` copy shows the
      download hint; idle CPU ~0%)

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
| 2026-08-15 | The wordmark uses EB Garamond, with no icon | Sid's call; fonts vendored into `public/fonts` |
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
| 2026-08-16 | Renaming a set document keeps its numeric prefix unless the new name starts with digits; the entry document (README/00-*) refuses rename and points at the plan row | The prefix is the set's reading order and must survive casual renames; the entry file IS the plan's identity, so renaming it goes through `rename_plan` |
| 2026-08-17 | A dev build is a separate profile: `~/.openplan-dev`, its own settings file, an `openplan-dev` MCP server, and its own managed block in CLAUDE.md/AGENTS.md. Keyed off `debug_assertions`, not an environment variable | Working on OpenPlan must never disturb the plans kept in it (a dev reset already wiped a real base once). An agent spawns the CLI itself, so a variable exported in a shell would not reach it, but a debug binary stays a debug binary wherever it runs |
| 2026-08-17 | Comments carry `authorName` (the person who typed it, unset for agents) and `authorEmail` (whose base it was written against) beside the existing role token | The token drives the icon and the MCP contract, so it stays; identity is added rather than substituted. Agents keep their tool name because that is who wrote the words, while the email says whose machine it ran on |
| 2026-08-17 | Author identity resolves settings → git config → anonymous fallback; agents keep their tool name and carry the person's email | Multi-teammate is near-term and restore never rewrites history, so every commit written as the literal `user` would stay ambiguous forever. Email tells people apart, name says which actor moved it |
| 2026-08-17 | Agents must answer every open comment thread with `reply_comment`, in the thread, in one or two lines | A review answered only in chat leaves teammates no record; long replies bury the decision. Enforced in the managed CLAUDE.md/AGENTS.md block and the MCP tool descriptions |
| 2026-08-17 (later, supersedes the row below) | Lifecycle reinstated as draft / active / archived, **derived** rather than stored, sitting alongside free tags | Sid's call. The north star already promised "living work artifacts with a lifecycle (draft → done)", so the plan was ahead of the data model. Deriving it answers the staleness objection that killed the old status field, and counting a plan's `source` as agent work (not just commit authors) fixes the import false-negative. Free tags stay for subject matter; `archived` remains the one declared state |
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
| 2026-09-22 | The loopback server is plain HTTP/1.1 over `std::net`, hand-rolled, with no new dependency | The whole surface is five routes and one-line JSON bodies. A server crate would bring an async runtime the app does not otherwise have, for code that fits in one file |
| 2026-09-22 | The server and its client live in `openplan-core`, not in the Tauri layer; the app only starts it and exposes two commands | The CLI's real-binary test can then run an actual server in process, which is the only way to prove the two halves agree. It also keeps the file contract and the live channel in the same crate |
| 2026-09-22 | The app advertises itself in `app.json` beside the settings file, holding the port and the pid; the file is removed on exit | Per profile, so a dev build and an installed one never find each other. Written where both halves already agree to look, so no second lookup rule exists |
| 2026-09-22 | The client's liveness test is the handshake, not the pid; the pid is recorded for whoever reads the file | Checking a pid from std alone is not portable, and a reply that parses as our session id is the stronger check anyway: it fails a live app whose server is gone, and a port some other program recycled |
| 2026-09-22 | Session presence is in memory only, and a session that vanishes is dropped when its held-open socket fails or, failing that, on the next request past a generous idle limit | Nothing about who is working now survives a restart, so there is nothing to persist. A timer thread to expire sessions would be exactly the periodic wake NFR-8 forbids |
| 2026-09-22 | A session registers a plan through `read_plan`, `get_comments` or `set_status`, never `create_plan` | Filing a plan is not working on it. A plan stays a draft until somebody opens it, which is what makes In progress mean something |
| 2026-09-22 | MCP has no server-initiated conversation message, so a comment reaches the agent on the next tool result; a Claude Code hook can deliver it sooner later if that proves too slow | The protocol gives a server no way to speak first. The next tool call is the earliest guaranteed moment, and it needs nothing installed. A hook is per-client work worth doing only if the wait is felt |
| 2026-09-22 | NFR-9's "no listening ports" continues to bind the MCP server; the port belongs to the app window | The stdio server still listens on nothing. The app binds loopback only, for as long as its window is open, which is the reading FR-17 already states |
| 2026-09-22 | The base is resolved once in the app's setup and handed to everything that needs it | Resolving it commits the base, so two callers resolving it for themselves race on git's index lock and one of them silently gives up. Found with the app running, not in tests |
| 2026-09-22 | Test fixtures name their temp directory per process | Every checkout on a machine shares one temp directory, so a fixed name lets one run delete another run's base while it is being used. That is what the intermittent failures across the suite were |
| 2026-09-22 | A pending thread is written to the sidecar immediately and committed only when the review is sent | NFR-3 is about the text surviving, and a write does that. The commit is what publishes it, so it belongs to the send, which also gives the review one recognisable entry in the log instead of one per comment |
| 2026-09-22 | Pending threads are filtered out at every point an agent could read them, not hidden behind a flag the caller passes | `format_for_agent`, the review counts and the loopback send each drop them on their own, so a new reader cannot forget to. Naming a pending thread in a send does not send it either |
| 2026-09-22 | "Copy for agents" leaves pending threads out too | It produces the same review text the MCP server serves. One rule about what has been sent is easier to hold than two, and the Send button sits in the same panel |
| 2026-09-22 | Thread state is derived from the comments, not stored | `resolved` plus the last comment's author already answer it, and a stored state would be a second copy to keep true. Both sides derive it with the same rule, and the agent export prints it |
| 2026-09-22 | Reopening clears `resolvedBy` and `resolvedAt` rather than keeping them as history | The sidecar says where a thread stands now; git says how it got there. Keeping a stale name on a reopened thread would read as though somebody closed it again |
| 2026-09-22 | The review's commit message singularises: `review: <id> (1 thread)` | Every other message in §6.4 reads as English. A permanent log saying "1 threads" is the kind of thing nobody goes back to fix |
| 2026-09-22 | The send result is one transient line in the top bar, not a new toast system | It is the only thing in the app that needs saying after an action. A toast library, or a hand-rolled one, would be more machinery than the one message justifies |
| 2026-09-22 | A view's entrance rides on the element the view switch mounts, with no animation key | Mounting is already the event we want: switching views mounts a new element and replays the rise, while a write behind the view only re-renders it. A key would be a second source of truth for the same thing |
| 2026-09-22 | A group staggers only what it mounted with; anything that arrives later fades where it stands | An agent writes whenever it likes. Re-staggering a board on every `base-changed` is the jank NFR-2 forbids, and a new card that moved its siblings would lose the reader's place |
| 2026-09-22 | Entrances fill backwards, never forwards or both | A held final frame wins over every later declaration in the cascade, so a card with a forwards fill can never lift on hover again. Backwards covers the stagger delay and then gets out of the way |
| 2026-09-22 | The reduced-motion guard stills delays as well as durations | A stilled animation that keeps its delay still holds the item back, invisible, for the length of the stagger. That is the wait the setting exists to remove |
| 2026-09-22 | The status glyph beats only where it stands for the open plan, and the picker is keyed to that plan | A glyph in a list is a fact, not an event. Keying the picker to the plan keeps opening another plan from reading as a change of status |
| 2026-09-22 | Resolving the base no longer commits it: the catch-up commit runs once in the app's setup and then on the watcher's word, and commands take the base from Tauri's managed state (implements the 2026-09-22 row above) | Every launch logged two unhandled rejections, the index is locked and a failed lockfile rename, because five commands resolved the base in parallel at first paint. A read has no business taking git's index lock. The state holds no lock because nothing relocates the base at runtime; a relocation path would have to put one there |
| 2026-09-22 | A comment sidecar is a change the interface re-reads but never one the watcher records | A pending thread is written to the sidecar at once and committed when its review is sent. Recording it on sight would publish it early and leave the review's own entry with nothing to commit |
| 2026-09-22 | Each atomic write names its own temp file, by process and a counter, rather than one name per target | Two writers to one file shared the temp name, so the first rename left the second with nothing to rename and the write failed with an error about a missing folder. Found by the test for the launch race |
| 2026-09-22 | The idle CPU burn (NFR-8) was the same defect, not an animation: resolving the base per command also set the base directory's permissions, which the watcher saw, which refreshed the interface, which resolved the base again | Measured on the release build against a 50-plan base: 24% CPU by `top` and 40% of a core by accounting, with the git index rewritten about once a second and a new display-link thread every third of a second. Resolving once leaves it at 0.0%, and the scan work grows with the base, which is why a small base only showed a few percent |
| 2026-10-28 | **0.3.0 entity model**: the plan stays the one entity; a work record sidecar holds repos, alignment, decisions, todos and PRs; projects are removed, folders group plans and repos belong to a plan | Sid: keep it simple, the plan is fundamental, folders are grouping, repos attach to the plan. Items need stable ids, timestamps and an author, which a body checklist cannot carry |
| 2026-10-28 | Alignment is a mandatory stage between draft and in-progress. The person opens it from the picker, the agent asks in the harness's own question UI and records the answers through MCP; `set_status` refuses in-progress until every question is answered and a todo exists | Sid: the onus of alignment is on the agent, and it should take under 15 minutes. The harness already has a question UI, so the app only renders the record |
| 2026-10-28 | Session presence no longer changes status (supersedes the 2026-09-22 presence row); every transition is an explicit, guarded call | Presence would skip alignment. The session count still shows who is live |
| 2026-10-28 | Archived is a status, with auto-archive N days after completed (default 7) checked on launch and board show, never on a timer | Sid: it marks work nobody needs to think about again. A timer is the periodic wake NFR-8 forbids |
| 2026-10-28 | Completed stays the person's; the app offers it when every recorded PR reads merged, and the managed block tells the agent to ask for confirmation | PR state is reported by the agent, not verified by the app, which makes no network calls |
| 2026-10-28 | Scripts run inside `html` fences in a frame with `allow-scripts`, an opaque origin and a no-network CSP; video is a file in the plan set, rendered by Remotion in the agent's workspace | Sid wants short videos that show how something works. A file plays with no scripts and in any viewer; the sandbox covers the interactive pieces. IPC isolation to be verified per webview |
| 2026-10-28 | Hooks: Stop and UserPromptSubmit for Claude Code and Cursor, next tool call for Codex, and the app says after Send which case applies | No harness wakes an idle interactive session from outside. Saying so beats pretending |
| 2026-10-28 | `update_plan` is added | The draft stage is iteration. Without it agents file duplicates, which is where the base's v2 and v3 plans came from |
| 2026-10-28 | One shortcut registry feeds every key, its `kbd` tooltip and the command palette | Sid: a shortcut and a tooltip with the key on every action. A key defined in two places drifts |
| 2026-10-28 | **GATE 6 waived and Phase 7 (0.3.0) starts** | Sid, 2026-10-28: "Gate waived", after the rule was pointed out. Recorded per §2 Process. GATE 7 remains |
| 2026-10-28 | Inline math is `$$x$$` on one line, never a single dollar pair | Plans quote prices ("$5 to $10"), and `remark-math`'s default would render the text between them as a formula |
| 2026-10-28 | KaTeX runs after `rehype-sanitize`, like the highlighter, and the app page carries `frame-src 'none'` | Allowing `style` on spans for KaTeX would let any raw HTML carry inline styles. A fence script could navigate its own frame to a web page, which the frame's CSP does not cover; the page directive blocks it and `srcdoc` frames still load |
| 2026-10-28 | An agent may set `alignment` only from draft; from any later status the person reopens it from the app | Reopening is the person's call, and the picker is where they make it |
| 2026-10-28 | Frontmatter block lists are rewritten as flow lists, and `tags:` reads through the same list parser | The parser folded block lists under an empty key, so an unknown block list used to vanish on rewrite |
| 2026-10-28 | Folder names are trimmed, whitespace collapsed, and `, [ ] { } " ' : #` dropped; matching ignores case | They are written as a YAML flow list, and the picker warns while typing rather than quoting |
| 2026-10-28 | Completed and Archived sit folded in one rail at the end of the board, open per visit; the "Hide completed" toggle is gone | Two folded groups replaced one hidden one, and a rail keeps four open columns at 1280px |
| 2026-10-28 | The shell is a Linear-style navbar with three modes, open, minimized (icon rail) and hidden (full screen), with `cmd+b` toggling open and hidden and `cmd+shift+b` the rail; sections carry labels; folders are a plain list in the navbar | Sid, with Linear screenshots: labelled sections, a basic folder system, full screen and minimized modes, `cmd+b` for the navbar |
| 2026-10-28 | The main area opens on an empty state, not the welcome document | Sid: empty state by default. The welcome document is removed from the app, the browser demo keeps an inline sample |
| 2026-10-28 | Body typeface is Inter (variable, vendored in `public/fonts`, OFL) with Linear's feature settings; the wordmark keeps EB Garamond | Sid asked for a typeface that reads as premium. Inter is what the reference screenshots use, and vendoring keeps the app offline (NFR-5) |
| 2026-10-28 | The shell step runs after the align flow and before the shortcut pass | The tooltip and shortcut audit has to cover the final navbar, and both steps rewrite `App.tsx` |
| 2026-10-29 | The import UI moved into Settings > Import plans rather than being deleted with the onboarding stage | PLAN.md said settings re-runs discovery, but settings never had it; without the move a release build had no way to import |
| 2026-10-29 | The work record is re-read on every `base-changed`, like comments; record decisions render as plain text in the existing decision card | The event carries no paths, and markdown output would carry source stamps that misplace comment anchors |
| 2026-10-29 | Every tool that takes a plan id registers the session on it, `create_plan` included (supersedes the 2026-09-22 "never `create_plan`" row) | Presence no longer sets status, so registering on filing costs nothing, and without it the align event and the review never reach the session that filed the plan |
| 2026-10-29 | A session keeps the events its agent has not seen: `/pending` lists them without consuming, and the MCP server acknowledges with `/heard` once a tool result carried them | The MCP server holds a poll open, so a plain non-consuming route would almost always be empty by the time a hook asked |
| 2026-10-29 | Hooks: Claude Code gets `Stop` (`{"decision":"block","reason"}`) and `UserPromptSubmit` (plain stdout as context); Cursor gets `stop` only (`followup_message`); `openplan pending --format stop` prints nothing when a stop hook already continued the turn | Read from the two vendors' hook documentation on 2026-10-29. Cursor's `beforeSubmitPrompt` can only block a prompt. The guard prevents a Stop hook loop |
| 2026-10-29 | Our hook entries are identified by their exact command string; reinstall replaces them and nothing else in the person's settings is touched, with key order preserved (`serde_json` `preserve_order`) | A settings file other tools own is rewritten only inside our own entries, as the 2026-08-16 managed-block row requires |
| 2026-10-29 | Auto-archive runs on launch and on entering the board, commits once as `openplan <openplan@openplan.local>`, and counts a pre-0.3.0 completed plan's age from `updated` | No timer (NFR-8). The app is a writer of its own here, not the person. Without the fallback every 0.2.0 completed plan would stay in Completed forever |
| 2026-10-29 | The picker shows In progress and In review disabled with "The agent moves it here"; the person's moves are draft, alignment, completed and archived | The guards live in the server, and the person's path to in-progress is answering alignment, not the picker |
| 2026-10-29 | Below 900px the open navbar floats over the main area and `cmd+b` shows or hides the panel without changing the stored mode; the rail still takes its 48px column | The §2 breakpoint, applied to the navbar. A wide-screen preference survives a small window |
| 2026-10-29 | The welcome document is gone from the app and the browser demo alike (supersedes the "browser demo keeps an inline sample" note in the empty-state row); a stored welcome entry from an older build is dropped on load | `pnpm dev` works with the empty state and drag-drop, so a sample was code with no reader |
| 2026-10-29 | Navbar section labels are small, muted, sentence case with a chevron; one accent on the current view row, a folder filter in force shows as medium weight with an open-folder icon | Matches the Linear reference, and a filtered board never shows two accents |
| 2026-10-29 | The navbar column never animates `width`; mode changes land in one frame and only the floating panel moves, with transform. `BoardView` is memoized | Width is a layout property (NFR-2). Toggling the navbar re-rendered the board for about 16ms with 60 plans, 0 after memoizing |
| 2026-10-29 | The empty state is a continuous scene (sheets falling into a tray on 7.3s, 9.7s and 12.1s clocks, a breathing tray, a swelling halo), transform and opacity only, paused whenever the window is hidden or unfocused | Sid: a looping animation that does not read as a loop, like GitHub's error page. Durations that share no factor line up only once in minutes. Pausing off-focus keeps the idle budget (NFR-8), and the reduced-motion guard stills it |
| 2026-10-29 | One shortcut registry (`src/lib/shortcuts.ts`) binds every key through one listener; keys never fire while typing except Escape, `mod+e` and `mod+s`; an action with no handler in the current state passes the key through | `mod+e` has to leave the editor and `mod+s` save from it; passing through is how `mod+f` still reaches CodeMirror's own find while editing |
| 2026-10-29 | One Escape handler closes the app's panels topmost first (find, history, comments, floating outline, revealed navbar); menus and dialogs close themselves and a handled event is skipped | Separate Escape listeners per panel closed two things at once |
| 2026-10-29 | The command palette is shadcn `command` on `cmdk` (the one new dependency, for its fuzzy filter); it lists five recent plans untyped and the top 20 title matches typed, plus content matches from the on-demand search; it and the shortcut sheet mount only while open | Mounting every plan made opening the palette grow with the base (NFR-1); the overlays re-render only themselves |
| 2026-10-29 | Tooltips with keys go on every icon and action button; rows that open a plan, breadcrumbs, section toggles and inline form buttons carry none | A tooltip on a list row says what the row already says |
| 2026-10-29 | The asset protocol scope sets `requireLiteralLeadingDot: false` | The base is `~/.openplan`, a dot-directory, and Tauri's `**` does not match one on Unix by default, so every local image and video under the base was refused (found at GATE 7: the video showed WebKit's cannot-play glyph and an image beside it broke the same way) |
| 2026-10-29 | App text size is a root token (`--app-font-size`, 12, 13 or 14px, default 13) that redefines Tailwind's text-xs to text-lg at their usual ratios; the plan body keeps its own px size | Sid: app text one step smaller, and a size apart from the plan text. Scaling `html` would have shrunk rem spacing and the plan's reading width too |
| 2026-10-29 | Card attributes come from a Display menu on the board, stored in localStorage; list and For you rows read the same options except the two-line clamp | Sid: toggle what a card shows, clamp the title to two lines. Rows are always one line |
| 2026-10-29 | A plan filed in the last 10 minutes carries a New badge, cleared by one timeout armed to the earliest expiry and re-armed on change, never an interval | Sid: spot what just arrived. One timeout per change is not the periodic wake NFR-8 forbids |
| 2026-10-29 | The plan page has Plan and Alignment tabs; the todos, repos and PRs sit in a panel beside the content when the main area is 860px or wider, and float from a "Work" toggle below that | Sid: a dedicated alignment tab, todos adjacent to the content. The panel threshold is main-area width, not the window breakpoint, so an open navbar does not squeeze the text |
| 2026-10-29 | A back control replaces the breadcrumb: opening from a view or the palette starts the trail, opening a plan from a plan stacks it, leaving for a view clears it; back to Search reopens the palette with the query; scroll positions of a left view are restored | Sid: a way back to where the plan was entered from. Restoring scroll costs one DOM walk per navigation |
| 2026-10-29 | **Exception to the transform-and-opacity rule:** the navbar column transitions `width` over 180ms ease-out with `will-change: width`, and the top bar's leading gap moves on the same curve; labels fade. Nothing else animates layout | Sid asked for a smooth transition between the two modes, and a translate cannot push the content. Measured: the board stays under a frame (production, 60 plans); a 2 MB plan costs 15 to 17ms a frame, one frame at 60Hz, what a window resize costs. Accepted. Virtualizing the preview is the only way down and is not worth it for a 180ms transition |
| 2026-10-29 | The navbar has two modes, expanded and minimized, with `cmd+b`; hidden mode, the edge reveal and `cmd+shift+b` are gone. The collapse chevron sits at the right end of the expanded top row, and only in minimized mode does the mark morph into the expand chevron | Sid, 2026-10-29, in three notes. A single thin chevron, not the panel box |
| 2026-10-29 | ~~On macOS the navbar keeps a 36px spacer above the mark in both modes, and in minimized mode the top bar's content starts at x 84~~ (superseded by the full-width top bar row below) | The traffic lights overlapped the rail and the top bar's first control (R1.10). A spacer that changed with the mode would jump the rows during the transition |
| 2026-10-29 | Folders the person creates live in the base's `openplan.json` `folders` list; the navbar and the pickers show the union with frontmatter; removing drops the list entry only | A folder with no plans has no frontmatter to live in. Plans keep their own folders, so one still in use reappears |
| 2026-10-29 | Search is a navbar row, not a control in the top row | Both modes then share one layout and the transition moves nothing |
| 2026-10-29 | One profile for now: the identity the app already holds (settings name and email), drawn as a generated avatar. Multiple profiles and their routing are designed in §10, not built | Sid wants browser-style profiles eventually and asked to start with one. Building the list before the routing is agreed would fix the wrong storage |
| 2026-10-29 | Minimized, the top bar spans the full window above the rail and carries the traffic lights, the mark (which morphs into the expand chevron) and the title; expanded, the navbar's top row sits level with the top bar with a left inset on macOS instead of a spacer above it | Sid (R2.4): the lights crowded the rail and the title. One row height in both modes keeps the rows from jumping vertically on a flip |
| 2026-10-29 | The width-transition exception extends to the top bar's `margin-left`, on the same 180ms curve | The title then slides with the navbar instead of jumping; sampled at 16ms it moves smoothly from x 114 to 256 |
| 2026-10-29 | The profile avatar is a marble drawn from a hash of the email, coloured from shadcn's `--chart-1` to `--chart-5`, which the theme now defines | A generated avatar needs no upload and no dependency, and the chart tokens follow light and dark |
| 2026-10-29 | The width-transition exception extends to a navbar section's label band: minimized, it shrinks to 16px around the divider, on the same 180ms curve | Sid (R3.1): the minimized rail had 35px around a 1px divider. Changing the band without a transition would jump the rows vertically during the width change |
| 2026-10-29 | The board shows the animated empty state when it has no plans, and when every plan is completed or archived, with a button that opens those columns | Sid (R3.2). A board of empty columns read as broken. All-finished is the common case once work wraps up |
| 2026-10-29 | The profile picture is copied beside the settings file as `avatar-<stamp>.<ext>` and older ones are removed; the setting stores the file name. PNG, JPEG, WebP and GIF up to 5 MB, no cropping | Sid (R3.3). A new stamp is a new URL, so the webview never shows a cached picture. The picture belongs to this machine, like the rest of the settings |
| 2026-10-29 | Name and email are trimmed; a blank one falls back to the git config; an email with whitespace or without text on both sides of an @ is refused | Sid (R3.3). The fallback keeps the existing `resolve_identity` order |
| 2026-10-29 | Settings has a Profile section, opened by Edit profile in the avatar menu. The picture saves on pick, the name and email on Save, and each save replaces the app's identity at once | Sid (R3.3). One place to edit the profile, with no reload |
| 2026-10-29 | Pull requests gain a `draft` state; a card shows the icon of the most advanced PR (merged, open, draft, closed), or a muted "no PR yet" icon only when the plan has a repo with a remote; merged uses a new `--merged` violet token | Sid (R2.6): one icon per state, as GitHub shows them. A plain folder never gets a PR, so the empty icon would mislead there |
| 2026-10-29 | Alignment questions carry `context` (two to four sentences: why it matters, what the agent found) and options a `tradeoff`, both optional so old records read; `pr_body` prints the context only where the answer departs from the recommendation | Sid (R2.7): questions were too thin to answer well. The PR reviewer needs the reasoning only where the person overrode the agent |
| 2026-10-29 | Plans are selected by a drag box from empty space, cmd+click, shift+click (adds the range, as Linear does) and cmd+a; a floating bar and a right-click menu act on the selection | Sid (R2.1). Folded groups are skipped by cmd+a and the box |
| 2026-10-29 | Archive and delete of several plans commit once (`edit: archive N plans`, `delete: N plans`); delete is the person's only, refuses any path outside the base, a hidden component or a non-plan, and checks every path before removing anything; a folder change on several plans commits once per plan | Sid (R2.1, R2.3). One command per kind of bulk change keeps the Tauri surface small, and git history keeps a deleted plan restorable |
| 2026-10-29 | Deleting asks twice in one dialog: the first press arms the button as "Confirm delete" for 4 seconds, the second deletes; focus starts on Cancel | Sid asked for double confirmation. A second dialog would ask the same question twice |
| 2026-10-29 | The webview's own context menu is suppressed everywhere except inputs, editors and a page with a text selection | Sid (R2.2): it offered Reload. Copy still has to work on selected text |
| 2026-10-31 | Round 4 lands directly on main with no PRs | Sid (q10) |
| 2026-10-31 | A plan is a draft only until the first review is sent, which moves it to alignment. Review and alignment run together until the person presses Build (shortcut `mod+shift+enter`, since every `+b` key belongs to the navbar). The status picker no longer sends an align event, and `Event::Align` is gone | Sid (R4.1): questions spread over the review rounds instead of one blocking batch. Build carries unsent comments (q2) and queues when no session is on the plan (q1) |
| 2026-10-31 | `record_alignment` and `ask_questions` merge by question id. A question keeps the round it was first asked in, and only new ids get the next round | Resending a question to record its answer must not make it look like a new round |
| 2026-10-31 | Agents post questions with `ask_questions` and answer through the Alignment tab or the session. They no longer open a harness question prompt | Sid (q4): fewer switches between the harness and OpenPlan. The app cannot close a harness prompt, so asking in both places would leave one open after an answer in the app |
| 2026-10-31 | Each question names a role (product, engineering, design, oncall), shown as a drawn persona avatar in a chart colour. The agent picks the roles a plan needs, and the tab names the ones that did not ask. Every question has at least two options and one recommendation, with no "Accept all" or "Let the agent decide" | Sid (q3, q8, q9): help the person build taste, not decide for them. Inline SVG follows the theme and loads nothing |
| 2026-10-31 | A dead session leaves the list when its poll socket closes: a second blocked thread reads the poll's socket and wakes the poll on end of file | R4.6: a poll with no event never wrote, so a killed `openplan mcp` stayed counted. Two blocked threads cost no cycles, unlike a timed wake |
| 2026-10-31 | Supersedes D11. The `openplan mcp` process wakes an idle Claude Code session by writing to its inbox socket (`CLAUDE_CODE_MESSAGING_SOCKET`): an auth line, then one `{"type":"user",...}` line. It reports the result to the app, which shows "Agent woken." or "Couldn't wake the session. It will hear on your next message." The setting "Wake the agent when I send a review" is on by default and lives in the app's server, which tells the process on each poll | Sid (R4.7, q16, q17). The format is undocumented. It was verified on 2026-10-31 by a child process writing to its own session, which got the message with no approval prompt. A session mid-turn hears through the Stop hook and then gets the wake after its turn, which costs one extra turn. Channels were rejected: research preview, a development-only startup flag, nothing on the desktop app |
| 2026-10-31 | Events for a plan nobody is on wait for the first session that takes it, except status changes | The plan file already says where it stands, so a replayed status is noise |
| 2026-10-31 | Supersedes the drawn persona tiles: personas are matte 3D blobs (Mila, Theo, Iris, Kai) with one prop each, colour tokens per persona in `index.css`, and one shared clock that runs only for on-screen avatars while the window is visible and focused. The score ring takes its length at once and only the number counts up | Sid (R4.9): clearly able to blink and turn their heads, not glossy. One clock and an IntersectionObserver keep idle CPU at zero (NFR-8). Only transform and opacity animate |
| 2026-10-31 | Picking an option is the answer: it is saved as a draft at once, and one Send delivers every drafted answer. The composer's text is the active question's note | Sid could not answer, because an option only counted once Enter added it. "Answered 2/3" says what Send will deliver |
| 2026-10-31 | The plan tab strip has square corners | Sid's explicit exception to the radius tokens, for this strip only. The open tab carries a 2px top rule instead |
| 2026-10-31 | The shortcut registry takes `alt` as a modifier, only inside a chord, plus the left and right arrow keys | Sid asked for ⌥⌘ with the arrows to switch tabs. Option on its own types characters on macOS, so it never fires alone |
| 2026-10-31 | Verified: an answer sent from the Alignment tab woke an idle Claude Code session through its inbox, which read the answer in about 3 seconds with nobody typing | The live test Sid asked for, run in the dev app against a real interactive session |
| 2026-10-31 | `atomic_write` resolves a symlink and writes beside the real file | `openplan install claude-code` had turned Sid's symlinked `~/.claude/CLAUDE.md` into a plain file, so the OpenPlan block never reached his dotfiles. Renaming over a link replaces the link |
| 2026-10-31 | The build after GATE 7 round 4 is 0.5.0, skipping 0.4.0 | Sid's call |
| 2026-10-31 | `read_plan` ends with each alignment question and its answer | An agent woken by answers given in the app needs to read them somewhere |
| 2026-10-31 | The app reads unmerged PRs with the person's `gh` CLI on plan open, from a board Refresh control, and when a plan's last session leaves. When every PR reads merged it offers "All PRs merged. Mark completed?". It never completes a plan on its own | Sid (q5, q6, q15). The agent's reports go stale once its session ends. `gh` uses the person's own login and needs no stored secret. The person stays the one who completes (2026-10-28) |
| 2026-10-31 | Alignment target setting, default 80, never gates Build | Sid's write-up recommends at least 80% and lets people set their own threshold |
| 2026-10-31 | Supersedes the row above: Build is disabled while the score is below the target, and a target of 0 turns the gate off. The gate is on the button only. The server keeps refusing `set_status in-progress` while a question has no answer, and does not learn the score | Sid (R5.2): agents aim for 100, and Build opens at the target. The score and the target live in the app, and a Rust copy of the score could drift |
| 2026-10-31 | The score only rises. Coverage is 80 times the settled areas over the required areas (edge cases, error handling, scale) plus every settled area. Each answer with a reason gives 5 points, up to 20. Every plan gets the new score, including plans already in alignment | Sid (R5.1, q3, q4): the score went from 80 to 48 when a second round arrived, because each asked area grew the denominator before it could be answered. A share of answers with a reason could also fall. The full question bank as denominator was rejected: 12 feature aspects would push agents past three questions a round |
| 2026-10-31 | New unanswered questions on the open plan switch it to the Alignment tab. A window in the background calls `requestUserAttention` once, then not again until it is focused. No `openplan://` deep link | Sid (R5.5, q2, q5): Tauri's core window API needs no new dependency. One request per background period keeps several sessions from nagging. Nobody has checked whether Claude Code desktop opens custom-scheme links |
| 2026-10-31 | Every question with options ends with "Write my own" | Sid (R5.3, q1): the composer already took free text, but nothing on the question said so |
| 2026-10-31 | **GATE 7 waived and Phase 8 (0.6.0, S3 builds and in-app updates) starts** | Sid, 2026-10-31: "Gate waived", after the rule was pointed out. Recorded per §2 Process. GATE 7 QA remains owed |

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

**Profiles (designed 2026-10-29, not built).** A profile is a separate base with its
own directory (`~/.openplan` stays the default, others are `~/.openplan-<name>`), its
own git history, its own identity and avatar, and its own settings. The app shows one
profile at a time and switches like a browser profile. Plans route to a profile at
`create_plan`, in the CLI, by rules on each profile checked in order:

1. The git remote's owner or organisation, for example `github.com/HypotenuseAI/*`
   goes to Work. It survives worktrees and clones in any folder.
2. A path prefix, for example `~/Personal/` goes to Personal. It covers folders with
   no remote.
3. Otherwise the default profile.

The agent already passes its repos (path and remote) to `create_plan`, and the
server's working directory is the session's, so routing needs nothing from the agent
or the person after the rules are set. A plan never moves between profiles on its own;
moving one is an explicit action that copies it and commits in both bases. Rejected:
routing to whichever profile is open in the app (wrong as soon as two sessions run in
different projects), and asking the agent to name a profile (it cannot know).
