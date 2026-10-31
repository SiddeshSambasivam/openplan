# Plan standards

How plans are written here. Agents read this before filing one, so edits take
effect on the next plan written. This is a house style, not a specification —
change anything that does not fit the work.

## Two shapes

| shape | when | layout |
|---|---|---|
| **Single file** | one focused change: a bug, an audit, a contained feature | `<slug>.md` |
| **Plan set** | work that spans phases, or that several documents cover better than one | `<slug>/` with `README.md` as the index and `NN-topic.md` in reading order |

A plan set's `README.md` is the entry point: what this is, the strategy in a
paragraph, a table of the documents with one line each, and a status tracker.
Superseded drafts move to `archive/` rather than being deleted — the index says
what each archived document is still authoritative for.

## The header

Every plan opens with a title that reads as a change, not a topic, then a block
that answers who, when, and where:

```markdown
# PDB filter schema bug: number `between` payloads coerce to datetimes

**Status:** documented, not yet fixed · **Found:** 2026-07-14, during PDB Search v1 reader work
**Affects:** the *current* Postgres search path (`schemas/filters.py`), and gates one cell
of the v1 reader (`pdb_search/reader/dispatch.py` on `feat/sd/pdb-search-03-read-path`)
```

Status is dated and carries its provenance — "strategy committed by Sid
2026-07-29" beats "approved". Add `Branch:`, `Flag:`, `Owner:`, and
`Predecessors:` when they exist.

## What a plan contains

Not every plan needs every section, but it needs the ones that carry weight:

- **Summary or mission** — the whole thing in a paragraph, near the top. A plan
  set gets "the architecture in one paragraph" before any detail.
- **Current state** — the evidence: what is actually there today, inventoried.
- **Approach** — the shape of the change, and why this one. Phase tables carry a
  column for *why this phase is its own gate*.
- **Steps** — in order, each small enough to review alone, naming the files it
  touches.
- **Alternatives** — what was rejected and why, so it is not re-litigated
  without new information.
- **Risks and open questions** — what is uncertain, and what would have to be
  true for this plan to be wrong.

Bugs additionally carry **Reproduction** (runnable, with the version and date it
was verified on), **Root cause**, and **Blast radius** — including why nothing is
visibly broken yet, when that is the case.

## Decisions

Consequential choices go in a decision log with stable IDs (`D1`, `D2`, …),
append-only, referenced from the phase documents. One format:

**Context → Options, with pros and cons → Decision → Why → Revisit if**

Write the rejected options out. A decision without its alternatives is a
decision someone will make again.

## Evidence

- Every number is measured, arithmetically bounded from something measured, or
  pinned to a named gate that will measure it. Put the source in the table.
- Mark anything unverified as unverified. A plan that hides its guesses is worse
  than one that admits them.
- Cite precisely: `path/to/file.py:266`, branch names, PR numbers, links.
- Say what will *not* be done when the boundary is not obvious.

## Style

- Write for the person reviewing it, not the one who already understands it.
- Prefer specifics to adjectives: paths, names, commands, numbers.
- Tables for anything enumerable — phases, targets, constants, documents.
- Bold the load-bearing term in a paragraph, not the paragraph.
- Keep a status tracker current. A stale plan is read as a wrong plan.
