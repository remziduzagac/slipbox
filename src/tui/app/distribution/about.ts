// About slipbox's basics (#104): what it is, and the few things that lead to everything else — all keys and commands,
// the palette, run from here; the which-key, how it opens. Each with the keys as you have them. Just the basics: the
// manual is the rest.

import type { ListItem } from "../../shell/overlays/list-types.ts";
import { spellKey } from "../../shell/input/keys/decoding.ts";
import { canonKey } from "../../../core/application/commands/registry.ts";

export interface AboutContext {
  readonly leader: string;
  readonly keymap: { keysFor(command: string): string[] };
}

/** What slipbox is, as its README and site say it. */
export const ABOUT = "Read, review and edit what your coding agent writes, in your terminal.";

/** The commands About runs: its own rows', and the basics'. */
export const ABOUT_RUNS = new Set(["app.release_notes", "app.upgrade", "help.open", "palette.open"]);

/** The basics, after the version: a heading, the two commands, how the which-key opens. */
export function aboutBasics(app: AboutContext): ListItem[] {
  const keys = (command: string) => app.keymap.keysFor(command).map(spellKey);
  return [
    { label: "", header: true, data: null },
    { label: "Start here", header: true, data: null },
    { label: "All keys and commands", keys: keys("help.open"), data: "help.open" },
    { label: "The command palette: any command by its name", keys: keys("palette.open"), data: "palette.open" },
    {
      label: "The which-key: the keys that can come next",
      keys: [spellKey(canonKey(app.leader))],
      informational: true,
      data: null,
    },
  ];
}
