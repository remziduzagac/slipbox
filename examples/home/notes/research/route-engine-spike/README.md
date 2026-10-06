# Route engine spike

A clone of the route engine kept inside the notes while I tried a different heuristic for the A* search. It is a
repository of its own, with a `.git` of its own that points back into Kestrel's repository, so it is a root of its own
too, and the notes folder around it does not walk into it.

The clone's remote is Kestrel's, so by the remote it would be `kestrel`, a second copy of a repository that already
lives next to the notes. The `.slipbox/config.toml` beside this file names it `engine-spike` instead, so a pointer can
tell it from the real one.

## What is here

| Path | What |
| --- | --- |
| `bench.toml` | the benchmark settings, which extend Kestrel's own |
| `src/notes.md` | what the spike found, with a timing table |
| `README.md` | this file |

## How it relates to the notes around it

My notes about the engine's costs are outside, in the notes folder: [sync-rewrite](../../projects/sync-rewrite.md) has
the pattern for how I write up a spike. A link out of this folder back into the notes crosses the boundary and works
by path. The spike's own notes are in [src/notes.md](src/notes.md).

## What I would do with it

Nothing yet. If it is worth keeping, it becomes a branch of the real repository and the folder is deleted; until then
it is a nested checkout, which cannot be deinitialised as a nested vault, because a git checkout is a vault by itself.
Moving the folder, or deleting it with `rm`, would count the links into it first.
