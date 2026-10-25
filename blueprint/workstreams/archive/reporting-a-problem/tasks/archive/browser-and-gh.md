---
status: done
assignee: claude-5
created: "2026-10-24"
---

# RPT-T3: The browser and gh

The programs a report runs, on your say (RPT-D3, RPT-D4; design.md § Sending's browser and gh).

## Description

- `core/browser.ts`: which opener this machine has (`open`; in WSL `wslview`, else `explorer.exe`; `xdg-open` with a
  display; none over SSH), as an argument vector; `explorer.exe`'s 1 not a failure.
- `core/gh.ts`: `gh` on `PATH`; its account without the network (`GH_TOKEN`, `GITHUB_TOKEN`, said unchecked; else
  `gh config get -h github.com user`); `gh issue create --repo --title --body-file -` from the home folder, the body
  on its input, a minute at most; its address, or its first lines on a failure, or a timeout.

## Acceptance criteria

- Unit tests: each platform's opener and none; the account by each way and none; a post's argument vector, input and
  folder; done, failed, timed out (a fake `gh` on `PATH`).
