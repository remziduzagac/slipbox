---
status: done
assignee: claude-cli
blocked_by: []
created: "2026-10-12"
---

# GR-T2: The history searched before the push

Nothing secret or private reaches GitHub (GR-D4).

## Description

- gitleaks over every commit, and the working tree.
- A search of the history for private text: home paths, addresses, hostnames, tokens' shapes, the user's other
  projects' private names, anything a stranger shouldn't read.
- What was found, reported to the user, with a recommendation for each; nothing rewritten without them.

## Acceptance criteria

- The report in notes.md, and the user's answer.

## Log

- 2026-10-12, gitleaks 8.30.1 over all 482 commits and over the working tree: one finding each, the same false
  positive (`generic-api-key` on a test's name in `tests/tui.test.ts`, "selection keys: shift+ctrl+end / home …").
  No secret.
- Every blob in the history searched for home paths, addresses, IP addresses, names and other projects:
  - **Commit email:** 222 commits, 2026-09-25 to 2026-10-01, carry the maintainer's personal address as author and
    committer; the later 269 carry their GitHub noreply address. Pushed, the personal one becomes public in every
    commit.
  - **The maintainer's user name in paths:** `/Users/remzi` and `/home/remzi` in old `docs/samples/` files and an
    old render snapshot, gone from the tree but in the history; the machine's kernel name (`orbstack`) in a WSL test
    and the old samples. Low risk: a user name, not a secret.
  - **The maintainer's other projects** named in the blueprint (`<dotfiles>`, the herdr config, workslate's theme
    files): references, no content.
  - Everything else is example data on purpose: `example.org`/`.invalid` addresses, documentation IP ranges
    (192.0.2.x, 198.51.100.x, 203.0.113.x), private 10.x addresses in the reference set's infra files.
- Asked the user: rewrite the 222 commits' address to the noreply one before the push (git filter-repo; every hash
  changes, so the hashes cited in files are remapped from its commit map), or publish as is. The user chose the
  rewrite (GR-D12); it is done by GR-T13, just before the first push.
