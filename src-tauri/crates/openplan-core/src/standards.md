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

Features also carry two sections, written before the first alignment round:

- **Entities.** A table of the entities the change adds or changes, what each
  one holds and how they relate, then a mermaid `erDiagram` of the same.
- **States.** A mermaid `stateDiagram-v2` of every state the feature can be in
  and every transition, each labelled with what triggers it.

Draw them first because edge cases hide in the transitions.

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
| `draft` | filed and revised in place with `update_plan`, until the person sends the first review | the agent, with `create_plan` | none |
| `alignment` | the person reviews in rounds, and the agent answers each round and asks its questions | the app, when the person sends the first review | none |
| `in-progress` | the work is under way | the agent, with `set_status`, after the person presses **Build** | refused until every recorded question has an answer and at least one todo exists |
| `in-review` | the work is done and waits for the person | the agent, with `set_status` | refused while any todo is open or doing |
| `completed` | the person accepted the work | the person only, and the app offers "Mark completed" once every PR reads merged | the server refuses it from an agent |
| `archived` | nobody needs to think about it again | the person, or the app after the number of days set in settings | none |

- Review and alignment run together for as many rounds as the person wants.
- **Build** is a button in the app. Pressing it sends the agent a Build message
  that carries any review comments the person had not sent yet.
- Session presence does not change status. Reading a plan or its comments leaves
  the status where it is.
- A new todo on an in-review plan moves it back to in-progress.
- Setting a plan back to alignment reopens the questions.

## Alignment

Alignment settles the choices that decide whether the work comes out right, before
anyone writes code. It runs alongside review, one round at a time, until the
person presses **Build**.

### Each review round

Aim for an alignment score of 100. Keep going, round by round, until
the score reaches 100. The score is the share of required areas the person confirmed.
A feature plan's required areas are entities, states, edge cases, error handling and scale.
Every other plan's required areas are edge cases, error handling and scale.
The app keeps **Build** off until the person has confirmed every one.

1. Answer the review first. Revise the plan with `update_plan`, reply in every
   thread with `reply_comment`, and resolve each thread you acted on.
2. Send an `understanding` statement with `ask_questions` for every required
   area the person has not confirmed. Write two to four sentences each: what
   you understand, and what would break if you were wrong.
   State every required area in round one. The person confirms each statement
   or corrects it.
3. When the person corrects an area, `read_plan` shows the correction. Restate
   the area in the next round, alongside that round's questions. A new
   statement replaces the old one, and the person reads it again.
4. Post one to three questions with `ask_questions`, for the choices you cannot
   make alone. Pick the ones the latest feedback makes answerable. Skip what the
   plan or the code already answers.
5. On a hard question, ask the person to say why. A note on an option or a
   written answer gives the reason.
6. Never pad a round with a question whose answer does not change the work.
7. End your turn with a one-line pointer to the questions, for example "Two
   questions are waiting on the Alignment tab."
8. Do not open a harness question prompt such as AskUserQuestion. The person may
   answer in the app, and the app cannot close a harness prompt. Never ask in a
   plan comment either.
9. The person answers on the plan's Alignment tab or by replying in the session.
   Record each answer given in the session with `record_alignment`.
10. Rounds merge by question id, so send only the new round. Leave `round` out.
    The server stamps it.

A statement on scale, from a feature plan that adds a cache:

```json
{ "area": "scale", "statement": "The largest base we know holds 412 plans, and the cache keeps each plan's summary in memory, about 2 KB each. If bases reach tens of thousands of plans, launch would read every file and stall for seconds." }
```

### On Build

1. Answer the comments that came with the Build message, as in a review round.
2. If questions are left, post all of them in one round with `ask_questions`.
   Wait for the answers before you write code.
3. Once every question has an answer, call `add_decisions` for the consequential
   answers, `add_todos` for the work, and `set_status` with in-progress. Then
   start.

You may post a question after Build when you reach a call you cannot make alone.
The plan stays in progress, and the app flags it as needing an answer.

### Writing a question

1. Give each question a `role`. `product` is the product owner, `engineering` is
   the tech lead, `design` is the designer, and `oncall` is the person paged
   when it breaks. `research` is the researcher, `accessibility` the
   accessibility reviewer, `data` the data analyst, `security` the security
   reviewer and `support` the support lead. Ask from the roles the plan
   touches. Do not add a role that has nothing to ask.
