---
status: review
assignee: claude-links
created: "2026-10-11"
---

# T7: Another root's links to this repository's hosting are backlinks

A file in another root linking to this repository's hosting counts as a backlink here, as its pointers do.

## Description

`reach.ts` (`landsHere`) counts another root's paths, pointers and `file://` links into this root, not its links to
this repository's hosting, which D87 makes the file in this copy. Count them too, through `core/hosting.ts`, with this
checkout's remote. Also check that another root's data and code files' links count, as notes' do; if they don't,
count them (their links are in the index).

## Acceptance criteria

- A test: root B's README links `https://github.com/me/a/blob/main/x.md`; A's `x.md` lists it among its backlinks.
  It fails without the change. Likewise a link from B's code comment, if that was missing.
- design/links.md § Backlinks says what counts.

## References

- Delivers: design/links.md § Backlinks.
- Rests on: D87, D73.

## Log

- 2026-10-11: `landsHere` read every `https:` link as a URL elsewhere. It now reads a hosting URL as the linking root
  reads it, through `hostedHere` in `core/hosting.ts` (the graph's `byHosting` reasoning, moved there and shared): the
  linking root's own checkout's remote, else the named folder of that remote; the file in that copy is a backlink
  here when it is this root's. Read as the linking root reads it, not by this checkout's remote alone, so a second
  clone or a worktree doesn't claim backlinks that open the default copy, as pointers already do. The linking roots'
  remotes and the machine's named folders are read once, not per link.
- 2026-10-11: Test "another root's links to this repository's hosting are backlinks here, as its pointers are" in
  `tests/vault.test.ts` (links across vaults): B's README links A's `x.md` by its hosting URL (and another
  repository's file of the same path, which doesn't count). Mutation-checked: without the hosting branch in
  `landsHere`, A's `x.md` has no backlink; restored, it passes.
- 2026-10-11: Checked another root's data and code files: their links don't count, and the premise "their links are in
  the index" doesn't hold. A probe (B with `links.json` naming `../A/x.md` and A's hosting URL, and `run.py` with the
  URL in a comment): B's own graph lists both files' links, A's backlinks don't, and B's saved `index.json` holds
  `entries` for its notes only. Data and code files' links are read on demand and kept in memory (`fileLinksOf`,
  `dataLinkCache`), never saved. Not counted: counting them means the saved index keeping those links (a change to
  what the cache holds, D39, D61), read when a root is indexed (a code file's need its grammar, loaded
  asynchronously), and kept fresh across processes (a data file's path-like values are filtered by what resolves when
  read). For the person to decide; the acceptance criterion's code-comment case waits on it. design/links.md
  § Backlinks says they don't count, and why.
- 2026-10-11: Tried on the reference set: `work/product/README.md` links `https://github.com/kestrel-labs/kestrel`
  (kestrel's own page, its README). With product indexed (`ls --json`), `slipbox backlinks README.md` in
  `work/kestrel` lists `work/product/README.md:8`; the main checkout's code, on the same state, lists none.
- 2026-10-11: design/links.md § Backlinks says what counts from other roots and how a hosting URL is read; § Links to
  the repository's own hosting that it is a backlink from other roots too.
