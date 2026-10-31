# Alignment as a system

By Siddesh Sambasivam, October 2026.

OpenPlan gives every agent plan a lifecycle. Agreeing on what to build is one of its
states, with its own questions, score and gate.

## The problem

Coding agents are good at writing code. What they lack is the context a team builds up
over years: why the product works the way it does, what customers keep asking for,
which past decisions still matter. An agent works from the prompt, the repo and a few
context files. That is rarely the whole picture.

So an agent can write clean, working code and still get it wrong. It can:

1. Misread a requirement, or fill a gap in the spec with a reasonable but wrong guess.
2. Solve the stated problem while missing the wider product vision, or what else the
   change touches.

Generating code is not the same as engineering. AI can write code and solve the
problem in front of it. Whether that was the right problem to solve is a separate
question. That is an alignment problem, not a capability problem.

## Why review alone doesn't catch it

Most AI coding work follows the same five steps:

1. Give the agent a prompt.
2. The agent asks a few questions.
3. The agent writes a plan.
4. I review the plan.
5. The agent builds it.

Review is a real step on most teams, and it catches a lot. But it checks the plan the
agent wrote. If the agent misunderstood the goal back at step 2, the plan reads as a
clean answer to the wrong question, and that is hard to spot. Code review comes later
still, when changing direction costs the most.

The gap is at step 2. A few quick clarifying questions can't transfer the context a
team carries in its head. Files like CLAUDE.md help, but they hold general rules, not
the intent behind this specific piece of work.

## The core idea

Alignment shouldn't depend on how complete the first prompt was, or how many questions
the agent happened to ask. So OpenPlan puts every piece of AI work through a strict
lifecycle, with clear states and clear rules for moving between them.

The plan is the basic unit of work. One plan can touch one or more repos and run across
one or more agent sessions.

OpenPlan is mostly a nice way to manage markdown files. That is the point. The value is
in the structure around the files. It makes alignment a fixed part of every plan.

## The plan lifecycle

Every plan moves through six states. Alignment is the gate: no code gets written until
it is done.

1. **Draft.** The agent writes the first version of the plan. I review it and give
   feedback until it reads right.
2. **Alignment.** The agent asks me questions until we agree on what to build, why, and
   how. The questions arrive alongside my review rounds, a few at a time. The result is
   a todo list for the plan. More on this below.
3. **In progress.** Agents work through the todo list. If I bring up a new requirement,
   it is added to the list.
4. **In review.** The work is done and waiting on review. That can be an agent review, a
   human review on GitHub or a similar platform, or CI checks.
5. **Completed.** All the plan's PRs are merged, and I confirm it.
6. **Archived.** Any plan can be archived. It then sits behind a collapsed toggle on the
   board or table view.

## Alignment, the step that matters most

Alignment is where OpenPlan gets opinionated. Before any code is written, the agent and
I have to agree on what we are building, why it is worth building, and how it will be
built. I'm allowed to not know the how.

### How it works

- **The agent asks, I decide.** The agent drafts questions, each with a few options and
  one it recommends, with its reason. It never makes the call for me, and I pick every
  answer. The goal is to help me build product and engineering taste, not to take
  decisions off my plate.
- **The agent owns alignment.** It is the agent's job to find the gaps between how I
  think about the work and how it does. I shouldn't have to know what to ask.
- **Easy questions first.** Questions start simple and get harder. The harder ones may
  need me to explain my reasoning, which is often where the real gaps show up.
- **Short and direct.** Questions are written plainly. The whole step should take 10 to
  15 minutes.
- **The output is a todo list.** Once we agree, the plan gets a todo list. Every agent
  working on the plan uses it as the source of truth.

### What the questions cover

The questions change with the work. They aim to keep the platform at the level an
enterprise product needs:

- Test coverage
- Edge cases and error handling
- Behaviour at scale
- Security
- User experience that meets the bar of good products today
- Performance, such as memory and CPU use
- Low-level design patterns (Gang of Four) and high-level design patterns
- Folder structure and naming conventions
- General engineering practice, such as SOLID

I weight error handling, edge cases and scale the most. Those are the things most often
skipped when working fast.

### Personas

The questions come from four fixed personas: a product owner, an engineering tech lead,
a designer and the on-call engineer who gets paged when it breaks. Each one looks at the
plan from a different angle, so the plan gets reviewed as a whole and not just as code.
I chose not to make personas customizable. A fixed set won't fit every case, but it
covers most of them and keeps the tool opinionated.

### Alignment score

To make it a bit fun, each plan gets an alignment score. I can start building at any
score. OpenPlan suggests at least 80, and the target is a setting.

## Why an app and not just a skill

A skill would get me most of the way. Something like Matt Pocock's `/grill-me` already
makes an agent question you before it builds, and it works well. I built an app anyway,
for three reasons.

**Good tools build good habits.** I enjoy using well-made interfaces, and I come back to
tools I enjoy. If the alignment step feels good to go through, I'm more likely to do it
every time. Some people will see this as bloat. For me, it is what makes the habit
stick.

**I want to practise product taste.** OpenPlan is a low-stakes place to try different
flows and interactions. At work I build for enterprise B2B customers, where the stakes
are too high to experiment freely.

**I think AI-era interfaces should be worked out, not copied.** AI is fast at building
and fixing things, but it is not good at knowing what feels great to use. It learns from
past interfaces and past research. Tools for working with agents are new, so their
design should come from how people actually work now, not from patterns built for a
different time.

For design, I learned a lot from Linear, which is one of the friendliest interfaces I've
used. I also drew from xAI's take on bots, Notion, OpenAI and Anthropic. I respect the
care these teams put into their products.

## Making plans easier to understand

Long plans are slow to read, and a misunderstanding buried in the middle of one is easy
to miss. To fix that, OpenPlan can make short explainer videos of a plan using Remotion.
A short video shows the main flows faster than pages of text. It costs more tokens, and
I think that is worth it.

## Trade-offs I accept

- **More friction.** Every plan takes longer to start. I'm trading speed now for fewer
  problems later.
- **Opinionated by design.** Fixed states and fixed personas won't suit every team or
  every task.
- **Extra token cost.** The explainer videos are not free.
- **It is still markdown underneath.** The value is in how the system makes me behave,
  not in some new technology.

## What's next

OpenPlan is still changing. I'll share updates as it grows.
