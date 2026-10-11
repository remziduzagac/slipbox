---
status: todo
assignee:
created: "2026-10-11"
---

# T4: `slipbox deinit` relinks pointers that name the folder

Unmaking a named folder rewrites the pointers that name it, from the files this machine reaches, as paths.

## Description

`planUnmakeVault` rewrites `/…` links and wikilinks so they keep reaching what they reached, but not pointers by the
folder's name (`slipbox://<name>/…`), which then break: once the folder has no name, nothing can resolve them. Plan
them too, as the relink would: each pointer from another root's file (the backlinks across roots, `reach.ts`) becomes
a relative path where the two travel together, else the path a link between separate folders gets (design/links.md
§ Between folders). The plan is previewed and applied like the rest (`plans.ts`).

## Acceptance criteria

- A test: two roots, one named, the other linking into it by pointer; `deinit` on the named one plans and applies the
  pointer's rewrite; afterwards the link resolves. It fails without the fix.
- The TUI's `shift+v` on a named folder's row previews the same plan.
- design/roots.md § `.slipbox/` and design/links.md § Pointers say it.

## References

- Delivers: design/roots.md § `.slipbox/`; design/links.md § Pointers.
- Rests on: D74, D75, D149.

## Log
