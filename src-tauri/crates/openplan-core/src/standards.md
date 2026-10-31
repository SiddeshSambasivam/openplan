# Plan standards

How plans are written here. Agents read this before filing one, so edits take
effect on the next plan written. This is a house style, not a specification.
Change anything that does not fit the work.

## Two shapes

| shape | when | layout |
|---|---|---|
| **Single file** | one focused change: a bug, an audit, a contained feature | `<slug>.md` |
| **Plan set** | anything large, meaning work in phases, or work several documents cover better than one | `<slug>/` |

**A large change gets a folder.** Do not let one file grow until it has to be
scrolled to be understood, and do not scatter its documents across the base.
Everything about that change lives in `<slug>/`:

- `README.md` is the entry point: what this is, the strategy in a paragraph, a
  table of the documents with one line each, and a status tracker.
- `NN-topic.md` holds the documents, numbered in reading order.
- `archive/` keeps superseded drafts rather than deleting them. The index says what
  each archived document is still authoritative for.

Start a folder when the work has phases, when more than one person or agent will
work on it, or the second time you want to add a section that does not belong in
what is already there.

## The header

Every plan opens with a title that reads as a change, not a topic, then a block
that answers who, when, and where:

```markdown
# PDB filter schema bug: number `between` payloads coerce to datetimes

**Status:** documented, not yet fixed · **Found:** 2026-07-14, during PDB Search v1 reader work
**Affects:** the *current* Postgres search path (`schemas/filters.py`), and gates one cell
of the v1 reader (`pdb_search/reader/dispatch.py` on `feat/sd/pdb-search-03-read-path`)
```

Status is dated and carries its provenance. "Strategy committed by Sid
2026-07-29" beats "approved". Add `Branch:`, `Flag:`, `Owner:`, and
`Predecessors:` when they exist.

## Plan types

Every plan declares a type. The type says which sections it has to carry, and the
app lays the page out by them.

| type | when to use it | required sections |
|---|---|---|
| `feature` | new behaviour, or a change to behaviour that already ships | Summary, Current state, Approach, Steps, Risks and open questions |
| `bug` | something is broken and the plan is how to fix it | Summary, Reproduction, Root cause, Blast radius, Steps |
| `migration` | moving off one thing onto another, in phases | Summary, Current state, Approach (a phase per gate), Steps, Rollback |
| `research` | a question to answer before anyone writes code | Question, What we know, Options, Recommendation, Open questions |
| `audit` | a survey of what is there now, and what to do about it | Scope, Findings, Recommendations |

Decisions is recommended whatever the type. A plan that made a call and did not
write down the alternatives will have that call made again.

## What a plan contains

Not every plan needs every section, but it needs the ones that carry weight:

- **Summary or mission.** The whole thing in a paragraph, near the top. A plan
  set gets "the architecture in one paragraph" before any detail.
- **Current state.** The evidence, meaning what is actually there today, inventoried.
- **Approach.** The shape of the change, and why this one. Phase tables carry a
  column for *why this phase is its own gate*.
- **Steps.** In order, each small enough to review alone, naming the files it
  touches.
- **Alternatives.** What was rejected and why, so it is not re-litigated
  without new information.
- **Risks and open questions.** What is uncertain, and what would have to be
  true for this plan to be wrong.

Bugs additionally carry **Reproduction** (runnable, with the version and date it
was verified on), **Root cause**, and **Blast radius**, including why nothing is
visibly broken yet, when that is the case.

## Decisions

Consequential choices go in a decision log with stable IDs (`D1`, `D2`, and on),
append-only, referenced from the phase documents. One format: the context, then
the options with their pros and cons, then the decision, then why, then what
would make you revisit it.

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
- Tables for anything enumerable: phases, targets, constants, documents.
- Bold the load-bearing term in a paragraph, not the paragraph.
- Keep a status tracker current. A stale plan is read as a wrong plan.

## Writing

These rules hold for the plan and for every reply you leave on a comment thread.

- No em dashes anywhere. Use a comma, or start a new sentence.
- Never write: additionally, crucial, delve, enduring, enhance, fostering, garner,
  interplay, intricate, landscape (as an abstract noun), pivotal, showcase, tapestry,
  testament, underscore, vibrant, leverage, utilize, robust, seamless. Use the plain
  word.
- No "serves as", "stands as", "boasts". Write "is" or "has".
- No "not just X, but Y". State the point on its own.
- No forced groups of three. List the number of things there are.
- A colon introduces a list or an example. It never joins two halves of a sentence.
- Bold the one term a paragraph turns on, not every noun in it.
- Sentence case headings. No decorative emoji. Straight quotes.
- No chatbot lines ("Happy to help", "Great question"), and no praise for the reader.
- Cut filler. "In order to" is "to", "due to the fact that" is "because", and
  "it is important to note that" is nothing.
- Say what something does, not how it feels. Name the file, the number, the command.
- Active voice. Name who does the thing.
- One idea per sentence. Split anything a reader has to read twice.
- Whole sentences, with their articles and verbs. Spell out arrows and shorthand.
