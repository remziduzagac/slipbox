---
status: review
assignee: claude-52
blocked_by: []
related: [PIC-T1, PIC-T2, PIC-T3, PIC-T4]
tracker: [gh:#52]
created: "2026-10-24"
---

# PIC-T5: Terminal checks and live tries

Every case driven through slipbox in a headless terminal with Kitty's graphics, and tried live.

## Description

- `tests/terminal/checks/reading.ts`: checks with `graphics: true`, reading the placeholders' row and column marks off
  the screen: a picture fitted to its window; a short window's floor; a click to its own size and back; scrolled by
  `z l` and the wheel; a resize; a stacked split; wrapping off; an embedded note's picture.
- Live: this worktree's slipbox on a scratch copy of the reference set (`tmp/issue/home`), in the right pane: the
  README's screenshots, the cases above, and their neighbours; written here.

## Acceptance criteria

- The checks pass with `SLIPBOX_TERMINAL_JOBS=2`; each fails without the change it checks (undone once).

## References

- Delivers: requirements.md § Acceptance criteria.

## Log

- 2026-10-24: `tests/terminal/checks/pictures.ts`, four checks with Kitty's graphics read off the placeholders'
  marks: fitted, a click and `z p` to its own size and back, `z h` / `z l` and the wheel; narrower, the floor in a
  short window, a stacked split, wrapping off; an embedded note's picture; the message where none are drawn. 4/4 with
  `SLIPBOX_TERMINAL_JOBS=2`. Undone once, the floor, the height bound, the click and the placeholders' column each fail
  a check (`tmp/issue/mutations.log`). The reference set gained `work/product/assets/route-planner-2.3.png` (1,734 ×
  950, a mock, flat colours), shown in `2.3-notes.md` and embedded in `2.3-plan.md`; CASES.md and the manifest say so.
- 2026-10-24, live: this worktree's slipbox on a scratch reference set in the right pane. herdsman draws no Kitty
  placeholders, so the picture's rows are blank there, and their count shows its size: fitted to the window 28 rows,
  at its own size 35 (that terminal's cells), `z p` alternating in the message log; `z p` off a `▣` line, the message.
- 2026-10-24: `tests/render.test.ts`'s "Mermaid … drawn while its library loads" fails here on this branch's base too
  (a scratch worktree at the base): not this work's.
