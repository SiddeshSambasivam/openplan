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

## The title

Every plan opens with a title that reads as a change, not a topic, and then its
first section:

```markdown
# Stop number `between` filters from coercing to datetimes

## Summary

The Postgres search path in `schemas/filters.py` parses every `between` payload
as a date range, so a filter on price returns nothing.
```

Do not add a status, owner, repo or branch line under the title. The app keeps
status and dates in the plan's frontmatter, and repos, branches and PRs in its
work record. A second copy in the body goes stale.

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

Bugs also carry **Reproduction** (runnable, with the version and date it
was verified on), **Root cause**, and **Blast radius**, including why nothing is
visibly broken yet, when that is the case.

## Decisions

Consequential choices go in a decision log with stable IDs (`D1`, `D2`, and on),
append-only, referenced from the phase documents. One format: the context, then
the options with their pros and cons, then the decision, then why, then what
would make you revisit it.

Write the rejected options out. A decision without its alternatives is a
decision someone will make again.

Decisions settled during alignment also go to the work record through
`add_decisions`, in the same format.

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
- Math: `$$x$$` on one line is inline, `$$` on its own lines is a block. A lone
  dollar sign is a price and stays text. Mermaid fences draw diagrams.
- Bold the load-bearing term in a paragraph, not the paragraph.
- Keep a status tracker current. A stale plan is read as a wrong plan.

## Lifecycle

A plan has one status at a time. The server checks every move.

| status | what it means | who moves the plan there | guard |
|---|---|---|---|
| `draft` | filed, under review, revised in place with `update_plan` | the agent, with `create_plan` | none |
| `alignment` | the person finished reviewing and the agent asks its questions | the person, from the status picker | none |
| `in-progress` | the work is under way | the agent, with `set_status` | refused until alignment is recorded and at least one todo exists |
| `in-review` | the work is done and waits for the person | the agent, with `set_status` | refused while any todo is open or doing |
| `completed` | the person accepted the work | the person only | the server refuses it from an agent |
| `archived` | nobody needs to think about it again | the person, or the app after the number of days set in settings | none |

- Session presence does not change status. Reading a plan or its comments leaves
  the status where it is.
- A new todo on an in-review plan moves it back to in-progress.
- Setting a plan back to alignment reopens the questions.

## Alignment

Alignment settles the choices that decide whether the work comes out right, before
anyone writes code. It starts when the person sets a plan to alignment.

1. Read the plan, its open comments and the question bank for its type. Ask about
   the aspects where a wrong guess would cost a rewrite. Skip the ones the plan or
   the code already answers.
2. Ask in the harness with its own question tool. In Claude Code that is
   AskUserQuestion. Never ask in a plan comment.
3. Ask at most 12 questions. The first is always "Accept all N recommendations, or
   go one by one?", with each recommendation listed below it in one line. If the
   person accepts all, every recommended option is the answer. Ask the
   must-answer questions either way.
4. Write each question as one direct sentence. List the recommended option first
   and mark it "(Recommended)". Give every option its consequence in one line.
5. Add a "Let the agent decide" option to every question you have not marked
   must-answer. Mark a question must-answer only when it is about product
   behaviour you cannot know from the plan or the code. AskUserQuestion takes four
   options, so offer at most three of your own beside "Let the agent decide".
6. Call `record_alignment` with every question and answer as soon as the last
   answer arrives. Then call `add_decisions` for the answers that are
   consequential, `add_todos` for the work, and `set_status` with in-progress.

When alignment is reopened, ask only about what changed since the last record. The
target is under 15 minutes of the person's time.

## Question bank

These are model questions for each plan type. Reword each one for the plan in
front of you and replace the options with the real ones. The usual options are a
starting point, not a menu to copy.

### `feature`

| aspect | model question | usual options |
|---|---|---|
| tests | What has to be tested before this merges? | unit tests on the new logic · unit tests plus one end-to-end test of the main flow · the existing tests are enough |
| edge cases | What happens when the input is empty, too large or malformed? | reject it with a clear error · accept it and repair it · keep today's behaviour |
| scale | How large a case must this handle without slowing down? | today's largest real case · ten times that · no target yet, measure after release |
| UX | What does the user see while this runs and when it fails? | a progress state and a plain error · only the result · the same as the closest existing screen |
| security | Who may use this, and does it touch secrets or personal data? | the same access as today · a new permission check · it touches sensitive data, so it needs a security review |
| performance | Which number must this change not make worse? | start time · time to open a page · memory at idle · none, it is off the hot path |
| low-level design | Where does the new logic live? | in the existing module · in a new module beside it · in the caller |
| high-level design | Does this add a service, a data store or a dependency? | no, it reuses what exists · one dependency, justified in the PR · a new service |
| layout and naming | What are the new files and public names called? | follow the nearest existing names · the names in this plan · names the reviewer picks |
| practices | How does this ship? | behind a flag that is off by default · straight to main · on a branch until a QA gate |

