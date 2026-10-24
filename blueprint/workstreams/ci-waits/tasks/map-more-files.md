---
status: todo
assignee:
priority: low
blocked_by: []
tracker: [gh:#65]
created: "2026-10-24"
---

# CIW-T6: More of the app's files mapped in `CHECKS_FOR`

Issue #65's item 2, for later: not part of the change that delivers CIW-T1 to CIW-T4.

## Description

Find the files a change most often touches that run every terminal check (`app.ts`, drawing, the parser, the index, the
config), and map what can be mapped; a file that really is shared keeps running them all.

## References

- Rests on: issue #65, item 2; design/repository.md § CI.
