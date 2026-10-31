# Plan standards

How plans should be written here. Agents read this before filing one, so edits
you make take effect on their next plan. Keep it short — this is a house style,
not a specification.

## Structure

Every plan has these sections, in this order:

- **Context** — what prompted this, and what the reader needs to know to judge
  it. Link the issue, the failing test, the conversation.
- **Approach** — the shape of the change, and the alternatives considered.
  Say why this one, not just what it is.
- **Steps** — the work, in order, small enough that each is reviewable on its
  own. Name the files each step touches.
- **Risks** — what could go wrong, what is uncertain, and what would have to be
  true for this plan to be wrong.

## Style

- Write for the person reviewing it, not the one who already understands it.
- Prefer specifics over adjectives: file paths, function names, commands.
- Say what will not be done, when the boundary is not obvious.
- Keep the title a single line that reads as a change, not a topic.
- Mark anything unverified as unverified. A plan that hides its guesses is
  worse than one that admits them.
