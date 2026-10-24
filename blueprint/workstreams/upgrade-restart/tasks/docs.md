---
status: todo
assignee: claude-23
blocked_by: [UPG-T4, UPG-T5, UPG-T6]
created: "2026-10-24"
---

# UPG-T8: The user docs and the CHANGELOG

What users will see, said where they read about updates, without the blueprint's IDs.

## Acceptance criteria

- The docs that speak of updates and upgrading say the offer, its choices, Skip this version, `:upgrade`,
  `:restart`, the question about unsaved notes, and the restart offer after an upgrade underneath; `keys.md` lists the
  two commands; the storage page lists the restart's note and `upgrade.lock`.
- A CHANGELOG line under Unreleased.
- `bun run test:docs` and `check:docs` pass.

## References

- Delivers: ../requirements.md § Acceptance criteria (the user docs and the CHANGELOG).

## Log
