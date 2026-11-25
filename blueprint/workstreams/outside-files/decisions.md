# Decisions: a file outside the vault, opened where you are

Settled with the maintainer on 2026-11-25, item by item, after [the research](../../research/outside-files.md). Each
says what was chosen, what was offered beside it, and why; the design settles what they leave to it. An entry is
never rewritten; a dated note goes under it (blueprint/README.md § How things are recorded).

## OUT-D1: A file outside the vault opens at once, here (2026-11-25)

**Decision:** A file outside the vault open — another vault's, home's or Elsewhere's — opened by name or picked
(OUT-D3) opens as a tab of the current vault's workspace, at once: no question first, the tabs as they were, nothing
switched. Going into its vault is a choice offered beside it (OUT-D4), never the price of opening it. The file stays
its own vault's (VV-D4): the tab names that vault (OUT-D5).

**Why:** The maintainer's call. The code editors compared open such a file where you are and limit what runs, not
what opens (VS Code, Zed, IntelliJ, Sublime Text); where they have windows, a new one is a choice. slipbox has no
windows, so going into the file's vault was the only way to open it, and that replaced every tab: a question in front
of every outside file, and Stay opening nothing.

**Not chosen:** the question first, as D270 has it.

## OUT-D2: Editable when you named or picked it; a link's file stays read-only (2026-11-25)

**Decision:** A file opened here by name or picked (OUT-D3) is editable, and saved where it is: the one write slipbox
makes out of a vault. It is the file named alone: nothing else is made, moved or renamed out of the vault from it
(OUT-D5). A file a link leads to opens in a peek, read-only, as today (VV-D7), and `t` keeps it as a read-only tab.
What VV-D6, D220 and D142 keep from being written out of a vault stays so: a buffer reached through a link, one read
through a link its place hasn't followed, a note of the vault whose target a link takes out of it.

**Why:** A path you typed, or a row you picked, is your own choice, and no one else's pull can change it; a link can
be changed, and one a pull changed could lead a save to `~/.bashrc` (VV-D6). So the write follows the person's
choice, and the guard stays where that risk is.

**Not chosen:** read-only everywhere, the file opened at once as a peek's tab is (the smallest change, no write rule
touched, but editing still meant going into its vault); editable everywhere, links' files too (the simplest rule, but
the guard against a changed link gone).

## OUT-D3: What you pick yourself opens here; a link peeks (2026-11-25)

**Decision:** Every way of opening a file by name or by picking it opens a file outside the vault here (OUT-D1),
editable (OUT-D2): `:e` with a path or a pointer, its path typed in the switcher (`space f e`), the explorer's `enter`
or `o` on a file outside the vault open's own tree, and the command line with `--root` naming a vault that doesn't
hold the file: that vault opens, and the file is a tab of it, marked with its own vault, as `:e` from inside opens it,
where today it is refused (`… is outside --root …`). Started with a file and no `--root`, slipbox opens in the file's
own vault, as before. A link — followed by key or click, `ctrl+enter`, a backlink from another vault, another vault's
search hit — opens a peek, as today (VV-D7). Choosing a vault itself — its row in the explorer, `space v v`, the top
bar's vault list, the git panel's Open on a repository, a checkout or a branch's worktree, a folder link that leads
out (D81) — still goes into it, asked (D270).

**Why:** One rule a person can hold: what you pick yourself opens here; where a link leads, you look; a vault you
pick, you go into. The git panel's Open picks a worktree, which is a vault, and opens the note there; it opens no file
alone (`goInto`, `tui/workspace/git/views/branches/gitbranchview.ts`; `:worktrees`). With `--root`, the vault and the
file are both named, so the file is chosen as `:e` would choose it.

**Not chosen:** the git panel's Open opening the note's copy in the worktree here instead of going into the worktree;
a file `--root` doesn't hold still refused; a link opening a read-only tab at once instead of a floating peek.

## OUT-D4: Its vault a command away, still asked (2026-11-25)

