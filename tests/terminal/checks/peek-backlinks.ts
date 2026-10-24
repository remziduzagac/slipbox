// The peek's backlinks (#10, D259; design/tui.md § The peek): worked out on a thread of their own, the note shown at
// once; as the other vault is now, at each peek; its index built when it has none; links by a name into such a vault
// resolved once it's caught up. Each check drives slipbox in a terminal through one case.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../../../src/core/config.ts";
import { STALE_TEMP_MS } from "../../../src/core/fsutil.ts";
import { openGraph } from "../../../src/core/graph.ts";
import { vaultKey } from "../../../src/core/paths.ts";
import { setLinkAnswer } from "../../../src/core/symlinks.ts";
import { configFilesFor, initVault, recordLocation, rootAt } from "../../../src/core/vault.ts";
import { type Check, explorerOpen, follow, leader, open } from "../check.ts";
import { type Session, sleep } from "../session.ts";
import { ARCHITECTURE } from "./links-and-files.ts";
import { markOf } from "./vaults.ts";

const TITLE = "kestrel › docs/architecture.md";
const LIST = /Linked from \((\d+)\):/;
/** Long enough for a vault indexed on a loaded machine. */
const SLOW = 30_000;

/** A vault's index, as this check's slipbox keeps it. */
function indexOf(s: Session, root: string): string {
  return join(s.dir, "cache", "slipbox", vaultKey(root), "index.json");
}

/** How many backlinks the peek lists, once it lists them: the end of the note, its list there. */
async function listed(s: Session): Promise<number> {
  await s.keys("shift+g");
  await s.see(LIST, SLOW);
  await s.keys("shift+g");
  return Number(LIST.exec(s.text())![1]);
}

/** The peek's backlinks answered, whatever they are (a list, none): no line saying they're coming. */
async function answered(s: Session): Promise<void> {
  await s.keys("shift+g");
  await s.until(
    () => /Linked from/.test(s.text()) && !/'s index…|building it/.test(s.text()),
    SLOW,
    "the backlinks answered",
  );
}

/** The cursor's line, on the status line. */
function line(s: Session): number {
  return Number(/ L(\d+):\d+ /.exec(s.statusLine())?.[1] ?? -1);
}

/** Temporary files an old write left beside kestrel's index and its redirects. */
function staleTemps(s: Session): string[] {
  const key = vaultKey(join(s.home, "work", "kestrel"));
  return [
    join(s.dir, "cache", "slipbox", key, ".index.json.slipbox-1-7-deadbeef.tmp"),
    join(s.dir, "state", "slipbox", key, ".redirects.json.slipbox-1-7-deadbeef.tmp"),
  ];
}

/** A vault of `n` notes in home, `~/big`, each linking others and `d0/n0.md`; and a note of notes linking it. */
function bigVault(s: Session, n: number): void {
  const root = join(s.home, "big");
  mkdirSync(join(root, ".slipbox"), { recursive: true });
  for (let i = 0; i < n; i++) {
    const dir = join(root, `d${i % 40}`);
    mkdirSync(dir, { recursive: true });
    const body = Array.from(
      { length: 12 },
      (_, k) => `Line ${k}: [n${(i + k) % n}](../d${((i + k) % n) % 40}/n${(i + k) % n}.md).`,
    );
    writeFileSync(join(dir, `n${i}.md`), `# Note ${i}\n\n${body.join("\n\n")}\n\n[the first](../d0/n0.md)\n`);
  }
}

/** kestrel indexed as this check's slipbox would index it, before it starts. */
function indexKestrel(s: Session): void {
  inState(s, () => {
    const loc = rootAt(join(s.home, "work", "kestrel"));
    openGraph(loc, loadConfig({ ...configFilesFor(loc) }).config, true);
  });
}

/** The Info view's count of the note's backlinks, once it shows one. */
async function infoCount(s: Session): Promise<number> {
  await s.see(/backlinks +\d+/, 5000);
  return Number(/backlinks +(\d+)/.exec(s.text())![1]);
}

/** Run with this check's folders as slipbox's (its state, its cache, its home): what `setup` writes there, it reads. */
function inState<T>(s: Session, run: () => T): T {
  const env = s.env();
  const was = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  Object.assign(process.env, env);
  try {
    return run();
  } finally {
    for (const [k, v] of Object.entries(was))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  }
}

