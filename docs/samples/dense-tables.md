**Leader = `Space`** · Pattern = `<count><verb><motion>` (e.g. `3dw` = delete 3 words) · `Space` + wait → which-key popup

---

## Modes

| Key                | Mode    | Use         |
| ------------------ | ------- | ----------- |
| `Esc`              | Normal  | navigation  |
| `i` `a` `o` `I` `A` `O` | Insert  | typing      |
| `v` `V` `Ctrl+v`   | Visual  | selection   |
| `:`                | Command | run command |
| `/` `?`            | Search  | find        |

## Insert mode — pick the right entry

| Key | Where                  |
| --- | ---------------------- |
| `i` | before cursor          |
| `a` | after cursor (append)  |
| `I` | start of line          |
| `A` | end of line            |
| `o` | new line below         |
| `O` | new line above         |
| `s` | delete char + insert   |
| `c<motion>` | change (e.g. `cw`) |

## Insert-mode shortcuts (while typing)

| Key             | Action                                  |
| --------------- | --------------------------------------- |
| `<C-w>` `<C-u>` | delete prev word / to line start        |
| `<C-r><reg>`    | paste register (e.g. `<C-r>+` = clipboard) |
| `<C-o> <cmd>`   | run ONE normal command, back to insert  |

## Movement

| Key                | Action                              |
| ------------------ | ----------------------------------- |
| `h` `j` `k` `l`    | left / down / up / right            |
| `w` `b` `e`        | next word / prev word / end of word |
| `W` `B` `E`        | same but **WORD**-wise (whitespace-separated) |
| `0` `^` `$` `g_`   | line start / first non-blank / end / last non-blank |
| `gg` `G` `<N>G`    | top / bottom / line N               |
| `{` `}`            | previous / next paragraph (blank line) |
| `(` `)`            | previous / next sentence            |
| `Ctrl+d` `Ctrl+u`  | half page down / up                 |
| `Ctrl+f` `Ctrl+b`  | full page forward / back            |
| `Ctrl+e` `Ctrl+y`  | scroll one line down / up (cursor stays) |
| `zz` `zt` `zb`     | center / top / bottom current line  |
| `f<c>` `F<c>` `t<c>` `T<c>` | jump to / up-to char (`;`,`,` repeat) |
| `%`                | jump to matching bracket            |
| `*` `#`            | search word under cursor f/b        |

## Treesitter motions (nvim-treesitter-textobjects)

| Key             | Action                              |
| --------------- | ----------------------------------- |
| `]m` `[m`       | next / previous function start      |
| `]]` `[[`       | next / previous class / section     |
| `vaf` `vif`     | select around / inside function     |
| `vac` `vic`     | select around / inside class        |

## Editing

| Key            | Action                                |
| -------------- | ------------------------------------- |
| `x`            | delete char                           |
| `dw` `dd` `D`  | delete word / line / to end-of-line   |
| `cw` `cc` `S`  | change word / line / line             |
| `r<c>` `R`     | replace one char / replace mode       |
| `u` `Ctrl+r`   | undo / redo                           |
| `.`            | **repeat last change** (powerful)     |
| `yw` `yy`      | yank word / line                      |
| `p` `P`        | paste after / before                  |
| `>>` `<<`      | indent / unindent                     |
| `J`            | join line below                       |
| `~`            | toggle case                           |
| `<count><cmd>` | e.g. `5dd` delete 5 lines             |

## Visual + Text Objects

| Key       | Selection         |
| --------- | ----------------- |
| `v`       | char-wise         |
| `V`       | line-wise         |
| `Ctrl+v`  | block / column    |
| `viw`     | inner word        |
| `vip`     | inner paragraph   |

Text objects — combine with `i` (inner) or `a` (around):

