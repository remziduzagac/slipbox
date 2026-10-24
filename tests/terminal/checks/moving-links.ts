// A symlink renamed or moved itself (D260), and what a rename writes through links on its way (VV-D6): a check each,
// driven through the explorer, the command line at `:` and the undo, on a small vault (or home) each check builds in
// its own folder. tests/vault.test.ts holds the same cases as unit tests; a case only the command line has (a move
// into a folder that isn't there yet, a plan saved and applied) is run with the CLI beside the TUI.

import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { type Check, explorerOpen, explorerRow, leader, opened } from "../check.ts";
import { vaultKey } from "../../../src/core/paths.ts";
import type { Session } from "../session.ts";
import { toLink } from "./links-and-files.ts";
import { markOf } from "./vaults.ts";

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Room in the explorer for a row's name and what describes it. */
const WIDE = "[ui]\nsidebar_width = 50\n";

/** The check's own vault, `v/` in its folder, with these files (written once: setup runs at every start). */
function vault(s: Session, files: Record<string, string>, config = ""): string {
  const v = join(s.dir, "v");
  if (existsSync(join(v, ".slipbox"))) return v;
  mkdirSync(join(v, ".slipbox"), { recursive: true });
  if (config) writeFileSync(join(v, ".slipbox", "config.toml"), config);
  for (const [rel, text] of Object.entries(files)) put(join(v, rel), text);
  return v;
}

