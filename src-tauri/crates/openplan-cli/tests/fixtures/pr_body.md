# Guarded status

The server refuses moves the work has not earned.

```sh
# not a heading
```

## What was agreed

- What has to be tested? Unit and end-to-end tests
  Why q1 came up.
- Where does the logic live? Unit tests (agent decided)
- What happens to old records? Leave them.
- Who may skip the guard? Nobody.
  The guard reads the record. Old records have no todos.

## Decisions

- D1: The server guards every status move.

## Todos in this PR

- [x] t1 Add the guard to `set_status`
- [x] t2 Write the guard tests

Plan: guarded-status in OpenPlan
