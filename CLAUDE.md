# OpenPlan — agent working rules

**Read [PLAN.md](PLAN.md) before doing anything.** It is the source of truth for this
project: north star, requirements, user flows, architecture, implementation details,
and the phased todo backlog (§8) that drives all work.

## How to work here

1. Pick the next unchecked item in PLAN.md §8 (phases are strictly ordered) unless
   the user directs otherwise.
2. **HARD RULE — QA gates.** Each phase ends with a GATE item: Sid's manual QA +
   explicit approval. Never start a phase whose previous GATE is unchecked — even if
   asked to. If asked, point to this rule and PLAN.md §2 Process, and require an
   explicit waiver recorded in the Decision Log first.
3. **Tests first**: write the failing test before the implementation. This applies to
   `src/lib/`, all Rust crates, and Tauri commands.
4. Check the item off in PLAN.md in the same change; if you made or changed a
   decision, add it to the Decision Log (PLAN.md §9).
5. Less code = better. No new dependency without written justification. Match the
   existing code and comment style.
6. UI: **one design system — shadcn/ui** (vendored in `src/components/ui/`): shadcn
   components + theme tokens only; no hand-rolled styling or raw values (Tailwind is
   just shadcn's engine). Every screen size (min 720×480), animations only on
   `transform`/`opacity`, 60fps always.
7. Resource-frugal (PLAN.md NFR-8): event-driven, never polling; no background
   indexing; must run well on old hardware.
8. Do NOT build on the existing comments/highlight system — it is scheduled for
   deletion and full rebuild (PLAN.md §6.2b, Phase 4).
9. No stale-prone info in code comments/docstrings (paths, counts, URLs, feature
   lists) — comments state local constraints only; durable facts live in PLAN.md.

## Commands

Package manager is **pnpm** (never npm/yarn — `packageManager` field is pinned).

- `pnpm dev` — UI only in a browser (in-memory file fallback)
- `pnpm tauri dev` — full desktop app
- `pnpm test` — TS tests · `cargo test --workspace` (in `src-tauri/`) — Rust tests
- `pnpm build` — typecheck + bundle frontend
