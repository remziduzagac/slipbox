# Decisions: what LazyVim and Helix users reach for

Settled with the user on 2026-11-08, item by item, from [the comparison](../../research/lazyvim-helix.md). Each says
what was chosen and what was offered beside it. Where a part is left to its task, the design marks it **Open**.

## EG-D1: The parts, in order (2026-11-08)

**Decision:** The workstream builds, in order:

1. the lists of places: the preview, where a pick opens, the last list again (EG-D2), which the later lists use;
2. at once beside it, each on its own: jump labels (EG-D3), problems where they are (EG-D5), `space g` as a group with
   a branch's commits and a line's web link (EG-D15, EG-D4, EG-D18), the structure: text objects, syntax jumps and
   growing the selection (EG-D6, EG-D7), folding a note's sections (EG-D11), reflow (EG-D12);
3. after the lists: TODOs (EG-D9), find in every note and replace with rows left out (EG-D10), undo by time
   (EG-D13), the copies kept and marks (EG-D20);
4. after the structure, surround (EG-D8); after `space g`, the blame column and the inline diff (EG-D16, EG-D17);
5. the language servers' additions (EG-D19) and the smaller keys and defaults (EG-D22), any time;
6. windows split freely and zoomed (EG-D21), with or after the roadmap's Later item "Window/tab ownership and document
   tools", which owns the window model it changes;
7. several selections at once (EG-D14), last: the most expensive, its keys settled first.

Staying out: debug adapters, test runners, toolchain managers and language extras, a plugin manager, AI chat inside
the editor, a profiler, animations, a dashboard, a terminal of its own; macros, named registers and block selection
(D155 stands for them); pull request and issue pickers (`gh` has them); an undo tree, undo kept across restarts, and
wrapping as you type.

