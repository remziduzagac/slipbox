// docs/guides/vaults.md: the explorer zoomed out past the vault you're in, its breadcrumb and its rows' marks; a peek
// into another vault; a folder's symlinks as the explorer shows them, and the question one leading out asks.

import { explorerOpen, follow } from "../check.ts";
import { HOME, quiet, type Shot } from "../shot.ts";

/** A wider explorer, so a row's marks and what describes it (a branch, where a link leads) fit beside its name. */
const WIDE = "[ui]\nsidebar_width = 50\n";

/** No explorer: what floats over the note has the screen to itself. */
const NO_EXPLORER = "[ui]\nsidebar = false\n";

export const SHOTS: Shot[] = [
  {
    name: "vaults-explorer",
    options: { ...HOME("work/kestrel/README.md"), config: WIDE },
    take: async (s) => {
      await s.status("README.md");
      await quiet(s);
      await explorerOpen(s);
      await s.see("› ◈ kestrel ›");
      // -: the view a folder up, ~/work — kestrel, the vault open, unfolded under its row, infra beside it; then the
      // keys back to the note, so kestrel's row shows as the vault you're in rather than the one selected.
      await s.keys("-");
      await s.see("◈ infra");
      await s.see("node_modules");
      await s.keys("escape");
      await s.status("READ");
    },
  },
  {
    name: "vaults-peek",
    options: { ...HOME("notes/index.md"), config: NO_EXPLORER },
    take: async (s) => {
      await s.status("index.md");
      // ../work/kestrel/docs/architecture.md, followed from notes: read in a peek, kestrel's.
      await follow(s, "architecture. The");
      await s.see("o go there · t keep as a tab", 5000);
      await s.see("kestrel › docs/architecture.md");
    },
  },
  {
    name: "vaults-links",
    options: { ...HOME("notes/index.md"), config: NO_EXPLORER },
    take: async (s) => {
      await s.status("index.md");
      // The link into kestrel followed, then `o` from the peek: kestrel's note in a tab of its own, the top bar naming
      // kestrel and its branch, and the status line's back arrow the way home to notes.
      await follow(s, "architecture. The");
      await s.see("o go there · t keep as a tab", 5000);
      await s.keys("o");
      await s.where(/^kestrel(?: ·|$)/);
      await s.status("architecture.md");
      // What going in says, gone: kestrel's own config's warnings, and the message naming where it is.
      await quiet(s);
      await s.notSee("kestrel —", 15000);
    },
  },
  {
    name: "vaults-link-question",
    options: { ...HOME("notes/research/link-styles.md"), config: NO_EXPLORER },
    take: async (s) => {
      await s.status("link-styles.md");
      // outside.md, a symlink to /etc/hosts, opened: asked about first.
      await s.ex("e research/outside.md");
      await s.see("Just look");
    },
  },
];