2. When `get_standards` ends with a "Who is answering" section, follow it. Ask
   only from the panel it names, and let the owner of each required area ask
   about it. A question another persona would ask goes to the closest panel
   member.
3. Order the questions from easy to hard. The early ones confirm scope. The later
   ones ask the person to explain their reasoning, and a free-text answer is
   welcome there.
4. Ask about a required area only when it holds a choice the statement cannot
   settle. Otherwise the statement covers it.
5. Write each question as one direct sentence, and give it a `context` in
   Markdown. Write the context in this order:
   1. What you found. One or two sentences that name the files, functions and
      numbers you read.
   2. Why that matters for this plan. One or two sentences.
   3. The option you recommend and why, as the last sentence.

   Keep it to two to six sentences in all. Short paragraphs, one list and bold
   file names are fine.
6. Offer at least two real options. Give every option a `consequence`, what
   happens if the person picks it, and a `tradeoff`, what it costs or gives up
   and when it is the right pick. One sentence each.
7. Set `recommended` to the option the `context` recommends.
8. The person picks every answer. Never add an option that hands the choice back
   to you. The app adds "Write my own" to every question with options, so do not
   add a free-text option yourself.
9. Add an `illustration` in markdown to a question or an option wherever it is
   easier to see than to read. Use a mermaid diagram, a worked example, a before
   and after, or a small `html` fence when media is on.

A question at the level of detail this asks for, as `ask_questions` takes it,
from a feature plan that adds a cache:

```json
{
  "id": "q4", "role": "engineering", "aspect": "performance",
  "question": "Where does the plan cache live?",
  "context": "`list_plans` in **library.rs** reads every plan file each time the board opens. The base has 412 plans, and the board takes 900 ms to open.\n\nThis plan adds the cache, so where it lives decides how fast the board opens after launch.\n\nI recommend memory because launch already reads the base once.",
  "illustration": "| | board opens in |\n|---|---|\n| today | 900 ms |\n| in memory | under 50 ms after launch |\n| on disk | under 50 ms always |",
  "options": [
    { "id": "a", "label": "In memory, filled on launch",
      "consequence": "The board opens in under 50 ms once the app has launched.",
      "tradeoff": "Launch reads every plan once. Right while the base stays under a few thousand plans." },
    { "id": "b", "label": "On disk beside the base",
      "consequence": "The board opens at once, even right after launch.",
      "tradeoff": "A second copy of every plan that can go stale. Right only when launch time matters more than the board." }
  ],
  "recommended": "a"
}
```

When alignment is reopened, ask only about what changed since the last record. The
target is under 15 minutes of the person's time across every round, statements
included.

## Question bank

These are model questions for each plan type, with the role that usually asks
each one. The rows run from easy to hard. Reword each one for the plan in front
of you and replace the options with the real ones. The usual options are a
starting point, not a menu to copy. The context and the trade-offs come from what
you find in the plan and the code, so the bank has none.

### `feature`

| role | aspect | model question | usual options |
|---|---|---|---|
| product | scope | Who gets this first, and what is left out? | every user at once · one group first · the people who asked for it |
| design | UX | What does the user see while this runs and when it fails? | a progress state and a plain error · only the result · the same as the closest existing screen |
| engineering | tests | What has to be tested before this merges? | unit tests on the new logic · unit tests plus one end-to-end test of the main flow · the existing tests are enough |
| engineering | entities | Which entities does this add or change, and how do they relate? | one new entity owned by an existing one · a new field on an existing entity · a new entity shared by several |
| engineering | states | Which states can this be in, and what moves it between them? | the states of the closest existing feature · a new state with its own transitions · no states, it runs in one step |
| engineering | edge cases | What happens when the input is empty, too large or malformed? | reject it with a clear error · accept it and repair it · keep today's behaviour |
| oncall | error handling | What happens when a step fails halfway? | retry, then show a plain error · roll back to the last good state · log it and carry on |
| oncall | scale | How large a case must this handle without slowing down? | today's largest real case · ten times that · no target yet, measure after release |
| engineering | performance | Which number must this change not make worse? | start time · time to open a page · memory at idle · none, it is off the hot path |
| engineering | security | Who may use this, and does it touch secrets or personal data? | the same access as today · a new permission check · it touches sensitive data, so it needs a security review |
| engineering | low-level design | Where does the new logic live? | in the existing module · in a new module beside it · in the caller |
| engineering | high-level design | Does this add a service, a data store or a dependency? | no, it reuses what exists · one dependency, justified in the PR · a new service |
| engineering | layout and naming | What are the new files and public names called? | follow the nearest existing names · the names in this plan · names the reviewer picks |
| oncall | practices | How does this ship? | behind a flag that is off by default · straight to main · on a branch until a QA gate |
| research | users | What do we know about the people who asked for this? | interviews or tickets name it · usage data points to it · nothing yet, so ship small and watch |
| accessibility | accessibility | Can someone use this with only a keyboard or a screen reader? | yes, with the same steps · yes, with one extra step · not in this change, a follow-up plan covers it |
| data | success | Which number tells us this worked? | how many people use it in the first month · how often the task gets finished · no number, ask the people who asked for it |
| security | access | Who can reach the new data or action? | the same people as today · only the owner · anyone with the link |
| support | support | What will customers ask about this, and where do they find the answer? | a help article at launch · a line in the release notes · nothing, it needs no explaining |

