# Keymap compared: vim, VS Code, Obsidian, slipbox

The key map decided on 2026-09-29, beside vim's, VS Code's and Obsidian's keys for the same
actions. The rules it follows are in [keymap.md](keymap.md), "Conventions": **vim's keys first**
where slipbox has the action, **the desktop editors' `ctrl` keys next** where vim's use of them is
marginal in a notes app, **`ctrl+w` and `ctrl+t` as the window and tab prefixes**, and **`space`
for the rest**. `keymap.md` is the reference; this page is for comparing.

Notation: `C-` ctrl, `S-` shift, `A-` alt, `␣` the leader (space); `␣tQ` is `space t shift+q`. VS Code's
keys are its Linux and Windows defaults. `?` marks an Obsidian default not confirmed; `—` none.

## Moving around

| Action | vim | VS Code | Obsidian | slipbox |
| --- | --- | --- | --- | --- |
| character / line | `h j k l` | arrows | arrows | `h j k l`, arrows |
| word | `w b e` | `C-←/→` | `C-←/→` | `w b e`, `C-←/→` |
| select by word | `v` + `w b e` | `C-S-←/→` | `C-S-←/→` | `v` + `w b e`, `C-S-←/→` |
| row start / end | `0 ^ $` | `Home` / `End` | `Home` / `End` | `0 ^ $`, `Home` / `End` |
| select to row start / end | `v0` `v$` | `S-Home` / `S-End` | `S-Home` / `S-End` | `v0` `v$`, `S-Home` / `S-End` |
| top / bottom of the note | `gg` / `G` | `C-Home` / `C-End` | `C-Home` / `C-End` | `gg` `G`, `C-Home` / `C-End` |
| screen top / middle / bottom | `H` `M` `L` | — | — | `H` `M` `L` |
| cursor's line to middle / top / bottom | `zz` `zt` `zb` | — | — | `zz` `zt` `zb` |
| half page down / up | `C-d` / `C-u` | — | — | `C-d` / `C-u` |
| page down / up | `C-f` / `C-b` | `PgDn` / `PgUp` | `PgDn` / `PgUp` | `PgDn` / `PgUp` |
| previous / next heading | `[[` / `]]` | — | — | `[[` `]]`, `A-↑/↓` |
| previous / next paragraph | `{` / `}` | — | — | `{` `}`, `C-↑/↓` |
| go to line | `:42`, `42G` | `C-g` | — | `:42`, `42G`, `C-g`, `␣fl` |

## Editing and the clipboard

| Action | vim | VS Code | Obsidian | slipbox |
| --- | --- | --- | --- | --- |
| undo | `u` | `C-z` | `C-z` | `u`, `C-z` |
| redo | `C-r` | `C-y`, `C-S-z` | `C-S-z` | `C-r`, `C-y`, `U` |
| copy | `y…` | `C-c` | `C-c` | `y…`, `C-c` (always the system clipboard too) |
| cut the character | `x` | `C-x` | `C-x` | `x` (source, lens) |
| cut with a motion / the line | `d…` / `dd` | `C-S-k` (line) | — | `d…` / `dd` (source, lens) |
| paste | `p` / `P` | `C-v` | `C-v` | `p` / `P` (the system clipboard), the terminal's paste |
| move the line | — | `A-↑/↓` | `?` | `A-S-↑/↓` |
| toggle a task | — | — | `C-l` | `C-l`, `␣nt`, a click |
| older / newer change, last insert | `g;` `g,`, `gi` | — | — | `g;` `g,`, `gi` |
| lens bigger / smaller / own size | — | — | — | `+` `-` `=` |
| save / save all | `:w` / `:wa` | `C-s` / `C-k s` | automatic | `C-s`, `␣nw`, `:w` / `␣nW`, `:wa` |

## Finding and opening

