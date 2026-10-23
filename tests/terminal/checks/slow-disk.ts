// A slow disk (T12, #9): what reads one off the main thread — home's walk and the background index's, the explorer's
// listings — never holds up the keys or the screen, and still does what it did. The disk a check can't mount is
// slipbox's own stand-in (`SLIPBOX_SLOW_DISK=<folder name>:<ms>[:<deadline ms>]`): a folder of that name takes so long
// to list, on whichever thread lists it. Each check builds a small home of its own.

import { type Check, explorerOpen, explorerRow, follow, leader, open } from "../check.ts";
import type { Session } from "../session.ts";
import { crumbs, lastMessage, listed } from "./links-and-files.ts";

/** The folder name every check's slow disk has. */
const SLOW = "slowdisk";

/** A small home: a vault `notes` (its index open), `slowdisk` beside it (a note linking to the index), folders before
 *  and after it; `more`, any other files (`~/…`). */
function smallHome(s: Session, more: Record<string, string> = {}): void {
  const files: Record<string, string> = {
    "~/notes/.slipbox/config.toml": "",
    "~/notes/index.md": "# Index\n\nThe notes' own index.\n",
    "~/todo.md": "# To do\n",
    "~/aaa/a.md": "# A\n",
    [`~/${SLOW}/far.md`]: "# Far\n\nLinks to [the index](../notes/index.md).\n",
    "~/zzz/z.md": "# Z\n",
    ...more,
  };
  for (const [rel, text] of Object.entries(files)) s.write(rel, text);
}

/** How long a key is waited for (ms): `ctrl+p`, until its switcher is drawn; then closed. */
async function answered(s: Session): Promise<number> {
  const at = performance.now();
  await s.keys("ctrl+p");
  await s.see(/Open note \(\d+\)/, 30_000);
  const ms = performance.now() - at;
  await s.keys("escape");
  await s.notSee(/Open note \(\d+\)/);
  return Math.round(ms);
}

/** Keys pressed while the background index works (it works a second after the last one): every one answered within
 *  a second, until `done` — the slow folder's read ending on its thread, never here. */
async function keysAnswered(s: Session, done: () => boolean, within = 60_000): Promise<void> {
  const waits: number[] = [];
  const end = performance.now() + within;
  while (!done() && performance.now() < end) {
    await Bun.sleep(1600);
    waits.push(await answered(s));
  }
  s.expect(done(), "the background index's work done");
  s.expect(Math.max(...waits) < 1000, `every key answered within a second meanwhile: ${waits.join(", ")} ms`);
}

/** The backlinks of the note open (`space l b`), asked until `row` is among them. */
async function backlinkFrom(s: Session, row: RegExp): Promise<void> {
  await s.retry(
    async () => {
      if (s.rowOf("Linking to") >= 0) await s.keys("escape");
      await leader(s, "l", "b");
    },
    () => s.rowOf(row) >= 0,
    `the backlink from ${row.source}`,
    1500,
    30_000,
  );
  await s.keys("escape");
}

/** The background index's place, as it keeps it. */
function progress(s: Session): { found: number; indexed: number; current: string | null; passFinished: string | null } {
  try {
    return JSON.parse(s.read(`${s.dir}/state/slipbox/autoindex.json`));
  } catch {
    return { found: 0, indexed: 0, current: null, passFinished: null };
  }
}

/** The explorer's view a folder up from the vault, at home: its folders listed. */
async function viewAtHome(s: Session): Promise<void> {
  await explorerOpen(s);
  await s.keys("-");
  await s.until(() => crumbs(s).startsWith("~ ›"), 5000, "the view at home");
  await s.until(() => listed(s, new RegExp(`\\s${SLOW}$`)), 5000, "home's folders listed");
}

/** The explorer's selected row, by the path `shift+y` copies of it. */
async function selectedPath(s: Session): Promise<string> {
  await s.keys("shift+y");
  await s.settle();
  return s.clipboard().trim();
}

const BACKGROUND = "[index]\nbackground = true\nidle_seconds = 1\n";