### `bug`

| aspect | model question | usual options |
|---|---|---|
| tests | Which test proves the fix? | a regression test that fails before the fix · that test plus a manual check of the reproduction · a manual check only |
| edge cases | What happens to records the bug already wrote? | leave them · repair them with a one-off script · repair them as part of the fix |
| low-level design | How deep does the fix go? | the root cause · a guard at the boundary now and the root cause later · both in one change |
| security | Could this bug have exposed data or access? | no, it only affects behaviour · unknown, check the logs first · yes, treat it as an incident |
| UX | What do the users it affected see or hear about it? | nothing, the fix is silent · a line in the release notes · a message in the product |
| practices | How does the fix reach users? | the next regular release · a hotfix today · behind a flag |

### `migration`

| aspect | model question | usual options |
|---|---|---|
| tests | How do we show the new path gives the same results as the old one? | run both and compare outputs · contract tests on the new path · spot checks after each phase |
| edge cases | What happens to records the new system cannot read? | block the migration until they are fixed · skip them and log each one · convert them with defaults |
| scale | How does the data move? | all at once in a maintenance window · in batches with a checkpoint · on first read |
| performance | How much slower may requests get while both paths run? | not at all · under 10 percent · any amount for a short window |
| security | Do access rules carry over unchanged? | yes, mapped one to one · they change, and the plan lists how · they get a review before cutover |
| high-level design | How do the old and new paths run during the move? | write to both, read the old · write to both, read the new · a hard cutover |
| layout and naming | What happens to the old names? | aliases for one release · renamed everywhere now · kept as they are |
| UX | Will users notice the move? | no visible change · a short notice · downtime announced ahead |
| practices | How far back can each phase roll? | every phase rolls back · only until cutover · no rollback, fix forward |

### `research`

| aspect | model question | usual options |
|---|---|---|
| scope | Which question must the answer settle, and what is out of scope? | the question as written · a narrower question first · the question and its follow-ups |
| sources | Which sources count as evidence? | our code and data only · our code plus public docs and papers · a small prototype as well |
| what counts as done | What does a finished answer look like? | one recommendation with its evidence · a ranked list of options · a prototype that answers it |
| how the answer will be used | What will the answer decide? | whether to build it · the approach of a feature plan · nothing yet, it is background |

### `audit`

| aspect | model question | usual options |
|---|---|---|
| scope | What does the audit cover? | one service or module · every service of one kind · the whole platform |
| sources | What counts as evidence? | the code · the code plus logs and metrics · interviews with the owners as well |
| what counts as done | What does a finished audit hand over? | findings ranked by risk · findings with a fix for each · each finding filed as its own plan |
| how the answer will be used | Who acts on the findings? | this agent, in follow-up plans · the team that owns the code · nobody yet, they inform a decision |

## Todos

- A todo is one reviewable unit of work, about one commit. Write it as an action
  and name the files or the part of the product it touches, as in "Add `archived`
  to `Status` in `plan.rs`, with parser tests".
- A todo is open, doing, done or dropped. A dropped todo carries the reason it was
  dropped. Move each one with `update_todo` when you start it and when you finish
  it, so the plan page shows where the work stands.
- A comment that asks for new work becomes a todo through `add_todos`.
- Add and update todos one at a time. Never replace the list, because another
  session may be working on the same plan.

## Pull requests

- Before you open a PR, call `pr_body` and paste its text into the PR description.
- After you open it, call `record_pr` with its URL, the repo, the branch and the
  todos it covers.
- When its checks, its review or its state change, call `record_pr` again with the
  same URL.
- When every PR is merged, ask the person in the harness to confirm the plan is
  complete. Do not set completed yourself. The server refuses it.

## Media

The second line of what `get_standards` serves says whether media is on for this
person.

- With "Media: on", a short video is welcome where it shows how something works.
  Render it with Remotion in your own workspace as an mp4 under 5 MB. Save it in
  the plan set's `media/` folder and reference it with a relative path, as in
  `<video src="media/sync-flow.mp4" controls></video>`. A single-file plan that
  gains media becomes a plan set.
- With "Media: on", an `html` fence may carry a small interactive piece. It runs
  in a sandbox with no network.
- With "Media: off", add neither.
- Never link media from the network.

## Writing

These rules hold for the plan, for every reply you leave on a comment thread,
for alignment questions and their options, for todo text, for decisions and for
PR bodies.

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
