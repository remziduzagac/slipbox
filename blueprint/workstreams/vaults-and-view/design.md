# Design changes

Each change names the root's design section it lands in at consolidation. A task writes the new text here as it does
the work; the root's files change only when VV is consolidated.

## MODIFIED: "root" becomes "vault" in every design file (VV-T1)

What users read says vault since VV-T1: the docs (the manual's chapter is `links-and-vaults.md`, Links and vaults), the
README, the skill, the help, the command titles and descriptions, the messages, the TUI's Info view and folder info,
and the human output of `slipbox info` and `slipbox stat`. A folder outside every vault and a file outside every vault
are said so, until VV-T2 and VV-T3 replace them; a vault nested in another and made part of it again by `deinit` is
"part of the vault holding it". A path starting `/` is read "from the vault's top". The design's files say root until
consolidation, when each says vault where it means one.

The names that keep the word, since agents, scripts and configs depend on them: the `--root` flag; `SLIPBOX_ROOT`; the
settings `[trust] roots`, `walk.root_markers`, `capture.location = "root"` and `links.path = "root"`; the explorer's
actions `rename_root`, `make_root` and `unmake_root`; the colour role `sidebar_root`; the command ids `root.trust`,
`root.untrust` and `vault.pin_root`, and `:pin-root`; the state file `roots.json`; the CLI's JSON fields (`root`).

## MODIFIED design/roots.md § How a root is named and shown

The paragraph on the CLI's words becomes: what the CLI prints for a person says vault, as the TUI and the docs do
(VV-D1); its JSON keeps root in its values, whose `schema` stays 1 (DF-D9): `info`'s `mode` is `root` or `folder`; a
change's `kind` is `root` for a vault's naming, `make-root` for `init` of a folder inside a vault, `unmake-root` for
`deinit`. Its reasons in words say vault: a vault nested in another is skipped by the walk as a `nested vault`, a
symlink out of it as `symlink points outside the vault`; nothing to undo is "in this vault". `info` labels the vault
`vault` (a folder outside every vault `folder`, "outside every vault"); `stat`'s row and the Info view's say `vault`.

## MODIFIED design/testing.md § Strategy

The table's `tests/docs.test.ts` row adds vault, never root (VV-D1): the user docs, the README and the skill never say
root for a vault, nor plain folder or loose file, outside code and links' targets; nor does a message slipbox prints (a
string with a space in it), past the names above. Root's other meanings pass: the filesystem's root, running as root, a
root cause, square roots.

## MODIFIED design/roots.md

Rewritten in vaults' terms (VV-D1–VV-D4): a vault and its markers; home, a vault without one, and its skip list;
no-vault and its tabs; every file in exactly one; a vault inside a vault. § Plain folders and loose files goes, its
storage (sessions by path) kept for no-vault's one set of tabs. § The walk's symlink bullet becomes VV-D6's rules: a
link out not followed until the user says so, the trust kept by link and target in the state folder, what a yes allows
where, the CLI's refusal, slow targets. § Storage keys: home's key, no-vault's.

## MODIFIED design/tui.md § Switching roots

Becomes § Going into a vault: what chooses another vault (the explorer, a peek's `o`, the git panel), the tabs
becoming its own, `ctrl+o` back; refused while a note is unsaved, as now. Following a link into another vault peeks
(VV-D7) instead of switching. The named folders' list at the start in a plain folder goes; `space v v` stays.

## MODIFIED design/tui.md § Side panes ("Explorer")

The explorer as one tree and the view (VV-D5): starting at what's opened, the breadcrumb, zooming out to the common
parent, `z` and the breadcrumb zooming in; vaults marked, the current one highlighted; the busy folders listed
(VV-D8); a row's marks in their columns (VV-D9). Goes: `..` above the root as a mode of its own (the breadcrumb and
zooming out replace it), the roots beside the tree, `:pin-root`.

## ADDED design/tui.md § The peek

The floating window for another vault's file (VV-D7): its keys, links inside it, where it's used, its size.

## MODIFIED design/tui.md § Side panes ("Source control")

The panel follows the vault (VV-D10): the current vault's repository, the repositories in the view, their order, opened
up in place, asked about in the background.

## MODIFIED design/trust.md

Adds the links' trust (VV-D6): asked when a link out is first opened, kept by link and target, never in the vault,
asked again when the target changes; beside a vault's trust for its tools (D172), not part of it.

## MODIFIED design/terms.md

Vault, home, no-vault (Elsewhere), the view, the peek added; root, plain folder, loose file retired. Done for vault
in VV-T1, the vocabulary page changing at once: vault, vault marker and trusted vault in; root, root marker and trusted
root retired, with the names that keep the word; plain folder and loose file noted as what users read as "a folder
(a file) outside every vault". Home, no-vault, the view and the peek come in with their tasks, plain folder and loose
file leave with VV-T2 and VV-T3.
