// The peek (VV-D7): another vault's file, or one of Elsewhere's (VV-D3), read where you are — a large floating window,
// the note rendered, read-only, found in with `/`, copied from. Looking never moves you; going there is a choice: `o`
// goes there (VV-D4), `t` keeps it as a tab here, read-only, `z` fills the screen, `esc` closes it. A link inside it to
// its own vault, or a third, moves the peek (`ctrl+o` back); one to this vault closes it and opens there.

export type { Peek } from "./peek/contracts.ts";
export { peekOf } from "./peek/state.ts";
export { leadsOut, ownPath, goThere } from "./peek/paths.ts";
export { peekTitle } from "./peek/presentation.ts";
export { peekProbe } from "./peek/probe.ts";
export { tuiReach, reachedAgain, keepCaughtUp, vaultGraph } from "./peek/synchronization.ts";
export { peekInstead, peekAt } from "./peek/opening.ts";
export { peekStep, peekGo, peekKeep, peekFill } from "./peek/history.ts";