| Object | What it grabs        |
| ------ | -------------------- |
| `w` `s` `p` | word / sentence / paragraph |
| `"` `'` `` ` `` | quoted text |
| `(` `[` `{` `<` | bracketed text |
| `t`    | HTML/XML tag         |

Examples: `ci"` change inside quotes · `da(` delete around parens · `vit` select inner tag · `yi{` yank inside braces

## Multi-cursor (vim-visual-multi)

| Key            | Action                                  |
| -------------- | --------------------------------------- |
| `Ctrl+n`       | start: select word + add cursor at next |
| `n` `N`        | skip / back                             |
| `Ctrl+a`       | add cursor at every match in selection  |
| `Ctrl+Up/Dn`   | add cursor on line above / below        |
| `q`            | drop current cursor                     |
| `Esc`          | exit multi-cursor                       |

## Surround (mini.surround — bundled)

| Key                  | Action                              |
| -------------------- | ----------------------------------- |
| `sa<motion><c>`      | **add** — `saiw"` → `"word"` · visual: `sa<c>` |
| `sd<c>`              | **delete** — `sd"` removes surrounding `"` |
| `sr<old><new>`       | **replace** — `sr"'` → `"` becomes `'` |

## Search & Replace

| Key              | Action                            |
| ---------------- | --------------------------------- |
| `/pat` `?pat`    | search forward / back             |
| `n` `N`          | next / previous match             |
| `:noh`           | clear highlight                   |
| `:s/old/new/g`   | replace in current line           |
| `:%s/old/new/g`  | replace in whole file             |
| `:%s/old/new/gc` | replace with confirm              |
| `:5,10s/old/new/g` | replace in line range           |

## Completion popup (blink.cmp)

| Key             | Action                       |
| --------------- | ---------------------------- |
| `<C-Space>`     | trigger completion           |
| `<Tab>` `<S-Tab>` | next / previous item       |
| `<CR>` / `<C-y>`| confirm · `<C-e>` abort      |

## Comments (mini.comment — bundled)

| Key            | Action                                |
| -------------- | ------------------------------------- |
| `gcc`          | toggle current line                   |
| `gc<motion>`   | toggle range (e.g. `gcap`, `gc3j`)    |
| `gc` (visual)  | toggle selection                      |

## Folding (collapse code regions)

| Key       | Action                              |
| --------- | ----------------------------------- |
| `za`      | toggle fold at cursor               |
| `zo` `zc` | open / close fold                   |
| `zR` `zM` | open all / close all folds          |
| `zr` `zm` | open / close one level globally     |
| `zj` `zk` | jump to next / previous fold        |

## Markdown helpers

| Key / command           | Action                              |
| ----------------------- | ----------------------------------- |
| `:RenderMarkdown`       | toggle pretty render (force: `enable` / `disable`) |
| `gqap` · `gqq`          | reflow paragraph / single line to `textwidth` |
| `saiw*` · `` saiw` ``   | wrap as `*italic*` (×2 = `**bold**`) · `` `code` `` |
| `saiw[` then add `()`   | wrap as `[word]`, then type `(url)` |
| `gx`                    | open URL / file path under cursor   |

---

## Files / Buffers

| Key                          | Action                        |
| ---------------------------- | ----------------------------- |
| `:w` `:w name` `:wq` `ZZ`    | save / save-as / save+quit    |
| `:q` `:q!` `:wqa` `:qa!`     | quit / force / all / force-all|
| `:e file` `:e!`              | open / reload from disk       |
| `:ls`                        | list open buffers             |
| `:b <N>` `:b <name>`         | switch to buffer              |
| `:bn` `:bp` `:bd`            | next / prev / delete buffer   |
| `<C-^>` (or `<C-6>`)         | toggle alternate buffer (most recent other) |

## Windows / Splits

| Key                          | Action                          |
| ---------------------------- | ------------------------------- |
| `:sp` / `Ctrl+w s`           | horizontal split (above/below)  |
| `:vs` / `Ctrl+w v`           | vertical split (side by side)   |
| `Ctrl+w h/j/k/l` · `<C-h/j/k/l>` | move focus (vanilla · kickstart shortcut, no prefix) |
| `Ctrl+w c` / `Ctrl+w o`      | close current / keep only this  |
| `Ctrl+w =`                   | equalize all window sizes       |
| `Ctrl+w > <` / `+ -`         | wider/narrower · taller/shorter |

## Tabs (page-level, heavier than splits)

| Key                              | Action                       |
| -------------------------------- | ---------------------------- |
| `:tabnew <f>` `:tabc` `:tabo`    | new / close / close others   |
| `gt` `gT`                        | next / previous tab          |

## Marks

| Key             | Action                                |
| --------------- | ------------------------------------- |
| `ma` · `mA`–`mZ` | local mark · **global** (across files, persists across sessions) |
| `'a` `` `a ``   | jump to line / exact position         |
| `''` `` `. `` `` `^ `` · `:marks` | last jump · edit · insert exit · list all |

## Registers

| Key             | Action                              |
| --------------- | ----------------------------------- |
| `:reg`          | list contents of all registers      |
| `"+y` `"+p`     | yank / paste **system clipboard**   |
| `"_d`           | delete to **black hole** (preserves yank) |
| `"0p` · `"1`–`"9` | paste last yank (survives `d`/`c`) · numbered delete history |

## Jumps & change history

| Key             | Action                              |
| --------------- | ----------------------------------- |
| `Ctrl+o` `Ctrl+i` | jump back / forward (file-aware) |
| `g;` `g,`       | older / newer edit position         |
| `` `` `` `` (backtick×2) | back to pos before last jump |

## Neo-tree (file tree — open with `<Space>e`)

| Key             | Action                              |
| --------------- | ----------------------------------- |
| `?`             | help overlay inside tree            |
| `<CR>` / `o`    | open file / expand folder           |
| `<C-x>` `<C-v>` `<C-t>` | open in hsplit / vsplit / tab |
| `s` `S`         | open in vsplit / hsplit (Neo-tree native) |
| `z`             | collapse all folders in tree        |
| `a`             | add file (end name with `/` for dir)|
| `A`             | add directory                       |
| `d` `r`         | delete / rename                     |
| `c` `m`         | copy / move (then navigate + paste) |
| `y` `x` `p`     | yank / cut / paste path-clipboard   |
| `H` `R`         | toggle hidden · refresh tree        |
| `q`             | close tree window                   |

## Telescope (in any picker)

| Key                    | Action                          |
| ---------------------- | ------------------------------- |
| `<C-n>` `<C-p>` / ↓ ↑  | next / previous result          |
| `<CR>`                 | open                            |
| `<C-x>` `<C-v>` `<C-t>`| open in hsplit / vsplit / tab   |
| `<Tab>`                | multi-select (toggle this item) |
| `<C-u>` `<C-d>`        | scroll preview up / down        |
| `<C-w>`                | delete previous word in prompt  |
| `<C-r>"` (insert)      | paste register `"` into prompt  |
| `<C-/>` insert · `<Esc>` normal | show keymaps · close   |

## kickstart (leader = `Space`)

| Key            | Action                                  |
| -------------- | --------------------------------------- |
| `<Space>` + wait | which-key popup (discover keys)       |
| `<Space>sf`    | search files (fuzzy)                    |
| `<Space>sg`    | grep in project (live)                  |
| `<Space>s/`    | live grep in **open buffers**           |
| `<Space>/`     | fuzzy search in **current buffer**      |
| `<Space>s.`    | recent files                            |
| `<Space><Space>` | buffer list (Telescope picker)         |
| `<Space>sw`    | search word under cursor                |
| `<Space>sk` `<Space>sh` | search keymaps / help tags     |
| `<Space>ds`    | document symbols                        |
| `<Space>ws`    | workspace symbols                       |
| `<Space>ss`    | pick from **all** Telescope builtins    |
| `<Space>D`     | go to type definition (LSP)             |
| `<Space>e`     | toggle file tree (Neo-tree)             |
| `<Space>th`    | toggle inlay hints                      |

## LSP

| Key              | Action                       |
| ---------------- | ---------------------------- |
| `K`              | hover docs                   |
| `<C-k>` (insert) | signature help for current function call |
| `gd` `gD`        | go to definition / declaration |
| `gI`             | go to implementation         |
| `gr`             | find references              |
| `<Space>rn`      | rename symbol                |
| `<Space>ca`      | code actions                 |
| `]d` `[d`        | next / previous diagnostic   |
| `<C-w>d`         | open diagnostic float for current line |

## Gitsigns

| Key                       | Action                       |
| ------------------------- | ---------------------------- |
| `]c` `[c`                 | next / previous git hunk     |
| `<Space>hp`               | preview hunk diff            |
| `<Space>hs` · `<Space>hr` | stage / reset hunk           |
| `<Space>hb`               | blame line (toggle inline blame) |
| `<Space>hd`               | diff buffer against index    |

## Ex commands you'll actually use

| Command                  | Action                         |
| ------------------------ | ------------------------------ |
| `:g/pat/d`               | delete every line matching pat |
| `:v/pat/d`               | delete every line **NOT** matching |
| `:sort` · `:sort u`      | sort lines / sort+unique       |
| `:set list!` · `:set wrap!` | toggle whitespace / line wrap |
| `:Inspect` · `:LspInfo`  | treesitter info · LSP servers for buffer |
| `:edit %:h` · `:cd %:h`  | open / cd to **dir of current file** |
| `:r file` · `:r !cmd`    | insert file content / shell output |
| `:earlier 5m` · `:later 1m` | time-travel undo by clock |

## Survival

| Key                       | Action                       |
| ------------------------- | ---------------------------- |
| `:e!`                     | reload buffer from disk (after swap warning, etc.) |
| `:term` · `<C-\><C-n>`    | open terminal · escape terminal mode |
| `:help <topic>`           | help on anything (`:help` alone = main menu) |
| `:checkhealth` · `:Mason` | nvim diagnostics · install LSPs / formatters |
| `g-` · `g+`               | older / newer text state (**undo by time**, branches) |
| `:undolist`               | show full undo tree branches |
| `Ctrl+g`                  | show file / cursor position  |