### `bug`

| role | aspect | model question | usual options |
|---|---|---|---|
| product | UX | What do the users it affected see or hear about it? | nothing, the fix is silent · a line in the release notes · a message in the product |
| engineering | tests | Which test proves the fix? | a regression test that fails before the fix · that test plus a manual check of the reproduction · a manual check only |
| engineering | edge cases | What happens to records the bug already wrote? | leave them · repair them with a one-off script · repair them as part of the fix |
| oncall | scale | How many users or records does the bug reach? | a handful, fixed by hand · a share of every request · unknown, count from the logs first |
| oncall | error handling | What happens when the fixed code meets the bad state again? | fail with an alert · repair it and log a warning · skip it quietly |
| oncall | security | Could this bug have exposed data or access? | no, it only affects behaviour · unknown, check the logs first · yes, treat it as an incident |
| engineering | low-level design | How deep does the fix go? | the root cause · a guard at the boundary now and the root cause later · both in one change |
| oncall | practices | How does the fix reach users? | the next regular release · a hotfix today · behind a flag |
| research | users | How did the people it affected tell us? | support tickets · an error report · we found it ourselves |
| accessibility | accessibility | Does the bug or the fix change what a screen reader says or where focus goes? | no · yes, the fix restores it · yes, and it needs its own test |
| data | success | Which number shows the fix worked? | the error rate drops to zero · the tickets stop · a test proves it, so no number is needed |
| security | access | Does the fixed code need a check on who may call it? | no, the access rules stay · yes, add the check in this fix · yes, in a follow-up plan |
| support | support | What do we tell the customers who reported it? | a reply on each ticket once it ships · a line in the release notes · nothing, the fix is silent |

### `migration`

| role | aspect | model question | usual options |
|---|---|---|---|
| product | UX | Will users notice the move? | no visible change · a short notice · downtime announced ahead |
| engineering | tests | How do we show the new path gives the same results as the old one? | run both and compare outputs · contract tests on the new path · spot checks after each phase |
| engineering | edge cases | What happens to records the new system cannot read? | block the migration until they are fixed · skip them and log each one · convert them with defaults |
| oncall | error handling | What happens when a batch fails halfway? | stop and resume from the last checkpoint · retry the batch at the end · roll back the phase |
| oncall | scale | How does the data move? | all at once in a maintenance window · in batches with a checkpoint · on first read |
| oncall | performance | How much slower may requests get while both paths run? | not at all · under 10 percent · any amount for a short window |
| engineering | security | Do access rules carry over unchanged? | yes, mapped one to one · they change, and the plan lists how · they get a review before cutover |
| engineering | high-level design | How do the old and new paths run during the move? | write to both, read the old · write to both, read the new · a hard cutover |
| engineering | layout and naming | What happens to the old names? | aliases for one release · renamed everywhere now · kept as they are |
| oncall | practices | How far back can each phase roll? | every phase rolls back · only until cutover · no rollback, fix forward |
| research | users | Who depends on the old path today? | only our own code · a few known customers · unknown, find out from the logs first |
| accessibility | accessibility | Do screens on the new path keep their keyboard and screen reader support? | yes, checked screen by screen · yes, the existing tests cover it · no screen changes |
| data | success | Which numbers must match before cutover? | record counts on both sides · a sample compared field by field · the error rate on the new path |
| security | access | Does the new store keep data encrypted and access logged as the old one did? | yes, with the same settings · with stronger settings the plan lists · it gets a review before cutover |
| support | support | What will customers notice and ask about during the move? | nothing, the move is invisible · a notice ahead of any downtime · a help article for changed steps |

