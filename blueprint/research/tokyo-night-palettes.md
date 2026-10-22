---
status: current
created: "2026-10-18"
---

# Research: Tokyo Night palettes

Verified against folke/tokyonight.nvim at commit `cdc07ac78467a233fd62c493de29a17e0cf2b2b6`. The four Helix exports
were read at
that exact revision, including Day's generated palette, rather than reconstructing its inversion algorithm.

## Summary

- **Four variants:** Night, Storm, Moon and Day are upstream styles (*read*, upstream README).
- **The old default was customized:** its darker backgrounds and softer foreground followed D96; the old Day palette
  also had a custom strong foreground. These were deliberate local values, not upstream palette values (*read*,
  `core/theme/builtin.ts` before D254, and D96).
- **One role mapping suffices:** map upstream colours into slipbox's palette, then use its existing semantic roles and
  typography. D254 replaces the colour deviations while retaining the readability mechanisms (*ours*).

## Mapping

Night and Storm share their accent colours; their backgrounds differ. Moon has distinct accents as well as its own
background. Day's exported colours already include upstream's light conversion (*read*, palette exports below).

The mapping is the same for all four variants (*ours*):

- `bg` and `bg_dark` retain their upstream meanings.
- `surface` uses `bg_highlight`; `surface2` and readable borders use `fg_gutter`.
- Normal and strong text use `fg`; dim text uses `fg_dark`. Upstream's bold markup also uses `fg`.
- Comment and named accent colours map directly. Inline code keeps its background and italics; syntax keeps bold
  keyword/function roles, using the variant's own magenta and blue.
- Heading bands and other tints remain slipbox's existing blends; these derived colours are role styling, not new
  base palette colours.

## Verification

The pinned upstream values used by the mapping are retained in `tests/fixtures/themes/tokyo-night.json`.
`tests/tokyo-night.test.ts` checks all variants' base colours and document, syntax and chrome roles against that
fixture. The theme-switching terminal check exercises all four variants live.

## Sources

All sources were read directly on 2026-10-18 (*read*):

- [Upstream project](https://github.com/folke/tokyonight.nvim/tree/cdc07ac78467a233fd62c493de29a17e0cf2b2b6).
- [Night palette export](https://github.com/folke/tokyonight.nvim/blob/cdc07ac78467a233fd62c493de29a17e0cf2b2b6/extras/helix/tokyonight_night.toml).
- [Storm palette export](https://github.com/folke/tokyonight.nvim/blob/cdc07ac78467a233fd62c493de29a17e0cf2b2b6/extras/helix/tokyonight_storm.toml).
- [Moon palette export](https://github.com/folke/tokyonight.nvim/blob/cdc07ac78467a233fd62c493de29a17e0cf2b2b6/extras/helix/tokyonight_moon.toml).
- [Day palette export](https://github.com/folke/tokyonight.nvim/blob/cdc07ac78467a233fd62c493de29a17e0cf2b2b6/extras/helix/tokyonight_day.toml).