**Decision:** On a tab of a file outside the vault, "Go into this file's vault" (`vault.into_file`, an interaction)
goes into the file's vault with the file open there, as `o` in a peek does: on `space v g`, by a click on the tab's
vault mark, from the palette. A line says so when the file opens. It asks first, as every switch does (D270): Go or
Stay, and unsaved notes their own question. A tab a peek kept (`t`) takes it too.

**Why:** A peek's `o` starts a new line in an editable tab; `space v g` is free, beside `space v v` the vaults. Every
switch asking stays one rule (D270): going in replaces your tabs. The line on opening is how the command is found.

**Not chosen:** the command going in at once, unasked, since you asked for it by name (an exception to D270's one
rule); the command alone, nothing said on opening (quieter, harder to find).

## OUT-D5: The file is the tab's; the vault's search and backlinks stay the vault's (2026-11-25)

**Decision:** In its tab the file is all slipbox makes of any file: edited, saved (OUT-D2), rendered, every editing
key (surround and the rest), watched for changes on disk as every file outside the vault open is. Its links are read
in its own vault and open a peek (VV-D7); one into the current vault opens here, as a peek's does. This vault's
search, backlinks, index, task list, the renames that fix links, and the git panel leave it out. Making, moving or
renaming files outside the vault stays refused.

**Why:** The file is what was asked for; everything that reads the whole vault stays the vault's own, so search and
backlinks never mix two vaults' notes, and "where am I" keeps its answer (VV-D4).

**Not chosen:** this vault's search also looking inside the outside tabs open.

## OUT-D6: Back after a restart, like every tab (2026-11-25)

**Decision:** A tab of a file outside the vault is one of the workspace's tabs: kept with them, and brought back when
the vault opens again, editable as it was (OUT-D2), its vault named. The workspace is kept in slipbox's own state,
under `XDG_STATE_HOME` (`stateDir` in `core/foundation/platform/paths.ts`), never in the vault.

**Why:** Every other tab comes back; one that didn't would surprise. Kept in slipbox's state, the list can't be changed
by a pull, so which outside file a restart opens, and writes, is still the person's choice (OUT-D2).

**Not chosen:** outside tabs for one session only, reopened with `:e`.

## OUT-D7: A relative `:e` path from the vault's top (2026-11-25)

**Decision:** `:e` with a relative path is read from the vault's top, as `:e notes/a.md` is
(`tui/actions/workspace/actions-files.ts`); one that leaves the vault (`:e ../x.md`) opens that file as OUT-D3 says,
instead of being refused.

**Why:** One rule for every relative `:e` path; the file beside the vault's folder is `../x.md`.

**Not chosen:** the current note's folder, as a Markdown link resolves (handy deep in folders, but `:e notes/a.md`
would change meaning too); the folder slipbox started in, vim's way (often the vault's top, but not when slipbox was
opened from elsewhere).

## OUT-D8: The loose file back, as no new kind of place (2026-11-25)

**Decision:** A file outside every vault, named or picked, opens beside the vault's notes, editable (OUT-D1–OUT-D3):
what VV-D3 retired as the loose file comes back for such a file. It is no new kind of place: the file stays its own
vault's (VV-D4), Elsewhere's when no vault holds it, and its tab always names that vault (OUT-D5). It gets no name of
its own; "loose file" stays out of the user docs (`NOT_VAULT` in `tests/docs.test.ts`). This supersedes VV-D3 in
part, its retiring the loose file (D58, D76); the plain folder stays retired.

**Why:** The maintainer's call. The confusion VV-D3 settled was three kinds of places together, a root, a plain folder
and a loose file ([the vaults workstream's notes](../archive/vaults-and-view/notes.md) § How it came up); this adds
none. The places stay vaults, home and Elsewhere, and the file is one of theirs, opened here.

**Not chosen:** a file outside every vault falling back to read-only, as a peek's kept tab is, so that VV-D3 stood
whole (editing it would still have meant going into Elsewhere).