export const PEEK_BACKLINKS: Check[] = [
  {
    area: "links-and-files",
    name: "peek backlinks: the note at once, the list once its thread has built kestrel's index — a code file's comment and a data file's among them; a later peek lists them as kestrel is now: a note come, a vault nested in it come (#10, D259)",
    covers: { cases: ["links/backlinks", "links/roots", "vault"], commands: ["link.follow"] },
    options: { home: true, startAt: "home/notes/index.md" },
    run: async (s) => {
      const kestrel = join(s.home, "work", "kestrel");
      s.expect(!existsSync(indexOf(s, kestrel)), "kestrel without an index here, to begin with");
      // This vault's own index first, built in the background here: its links into kestrel are among both lists, read
      // from it — the thread writes nothing of this vault's.
      await s.until(() => existsSync(indexOf(s, join(s.home, "notes"))), SLOW, "this vault's index, built here");
      await follow(s, ARCHITECTURE);
      await s.see(TITLE, 5000);
      const first = await listed(s);
      s.expect(existsSync(indexOf(s, kestrel)), "kestrel's index built by the peek's thread");
      await s.see("public/index.html:6"); // a code file's comment: its grammar loaded on the thread
      await s.see("config/base.yaml:7"); // a data file's value
      await s.keys("escape");
      // Meanwhile, in kestrel: a note that links the architecture, and a vault nested in it whose note does too.
      s.write("~/work/kestrel/docs/later.md", "# Later\n\nSee [the architecture](architecture.md).\n");
      mkdirSync(join(kestrel, "lab", ".slipbox"), { recursive: true });
      s.write("~/work/kestrel/lab/n.md", "# Lab\n\nAbout [the architecture](../docs/architecture.md).\n");
      await s.keys("enter");
      await s.see(TITLE, 5000);
      const second = await listed(s);
      s.expect(second === first + 2, `the list as kestrel is now: ${first} then ${second}`);
      await s.see("docs/later.md:3 — the architecture");
      await s.see("lab/n.md:3 — the architecture");
    },
  },
  {
    area: "links-and-files",
    name: "peek backlinks: ctrl+o back to a row of the list — the list there at once, the cursor on its row (#10)",
    covers: { cases: ["links/backlinks"], commands: ["link.follow"] },
    options: { home: true, startAt: "home/notes/index.md" },
    run: async (s) => {
      await follow(s, ARCHITECTURE);
      await s.see(TITLE, 5000);
      await listed(s);
      // A row of kestrel's own, followed: the peek moves to the file linking here.
      await s.keys("/");
      await s.type("mkdocs.yml:21");
      await s.keys("enter", "escape");
      const row = line(s);
      await s.keys("enter");
      await s.see("kestrel › mkdocs.yml", 5000);
      await s.keys("ctrl+o");
      await s.see(TITLE, 2000);
      // At once: the list it showed here, no line saying it's coming, the cursor on the row it left.
      s.expect(!s.text().includes("reading kestrel"), "the list there at once, not a line saying it's coming");
      await s.until(() => line(s) === row, 2000, `the cursor back on its row, L${row}`);
      // A key meanwhile moves it, and the list come again from its thread leaves it there.
      await s.keys("k");
      await s.until(() => line(s) === row - 1, 2000, `the cursor a row up, L${row - 1}`);
      await sleep(3000);
      s.expect(line(s) === row - 1, `the cursor where the key left it, L${row - 1}: L${line(s)}`);
    },
  },
  {
    area: "links-and-files",
    name: "peek backlinks: kestrel's walk changed in its settings since its last peek — the list as it walks now (#10)",
    covers: { cases: ["links/backlinks"], commands: ["link.follow"] },
    options: { home: true, startAt: "home/notes/index.md" },
    run: async (s) => {
      await follow(s, ARCHITECTURE);
      await s.see(TITLE, 5000);
      const first = await listed(s);
      await s.see("docs/qa/");
      await s.keys("escape");
      const config = join(s.home, "work", "kestrel", ".slipbox", "config.toml");
      const text = readFileSync(config, "utf8");
      s.expect(text.includes('exclude = ["vendor/", "docs/generated/"]'), "kestrel's walk excludes, as set");
      writeFileSync(config, text.replace('"docs/generated/"]', '"docs/generated/", "docs/qa/"]'));
      await s.keys("enter");
      await s.see(TITLE, 5000);
      const second = await listed(s);
      s.expect(second < first, `docs/qa/'s backlinks gone: ${first} then ${second}`);
      s.expect(!s.text().includes("docs/qa/"), "no backlink from docs/qa/ listed");
    },
  },
  {
    area: "links-and-files",
    name: "peek backlinks: home without an index says so, and builds none; with an index of another version's, likewise (VV-D2, #10)",
    covers: { cases: ["links/backlinks", "vault"], commands: ["link.follow"] },
    options: {
      home: true,
      startAt: "home/notes/to-home.md",
      setup: (s) => {
        s.write("~/loose.md", "# Loose\n\nA note of home's own.\n");
        s.write("~/notes/to-home.md", "# To home\n\n[the loose one](../loose.md)\n");
      },
    },
    run: async (s) => {
      const index = indexOf(s, s.home);
      await s.keys("tab", "enter");
      await s.see("~ › loose.md", 5000);
      await s.keys("shift+g");
      await s.see("Linked from: ~ has no index here yet — o goes there, and finds them.", 5000);
      s.expect(!existsSync(index), "no index built for home");
      // One written by another version: as none.
      await s.keys("escape");
      mkdirSync(join(index, ".."), { recursive: true });
      const old = JSON.stringify({ version: 1, entries: {} });
      writeFileSync(index, old);
      await s.keys("enter");
      await s.see("~ › loose.md", 5000);
      await s.keys("shift+g");
      await s.see("Linked from: ~ has no index here yet — o goes there, and finds them.", SLOW);
      s.expect(readFileSync(index, "utf8") === old, "home's index as it was, not built here");
    },
  },
  {
    area: "links-and-files",
    name: "peek backlinks: a tab kept from a peek comes back with the session, and its vault's index is built again (#10)",
    covers: { cases: ["links/backlinks", "vault"], commands: ["link.follow", "peek.tab"] },
    options: { home: true, startAt: "home/notes/index.md" },
    run: async (s) => {
      const kestrel = join(s.home, "work", "kestrel");
      await follow(s, ARCHITECTURE);
      await s.see(TITLE, 5000);
      await listed(s);
      await s.keys("t");
      await s.see("kestrel: architecture.md", 5000);
      await s.keys("ctrl+q");
      await s.until(() => s.exited(), 10_000, "slipbox to quit");
      rmSync(indexOf(s, kestrel));
      // Started on notes, its session brings the tab back: kestrel caught up on the thread, its index built.
      await s.restart({ startAt: "home/notes" });
      await s.see("kestrel: architecture.md", 10_000);
      await s.until(() => existsSync(indexOf(s, kestrel)), SLOW, "kestrel's index built again");
    },
  },
  {
    area: "links-and-files",
    name: "peek backlinks: a name a note of kestrel declares, kestrel without an index here — found a moment later, its index built on the thread: the old form's suggestion names its note (D259, 21.11)",
    covers: { cases: ["links/roots", "vault"] },
    options: {
      home: true,
      startAt: "home/notes/by-name.md",
      setup: (s) => {
        s.write("~/work/kestrel/docs/far.md", "---\naliases: [Far Name]\n---\n# Far\n");
        s.write("~/notes/by-name.md", "# By name\n\nSee [[kestrel:Far Name]].\n");
        // kestrel known on this machine by its name, as once it's been opened — its index not built.
        inState(s, () => recordLocation(rootAt(join(s.home, "work", "kestrel"))));
      },
    },
    run: async (s) => {
      // The old form is no link (21.11): enter says so, and suggests the pointer to the note the name finds — once
      // kestrel is caught up on the thread, which finds it by the name its note declares.
      await s.keys("tab");
      await s.retry(
        () => s.keys("enter"),
        () => s.rowOf("slipbox://kestrel/docs/far.md") >= 0,
        "the old form's suggestion naming the note the name finds",
        1000,
        SLOW,
      );
      s.expect(existsSync(indexOf(s, join(s.home, "work", "kestrel"))), "kestrel's index built on the thread");
    },
  },
  {
    area: "links-and-files",
    name: "peek backlinks: kestrel's index can't be written here — the list comes all the same, and a link by a name only a note of kestrel declares resolves (#10)",
    covers: { cases: ["links/backlinks"], commands: ["link.follow"] },
    options: {
      home: true,
      startAt: "home/notes/to-by-name.md",
      setup: (s) => {
        // Where its index goes, a folder: read, it's none; written, refused.
        mkdirSync(indexOf(s, join(s.home, "work", "kestrel")), { recursive: true });
        s.write("~/work/kestrel/docs/far.md", "---\naliases: [Far Name]\n---\n# Far\n");
        s.write("~/work/kestrel/docs/by-name.md", "# By name\n\nSee [[Far Name]].\n");
        s.write("~/notes/to-by-name.md", "# To it\n\n[by name](../work/kestrel/docs/by-name.md)\n");
      },
    },
    run: async (s) => {
      await s.keys("tab", "enter");
      await s.see("kestrel › docs/by-name.md", 5000);
      await s.keys("shift+g");
      await s.see(/Linked from(:| \()/, SLOW);
      s.expect(!s.text().includes("not worked out"), "the backlinks worked out");
      await s.keys("g", "g", "tab");
      await s.status(/\[\[Far Name\]\] \(resolved/, SLOW);
    },
  },
  {
    area: "links-and-files",
    name: "peek backlinks: a move kestrel's thread found is known to the peek — the link to the old path says where it went (17.12, #10)",
    covers: { cases: ["links/backlinks"], commands: ["link.follow"] },
    options: {
      home: true,
      startAt: "home/notes/to-points.md",
      setup: (s) => {
        s.write("~/work/kestrel/docs/old-name.md", "# Old name\n\nA note about to move, its text its own: 4178.\n");
        s.write("~/work/kestrel/docs/points.md", "# Points\n\nSee [the old one](old-name.md).\n");
        s.write("~/notes/to-points.md", "# To points\n\n[points](../work/kestrel/docs/points.md)\n");
      },
    },
    run: async (s) => {
      const docs = join(s.home, "work", "kestrel", "docs");
      await s.keys("tab", "enter");
      await s.see("kestrel › docs/points.md", 5000);
      await answered(s);
      await s.keys("escape");
      renameSync(join(docs, "old-name.md"), join(docs, "new-name.md"));
      await s.keys("enter");
      await s.see("kestrel › docs/points.md", 5000);
      await answered(s);
      // Its graph here caught up after the list shows: the hint once it has.
      await s.keys("g", "g", "tab");
      await s.retry(
        () => s.keys("enter"),
        () => s.rowOf("moved to") >= 0,
        "the link to the old path saying where it went",
        1000,
        SLOW,
      );
    },
  },
  {
    area: "links-and-files",
    name: "peek backlinks: a file come to kestrel since its last peek, no note among them, is known to the next peek's links (#10)",
    covers: { cases: ["links/backlinks"], commands: ["link.follow"] },
    options: {
      home: true,
      startAt: "home/notes/to-chart.md",
      setup: (s) => {
        s.write("~/work/kestrel/docs/with-chart.md", "# With a chart\n\n[the chart](chart.csv)\n");
        s.write("~/notes/to-chart.md", "# To it\n\n[with a chart](../work/kestrel/docs/with-chart.md)\n");
      },
    },
    run: async (s) => {
      await s.keys("tab", "enter");
      await s.see("kestrel › docs/with-chart.md", 5000);
      await answered(s);
      await s.keys("g", "g", "tab");
      await s.status(/chart\.csv \((broken|unresolved)/, 5000);
      await s.keys("escape");
      s.write("~/work/kestrel/docs/chart.csv", "a,b\n1,2\n");
      await s.keys("enter");
      await s.see("kestrel › docs/with-chart.md", 5000);
      await answered(s);
      await s.keys("g", "g", "tab");
      await s.status(/chart\.csv \(resolved/, SLOW);
    },
  },
  {
    area: "links-and-files",
    name: "peek backlinks: a folder kestrel follows a link to — its notes among the backlinks, asked on the thread whether it answers (VV-D6, #10)",
    covers: { cases: ["links/backlinks", "vault"], commands: ["link.follow"] },
    options: {
      home: true,
      startAt: "home/notes/index.md",
      setup: (s) => {
        s.write("~/outside/x.md", "# X\n\nAbout [the architecture](../docs/architecture.md).\n");
        const link = join(s.home, "work", "kestrel", "linked");
        symlinkSync(join(s.home, "outside"), link);
        inState(s, () => setLinkAnswer(link, "follow"));
      },
    },
    run: async (s) => {
      await follow(s, ARCHITECTURE);
      await s.see(TITLE, 5000);
      await listed(s);
      await s.see("linked/x.md:3 — the architecture");
    },
  },
  {
    area: "links-and-files",
    name: "peek backlinks: a big vault's index built on its thread, the screen answering meanwhile; quitting meanwhile is at once, no index written (#10)",
    covers: { cases: ["links/backlinks"], commands: ["link.follow", "peek.fill"] },
    alone: true,
    options: {
      home: true,
      startAt: "home/notes/to-big.md",
      setup: (s) => {
        bigVault(s, 4000);
        s.write("~/notes/to-big.md", "# To big\n\n[the first](../big/d0/n0.md)\n");
      },
    },
    run: async (s) => {
      await s.keys("tab", "enter");
      await s.see("big › d0/n0.md", 5000);
      await s.keys("shift+g");
      await s.see("has no index here yet — building it", 5000);
      // While it builds: z fills the screen at once.
      await s.keys("z");
      await s.see("z smaller", 1500);
      s.expect(s.text().includes("building it"), "still building, the key answered meanwhile");
      const started = performance.now();
      await s.keys("escape", "ctrl+q");
      await s.until(() => s.exited(), 3000, "slipbox to quit while its thread builds");
      s.expect(performance.now() - started < 3000, "quit at once");
      s.expect(!existsSync(indexOf(s, join(s.home, "big"))), "no index written by a thread let go of");
    },
  },
  {
    area: "links-and-files",
    name: "peek backlinks: a closed peek's long build doesn't hold the next peek's backlinks (#10)",
    covers: { cases: ["links/backlinks"], commands: ["link.follow"] },
    alone: true,
    options: {
      home: true,
      startAt: "home/notes/two.md",
      setup: (s) => {
        bigVault(s, 4000);
        s.write(
          "~/notes/two.md",
          "# Two\n\n[the first](../big/d0/n0.md)\n\n[the architecture](../work/kestrel/docs/architecture.md)\n",
        );
      },
    },
    run: async (s) => {
      await s.keys("tab", "enter");
      await s.see("big › d0/n0.md", 5000);
      await s.keys("shift+g");
      await s.see("building it", 5000);
      await s.keys("escape", "tab", "enter");
      await s.see(TITLE, 5000);
      const started = performance.now();
      await listed(s);
      s.expect(
        !existsSync(indexOf(s, join(s.home, "big"))),
        "kestrel's listed before big's index, which its peek had asked for, was built",
      );
      s.expect(performance.now() - started < SLOW, "listed without waiting for big's");
    },
  },
  {
    area: "links-and-files",
    name: "peek backlinks: a peek kept as a tab before its backlinks came — the tab is the file, nothing added to it (#10)",
    covers: { cases: ["links/backlinks"], commands: ["link.follow", "peek.tab"] },
    alone: true,
    options: {
      home: true,
      startAt: "home/notes/to-big.md",
      setup: (s) => {
        bigVault(s, 4000);
        s.write("~/notes/to-big.md", "# To big\n\n[the first](../big/d0/n0.md)\n");
      },
    },
    run: async (s) => {
      await s.keys("tab", "enter");
      await s.see("big › d0/n0.md", 5000);
      await s.keys("shift+g");
      await s.see("building it", 5000);
      await s.keys("t");
      await s.see("big: n0.md", 5000);
      await s.keys("shift+g");
      // The note's own text: no line about backlinks, before or after its thread answers.
      await s.until(() => existsSync(indexOf(s, join(s.home, "big"))), SLOW * 2, "big's index built all the same");
      await sleep(1000);
      s.expect(!s.text().includes("Linked from"), "the tab is the file: nothing added to it");
    },
  },
  {
    area: "links-and-files",
    name: "peek backlinks: another slipbox's index with a link it can't say where — the rest of the backlinks shown (#10)",
    covers: { cases: ["links/backlinks"], commands: ["link.follow"] },
    options: {
      home: true,
      startAt: "home/notes/index.md",
      setup: (s) => {
        const third = join(s.home, "third");
        mkdirSync(join(third, ".slipbox"), { recursive: true });
        writeFileSync(join(third, "t.md"), "# T\n");
        inState(s, () => recordLocation(rootAt(third)));
        // As another version might have written it: a link with no line, one with no text.
        const link = {
          kind: "markdown",
          target: "../work/kestrel/docs/architecture.md",
          heading: null,
          block: null,
          alias: null,
          column: 1,
        };
        const index = indexOf(s, third);
        mkdirSync(join(index, ".."), { recursive: true });
        writeFileSync(
          index,
          JSON.stringify({
            entries: {
              "t.md": {
                links: [
                  { ...link, line: 3 },
                  { ...link, line: 0 },
                ],
              },
            },
          }),
        );
      },
    },
    run: async (s) => {
      await follow(s, ARCHITECTURE);
      await s.see(TITLE, 5000);
      await listed(s);
      await s.see("~/third/t.md:3");
      s.expect(!s.text().includes("not worked out"), "the backlinks worked out, that link left out");
    },
  },
  {
    area: "links-and-files",
    name: "peek backlinks: temporary files of kestrel's index and its redirects, left behind by a thread let go of mid-write, are swept once they're old (#10)",
    covers: { cases: ["links/backlinks"], commands: ["link.follow"] },
    options: {
      home: true,
      startAt: "home/notes/index.md",
      setup: (s) => {
        const hour = new Date(Date.now() - 2 * STALE_TEMP_MS);
        for (const f of staleTemps(s)) {
          mkdirSync(join(f, ".."), { recursive: true });
          writeFileSync(f, "{");
          utimesSync(f, hour, hour);
        }
      },
    },
    run: async (s) => {
      for (const f of staleTemps(s)) s.expect(existsSync(f), `${f} there, to begin with`);
      await follow(s, ARCHITECTURE);
      await s.see(TITLE, 5000);
      await listed(s);
      for (const f of staleTemps(s)) s.expect(!existsSync(f), `${f} swept by the thread's catch-up of kestrel`);
    },
  },
  {
    area: "links-and-files",
    name: "peek backlinks: a kept tab's vault being indexed on the thread at start gives way to a peek's backlinks (#10)",
    covers: { cases: ["links/backlinks"], commands: ["link.follow", "peek.tab"] },
    alone: true,
    options: {
      home: true,
      startAt: "home/notes/two.md",
      setup: (s) => {
        bigVault(s, 4000);
        s.write(
          "~/notes/two.md",
          "# Two\n\n[the first](../big/d0/n0.md)\n\n[the architecture](../work/kestrel/docs/architecture.md)\n",
        );
      },
    },
    run: async (s) => {
      const big = join(s.home, "big");
      // big's note kept as a tab, slipbox quit before big's index is built: started again, the tab's catch-up builds it.
      await s.keys("tab", "enter");
      await s.see("big › d0/n0.md", 5000);
      await s.keys("t");
      await s.see("big: n0.md", 5000);
      await s.keys("ctrl+q");
      await s.until(() => s.exited(), 10_000, "slipbox to quit");
      s.expect(!existsSync(indexOf(s, big)), "big's index not built yet");
      await s.restart({ startAt: "home/notes" });
      await s.see("big: n0.md", 10_000);
      // The notes' tab, its link to kestrel peeked at: listed before big's index is built.
      await s.keys("g", "t");
      await s.see("two.md", 5000);
      await follow(s, "the architecture");
      await s.see(TITLE, 5000);
      await listed(s);
      s.expect(!existsSync(indexOf(s, big)), "kestrel's listed before big's index, the tab's catch-up given way");
    },
  },
  {
    area: "links-and-files",
    name: "peek backlinks: inside a peek, a name a note of a third vault declares, that vault without an index here — found once it's built: the old form's suggestion names its note (D259, 21.11)",
    covers: { cases: ["links/roots", "vault"], commands: ["link.follow"] },
    options: {
      home: true,
      startAt: "home/notes/to-third.md",
      setup: (s) => {
        s.write("~/work/product/prd/far-product.md", "---\naliases: [Far Product]\n---\n# Far product\n");
        s.write("~/work/kestrel/docs/third.md", "# Third\n\nSee [[product:Far Product]].\n");
        s.write("~/notes/to-third.md", "# To it\n\n[third](../work/kestrel/docs/third.md)\n");
        // product known on this machine by its name, its index not built.
        inState(s, () => recordLocation(rootAt(join(s.home, "work", "product"))));
      },
    },
    run: async (s) => {
      await s.keys("tab", "enter");
      await s.see("kestrel › docs/third.md", 5000);
      await answered(s);
      await s.keys("g", "g", "tab");
      await s.retry(
        () => s.keys("enter"),
        () => s.rowOf("slipbox://product/prd/far-product.md") >= 0,
        "the old form's suggestion naming the note in product the name finds",
        1000,
        SLOW,
      );
    },
  },
  {
    area: "links-and-files",
    name: "peek backlinks: home with an index of this version whose every note changed since — caught up, its backlinks listed, not said to have none (VV-D2, #10)",
    covers: { cases: ["links/backlinks", "vault"], commands: ["link.follow"] },
    options: {
      home: true,
      startAt: "home/notes/to-home.md",
      setup: (s) => {
        s.write("~/loose.md", "# Loose\n\nA note of home's own.\n");
        s.write("~/notes/to-home.md", "# To home\n\n[the loose one](../loose.md)\n");
        // Home's index built, then every note of it touched (a backup put back, a sync).
        const r = s.cliIn("~/", "index", "--refresh", s.home);
        s.expect(r.code === 0, `home's index built: ${r.out}`);
        const later = new Date(Date.now() + 60_000);
        // Every note in it, its links never followed (the reference set has a loop of them), its hidden folders left.
        const touch = (dir: string): void => {
          for (const e of readdirSync(dir, { withFileTypes: true })) {
            if (e.name.startsWith(".") || e.isSymbolicLink()) continue;
            const p = join(dir, e.name);
            if (e.isDirectory()) touch(p);
            else if (e.name.endsWith(".md")) utimesSync(p, later, later);
          }
        };
        touch(s.home);
      },
    },
    run: async (s) => {
      s.expect(existsSync(indexOf(s, s.home)), "home's index there");
      await s.keys("tab", "enter");
      await s.see("~ › loose.md", 5000);
      await answered(s);
      s.expect(!s.text().includes("has no index here yet"), "caught up: its index of this version read");
    },
  },
  {
    area: "links-and-files",
    name: "peek backlinks: a vault nested in this one, never indexed — its links among this note's backlinks, its index built on the thread (#10)",
    covers: { cases: ["links/backlinks", "vault"], commands: ["backlinks.open"] },
    options: {
      home: true,
      startAt: "home/notes/index.md",
      setup: (s) => {
        mkdirSync(join(s.home, "notes", "nest", ".slipbox"), { recursive: true });
        s.write("~/notes/nest/n.md", "# Nest\n\nBack to [the index](../index.md).\n");
      },
    },
    run: async (s) => {
      const nest = join(s.home, "notes", "nest");
      // The backlinks of the index: the nested vault found, its index built on the thread, its link listed.
      await s.retry(
        async () => {
          await s.keys("escape", "space", "l", "b");
        },
        () => s.rowOf("nest/n.md") >= 0,
        "the nested vault's link among the backlinks",
        2000,
        SLOW,
      );
      s.expect(existsSync(indexOf(s, nest)), "the nested vault's index built");
    },
  },
  {
    area: "links-and-files",
    name: "peek backlinks: a note of kestrel deleted since kestrel's index, linking here — once a link by name reaches kestrel, kestrel is caught up on the thread, and the Info view's count of this note's backlinks drops it, no key pressed (#10)",
    covers: { cases: ["links/backlinks", "links/roots", "info"], commands: ["note.info"] },
    options: {
      home: true,
      startAt: "home/notes/by-name.md",
      setup: (s) => {
        s.write("~/notes/by-name.md", "# By name\n\nNothing yet.\n");
        s.write("~/work/kestrel/docs/to-notes.md", "# To notes\n\nBack to [by name](../../../notes/by-name.md).\n");
        indexKestrel(s);
        inState(s, () => recordLocation(rootAt(join(s.home, "work", "kestrel"))));
        // Deleted since: kestrel's index lists it, its link here with it.
        rmSync(join(s.home, "work", "kestrel", "docs", "to-notes.md"));
      },
    },
    run: async (s) => {
      const index = indexOf(s, join(s.home, "work", "kestrel"));
      await leader(s, "n", "i");
      await s.status("INFO");
      s.expect((await infoCount(s)) === 1, "kestrel's index still lists the note gone, its link here counted");
      await s.keys("escape");
      // A link by kestrel's name, written from outside: the old form (21.11) reaches kestrel by it, its graph opened
      // here, its index behind its walk — nothing to parse, a note gone.
      s.write("~/notes/by-name.md", "# By name\n\nSee [[kestrel:Architecture]].\n");
      // No key from here: the thread's catch-up lays the screen out again.
      await s.until(() => /backlinks +0\b/.test(s.text()), SLOW, "the count without the note gone");
      s.expect(!readFileSync(index, "utf8").includes("docs/to-notes.md"), "kestrel's index caught up on the thread");
    },
  },
  {
    area: "links-and-files",
    name: "peek backlinks: a vault nested in kestrel, never indexed, its note linking here — a peek into kestrel builds its index on the thread, and this note's backlinks count it, in the Info view (#10)",
    covers: { cases: ["links/backlinks", "vault", "info"], commands: ["link.follow", "note.info"] },
    options: {
      home: true,
      startAt: "home/notes/index.md",
      setup: (s) => {
        mkdirSync(join(s.home, "work", "kestrel", "lab", ".slipbox"), { recursive: true });
        s.write("~/work/kestrel/lab/n.md", "# Lab\n\nBack to [the index](../../../notes/index.md).\n");
        // kestrel's own index as of now: the peek's thread writes only the nested one's.
        indexKestrel(s);
      },
    },
    run: async (s) => {
      const lab = join(s.home, "work", "kestrel", "lab");
      await leader(s, "n", "i");
      await s.status("INFO");
      const before = await infoCount(s);
      await s.keys("escape");
      await follow(s, ARCHITECTURE);
      await s.see(TITLE, 5000);
      await listed(s);
      s.expect(existsSync(indexOf(s, lab)), "the nested vault's index built by the peek's thread");
      await s.keys("escape");
      await s.until(
        () => new RegExp(`backlinks +${before + 1}\\b`).test(s.text()),
        SLOW,
        `the count with the nested vault's link: ${before + 1}`,
      );
    },
  },
  {
    area: "links-and-files",
    name: "peek backlinks: a vault nested in this one, never indexed — its row in the explorer says it has no index, then, once its thread has built one, that it has (VV-D9, #10)",
    covers: { cases: ["links/backlinks", "vault", "explorer"], commands: ["backlinks.open"] },
    options: {
      home: true,
      startAt: "home/notes/index.md",
      setup: (s) => {
        mkdirSync(join(s.home, "notes", "nest", ".slipbox"), { recursive: true });
        s.write("~/notes/nest/n.md", "# Nest\n\nBack to [the index](../index.md).\n");
      },
    },
    run: async (s) => {
      await explorerOpen(s);
      await s.keys("escape"); // the keys back to the note: no menu over a row's marks
      await s.until(() => markOf(s, "nest") === "", 5000, "nest, without an index: no mark");
      // Start's own remakes of the tree done first (git's status, the followed links' probes): the one after the build
      // is the thread's answer's.
      await sleep(3000);
      // The index's backlinks: the nested vault found, its index built on the thread.
      await leader(s, "l", "b");
      await s.until(() => markOf(s, "nest") === "●", SLOW, "nest, its index built: ●");
    },
  },
  {
    area: "links-and-files",
    name: "peek backlinks: a vault nested in kestrel by a root marker only your config names — found as a vault on the thread too, its index built, its link listed (21.1, #10)",
    covers: { cases: ["links/backlinks", "vault"], commands: ["link.follow"] },
    options: {
      home: true,
      startAt: "home/notes/index.md",
      config: '[walk]\nroot_markers = [".git", ".slipbox", ".mark"]\n',
      setup: (s) => {
        mkdirSync(join(s.home, "work", "kestrel", "lab", ".mark"), { recursive: true });
        s.write("~/work/kestrel/lab/n.md", "# Lab\n\nAbout [the architecture](../docs/architecture.md).\n");
      },
    },
    run: async (s) => {
      await follow(s, ARCHITECTURE);
      await s.see(TITLE, 5000);
      await listed(s);
      await s.see("lab/n.md:3 — the architecture");
      // A vault of its own there as here: its index built, not its note taken for one of kestrel's.
      s.expect(existsSync(indexOf(s, join(s.home, "work", "kestrel", "lab"))), "lab's index built on the thread");
    },
  },
  {
    area: "links-and-files",
    name: "peek backlinks: a vault a widened search opened first, then reached by a name a note of it declares — caught up then, its index built on the thread, the name found (#10)",
    covers: { cases: ["links/roots", "search", "vault"], commands: ["search.open"] },
    alone: true,
    options: {
      home: true,
      startAt: "home/notes/index.md",
      setup: (s) => {
        const far = join(s.home, "work", "lantern");
        mkdirSync(far, { recursive: true });
        s.write("~/work/lantern/far.md", "---\naliases: [Far Name]\n---\n# Far\n\nThe lantern's wick, trimmed.\n");
        // Known on this machine by its name, as once it's been opened — its index not built.
        inState(s, () => {
          initVault(far, "lantern");
          recordLocation(rootAt(far));
        });
      },
    },
    run: async (s) => {
      // The search widened to every vault this machine knows: lantern opened from the machine's list.
      await leader(s, "f", "s");
      await s.type("wick");
      await s.keys("ctrl+a");
      await s.see("and the folders linked to it");
      await s.keys("ctrl+a");
      await s.see("~/work/lantern/far.md", 15_000);
      await s.keys("escape");
      // Then a note naming it: the old form's enter (21.11) reaches lantern by its name — the graph the search opened.
      s.write("~/notes/by-name.md", "# By name\n\nSee [[lantern:Far Name]].\n");
      await s.see("by-name.md", 5000); // in the explorer: the watcher has it
      await open(s, "by-name");
      await s.keys("tab");
      await s.retry(
        () => s.keys("enter"),
        () => s.rowOf("slipbox://lantern/far.md") >= 0,
        "the old form's suggestion naming the note the name finds",
        1000,
        SLOW,
      );
      s.expect(existsSync(indexOf(s, join(s.home, "work", "lantern"))), "lantern's index built on the thread");
    },
  },
];
