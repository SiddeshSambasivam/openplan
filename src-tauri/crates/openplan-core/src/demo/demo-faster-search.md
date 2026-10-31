---
id: demo-faster-search
title: Demo: faster search
status: in-review
type: feature
source: cursor
folders: [Demo]
demo: true
created: {now}
updated: {now}
---
# Demo: faster search

## Summary

Search reads every note on each key press, so it slows down as a library grows. At 5,000 notes the first results take 1.4 seconds. This plan keeps a word index on the device and searches that instead, with a target of results in under 100 ms at 20,000 notes.

## Current state

- `search/search.ts` loads each note and scans its text for every query.
- The slowest 5% of searches last week took over 1.2 seconds.
- People with more than 2,000 notes search 40% less often than people with fewer.

## Approach

Build an index of every word to the notes that hold it, once on first launch and then one note at a time as notes change. A query looks its words up in the index and ranks the notes that hold all of them.

| Library size | Before | After |
|---|---|---|
| 500 notes | 160 ms | 9 ms |
| 5,000 notes | 1,400 ms | 31 ms |
| 20,000 notes | 5,900 ms | 78 ms |

## Steps

1. Build the word index in `search/index.ts`, with tests for adding, changing and deleting a note.
2. Keep the index current from the note store's change events.
3. Answer queries from the index in `search/search.ts`.

## Risks and open questions

- The index adds about 15% to the storage a library uses.
- The first launch after the update builds the index, which takes about 20 seconds at 20,000 notes. Search falls back to the old scan until it is ready.