**Why:** The preview is the one piece many others show through, so it comes first; the rest are independent, and the
top-ranked of the comparison (labels, previews, a branch's commits, problems) start first. Several selections change
how every edit, undo step and server edit is made, so they wait until everything else is in.

**Not chosen:** a workstream for the top ten alone, the rest later: the user went through the whole comparison first.

## EG-D2: Lists of places: a preview, where a pick opens, the last list again (2026-11-08)

**Decision:** The lists whose rows are places (the switcher, search, find in every note, references, backlinks, links,
and the lists EG adds of places) show the selected row's place: the file as slipbox shows it, at the hit, the hit
marked. Beside the list on a wide screen, under it on a narrow one; `ctrl+t` hides or shows it. The palette, help and
menus stay as they are. In every such list, `alt+enter` asks where the pick opens: here, the split, a new tab or a peek.
`space '` opens the last list of places again as it was, its filter and selection kept.

**Why:** Judging twenty hits or references means opening each today. Windows Terminal takes `alt+enter` for full
screen by default, so its command is in the palette too.

**Not chosen:** the preview off until `ctrl+t`; previews for search hits only, as lines of context; `ctrl+s` for the
split and `ctrl+enter` for a new tab, or the split alone.

## EG-D3: Jump labels (2026-11-08)

**Decision:** One command labels every visible word start and link, in both windows of a split; typing a label moves
the cursor there, and `enter` on a link then follows it. `s` while reading, where it's free, and `g w` there and in
SOURCE view, where `s` stays vim's substitute.

**Why:** Reading is slipbox's main mode, and today a far place is `f`/`t` within a row, `tab` from link to link, or a
search.

**Not chosen:** labels on links and headings only, a link's following at once; `g w` alone, leaving `s` free.

## EG-D4: A branch's commits (2026-11-08)

**Decision:** "This branch's commits" in the git panel, and `:log`: the commits since the branch's base, newest first,
each its hash, subject, author and day; a branch opened up in Branches lists its commits too. `enter` on a commit
lists the files it changed; `enter` on a file shows that commit's change to it, drawn as every diff is.

**Why:** An agent's branch is reviewed a commit at a time; slipbox had a file's history and the branch's diff as one
whole, never its commits.

**Not chosen:** a commit opening as one long diff of all its files, as `git show` prints it; the whole history, not
just since the base.

## EG-D5: Problems where they are: jumps, the status line, the whole message (2026-11-08)

**Decision:** `] d` / `[ d` go to the next or previous problem shown in the file, around its ends; `] e` / `[ e` to
errors only. With the cursor on a problem, the status line shows its message. `space c d` opens it in full in a
floating window, with who found it; there `y` copies it and `s` adds it to the scratch for an agent.

**Why:** Working through a linter's or a server's findings meant the Problems panel, its `j` and `k` moving the note.
The status line said only how many; what each said was the panel's (design/tui.md § Screen layout), and that changes.

**Not chosen:** the message dim after the end of its line, as Helix and LazyVim write it; jumps alone, the panel's
selection following.

## EG-D6: Text objects and jumps by syntax (2026-11-08)

**Decision:** Text objects for code, from its grammar (code files, code cells, fenced blocks): `f` a function, `c` a
class or type, `a` an argument, `o` a block; and for Markdown: `h` a section, `l` a list item, `o` a fenced block, `k`
a link; `i` the inside, `a` the whole, after the operators and in visual mode, in SOURCE view and the lens. Matching
jumps: `] f` / `[ f` a function, `] a` / `[ a` an argument, `] o` / `[ o` a block, in a note the next fenced block.
Classes and types stay on `]]` / `[[`, since `] c` is git's and `] t` a note type's.

**Why:** The grammars ship already; and neither LazyVim nor Helix has Markdown's, the edits notes need most.

**Not chosen:** Markdown's alone; code's alone; of the jumps, functions alone.

## EG-D7: Growing and shrinking the selection by syntax (2026-11-08)

**Decision:** In SOURCE view and the lens, `alt+o` grows the selection to the node around it (from the cursor's word
when nothing is selected, in visual mode), `alt+i` shrinks it back a step, `alt+n` / `alt+p` move it to the next or
previous sibling. Notes by their Markdown tree, code by its grammar. `ctrl+space` stays unbound: it's the user's.

**Why:** A statement, a list or a section in a key or two, by what the text is.

**Not chosen:** LazyVim's `ctrl+space` beside the alt keys, or alone, to grow only.

## EG-D8: Surround (2026-11-08)

**Decision:** `y s <motion or object> <mark>` adds a pair, `d s <mark>` deletes one, `c s <old> <new>` changes one,
and `shift+s <mark>` wraps a visual selection. The marks: `*` italic, `b` bold, `` ` `` code, `~` strikethrough, `l` a
link (the cursor in its target), the brackets and the quotes. While typing, a mark typed over a selection wraps it
instead of replacing it.

**Why:** Emphasis, code spans, links and quotes are the commonest edits to Markdown; desktop editors and Obsidian wrap
a selection a mark is typed over.

**Not chosen:** the keys without wrapping on type; LazyVim's `g s a` / `g s d` / `g s r`.

## EG-D9: TODOs and stubs (2026-11-08)

**Decision:** TODO, FIXME, FIX, HACK, XXX and BUG are coloured where they're marks: in a code comment, or at the
start of a note's line or list item, followed by `:`. So are the stubs agents leave: `todo!()`, `unimplemented!()`,
`raise NotImplementedError`, `throw new Error("not implemented")`. `] x` / `[ x` step through the file's; `space f x`
lists the vault's, with the preview.

**Why:** Agents leave TODOs and stubs behind, and nothing showed them; `] t` is a note type's.

**Not chosen:** TODOs as problems of their own kind, in a tab of the Problems panel; colour alone.

## EG-D10: Find in every note, and a replace with rows left out (2026-11-08)

**Decision:** Find in every note fills its list as you type. It opens with the selection on one line, else the
cursor's word, typed and selected, and `space f w` finds that word at once. `path:ops/` narrows the files, as in
search. After the list closes, `] q` / `[ q` go to the next or previous hit. In replace in every note's preview, each
row shows its line before and after; `ctrl+x` drops a row, which then stays as it is, or brings it back, and the title
counts the rows kept; `enter` replaces those, one undo step as now.

**Why:** Find asked first and listed after; nothing was typed for you, nothing narrowed it, and a closed list was gone.
A replace was all or nothing, where an agent's rename must leave a few hits alone.

**Not chosen:** a live and typed list alone, or steps and reopening alone; asking at each match across files, as
`:s///c`; a preview edited as text and saved, as grug-far's.

## EG-D11: Folding a note's sections (2026-11-08)

**Decision:** In the rendered note and SOURCE view, `z a` folds or opens the section the cursor is in, as it folds a
cell in code; `z c` / `z o` close and open it; `z shift+m` folds every section to its heading and `z shift+r` opens
them all, in code every cell. A folded section is its heading and a dim `▸ 12 lines`; a click, or a jump into it,
opens it. Kept per tab and restored with the session.

**Why:** An agent's long document read by its headings; the outline folded only its own list.

**Not chosen:** folding by level as well (vim's `z m` / `z r`); folding from the outline alone.

## EG-D12: Reflow, both ways (2026-11-08)

**Decision:** `g q <motion or object>` (`g q i p`, `g q q`, `g q` in visual mode) hard-wraps to a width; `g shift+q`
joins each paragraph or list item back to one line; `:reflow [width]` and `:unwrap` in the palette. Both keep list
markers and their indent, `>` quotes and hard breaks, and never break a link or a code span; headings, tables, fenced
code and front matter are left alone. The width is the folder's markdownlint `MD013` `line_length`, else
`.editorconfig`'s `max_line_length`, else 80; `editor.text_width` overrides.

**Why:** `ui.wrap` wraps on screen only; a linter, a diff and other tools see the file's lines. `:'<,'>!fmt` broke
list markers and links. Unwrapping serves the other way: pasting into what wraps by itself, or a vault that keeps a
paragraph a line.

**Not chosen:** wrapping as you type past the width, as vim's `textwidth`; the commands without keys.

## EG-D13: Undo by time, and its steps as a list (2026-11-08)

**Decision:** `:earlier 10m` / `:later 10m` (and `1h`, and `1f` for a save). `space h u` lists the note's undo steps,
newest first, each its time and kind (typing, a reload from disk, a replace, a save); `enter` goes back to one, the
preview showing its diff to now. Kept while slipbox runs, as undo is.

**Why:** Going back to before an agent's last few rewrites meant counting `u`s.

**Not chosen:** undo kept across restarts, as vim's undofile; a tree, as undotree, keeping what an edit after an undo
drops.

## EG-D14: Several selections at once, Helix's way (2026-11-08)

**Decision:** Helix's model: a cursor added below or above, the matches of a regex inside the selection selected, a
selection split on a regex or on its lines, those that match kept or dropped, the primary kept alone, their starts
aligned; an edit acts at each, as one undo step. Helix's keys clash with vim's here (`shift+c`, `s`, `shift+k`, `,`),
so its task proposes keys, mostly inside visual mode, for the user to settle before it's built.

**Why:** The user's choice, against the recommendation to leave it out; the idea had been open since 2026-10-14
(ideas.md § Editing). D155's block selection stays out.

**Not chosen:** leaving it out, with `c g n` and `.` shown better; the next match alone (VS Code's `ctrl+d`, on
`alt+d`); a block selection on `alt+v`.

## EG-D15: `space g` a group, for the note's change and file (2026-11-08)

> Amends GIT-D12, whose `space g` was the git panel alone.

**Decision:** `space g` shows which-key and `space g g` opens the git panel, whose keys work there as now. Beside it,
the keys for the note's own change and file, the cursor standing for the panel's selected row (the change on its line,
else the note's file), with the panel's letters where the panel has the action: `space g s` stages the change or the
file, `space g u` unstages the file, `space g d` reverts the change after asking. The rest take letters the panel uses
only to move: `space g enter` previews the change, `h` this file's history, `l` the branch's commits, `o` the inline
diff, `b` the blame column, `shift+b` who changed this line, `shift+d` the file's diff against the base, `y` / `w` the
line's web link. Commit, amend, fetch, pull, push, stash, review, new branch, merge, the merge screen and rebase stay
the panel's.

**Why:** The cursor's change and file needed keys without going into the panel; the user proposed `space g` as a group
with the panel on `space g g`. GIT-D12's core stands: the panel's work is done in the panel, its footer saying its
keys. Mirroring every panel key from the note was proposed, then dropped: it saved one key (`space g c` against `space
g g c`), committed what's staged without showing it, acted on the branch from a note, and doubled the popup.

**Not chosen:** `space g` left as the panel, the new keys on a `g h` group; every panel key mirrored under `space g`;
the panel and the palette alone.

## EG-D16: Blame for the file, as a column (2026-11-08)

**Decision:** `space g b` turns on a dim column beside the text: each run of lines from one commit gets its short
hash, author and age on its first line, newer commits brighter. By line in SOURCE view and code, by block in a
rendered note, naming the newest commit among its lines. A click on an entry, or `space g shift+b`, shows the commit;
uncommitted lines say so.

**Why:** Which lines an agent's commits wrote, at a glance; blame showed one line at a time.

**Not chosen:** the file in a floating window as `git blame` prints it; a commit's lines marked from its history.

## EG-D17: The inline diff (2026-11-08)

**Decision:** `space g o` shows the changes in the window itself: removed lines dim and struck where they were, never
part of the text, and added and changed lines coloured. First against what's staged, as the gutter marks; pressed
again, against the branch's base; again, off. By block in a rendered note; `] c` / `[ c` step through what it shows.

**Why:** What changed, read and edited in place, where every diff floated in a window of its own.

**Not chosen:** against what's staged alone; against the base alone.

## EG-D18: A line's web link (2026-11-08)

**Decision:** `space g y` copies the web link to the cursor's line, or a selection's lines as a range, at the current
commit; `space g w` opens it with the platform's opener, or copies it over SSH, as RPT-D3 does. The forge is the
remote's: GitHub, GitLab, Codeberg, Bitbucket.

**Why:** A place handed to someone, or to an issue; `y r` copied only `path:line`.

**Not chosen:** copying alone.

## EG-D19: What the language servers add (2026-11-08)

**Decision:**

- inlay hints, off by default (`lsp.inlay_hints = false`), `space u h` turning them on or off; dim, never part of the
  text;
- the uses of the symbol under the cursor marked once it rests there, writes apart from reads, `] r` / `[ r` stepping
  through them; in a note, the cursor on a link marks the other links to the same place (`editor.mark_references =
  true`, `space u shift+r` turning it off);
- renaming or moving a code file fixes the imports that point at it, from its server, in the same preview as the
  links;
- `space c i` lists the callers of the function at the cursor and `space c o` what it calls, with the preview, `right`
  opening a caller's own;
- visual `=` and `g =` with a motion format that part with the server; `:lsp-restart` restarts the file's servers.

**Why:** Each shows or changes what an agent's code does without leaving the file: the types it left implicit, where
a name is used, what a move breaks.

**Not chosen:** inlay hints on by default, LazyVim's; the uses marked only on a key; either of the rename's imports and
the call hierarchy alone.

## EG-D20: The copies kept, and marks (2026-11-08)

> Amends D155, which didn't want vim's marks; its macros, named registers and block selection stay out.

**Decision:** The last 20 copies and cuts are kept for the session: `space p` lists them, with the preview, to paste
one, and right after a paste `[ y` / `] y` swap it for the previous or next copy; the clipboard stays the one register.
vim's marks: `m <letter>` marks the cursor's place, a lowercase letter in this note and an uppercase one across the
vault; `` ` <letter> `` goes there, `' <letter>` to its line's start; `space h m` lists them, with the preview. They
move with edits and with an agent's rewrite, and are kept with the session.

**Why:** An earlier copy pasted without copying it again; a place in a long note, or in another, a key away. D155's
reason, a good editor and not all of vim, was weighed and the user kept marks.

**Not chosen:** named registers and macros (`" a`, `shift+q`, `@`), or macros alone; harpoon's numbered list of notes,
or it beside marks.

## EG-D21: Windows: zoomed, and a tab split freely (2026-11-08)

> Amends D141, whose tabs have one split.

**Decision:** `ctrl+w z` / `space w m` zooms the window: it fills the tab, the other windows and the side panels hidden
but kept; pressed again, everything comes back as it was. The window header says `zoomed`; the status line and top bar
stay. A tab splits freely, as vim and Helix split, instead of into two windows at most.

**Why:** A split read one window at a time for a while, then put back; more than two notes side by side. D141 chose
one split as the least that reads one note beside another, not as a limit wanted.

**Not chosen:** zoom hiding only the split's other window, the side panels kept.

## EG-D22: The smaller keys and defaults (2026-11-08)

> Amends D155, whose closing pairs were opt-in.

**Decision:**

- vim's case operators `g u`, `g shift+u` and `g ~`, and in visual mode `u`, `shift+u`, `~`, `shift+j`, `r <char>`
  and `p`;
- `editor.auto_pairs = true` as the default;
- `alt+.` repeats the last motion, any of them, where `;` repeats only `f` and `t`;
- ``space ` `` and `ctrl+^` go back to the note before this one;
- faint indent guides for a note's nested list items, `space u i` turning them off (quotes have their bars);
- `space q d` quits without saving the session, this once.

**Why:** Each is a small thing LazyVim's or Helix's users find missing: the rest of vim's visual keys, pairs closed as
both editors close them, a motion repeated, the other file, the depth of a long list, a session not saved.

**Not chosen:** none of the four in either group was dropped.
