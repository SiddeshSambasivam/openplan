---
id: demo-keyboard-shortcuts
title: Demo: keyboard shortcuts
status: completed
type: feature
source: claude-code
folders: [Demo]
demo: true
created: {now}
updated: {now}
completed: {now}
---
# Demo: keyboard shortcuts

## Summary

Every action in Notes needed the mouse. This plan added a key for the eight most used actions and a sheet that lists them, opened with `?`.

## Current state

- The editor handled typing keys only. Every other action was a menu item.
- The eight actions in the table below made up 85% of menu clicks last month.

## Approach

One table of shortcuts drives both the key handling and the sheet, so the two cannot disagree.

| Action | Key |
|---|---|
| New note | `Cmd N` |
| Search | `Cmd K` |
| Pin or unpin the note | `Cmd Shift P` |
| Move to a notebook | `Cmd Shift M` |
| Duplicate | `Cmd D` |
| Delete | `Cmd Backspace` |
| Go back | `Cmd [` |
| Show every shortcut | `?` |

## Steps

1. Add the shortcut table and its key handler in `keys/shortcuts.ts`.
2. Add the shortcut sheet in `keys/ShortcutSheet.tsx`.
3. Show each action's key beside it in the menus.

## Risks and open questions

- `Cmd D` adds a bookmark in some browsers. The web app asks the browser to let it have the key, and falls back to the menu when it cannot.