export const SLOW_DISK: Check[] = [
  {
    area: "links-and-files",
    name: "slow disk: the background index — home's walk and a vault it finds, each reading a folder that answers slowly on a thread of their own: every key answered meanwhile; their notes indexed, their links backlinks",
    covers: { cases: ["vault", "links/backlinks"], commands: ["backlinks.open"] },
    alone: true,
    options: {
      startAt: "home/notes/index.md",
      config: BACKGROUND,
      env: { SLIPBOX_SLOW_DISK: `${SLOW}:2500` },
      setup: (s) =>
        smallHome(s, {
          "~/found/.slipbox/config.toml": "",
          [`~/found/${SLOW}/f.md`]: "# F\n\nLinks to [the index](../../notes/index.md).\n",
        }),
    },
    run: async (s) => {
      await s.status(/~\/notes .*index\.md/);
      await keysAnswered(s, () => progress(s).passFinished !== null);
      s.expect(progress(s).indexed >= 2, `the vaults found indexed: ${JSON.stringify(progress(s))}`);
      // Home's own note, and the vault's it found, each a backlink of the index.
      await backlinkFrom(s, new RegExp(`${SLOW}/far\\.md`));
      await backlinkFrom(s, new RegExp(`found.*${SLOW}/f\\.md`));
    },
  },
  {
    area: "links-and-files",
    name: "slow disk: home open, its walk reading a folder that answers slowly on a thread of its own — every key answered meanwhile; its notes, and one an agent wrote meanwhile, in the switcher once walked",
    covers: { cases: ["vault"], commands: [] },
    alone: true,
    options: {
      startAt: "home",
      config: "[index]\nidle_seconds = 1\n",
      env: { SLIPBOX_SLOW_DISK: `${SLOW}:2500` },
      setup: (s) => smallHome(s),
    },
    run: async (s) => {
      await s.status(/\s~\s.*todo\.md/);
      // An agent's note, written while home is walked.
      s.expect(s.cliIn("~/", "write", "made.md", "# Made", "--create").code === 0, "the agent's note written");
      // Keys while home is walked, each answered within a second, until its walk has the slow folder's note.
      const waits: number[] = [];
      let walked = false;
      for (let i = 0; i < 30 && !walked; i++) {
        await Bun.sleep(1600);
        const at = performance.now();
        await s.keys("ctrl+p");
        await s.see(/Open note \(\d+\)/, 30_000);
        waits.push(Math.round(performance.now() - at));
        await s.type("far");
        await s.settle();
        walked = s.rowOf(new RegExp(`${SLOW}/far\\.md`)) >= 0;
        await s.keys("escape");
      }
      s.expect(walked, "home walked: far.md in the switcher");
      s.expect(Math.max(...waits) < 1000, `every key answered within a second meanwhile: ${waits.join(", ")} ms`);
      await s.keys("ctrl+p");
      await s.type("made");
      await s.see(/made\.md/, 5000);
      await s.keys("escape");
    },
  },
  {
    area: "links-and-files",
    name: "slow disk: home's walk given up on — a folder that doesn't answer in time: said, the keys answered meanwhile, never walked on the main thread instead",
    covers: { cases: ["vault"], commands: [] },
    alone: true,
    options: {
      startAt: "home/notes/index.md",
      config: BACKGROUND,
      env: { SLIPBOX_SLOW_DISK: `${SLOW}:8000:1500` },
      setup: (s) => smallHome(s),
    },
    run: async (s) => {
      await s.status(/~\/notes .*index\.md/);
      await s.message("home's walk gave up", 20_000);
      const said = await lastMessage(s, "gave up");
      s.expect(
        said === "home's walk gave up: a folder didn't answer in time; it's tried again in ten minutes",
        `said whole: ${said}`,
      );
      s.expect((await answered(s)) < 1000, "a key answered at once");
      s.expect(progress(s).passFinished === null, "the pass waits for home's walk: not finished with nothing found");
    },
  },
  {
    area: "links-and-files",
    name: "slow disk: the explorer — a folder beside the vault listed slowly: `listing…` under it, every key answered meanwhile, then its rows",
    covers: { cases: ["explorer"], commands: ["explorer.cycle"] },
    alone: true,
    options: { startAt: "home/notes/index.md", env: { SLIPBOX_SLOW_DISK: `${SLOW}:2500` }, setup: (s) => smallHome(s) },
    run: async (s) => {
      await viewAtHome(s);
      await explorerRow(s, SLOW);
      await s.keys("l");
      await s.see("listing…", 2000);
      s.expect((await answered(s)) < 1000, "a key answered while the folder is listed");
      await s.until(() => listed(s, /\sfar\.md$/), 10_000, "the folder's rows");
      s.expect(!s.text().includes("listing…"), "listing… gone once its rows came");
    },
  },
  {
    area: "links-and-files",
    name: "slow disk: the explorer — a folder whose listing gives no answer in time says so in its row; the folders listed before stay as they were",
    covers: { cases: ["explorer"], commands: [] },
    options: {
      startAt: "home/notes/index.md",
      // Room for the row's words.
      config: "[ui]\nsidebar_width = 50\n",
      env: { SLIPBOX_SLOW_DISK: `${SLOW}:8000:1500` },
      setup: (s) => smallHome(s),
    },
    run: async (s) => {
      await viewAtHome(s);
      await explorerRow(s, SLOW);
      await s.keys("l");
      await s.see("can't read: no answer in time", 10_000);
      s.expect(listed(s, /\saaa$/) && listed(s, /\szzz$/), "home's other folders still listed");
    },
  },
  {
    area: "links-and-files",
    name: "slow disk: the explorer — zoomed out to a folder not listed yet, the folder it came from selected once it's listed",
    covers: { cases: ["explorer"], commands: [] },
    options: { startAt: "home/notes/index.md", env: { SLIPBOX_SLOW_DISK: "home:1500" }, setup: (s) => smallHome(s) },
    run: async (s) => {
      await explorerOpen(s);
      await s.keys("-");
      await s.see("listing…", 3000);
      await s.until(() => listed(s, /\saaa$/), 10_000, "home listed");
      s.expect((await selectedPath(s)).endsWith("/home/notes"), `the vault's row selected: ${s.clipboard()}`);
    },
  },
  {
    area: "links-and-files",
    name: "slow disk: the explorer — rows that come above the selected one leave it where it was; a `listing…` row answers moving and folding alone",
    covers: { cases: ["explorer"], commands: [] },
    options: { startAt: "home/notes/index.md", env: { SLIPBOX_SLOW_DISK: `${SLOW}:2500` }, setup: (s) => smallHome(s) },
    run: async (s) => {
      await viewAtHome(s);
      await explorerRow(s, SLOW);
      await s.keys("l");
      await s.see("listing…", 2000);
      // On the listing… row: nothing copied, nothing zoomed into; folded, its folder.
      await s.keys("j");
      await s.keys("shift+y");
      await s.settle();
      s.expect(!s.clipboard().includes("listing"), `nothing of the row copied: ${s.clipboard()}`);
      await s.keys("z");
      s.expect(crumbs(s).startsWith("~ ›"), `the view where it was: ${crumbs(s)}`);
      await s.keys("h");
      await s.notSee("listing…", 3000);
      // Unfolded again, the selection below it: its rows come above, the selection staying on its row.
      await explorerRow(s, SLOW);
      await s.keys("l");
      await explorerRow(s, "zzz");
      await s.until(() => listed(s, /\sfar\.md$/), 10_000, "the folder's rows");
      s.expect((await selectedPath(s)).endsWith("/home/zzz"), `zzz still selected: ${s.clipboard()}`);
    },
  },
  {
    area: "links-and-files",
    name: "slow disk: the explorer — a hidden folder that answers slowly holds up nothing while hidden names aren't listed",
    covers: { cases: ["explorer"], commands: [] },
    options: {
      startAt: "home/notes/index.md",
      // A busy name: the listing would look into it for a note, as the explorer's marks do.
      env: { SLIPBOX_SLOW_DISK: ".cache:4000" },
      setup: (s) => smallHome(s, { "~/mixed/a.md": "# A\n", "~/mixed/.cache/c.md": "# C\n" }),
    },
    run: async (s) => {
      await viewAtHome(s);
      await explorerRow(s, "mixed");
      await s.keys("l");
      await s.until(() => listed(s, /\sa\.md$/), 1000, "mixed listed at once, .cache never read");
    },
  },
  {
    area: "links-and-files",
    name: "slow disk: the explorer — another vault gone into while the view's folder is listed: its rows come all the same",
    covers: { cases: ["explorer", "vault"], commands: [] },
    options: {
      startAt: "home/notes/index.md",
      env: { SLIPBOX_SLOW_DISK: "home:4000" },
      setup: (s) =>
        smallHome(s, {
          // Another vault, its own settings: what the listing was read under changes as it's gone into.
          "~/other/.slipbox/config.toml": '[walk]\nexclude = ["drafts/"]\n',
          "~/other/o.md": "# O\n",
          "~/notes/to-other.md": "[the other vault's note](../other/o.md)\n",
        }),
    },
    run: async (s) => {
      await open(s, "to-other.md");
      await explorerOpen(s);
      await s.keys("-");
      await s.see("listing…", 3000);
      // Into the other vault while home is listed: its note peeked at by the link, o goes into it.
      await s.keys("escape");
      await follow(s, "the other vault's note");
      await s.keys("o");
      await s.status(/~\/other .*o\.md/, 5000);
      await explorerOpen(s);
      await s.until(() => listed(s, /\saaa$/) && listed(s, /\szzz$/), 10_000, "home's rows, after the vault changed");
    },
  },
  {
    area: "links-and-files",
    name: "slow disk: the background index — a vault found, the TUI quit while it's indexed and started again: counted once",
    covers: { cases: ["vault"], commands: [] },
    alone: true,
    options: {
      startAt: "home/notes/index.md",
      config: BACKGROUND,
      env: { SLIPBOX_SLOW_DISK: `${SLOW}:2500` },
      // Notes enough that parsing them takes several slices: the TUI quits between them.
      setup: (s) => {
        const many: Record<string, string> = { "~/found/.slipbox/config.toml": "", [`~/found/${SLOW}/f.md`]: "# F\n" };
        for (let i = 0; i < 400; i++) many[`~/found/n${i}.md`] = `# N${i}\n\n${"Words to parse. ".repeat(40)}\n`;
        smallHome(s, many);
      },
    },
    run: async (s) => {
      await s.status(/~\/notes .*index\.md/);
      await s.until(
        () => progress(s).current?.endsWith("/found") === true && progress(s).found > 0,
        30_000,
        "found opened, its notes being parsed",
      );
      await s.restart();
      await s.until(() => progress(s).passFinished !== null, 60_000, "the pass done");
      const p = progress(s);
      s.expect(p.found === p.indexed, `each vault found counted once: ${p.found} found, ${p.indexed} indexed`);
    },
  },
];