### `research`

| role | aspect | model question | usual options |
|---|---|---|---|
| product | scope | Which question must the answer settle, and what is out of scope? | the question as written · a narrower question first · the question and its follow-ups |
| product | how the answer will be used | What will the answer decide? | whether to build it · the approach of a feature plan · nothing yet, it is background |
| engineering | sources | Which sources count as evidence? | our code and data only · our code plus public docs and papers · a small prototype as well |
| oncall | error handling | Must the answer say how each option fails? | yes, for every option · only for the recommended one · no, a later plan covers it |
| engineering | scale | At what size must the answer still hold? | today's size · ten times today · no target, name the limit found |
| product | what counts as done | What does a finished answer look like? | one recommendation with its evidence · a ranked list of options · a prototype that answers it |
| research | users | Whose experience must the answer cover? | the people who use it today · the people we want to reach · both |
| accessibility | accessibility | Must each option say how it works with a keyboard and a screen reader? | yes, for every option · only for the recommended one · no, a later plan covers it |
| data | sources | Which numbers count as evidence? | product usage data · survey answers · both, with the sample size named |
| security | access | Must each option say what data it exposes and to whom? | yes, for every option · only for the recommended one · no, a later plan covers it |
| support | how the answer will be used | Which customer questions should the answer settle? | the most common tickets on this area · none, it is an internal question · the ones raised in sales calls |

### `audit`

| role | aspect | model question | usual options |
|---|---|---|---|
| product | scope | What does the audit cover? | one service or module · every service of one kind · the whole platform |
| product | how the answer will be used | Who acts on the findings? | this agent, in follow-up plans · the team that owns the code · nobody yet, they inform a decision |
| engineering | sources | What counts as evidence? | the code · the code plus logs and metrics · interviews with the owners as well |
| oncall | error handling | Does the audit check how each part fails and recovers? | yes, by forcing each failure · by reading the code only · no, it is out of scope |
| oncall | scale | Does the audit measure behaviour under load? | at today's peak · at ten times today's peak · no, it is out of scope |
| product | what counts as done | What does a finished audit hand over? | findings ranked by risk · findings with a fix for each · each finding filed as its own plan |
| research | users | Whose experience does the audit check? | every user · one group, named in the scope · nobody, it reads the code only |
| accessibility | accessibility | Does the audit check keyboard use, screen readers and contrast? | yes, on every screen in scope · on the main flows only · no, it is out of scope |
| data | success | How is each finding sized? | by the number of users it reaches · by the cost to fix it · by risk alone |
| security | access | Does the audit list who can reach each part? | yes, every role and permission · admin access only · no, it is out of scope |
| support | support | Does the audit use support tickets as evidence? | yes, from the last 90 days · only tickets about this area · no |

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

- With "Media: on", an explainer video is welcome where motion shows what words
  cannot: a flow, a before and after, or a sequence of states. Never add one for
  decoration. Make it with Remotion, as below.
- With "Media: on", an `html` fence may carry a small interactive piece. It runs
  in a sandbox with no network.
- With "Media: off", add neither.
- Never link media from the network.

### Explainer videos

The look is clean and minimal, in the style of Apple's product videos.

- One idea per scene, at most five scenes, under ten seconds in total.
- A near-white background, or near-black if the reader likely works in a dark
  theme. One accent colour. The system sans font, Inter or SF. Large type and
  wide margins. No stock footage and no music.
- Every move eases out, with `spring` at low bounce or `interpolate` with an
  easing curve. Elements enter by fading in and rising a few pixels. Nothing
  bounces and nothing spins. Scenes change with a 300 ms crossfade.
- Render 1920x1080 at 30 fps as an h264 mp4 at CRF 23, under 5 MB. If the file
  is larger, drop to 1280x720 before you raise the CRF.

Make it in this order:

1. Run `npx create-video@latest --blank <name>` in a scratch folder outside the
   plan base.
2. Write one composition per scene and a root composition that sequences them.
3. Preview with `npx remotion studio` only if a person will watch the preview.
4. Render with `npx remotion render <RootComposition> out/clip.mp4 --codec h264 --crf 23`.
5. Copy `out/clip.mp4` into the plan set's `media/` folder. A single-file plan
   that gains media becomes a plan set.
6. Reference it in the plan as `<video src="media/clip.mp4" controls></video>`.
7. Commit the mp4 with the plan. Do not commit the scratch folder.

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
