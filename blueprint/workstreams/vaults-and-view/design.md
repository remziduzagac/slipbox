# Design changes

Each change names the root's design section it lands in at consolidation. A task writes the new text here as it does
the work; the root's files change only when VV is consolidated.

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

Vault, home, no-vault (Elsewhere), the view, the peek added; root, plain folder, loose file retired.