/** A file at `path`, its folders made. */
function put(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

/** A symlink at `path` leading to `target`, unless something is there already. */
function link(target: string, path: string): void {
  try {
    lstatSync(path);
    return;
  } catch {}
  mkdirSync(dirname(path), { recursive: true });
  symlinkSync(target, path);
}

/** The answers kept for links (VV-D6): each followed, as the question's f keeps it — written once. */
function followed(s: Session, links: [link: string, target: string][]): void {
  const file = join(s.dir, "state", "slipbox", "links.json");
  if (existsSync(file)) return;
  mkdirSync(dirname(file), { recursive: true });
  const kept = links.map(([l, target]) => ({ link: l, target, answer: "follow", at: "2026-10-23" }));
  writeFileSync(file, JSON.stringify({ version: 1, links: kept }));
}

/** The links an answer is kept for now, as `slipbox symlinks` reads them. */
function answered(s: Session): string[] {
  const file = join(s.dir, "state", "slipbox", "links.json");
  return (JSON.parse(readFileSync(file, "utf8")).links as { link: string }[]).map((e) => e.link);
}

const isLink = (path: string) => {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
};

/** `fn` with `dir` made `mode` meanwhile, given back after, whatever happens. */
async function withMode(dir: string, mode: number, fn: () => Promise<void>): Promise<void> {
  chmodSync(dir, mode);
  try {
    await fn();
  } finally {
    chmodSync(dir, 0o755);
  }
}

/** The explorer's `m` on a row: the folder picked by typing, its preview seen. */
async function moveRow(s: Session, row: string, folder: string, preview: string | RegExp): Promise<void> {
  await explorerRow(s, row);
  await s.keys("m");
  await s.see(new RegExp(`Move ${escaped(row)}/? to…`));
  await s.type(folder);
  await s.keys("enter");
  await s.see(preview);
}

/** The explorer's `r` on a row: the new name typed over the old, its preview (or refusal) seen. */
async function renameRow(s: Session, row: string, name: string, then: string | RegExp): Promise<void> {
  await explorerRow(s, row);
  await s.keys("r");
  await s.see(new RegExp(`rename ${escaped(row)}/? to:`));
  await s.keys("ctrl+u");
  await s.type(name);
  await s.keys("enter");
  await s.see(then);
}

/** The CLI's answer as JSON, run in the check's vault: its exit code and its error's words, if any. */
function cli(s: Session, ...args: string[]): { code: number; error: string | null; data: Record<string, unknown> } {
  const r = s.cliIn(join(s.dir, "v"), ...args, "--json");
  const json = JSON.parse(r.out || "{}");
  return { code: r.code, error: json.error?.message ?? null, data: json.data ?? {} };
}

export const MOVING_LINKS: Check[] = [
  {
    area: "links-and-files",
    name: "links: a followed file link renamed with r and moved with m stays a link, what it leads to where it was, out of the vault its own links left and said; a note through a followed link isn't moved out of it, nor one into it",
    covers: { cases: ["rename", "links/moves", "safety"], commands: ["note.rename"] },
    options: {
      startAt: "v/b.md",
      config: WIDE,
      setup: (s) => {
        const v = vault(s, {
          "b.md": "# B\n\n[e](ext.md) and [s](outdir/s.md)\n",
          "box/k.md": "# K\n",
        });
        if (!existsSync(join(s.dir, "far"))) {
          put(join(s.dir, "far", "s.md"), "# Far\n\nBack to [b](b.md).\n");
          put(join(s.dir, "out", "s.md"), "# Out\n");
        }
        link(join(s.dir, "far", "s.md"), join(v, "ext.md"));
        link(join(s.dir, "out"), join(v, "outdir"));
        followed(s, [
          [join(v, "ext.md"), join(s.dir, "far", "s.md")],
          [join(v, "outdir"), join(s.dir, "out")],
        ]);
      },
    },
    run: async (s) => {
      const v = join(s.dir, "v");
      // r: renamed in its folder, a link still; m: into box, its own link written from there, through it.
      await explorerOpen(s);
      await renameRow(s, "ext.md", "ext2", "ext.md → ext2.md: 1 change in 1 file");
      await s.keys("enter");
      await s.message("renamed ext.md → ext2.md");
      await moveRow(s, "ext2.md", "box", "ext2.md → box/ext2.md: 1 change in 1 file");
      await s.see("skipped ext2.md:3");
      await s.keys("enter");
      await s.message("renamed ext2.md → box/ext2.md");
      s.expect(isLink(join(v, "box", "ext2.md")), "box/ext2.md a link still");
      s.expect(realpathSync(join(v, "box", "ext2.md")) === join(s.dir, "far", "s.md"), "leading where it did");
      s.expect(s.read(join(s.dir, "far", "s.md")).includes("[b](b.md)"), "out of the vault: its own link left");
      s.expect(s.read(join(v, "b.md")).includes("[e](box/ext2.md)"), "the link to it follows");
      s.expect(answered(s).includes(join(v, "box", "ext2.md")), "its answer moved with it: followed still");
      // A note through the followed folder link, moved out of it; one moved into it: refused.
      await s.keys("escape");
      await toLink(s, "outdir/s.md");
      await s.keys("enter");
      await opened(s, "outdir/s.md");
      await s.ex("mv s.md");
      await s.message("outdir/s.md resolves outside the vault");
      s.expect(s.exists(join(s.dir, "out", "s.md")) && !s.exists(join(v, "s.md")), "nothing moved out");
      await s.keys("ctrl+o");
      await opened(s, "b.md");
      await s.ex("mv outdir/b.md");
      await s.message("outdir/b.md would land outside the vault");
    },
  },
  {
    area: "links-and-files",
    name: "rename: a relative link moved keeps its own text's way — a link to a link stays one, a `..` after a link stays, a `\\` in a name is the name's",
    covers: { cases: ["links/moves", "rename"] },
    options: {
      startAt: "v/b.md",
      config: WIDE,
      setup: (s) => {
        const v = vault(
          s,
          {
            "b.md": "# B\n",
            "box/k.md": "# K\n",
            "shelf/x.md": "# X\n",
            "shelf/t.md": "# T\n",
            "shelf/inner/i.md": "# I\n",
          },
          '[walk]\nexclude = ["shelf/"]\n',
        );
        link("shelf/x.md", join(v, "l0.md"));
        link("l0.md", join(v, "al.md")); // a link to a link
        link("shelf/inner", join(v, "lnk"));
        link("lnk/../t.md", join(v, "c.md")); // `..` after a link: the link's target's folder
        // A `\` is a name's own character on Linux and macOS, not a folder's end.
        put(join(v, "shelf", "x\\y.md"), "# XY\n");
        link("shelf/x\\y.md", join(v, "bs.md"));
      },
    },
    run: async (s) => {
      const v = join(s.dir, "v");
      await explorerOpen(s);
      for (const [row, text] of [
        ["al.md", "../l0.md"],
        ["c.md", "../lnk/../t.md"],
        ["bs.md", "../shelf/x\\y.md"],
      ] as const) {
        await moveRow(s, row, "box", `${row} is a relative link: written again at box/${row}`);
        await s.keys("enter");
        await s.message(`renamed ${row} → box/${row}`);
        s.expect(
          readlinkSync(join(v, "box", row)) === text,
          `box/${row} says ${text}: ${readlinkSync(join(v, "box", row))}`,
        );
        s.expect(isLink(join(v, "box", row)) && s.exists(join(v, "box", row)), `box/${row} leads where it did`);
      }
      s.expect(isLink(join(v, "l0.md")), "the link it leads to, a link still, where it was");
    },
  },
  {
    area: "links-and-files",
    name: "links: in home, a rename writes a note reached through a followed file link through it, never over it; the link moved with m, its own links written through it; undone, back",
    covers: { cases: ["rename", "links/moves", "safety"], commands: ["rename.undo"] },
    options: {
      startAt: "home/b.md",
      config: WIDE,
      setup: (s) => {
        if (!s.exists("~/b.md")) {
          s.write("~/a.md", "# A\n");
          s.write("~/b.md", "# B\n\n[e](ext.md)\n");
          s.write("~/box/k.md", "# K\n");
          put(join(s.dir, "far", "s.md"), "# Far\n\nsee [a](a.md)\n");
        }
        link(join(s.dir, "far", "s.md"), s.path("~/ext.md"));
        followed(s, [[s.path("~/ext.md"), join(s.dir, "far", "s.md")]]);
      },
    },
    run: async (s) => {
      const far = join(s.dir, "far", "s.md");
      await explorerOpen(s);
      await renameRow(s, "a.md", "z", "a.md → z.md: 1 change in 1 file");
      await s.keys("enter");
      await s.message("renamed a.md → z.md");
      s.expect(isLink(s.path("~/ext.md")), "the link a link still, not a copy");
      s.expect(s.read(far).includes("see [a](z.md)"), "the note it leads to written");
      await moveRow(s, "ext.md", "box", "ext.md → box/ext.md: 2 changes in 2 files");
      await s.keys("enter");
      await s.message("renamed ext.md → box/ext.md");
      s.expect(isLink(s.path("~/box/ext.md")), "moved as a link");
      s.expect(s.read(far).includes("see [a](../z.md)"), "its own link written from box, through it");
      await leader(s, "v", "shift+u");
      await s.see("undo: box/ext.md → ext.md");
      await s.keys("enter");
      await s.message("renamed box/ext.md back to ext.md");
      s.expect(isLink(s.path("~/ext.md")) && s.read(far).includes("see [a](z.md)"), "back, a link, its text as it was");
    },
  },
  {
    area: "links-and-files",
    name: "links: a followed link renamed where its answer can't be kept: it moves, said — in the CLI's JSON data too — nothing indexed through it at its new name; undone, it's followed again where it was",
    covers: { cases: ["links/state", "rename"], commands: ["rename.undo"] },
    options: {
      startAt: "v/b.md",
      config: WIDE,
      setup: (s) => {
        const v = vault(s, { "b.md": "# B\n\n[s](lnk/s.md)\n" });
        if (!existsSync(join(s.dir, "out"))) put(join(s.dir, "out", "s.md"), "# S\n");
        // The vault's own state folder, there from its first use: its rename log written under the lock.
        mkdirSync(join(s.dir, "state", "slipbox", vaultKey(v)), { recursive: true });
        link(join(s.dir, "out"), join(v, "lnk"));
        followed(s, [[join(v, "lnk"), join(s.dir, "out")]]);
      },
    },
    run: async (s) => {
      const v = join(s.dir, "v");
      await explorerOpen(s);
      await renameRow(s, "lnk", "lnk2", "lnk/ → lnk2/: 1 change in 1 file");
      // The state folder made one that can't be written, as the move is carried out.
      await withMode(join(s.dir, "state", "slipbox"), 0o500, async () => {
        await s.keys("enter");
        await s.message("its answer couldn't be kept");
      });
      s.expect(isLink(join(v, "lnk2")) && !isLink(join(v, "lnk")), "the link moved all the same");
      s.expect(s.read(join(v, "b.md")).includes("(lnk2/s.md)"), "the link to it follows");
      // Not followed at its new name: nothing read through it into the index.
      await s.keys("escape");
      await explorerOpen(s);
      await explorerRow(s, "b.md"); // the row selected shows its menu's button, not its mark
      await s.until(() => markOf(s, "lnk2") !== null, undefined, "lnk2's row");
      s.expect(markOf(s, "lnk2") === "⊘", `lnk2 not indexed (its mark: ${markOf(s, "lnk2")})`);
      // Undone, it's back where its answer stayed: followed again, and indexed.
      await s.keys("escape");
      await leader(s, "v", "shift+u");
      await s.see("undo: lnk2/ → lnk/");
      await s.keys("enter");
      await s.message("moved lnk2/ back to");
      await explorerOpen(s);
      await explorerRow(s, "b.md");
      await s.until(() => markOf(s, "lnk") === "●", 20_000, "lnk followed and indexed again ●");
      s.expect(answered(s).includes(join(v, "lnk")), "its answer where it was");
      // The command line's JSON says it among its data's warnings, beside the plan's own.
      await withMode(join(s.dir, "state", "slipbox"), 0o500, async () => {
        const r = cli(s, "mv", "lnk", "lnk3");
        const said = (r.data.warnings as string[] | undefined) ?? [];
        s.expect(r.code === 0 && said.some((w) => w.includes("its answer couldn't be kept")), `${r.error}`);
      });
    },
  },
  {
    area: "links-and-files",
    name: "rename: a folder moved with a relative file link in it that leads out of it leaves the link's note as it is, said — never written where the moved link leads; undone, back",
    covers: { cases: ["rename", "links/moves", "safety"], commands: ["rename.undo"] },
    options: {
      startAt: "v/b.md",
      config: WIDE,
      setup: (s) => {
        const v = vault(
          s,
          {
            "b.md": "# B\n",
            "shelf/kept.md": "# Kept\n\n[b](../b.md)\n",
            // Where the link leads once its folder has moved down: a decoy.
            "deep/shelf/kept.md": "# Decoy\n",
          },
          '[walk]\nexclude = ["shelf/"]\n',
        );
        link("../shelf/kept.md", join(v, "docs", "kept.md"));
      },
    },
    run: async (s) => {
      const v = join(s.dir, "v");
      await explorerOpen(s);
      // From its new place the link leads elsewhere: an edit for the note it reaches now is right for no name.
      await moveRow(s, "docs", "deep", "skipped docs/kept.md:3");
      await s.see("a link moving with its folder leads elsewhere after");
      await s.keys("enter");
      await s.message("moved docs/ → deep/docs/");
      s.expect(s.read(join(v, "shelf", "kept.md")) === "# Kept\n\n[b](../b.md)\n", "its note left as it is");
      s.expect(s.read(join(v, "deep", "shelf", "kept.md")) === "# Decoy\n", "never where the moved link leads");
      s.expect(isLink(join(v, "deep", "docs", "kept.md")), "the link moved with its folder, a link");
      await leader(s, "v", "shift+u");
      await s.see("undo: deep/docs/ → docs/");
      await s.keys("enter");
      await s.message("moved deep/docs/ back to");
      s.expect(s.read(join(v, "shelf", "kept.md")) === "# Kept\n\n[b](../b.md)\n", "its note as it was");
      s.expect(s.read(join(v, "deep", "shelf", "kept.md")) === "# Decoy\n", "the decoy as it was");
      s.expect(isLink(join(v, "docs", "kept.md")), "the link back with its folder");
    },
  },
  {
    area: "links-and-files",
    name: "links: a followed link to a vault, or to a folder holding one, isn't renamed by its name: a vault's place is its real path",
    covers: { cases: ["rename", "multiple-roots", "safety"] },
    options: {
      startAt: "v/b.md",
      config: WIDE,
      setup: (s) => {
        const v = vault(s, { "b.md": "# B\n\n[o](ov/o.md)\n" });
        if (!existsSync(join(s.dir, "other"))) {
          put(join(s.dir, "other", ".slipbox", "config.toml"), "");
          put(join(s.dir, "other", "o.md"), "# O\n");
          put(join(s.dir, "holder", "v2", ".slipbox", "config.toml"), "");
          put(join(s.dir, "holder", "v2", "h.md"), "# H\n");
        }
        link(join(s.dir, "other"), join(v, "ov"));
        link(join(s.dir, "holder"), join(v, "hold"));
        followed(s, [
          [join(v, "ov"), join(s.dir, "other")],
          [join(v, "hold"), join(s.dir, "holder")],
        ]);
      },
    },
    run: async (s) => {
      const v = join(s.dir, "v");
      await explorerOpen(s);
      for (const [row, to] of [
        ["ov", "ov2"],
        ["hold", "held"],
      ] as const) {
        await renameRow(s, row, to, `${row} resolves outside the vault`);
        s.expect(isLink(join(v, row)) && !s.exists(join(v, to)), `${row} where it was`);
      }
      s.expect(s.read(join(v, "b.md")).includes("[o](ov/o.md)"), "no link rewritten");
    },
  },
  {
    area: "links-and-files",
    name: "links: in home, naming a vault reached through a followed link with shift+r: its own config.toml written, not taken for a hidden folder",
    covers: { cases: ["vault", "multiple-roots", "links/state"] },
    options: {
      startAt: "home/h.md",
      config: WIDE,
      setup: (s) => {
        if (!s.exists("~/h.md")) {
          s.write("~/h.md", "# H\n");
          put(join(s.dir, "proj", ".slipbox", "config.toml"), '[vault]\nname = "proj"\n');
          put(join(s.dir, "proj", "n.md"), "# N\n");
        }
        link(join(s.dir, "proj"), s.path("~/work"));
        followed(s, [[s.path("~/work"), join(s.dir, "proj")]]);
      },
    },
    run: async (s) => {
      await explorerOpen(s);
      await explorerRow(s, "work");
      await s.keys("shift+r");
      await s.see("name proj, as pointers name it:"); // by the name it has
      await s.keys("ctrl+u");
      await s.type("proj2");
      await s.keys("enter");
      await s.see(/proj2.*enter: do it/);
      await s.keys("enter");
      await s.message("named the folder");
      const config = join(s.dir, "proj", ".slipbox", "config.toml");
      s.expect(s.read(config).includes('name = "proj2"'), "its own config.toml written");
      s.expect(!isLink(config) && isLink(s.path("~/work")), "through the link, the link a link still");
    },
  },
  {
    area: "links-and-files",
    name: "links: a rename never writes through a link into a folder the walk doesn't list — a hidden one, or from a hidden note it reached into another — said; nor, in home, into a dotfile",
    covers: { cases: ["rename", "safety"] },
    options: {
      startAt: "v/b.md",
      config: WIDE,
      setup: (s) => {
        const v = vault(s, {
          "a.md": "# A\n",
          "b.md": "# B\n\n[p](.notes/p.md)\n",
          "c.md": "# C\n",
          ".hidden/n.md": "# N\n\nsee [a](a.md)\n",
          ".private/q.md": "# Q\n\n[c](../c.md)\n",
        });
        link(".hidden/n.md", join(v, "n.md"));
        link("../.private/q.md", join(v, ".notes", "p.md"));
        if (!s.exists("~/rc.md")) {
          s.write("~/d.md", "# D\n");
          s.write("~/.bashrc", "# rc\n\n[d](d.md)\n");
        }
        link(s.path("~/.bashrc"), s.path("~/rc.md"));
      },
    },
    run: async (s) => {
      const v = join(s.dir, "v");
      await explorerOpen(s);
      await renameRow(s, "a.md", "z", "skipped n.md:3");
      await s.see("a link leads it into a folder the walk doesn't list");
      await s.keys("enter");
      await s.message("renamed a.md → z.md");
      s.expect(s.read(join(v, ".hidden", "n.md")) === "# N\n\nsee [a](a.md)\n", "the hidden note as it was");
      s.expect(isLink(join(v, "n.md")), "its link a link still");
      // A note in a hidden folder the vault reached, a link into another hidden folder, not reached.
      await renameRow(s, "c.md", "c2", "skipped .notes/p.md:3");
      await s.keys("enter");
      await s.message("renamed c.md → c2.md");
      s.expect(s.read(join(v, ".private", "q.md")) === "# Q\n\n[c](../c.md)\n", "nothing written in .private/");
      s.expect(isLink(join(v, ".notes", "p.md")), "the reached note a link still");
      // Home's own: a note that is a link to ~/.bashrc.
      await s.restart({ startAt: "home/d.md" });
      await explorerOpen(s);
      await renameRow(s, "d.md", "e", "d.md → e.md");
      await s.keys("enter");
      await s.message("renamed d.md → e.md");
      s.expect(s.read("~/.bashrc") === "# rc\n\n[d](d.md)\n", "~/.bashrc as it was");
    },
  },
  {
    area: "links-and-files",
    name: "links: a link renamed onto what it leads to, or onto another link to it, is refused; one moved where a link leading nowhere was put meanwhile, refused, nothing written; one sharing what it leads to with a name that stays keeps its own links, said",
    covers: { cases: ["rename", "links/moves", "safety"] },
    options: {
      startAt: "v/b.md",
      config: WIDE,
      setup: (s) => {
        const v = vault(
          s,
          {
            "a.md": "# A\n",
            "b.md": "# B\n\n[l](l1.md)\n",
            "img.png": "PNG",
            "box/k.md": "# K\n",
            "shelf/s.md": "# S\n\n[a](a.md)\n",
          },
          '[walk]\nexclude = ["shelf/"]\n',
        );
        for (const l of ["l1.md", "l2.md"]) link("shelf/s.md", join(v, l));
        link("img.png", join(v, "alias.png"));
      },
    },
    run: async (s) => {
      const v = join(s.dir, "v");
      await explorerOpen(s);
      await renameRow(s, "l1.md", "l2", "l2.md exists; not overwriting it");
      // Onto what it leads to: an image, which the explorer doesn't list, by the command line.
      const onto = cli(s, "mv", "alias.png", "img.png");
      s.expect(onto.code === 5 && onto.error === "img.png exists; not overwriting it", `${onto.error}`);
      s.expect(s.read(join(v, "img.png")) === "PNG" && isLink(join(v, "alias.png")), "nothing put over img.png");
      // Moved into box, it says nothing of its own links: an image has none.
      const imaged = cli(s, "mv", "alias.png", "box/");
      const said = (imaged.data.warnings as string[] | undefined) ?? [];
      s.expect(imaged.code === 0 && !said.some((w) => w.includes("its own links")), `${imaged.error} ${said}`);
      s.expect(isLink(join(v, "l1.md")) && isLink(join(v, "l2.md")), "both links as they were");
      // Planned, then a link leading nowhere put where it goes: refused as it's carried out. A plan saved and applied
      // by the command line, as an agent's two steps: the TUI's preview would race the watcher's look at the link.
      const planned = cli(s, "mv", "l1.md", "box/", "--plan");
      const id = String((planned.data.plan as { id?: string } | undefined)?.id ?? planned.data.id ?? "");
      s.expect(planned.code === 0 && id !== "", `a plan saved (${JSON.stringify(planned.data)})`);
      symlinkSync(join(v, "gone.md"), join(v, "box", "l1.md"));
      const applied = cli(s, "apply", id);
      s.expect(applied.code === 5 && !!applied.error?.endsWith("exists now; nothing changed"), `${applied.error}`);
      s.expect(s.read(join(v, "b.md")).includes("[l](l1.md)"), "nothing written");
      rmSync(join(v, "box", "l1.md"));
      // In the TUI: its own links left, l2.md leading where it does too, and said.
      await moveRow(s, "l1.md", "box", "what it leads to is l2.md too: its own links left as they are");
      await s.keys("enter");
      await s.message("renamed l1.md → box/l1.md");
      s.expect(s.read(join(v, "shelf", "s.md")) === "# S\n\n[a](a.md)\n", "its own links left: l2.md's too");
      s.expect(isLink(join(v, "box", "l1.md")), "moved as a link");
    },
  },
  {
    area: "links-and-files",
    name: "links: a rename reaching a file by two links from two folders writes it for neither, said; two links to one file moved together edit it alike, written once, both indexed again",
    covers: { cases: ["rename", "links/moves", "links/backlinks"], commands: ["note.rename", "backlinks.open"] },
    options: {
      startAt: "v/sub/a.md",
      config: WIDE,
      setup: (s) => {
        const v = vault(
          s,
          {
            "a.md": "# A\n",
            "sub/a.md": "# Sub A\n",
            "deep/k.md": "# K\n",
            "shelf/s.md": "# S\n\n[x](sub/a.md) [y](a.md)\n",
            "shelf/t.md": "# T\n\n[a](../a.md)\n",
          },
          '[walk]\nexclude = ["shelf/"]\n',
        );
        link("shelf/s.md", join(v, "e1.md"));
        link("../shelf/s.md", join(v, "sub", "e2.md"));
        for (const n of ["e3.md", "e4.md"]) link(join(v, "shelf", "t.md"), join(v, "box", n));
      },
    },
    run: async (s) => {
      const v = join(s.dir, "v");
      await s.ex("mv sub/z.md");
      await s.see("skipped e1.md:3");
      await s.see("skipped sub/e2.md:3");
      await s.see("from another folder: not rewritten");
      await s.keys("enter");
      await s.message("renamed sub/a.md → sub/z.md");
      s.expect(s.read(join(v, "shelf", "s.md")) === "# S\n\n[x](sub/a.md) [y](a.md)\n", "written for neither");
      await explorerOpen(s);
      await moveRow(s, "box", "deep", "box/ → deep/box/: 1 change in 1 file");
      await s.keys("enter");
      await s.message("moved box/ → deep/box/");
      s.expect(s.read(join(v, "shelf", "t.md")) === "# T\n\n[a](../../a.md)\n", "written once, for both");
      // Renamed again, the file written once through one name: both names' links indexed again — its backlinks.
      await renameRow(s, "a.md", "b", "a.md → b.md: 1 change in 1 file");
      await s.keys("enter");
      await s.message("renamed a.md → b.md");
      await s.keys("escape");
      await s.ex("e b.md");
      await opened(s, "b.md");
      await leader(s, "l", "b");
      await s.see("deep/box/e3.md");
      await s.see("deep/box/e4.md");
      await s.keys("escape");
    },
  },
  {
    area: "links-and-files",
    name: "nested roots: a rename reaching a note of a vault nested in this one through a link leaves it, said: its own vault reads its links otherwise",
    covers: { cases: ["rename", "multiple-roots"], commands: ["note.rename"] },
    options: {
      startAt: "v/t.md",
      config: WIDE,
      setup: (s) => {
        const v = vault(s, {
          "t.md": "# T\n",
          "sub/n/.slipbox/config.toml": "",
          "sub/n/t.md": "# NT\n", // its own `t.md`, as it reads the link
          "sub/n/n.md": "# N\n\n[t](t.md)\n",
        });
        link("sub/n/n.md", join(v, "alias.md"));
      },
    },
    run: async (s) => {
      const v = join(s.dir, "v");
      await s.ex("mv u.md");
      await s.see("skipped alias.md:3");
      await s.see("reached as sub/n/n.md too, from another folder");
      await s.keys("enter");
      await s.message("renamed t.md → u.md");
      s.expect(s.read(join(v, "sub", "n", "n.md")) === "# N\n\n[t](t.md)\n", "the nested vault's note as it was");
    },
  },
  {
    area: "links-and-files",
    name: "rename: a move that can't be finished changes nothing — a link whose note can't be written, a note into a folder that can't be written, a folder made unsearchable after the preview, a move out of a folder that can't be written into new folders — the folders made for it gone",
    covers: { cases: ["rename", "copy-move", "safety"], commands: ["note.rename"] },
    options: {
      startAt: "v/ze.md",
      config: WIDE,
      setup: (s) => {
        const v = vault(
          s,
          {
            "a.md": "# A\n",
            "ze.md": "# ZE\n\n[d](zd.md) [s](src/s.md)\n",
            "shelf/s.md": "# Shelved\n\nsee [a](a.md)\n",
            "zd.md": "# ZD\n",
            "zro/keep.md": "# Keep\n",
            "box/k.md": "# K\n",
            "src/s.md": "# S\n",
            "shut/f/n.md": "# N\n",
            "src2/s.md": "# S2\n",
            "ref.md": "# Ref\n\n[s](src2/s.md)\n",
          },
          '[walk]\nexclude = ["shelf/"]\n',
        );
        link("shelf/s.md", join(v, "ext.md"));
        link("../a.md", join(v, "box", "rel.md"));
      },
    },
    run: async (s) => {
      const v = join(s.dir, "v");
      const ze = s.read(join(v, "ze.md"));
      await explorerOpen(s);
      // What a link leads to is in a folder that can't be written: its own link can't be, so nothing moves.
      await withMode(join(v, "shelf"), 0o500, async () => {
        await moveRow(s, "ext.md", "box", "ext.md → box/ext.md");
        await s.keys("enter");
        await s.message("can't be written where it is");
      });
      s.expect(isLink(join(v, "ext.md")) && !s.exists(join(v, "box", "ext.md")), "the link where it was");
      s.expect(s.read(join(v, "shelf", "s.md")).includes("see [a](a.md)"), "its note as it was");
      // A note into a folder that can't be written.
      await withMode(join(v, "zro"), 0o500, async () => {
        await moveRow(s, "zd.md", "zro", "zd.md → zro/zd.md: 1 change in 1 file");
        await s.keys("enter");
        await s.message("zd.md can't be moved (EACCES)");
      });
      s.expect(s.exists(join(v, "zd.md")) && s.read(join(v, "ze.md")) === ze, "nothing moved, nothing written");
      // Previewed, then its folder made one that can be written but not searched: refused as it's carried out.
      await s.keys("escape");
      await toLink(s, "src/s.md");
      await s.keys("enter");
      await opened(s, "src/s.md");
      await s.ex("mv s.md");
      await s.see("src/s.md → s.md: 1 change in 1 file");
      await withMode(join(v, "src"), 0o600, async () => {
        await s.keys("enter");
        await s.message("src/s.md can't be moved");
      });
      s.expect(s.read(join(v, "ze.md")) === ze, "the note linking to it as it was");
      // The command line's, a move into folders not there yet: refused, the folders made for it taken away.
      await withMode(join(v, "box"), 0o500, async () => {
        const r = cli(s, "mv", "box/rel.md", "new/sub/rel.md");
        s.expect(r.code === 5 && r.error === "box/rel.md can't be moved (EACCES); nothing changed", `${r.error}`);
      });
      await withMode(join(v, "shut"), 0o500, async () => {
        const r = cli(s, "mv", "shut/f", "new2/f");
        s.expect(r.code === 5 && r.error === "shut/f can't be moved (EACCES); nothing changed", `${r.error}`);
      });
      await withMode(join(v, "zro"), 0o500, async () => {
        const r = cli(s, "mv", "shut", "zro/deep/shut");
        s.expect(r.code === 5 && !!r.error?.endsWith("can't be made (EACCES); nothing changed"), `${r.error}`);
      });
      s.expect(!s.exists(join(v, "new")) && !s.exists(join(v, "new2")), "no folder made left");
      s.expect(isLink(join(v, "box", "rel.md")) && s.exists(join(v, "shut", "f", "n.md")), "each where it was");
      // A plan saved, then its note's folder made unsearchable: `slipbox apply` refuses it.
      const planned = cli(s, "mv", "src2/s.md", "s2.md", "--plan");
      const id = String((planned.data.plan as { id?: string } | undefined)?.id ?? planned.data.id ?? "");
      s.expect(planned.code === 0 && id !== "", `a plan saved (${JSON.stringify(planned.data)})`);
      await withMode(join(v, "src2"), 0o600, async () => {
        const r = cli(s, "apply", id);
        s.expect(r.code === 5 && r.error === "src2/s.md can't be moved (EACCES); nothing changed", `${r.error}`);
      });
      s.expect(s.read(join(v, "ref.md")) === "# Ref\n\n[s](src2/s.md)\n", "the plan's other file as it was");
    },
  },
  {
    area: "links-and-files",
    name: "links: a rename reaching a note the vault reached in a hidden folder, and a link to it from another folder: written for neither name, said",
    covers: { cases: ["rename", "links/moves"], commands: ["note.rename"] },
    options: {
      startAt: "v/r.md",
      config: WIDE,
      setup: (s) => {
        const v = vault(s, {
          "b.md": "# B\n",
          ".hidden/b.md": "# HB\n",
          ".hidden/n.md": "# N\n\n[b](b.md)\n",
          "r.md": "# R\n\n[x](.hidden/b.md) [n](.hidden/n.md)\n", // what reaches them
        });
        link(".hidden/n.md", join(v, "l.md")); // from the top, its `b.md` is the top's
      },
    },
    run: async (s) => {
      const v = join(s.dir, "v");
      await toLink(s, ".hidden/b.md");
      await s.keys("enter");
      await opened(s, ".hidden/b.md");
      await s.ex("mv c.md");
      await s.see("skipped .hidden/n.md:3");
      await s.see("reached as l.md too, from another folder");
      await s.keys("enter");
      await s.message("renamed .hidden/b.md → c.md");
      s.expect(s.read(join(v, ".hidden", "n.md")) === "# N\n\n[b](b.md)\n", "written for neither name");
    },
  },
  {
    area: "links-and-files",
    name: "links: a followed link's case-only rename with r, as a disk that ignores case has it: renamed as a link, never refused through it",
    covers: { cases: ["rename", "links/moves"] },
    options: {
      startAt: "v/b.md",
      config: WIDE,
      setup: (s) => {
        const v = vault(s, { "b.md": "# B\n\n[s](Outer/s.md)\n" });
        if (!existsSync(join(s.dir, "out"))) put(join(s.dir, "out", "s.md"), "# S\n");
        link(join(s.dir, "out"), join(v, "Outer"));
        // A disk that ignores case finds `Outer` as `outer`; on one that doesn't, a second name for the link's entry.
        if (!existsSync(join(v, "OUTER")) && !existsSync(join(v, "outer")))
          linkSync(join(v, "Outer"), join(v, "outer"));
        followed(s, [[join(v, "Outer"), join(s.dir, "out")]]);
      },
    },
    run: async (s) => {
      const v = join(s.dir, "v");
      await explorerOpen(s);
      await renameRow(s, "Outer", "outer", "Outer/ → outer/");
      await s.keys("enter");
      await s.message("moved Outer/ → outer/");
      // Where case is ignored, the one entry's name is its new case now; elsewhere the two names were one entry already.
      const names = readdirSync(v);
      if (!names.includes("OUTER") && names.includes("Outer") && names.includes("outer"))
        s.expect(isLink(join(v, "outer")), "a link still");
      else s.expect(names.includes("outer") && !names.includes("Outer") && isLink(join(v, "outer")), `${names}`);
    },
  },
  {
    area: "links-and-files",
    name: "rename: a folder moved with links in it, each judged by where it leads after as the disk reads it — an absolute one into the folder left, said; a relative one through another link written",
    covers: { cases: ["rename", "links/moves"], commands: ["rename.undo"] },
    options: {
      startAt: "v/a.md",
      config: WIDE,
      setup: (s) => {
        const v = vault(
          s,
          {
            "a.md": "# A\n",
            "deep/k.md": "# K\n",
            "box/shelf/t.md": "# T\n\n[a](../a.md)\n",
            "shelf/inner/i.md": "# I\n",
            "shelf/u.md": "# U\n\n[a](../a.md)\n",
          },
          '[walk]\nexclude = ["shelf/"]\n',
        );
        link(join(v, "box", "shelf", "t.md"), join(v, "box", "l.md")); // absolute, into the folder itself
        link(join(v, "shelf", "inner"), join(v, "box", "lnk"));
        link("lnk/../u.md", join(v, "box", "c.md")); // through another link, and back up
      },
    },
    run: async (s) => {
      const v = join(s.dir, "v");
      await explorerOpen(s);
      await moveRow(s, "box", "deep", "skipped box/l.md:3");
      await s.see("leads elsewhere after");
      s.expect(!s.text().includes("skipped box/c.md"), "box/c.md leads where it did: written");
      await s.keys("enter");
      await s.message("moved box/ → deep/box/");
      s.expect(s.read(join(v, "deep", "box", "shelf", "t.md")) === "# T\n\n[a](../a.md)\n", "l.md's note left");
      s.expect(
        s.read(join(v, "shelf", "u.md")) === "# U\n\n[a](../../a.md)\n",
        "c.md's note written for its new place",
      );
      await s.keys("escape");
      await leader(s, "v", "shift+u");
      await s.see("undo: deep/box/ → box/");
      await s.keys("enter");
      await s.message("moved deep/box/ back to");
      s.expect(s.read(join(v, "shelf", "u.md")) === "# U\n\n[a](../a.md)\n", "undone: c.md's note as it was");
    },
  },
  {
    area: "links-and-files",
    name: "rename: in home, a folder moved with a followed link in it leaves the link's note as it is, said — not followed at its new place — and is undone",
    covers: { cases: ["rename", "links/state"], commands: ["rename.undo"] },
    options: {
      startAt: "home/z.md",
      config: WIDE,
      setup: (s) => {
        if (!s.exists("~/z.md")) {
          s.write("~/z.md", "# Z\n");
          s.write("~/b/k.md", "# K\n");
          put(join(s.dir, "out", "s.md"), "# S\n\n[z](../z.md)\n");
        }
        link(join(s.dir, "out", "s.md"), s.path("~/a/l.md"));
        followed(s, [[s.path("~/a/l.md"), join(s.dir, "out", "s.md")]]);
      },
    },
    run: async (s) => {
      const note = join(s.dir, "out", "s.md");
      await explorerOpen(s);
      // Home walked only where it's asked: a, unfolded, is read whole.
      await explorerRow(s, "a");
      await s.keys("l");
      await s.see("l.md");
      await moveRow(s, "a", "b", "skipped a/l.md:3");
      await s.see("isn't followed at its new place");
      await s.keys("enter");
      await s.message("moved a/ → b/a/");
      s.expect(s.read(note) === "# S\n\n[z](../z.md)\n", "the link's note as it was");
      await s.keys("escape");
      await leader(s, "v", "shift+u");
      await s.see("undo: b/a/ → a/");
      await s.keys("enter");
      await s.message("moved b/a/ back to");
      s.expect(isLink(s.path("~/a/l.md")) && s.read(note) === "# S\n\n[z](../z.md)\n", "back, its note as it was");
    },
  },
  {
    area: "links-and-files",
    name: "rename: a data file and a link to it from another folder written for neither; a second name for a note by a hard link isn't one entry; a planned move whose note is gone refused; a folder moved with a followed link in it isn't read through there; a stale answer isn't one; a link with none moved says nothing lost",
    covers: { cases: ["rename", "links/moves", "safety"], commands: ["note.rename"] },
    options: {
      startAt: "v/docs/x.md",
      config: WIDE,
      setup: (s) => {
        const v = vault(
          s,
          {
            "docs/real.json": '{"$ref": "./x.md"}\n',
            "docs/x.md": "# X\n",
            "other/x.md": "# OX\n",
            "sub/h.md": "# H\n",
            "g.md": "# G\n",
            "index.md": "# Index\n\n[g](g.md)\n",
            "b.md": "# B\n\n[s](a/out/s.md)\n",
            "a/k.md": "# K\n",
            "deep/k.md": "# K\n",
            "shelf2/x.md": "# SX\n\n[b](../b.md)\n",
            "pic.png": "PNG",
            "box2/k.md": "# K\n",
          },
          '[walk]\nexclude = ["shelf2/"]\n',
        );
        link("../docs/real.json", join(v, "other", "alias.json"));
        link("pic.png", join(v, "alias2.png")); // within the vault: no answer of its own
        if (!existsSync(join(v, "sub", "h2.md"))) linkSync(join(v, "sub", "h.md"), join(v, "sub", "h2.md"));
        if (!existsSync(join(s.dir, "out2"))) put(join(s.dir, "out2", "s.md"), "# S\n");
        link(join(s.dir, "out2"), join(v, "a", "out"));
        // f/l.md once followed to out2/s.md, its answer still for that; re-pointed into the vault since.
        link(join(v, "shelf2", "x.md"), join(v, "f", "l.md"));
        followed(s, [
          [join(v, "a", "out"), join(s.dir, "out2")],
          [join(v, "f", "l.md"), join(s.dir, "out2", "s.md")],
          [join(v, "box2", "alias2.png"), join(s.dir, "out2")], // an old answer, for elsewhere, where alias2.png goes
        ]);
      },
    },
    run: async (s) => {
      const v = join(s.dir, "v");
      // The data file and its link from other/: written for neither, said.
      await s.ex("mv docs/sub/x.md");
      await s.see("skipped docs/real.json:1");
      await s.see("reached as other/alias.json too");
      await s.keys("enter");
      await s.message("renamed docs/x.md → docs/sub/x.md");
      s.expect(s.read(join(v, "docs", "real.json")) === '{"$ref": "./x.md"}\n', "the data file as it was");
      // A note's second name in its folder, a hard link: another entry, so there, it's not written over.
      await s.ex("e sub/h.md");
      await opened(s, "sub/h.md");
      await s.ex("mv sub/h2.md");
      await s.message("sub/h2.md exists; not overwriting it");
      // The command line's, beside the TUI: a plan saved, its note gone before it's applied.
      const planned = cli(s, "mv", "g.md", "g2.md", "--plan");
      const id = String((planned.data.plan as { id?: string } | undefined)?.id ?? planned.data.id ?? "");
      rmSync(join(v, "g.md"));
      const applied = cli(s, "apply", id);
      s.expect(
        applied.code === 5 && applied.error === "g.md isn't there any more; nothing changed",
        `${applied.error}`,
      );
      s.expect(s.read(join(v, "index.md")) === "# Index\n\n[g](g.md)\n", "nothing written");
      // A folder moved with a followed link in it: the link isn't followed at its new place, nothing read through it.
      s.expect(cli(s, "mv", "a", "c").code === 0, "a moved to c");
      const read = s.cliIn(v, "read", "c/out/s.md");
      s.expect(read.code === 5, `c/out/s.md not read through the link not followed (${read.code})`);
      // A stale answer isn't one: f/l.md leads into the vault now, so its note is written as its folder moves.
      const f = cli(s, "mv", "f", "deep/f");
      const said = (f.data.warnings as string[] | undefined) ?? [];
      s.expect(f.code === 0 && !said.some((w) => w.includes("followed link moving")), `${f.error} ${said}`);
      s.expect(s.read(join(v, "shelf2", "x.md")) === "# SX\n\n[b](../../b.md)\n", "its note written for its new place");
      // A link with no answer moved where an old one for elsewhere is, the state folder unwritable: none of its own lost.
      await withMode(join(s.dir, "state", "slipbox"), 0o500, async () => {
        const m = cli(s, "mv", "alias2.png", "box2/");
        const w = (m.data.warnings as string[] | undefined) ?? [];
        s.expect(m.code === 0 && !w.some((x) => x.includes("couldn't be kept")), `${m.error} ${w}`);
      });
    },
  },
  {
    area: "links-and-files",
    name: "rename: in home, an undo whose note is reached through a link not followed is refused before it's read, said",
    covers: { cases: ["rename", "links/state", "safety"] },
    options: {
      startAt: "home/a.md",
      config: WIDE,
      setup: (s) => {
        if (!s.exists("~/a.md")) {
          s.write("~/a.md", "# A\n");
          s.write("~/box/k.md", "# K\n");
          put(join(s.dir, "out", "s.md"), "# S\n\n[a](../a.md)\n");
        }
        link(join(s.dir, "out"), s.path("~/outdir"));
        followed(s, [[s.path("~/outdir"), join(s.dir, "out")]]);
        // Home's own state folder, there from its first use: the rename's log written under the lock.
        mkdirSync(join(s.dir, "state", "slipbox", vaultKey(s.home)), { recursive: true });
      },
    },
    run: async (s) => {
      // Moved where its answer can't be kept: the link moves, its note written through it for its new place.
      await withMode(join(s.dir, "state", "slipbox"), 0o500, async () => {
        const r = s.cliIn(s.home, "mv", "outdir", "box/outdir", "--json");
        s.expect(r.code === 0, `moved (${r.code})`);
      });
      s.expect(s.read(join(s.dir, "out", "s.md")) === "# S\n\n[a](../../a.md)\n", "its note written through it");
      // Its undo would read that note through the link, not followed at its new name: refused first, said.
      const u = s.cliIn(s.home, "undo", "--json");
      const error = JSON.parse(u.out || "{}").error?.message ?? "";
      s.expect(u.code === 5 && error.includes("is reached through a link that isn't followed"), `${error}`);
    },
  },
  {
    area: "links-and-files",
    name: "rename: undo moves back only what moved as it moved — a link put where a folder went isn't moved back through",
    covers: { cases: ["rename", "safety"], commands: ["rename.undo"] },
    options: {
      startAt: "v/b.md",
      config: WIDE,
      setup: (s) => {
        vault(s, { "b.md": "# B\n", "a/n.md": "# N\n" });
        if (!existsSync(join(s.dir, "ext"))) put(join(s.dir, "ext", "n.md"), "# N\n\nfrom outside\n");
      },
    },
    run: async (s) => {
      const v = join(s.dir, "v");
      await explorerOpen(s);
      await renameRow(s, "a", "b2", "a/ → b2/");
      await s.keys("enter");
      await s.message("moved a/ → b2/");
      // A pull made it a link out of the vault.
      rmSync(join(v, "b2"), { recursive: true });
      symlinkSync(join(s.dir, "ext"), join(v, "b2"));
      await leader(s, "v", "shift+u");
      await s.message("b2 resolves outside the vault");
      s.expect(isLink(join(v, "b2")) && !s.exists(join(v, "a")), "nothing moved back through it");
      s.expect(s.read(join(s.dir, "ext", "n.md")).includes("from outside"), "what it leads to as it was");
    },
  },
];