| Action | vim | VS Code | Obsidian | slipbox |
| --- | --- | --- | --- | --- |
| find in the note | `/` | `C-f` | `C-f` | `/`, `C-f`, `␣f/` |
| find backward | `?` | — | — | `/` then `N` (`?` is help) |
| next / previous match | `n` / `N` (search's way) | `Enter` / `S-Enter` | `Enter` / `S-Enter` | `n` / `N` (always) |
| replace | `:s` | `C-h` | `C-h` | `C-h`, `␣fr`, `:s` |
| search the vault | `:vimgrep` | `C-S-f` | `C-S-f` | `C-S-f`, `␣fg` |
| open a note | `:e` | `C-p` | `C-o` | `C-p` (recent first), `␣ff`, `:e` |
| command palette | `:` | `C-S-p`, `F1` | `C-p` | `:`, `C-S-p`, `␣fp` |
| a heading in this note | — | `C-S-o` | `?` | `␣fo` |

## Links and history

| Action | vim | VS Code | Obsidian | slipbox |
| --- | --- | --- | --- | --- |
| follow the link | `gf`, `gx` | `C-click` | `A-Enter` | `Enter`, `gf`, `gx`, `␣lf`, a click |
| follow it into the split | `C-w f` | `C-Enter` | `?` | `C-Enter`, `C-w f`, `␣ls`, `␣wf` |
| next / previous link | — | — | — | `Tab` / `S-Tab`, `]l` / `[l`, `␣ln` / `␣lp` |
| back / forward | `C-o` / `C-i` | `A-←` / `A-→` | `C-A-←` / `C-A-→` | `C-o`, `A-←` / `A-→`, `␣hp` / `␣hn` |
| the history | `:jumps` | — | — | `␣hh` |

## Windows

| Action | vim | VS Code | Obsidian | slipbox |
| --- | --- | --- | --- | --- |
| split side by side / stacked | `C-w v` / `C-w s` | `C-\` | — | `C-w v`, `C-\`, `␣wv` / `C-w s`, `␣ws` |
| focus a window | `C-w hjkl` | — | — | `C-w` or `␣w` + `hjkl` or arrows |
| move a window | `C-w HJKL` | — | — | `C-w` or `␣w` + `HJKL` or `S-`arrows |
| other / swap / keep only | `C-w w` / `x` / `o` | — | — | `C-w` or `␣w` + `w` / `x` / `o` |
| resize, resize mode | `C-w + - < > =` | — | — | `C-w` or `␣w` + `+ - < > =`; `␣wr` |
| close the window | `C-w q`, `:q` | — | — | `C-w q`, `␣wq`, `q`, `:q` |

## Tabs

| Action | vim | VS Code | Obsidian | slipbox |
| --- | --- | --- | --- | --- |
| new tab | `:tabnew` | `C-n` (a file) | `C-t` | `C-t c`, `␣tc`, `:tabnew` |
| next / prev tab | `gt` / `gT` | `C-Tab`, `C-PgDn/Up` | `C-Tab` | `gt` `gT`, `C-Tab`, `C-PgDn/Up`, `C-t`/`␣t` + `n/p` |
| tab N | `Ngt` | `A-1…9` | `C-1…8` | `A-1…9`, `C-t 1…9`, `␣t 1…9` |
| move the tab | — | `C-S-PgUp/PgDn` | — | `C-S-PgUp/PgDn`, `C-t S-h/l`, `␣t S-h/l` |
| list the tabs | `:tabs` | — | — | `C-t t`, `␣tt` |
| close the tab | `:tabclose` | `C-w` | `C-w` | `C-t q`, `␣tq`, `q` on its last window |
| close the others / all | `:tabonly` / — | — | — | `C-t o`, `␣to`, `:tabonly` / `C-t Q`, `␣tQ` |
| pin the tab | — | `C-k S-Enter` | — | `C-t m`, `␣tm`, `:tabpin` |

## Panes, views and the app

| Action | vim | VS Code | Obsidian | slipbox |
| --- | --- | --- | --- | --- |
| explorer / reveal the note in it | — | `C-S-e`, `C-b` | — | `␣e` / `␣E` |
| outline | — | — | — | `␣o` |
| rendered ↔ source | — | `C-S-v` | `C-e` | `C-e`, `␣nv`, `:source` |
| the lens | — | — | live preview | `␣nl`, `:lens` |
| wrap / readable width / zen | `:set wrap` | `A-z` / — / `C-k z` | — | `A-z`, `␣uw` / `␣uW` / `␣uz` |
| problems bar / marks | `:set signcolumn` / — | — | — | `␣ud` / `␣uD` |
| file info | `C-g` | — | — | `␣ni` |
| help | `:help` | `F1` (palette) | — | `?`, `␣?`, `:help` |
| quit | `:qa` | `C-q` | `C-q` | `C-q`, `␣qq`, `:qa`, `:q` on the last window |
| new note (phase 4) | — | `C-n` | `C-n` | `C-n`, reserved |

## Where slipbox differs, on purpose

- **`C-w` is vim's window prefix, not close.** The desktop editors close a tab with it; a
  compositor may take it too (Hyprland configs often do), and browsers always do. `␣w…` works
  wherever `C-w` doesn't reach.
- **`C-t` is slipbox's tab prefix.** Obsidian opens a tab with it, VS Code finds a symbol, vim pops
  the tag stack, zellij uses it for its tab mode. `␣t…` is the route that always works.
- **`C-e` is rendered ↔ source**, Obsidian's meaning; vim scrolls a line with it, VS Code opens a
  file.
- **`Tab` is next link.** Terminals send vim's `C-i` (forward) as `Tab`, so forward is `A-→` and
  `␣hn`.
- **`A-↑/↓` jump between headings** (as JetBrains jumps between methods); VS Code moves the line
  with them, which is `A-S-↑/↓` here.
- **`C-z` undoes, `C-c` copies.** slipbox reads the terminal raw: neither suspends nor interrupts
  it. `C-v` is unbound (`p` pastes, and the terminal's paste works as ever).
- **`?` is help, not vim's backward search**, and `n` / `N` always go forward / backward rather than
  the way the search went: `/` then `N` searches backward.
- **`q` closes the window or the tab but never quits**, vim's macro key being unused here; `:q`
  quits on the last window, as vim's does.
- **Chords a terminal may not pass** — `C-S-f`, `C-S-p`, `C-Tab`, `C-Enter`, `A-1…9` — each have a
  `␣` or `:` route.
