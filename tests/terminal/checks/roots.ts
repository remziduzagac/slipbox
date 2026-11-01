// Roots, home and Elsewhere, the explorer's view and the background index (TT-T6).

import { cpSync, existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  explorerOpen,
  type Check,
  downloadsElsewhere,
  EXPLORER,
  explorerRow,
  follow,
  leader,
  moveTo,
  open,
  opened,
  pos,
} from "../check.ts";
import type { Session } from "../session.ts";
import { explorer, crumbs, listed, names, toLink, ARCHITECTURE, PEEK_HINT } from "../support/links.ts";

/** A click on the breadcrumb's folder `name` (SGR's reports, as a terminal sends them). */
async function clickCrumb(s: Session, name: string): Promise<void> {
  const rows = s.screen();
  const row = rows.findIndex((r) => EXPLORER.test(r)) + 1;
  const at = new RegExp(`(^|\\s)${name}(\\s|$)`).exec(rows[row] ?? "");
  s.expect(row > 0 && !!at, `${name} in the breadcrumb to click: ${crumbs(s)}`);
  const col = at!.index + at![1]!.length;
  const x = Bun.stringWidth(rows[row]!.slice(0, col)) + 1;
  await s.send(`\x1b[<0;${x};${row + 1}M`);
  await s.send(`\x1b[<0;${x};${row + 1}m`);
}

/** The explorer opened (space e toggles it, so up to three tries) with focus. */

/** Every file under a folder with its size: what "nothing written into it" compares. */
function tree(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) out.push(`${abs.slice(base.length)}/`, ...tree(abs, base));
    else out.push(`${abs.slice(base.length)} ${e.isFile() ? statSync(abs).size : "link"}`);
  }
  return out.sort();
}

// The trees as they were before slipbox first opened them (setup runs at every start: taken once).
const before = new WeakMap<Session, Record<string, string[]>>();

export const ROOTS: Check[] = [
  {
    area: "links-and-files",
    name: "roots: a path into another root peeks, o goes into it, and back; a broken one said; a backlink from it, by its path (17.x, 21.9)",
    covers: { cases: ["links/travel", "links/backlinks", "links/forms", "vault"], commands: ["backlinks.open"] },
    options: { home: true, startAt: "home/notes/index.md" },
    run: async (s) => {
      // This note's backlinks listed: notes is indexed whole, its index on disk for other roots to read (17.11).
      await leader(s, "l", "b");
      await s.see("Linking to", 10000);
      await s.keys("escape");
      // ../work/kestrel/docs/architecture.md: a peek; o, into kestrel, at its own path; back, at the link.
      await follow(s, ARCHITECTURE);
      await s.see(PEEK_HINT, 5000);
      await s.keys("o");
      await s.message(/kestrel — /);
      await s.where(/^kestrel │ main\b/, /‹ docs\/architecture\.md/, 5000);
      await s.keys("ctrl+o");
      await s.where(/^notes(?: │|$)/, /index\.md/, 5000);
      // A pointer to a name this machine has never seen: said so, nothing opened.
      await follow(s, "the secret project");
      await s.message("isn't on this machine yet");
      await opened(s, "index.md");
      // architecture.md's backlinks: notes' index among them, by its path from home (21.9).
      await follow(s, ARCHITECTURE);
      await s.see(PEEK_HINT, 5000);
      await s.keys("o");
      await s.where(/^kestrel │ main\b/, /‹ docs\/architecture\.md/, 5000);
      await leader(s, "l", "b");
      await s.see("Linking to", 10000);
      await s.type("notes/index");
      await s.see("~/notes/index.md");
    },
  },
  {
    area: "links-and-files",
    name: "nested roots: the demo's outreach — peeked at by path, o in, back, backlinks, two deep",
    covers: { cases: ["vault", "links/roots", "links/backlinks"], commands: ["backlinks.open"] },
    run: async (s) => {
      // home's last link: outreach/index.md, in a root nested in this one (enter: the row's link) — a vault of its
      // own, so a peek (VV-D7); o goes into it.
      await s.keys("shift+g", "enter");
      await s.see("outreach › index.md", 5000);
      await s.keys("o");
      await s.message(" outreach — "); // as the switch says it: name — path
      await s.status("index.md");
      await s.see("The observatory's public programme");
      // Two deep: the school visits.
      await s.keys("g", "g", "tab", "tab", "enter");
      await s.see("outreach-school-visits › index.md", 5000);
      await s.keys("o");
      await s.message(" outreach-school-visits — ");
      await s.see("A vault nested two deep");
      // Back, and back again: to the observatory's home.
      await s.keys("ctrl+o");
      await s.status("index.md");
      await s.keys("ctrl+o");
      await s.status("home.md");
      await s.see("Halden Ridge Observatory");
      // home's backlinks: from both nested roots, each by its path (21.9).
      await leader(s, "l", "b");
      await s.see("outreach/index.md");
      await s.see("outreach/school-visits/index.md");
      await s.keys("escape");
    },
  },
  {
    area: "links-and-files",
    name: "nested roots: the explorer's row — its name asked by shift+r; m moves its folder, its links out following, two deep too",
    covers: { cases: ["vault", "links/moves"] },
    run: async (s) => {
      await explorerOpen(s);
      await s.see("outreach");
      await explorerRow(s, "outreach");
      await s.keys("shift+r");
      await s.see("name outreach, as pointers name it:");
      await s.keys("escape");
      // m: its folder moved, picked from the tree by typing — its links out (two deep too) follow, its name stays.
      await s.keys("m");
      await s.see("Move outreach/ to…");
      await s.see("(the vault's top)");
      await s.type("handbo");
      await s.keys("enter");
      await s.see(/outreach\/ → handbook\/outreach\//);
      await s.keys("enter");
      await s.file(
        "handbook/outreach/index.md",
        (t) => t.includes("[the operations handbook](../operations-handbook.md)"),
        "outreach's link out fixed",
      );
      s.expect(
        s.read("handbook/outreach/school-visits/index.md").includes("(../../safety-card.adoc)"),
        "two deep: fixed too",
      );
      s.expect(s.read("home.md").includes("[outreach](handbook/outreach/index.md)"), "home's path into it follows");
    },
  },
  {
    area: "links-and-files",
    name: "vaults: v makes a folder a root after a preview, paths across untouched; V makes it a plain folder again",
    covers: { cases: ["vault", "links/state"] },
    run: async (s) => {
      const home = s.read("home.md");
      await explorerOpen(s);
      await explorerRow(s, "logs");
      // Its menu has it; v does it: the name asked, a distinct one offered.
      await s.keys(".");
      await s.see(/Give it \.slipbox\/ +v/);
      await s.keys("v");
      await s.see("give logs/ its .slipbox/, called (empty: no name):");
      await s.see("› halden-logs");
      await s.keys("enter");
      await s.see(/logs\/ → a vault of its own, called halden-logs: \d+ changes? in \d+ files?/);
      await s.keys("enter");
      await s.message("made logs/ a vault of its own, called"); // the box wraps the rest
      s.expect(s.exists("logs/.slipbox/config.toml"), "logs/ has its .slipbox/");
      s.expect(s.read("home.md") === home, "home's path into it, across now, as it was");
      // V: back, the links as they were.
      await s.keys("shift+v");
      await s.see(/logs\/ → part of halden: \d+ changes? in \d+ files?/);
      await s.keys("enter");
      await s.message("made logs/ part of halden");
      s.expect(!s.exists("logs/.slipbox"), "its .slipbox/ gone (to the trash)");
      await s.file("home.md", (t) => t === home, "home as it was");
      // From anywhere too: which-key lists them under space d (folders) and space v (vaults).
      await s.keys("escape");
      await leader(s, "d");
      await s.see("Rename the folder");
      await s.keys("escape");
      await leader(s, "v");
      await s.see("Give a folder .slipbox/");
      await s.see("Take .slipbox/ away");
      await s.keys("escape");
    },
  },
  {
    area: "links-and-files",
    name: "vaults: a git repository is a root by itself — opened from its top, nothing asked or written; its links followed",
    covers: { cases: ["vault", "links/roots", "links/conventions"] },
    options: {
      home: true,
      startAt: "home/work/infra/README.md",
      setup: (s) => {
        if (!before.has(s)) before.set(s, { infra: tree(s.path("~/work/infra")) });
      },
    },
    run: async (s) => {
      // The repository's top is the root (20.3): named by its remote, the note by its path in it.
      await s.where(/^infra(?: │|$)/, /README\.md/);
      s.expect(!s.text().includes("make it a vault?"), "nothing offered");
      // Its links followed within it.
      await toLink(s, "k8s/api.yaml");
      await s.keys("enter");
      await opened(s, "k8s/api.yaml");
      await s.where(/^infra(?: │|$)/);
      await s.quit();
      s.expect(!s.exists("~/work/infra/.slipbox"), "no .slipbox/ made in the repository");
      s.expect(
        JSON.stringify(tree(s.path("~/work/infra"))) === JSON.stringify(before.get(s)!.infra),
        "the repository as it was",
      );
    },
  },
  {
    area: "links-and-files",
    name: "roots: a named folder moved by hand brings its reading places along, nothing asked (21.8)",
    covers: { cases: ["vault", "links/state", "links/named-folders"] },
    options: { home: true, startAt: "home/hobbies/photography/index.md" },
    run: async (s) => {
      // Read to the end of a note, then quit: the place is kept, by file.
      await moveTo(s, ["shift+g"], (l) => l > 10, "the end of the note");
      const left = pos(s).line;
      await s.quit();
      // Moved by hand, then opened where it is now: photography, by its .slipbox/ id, its state along.
      renameSync(s.path("~/hobbies/photography"), s.path("~/hobbies/photography-moved"));
      await s.restart({ startAt: "home/hobbies/photography-moved/index.md" });
      await s.message("photography moved here from", 5000); // the box wraps where from
      await s.notSee("did it move here?");
      await s.until(() => pos(s).line === left, 5000, `index.md at line ${left} again`);
    },
  },
  {
    area: "links-and-files",
    name: "vaults: Elsewhere — a folder outside home and every vault opens in no-vault, its tabs its own, no index and said so; going into a vault brings its tabs",
    covers: {
      cases: ["vault", "links/roots", "links/state", "links/backlinks"],
      commands: ["search.open", "backlinks.open", "folders.open"],
    },
    options: {
      home: true,
      startAt: "elsewhere",
      setup: (s) => {
        // Beside home, not in it (home is a vault): a few of Downloads' files.
        const at = join(s.dir, "elsewhere");
        cpSync(s.path("~/Downloads/old-blog-export"), join(at, "old-blog-export"), { recursive: true });
        cpSync(s.path("~/Downloads/stray-note.md"), join(at, "stray-note.md"));
        s.cliIn("~/notes", "ls"); // notes: known to this machine
      },
    },
    run: async (s) => {
      await s.where("Elsewhere");
      await s.see("stray-note.md");
      await s.see("old-blog-export");
      // No list of the named folders over it at the start: its folder, the breadcrumb above it.
      s.expect(s.rowOf(/Folders \(\d+\)/) < 0, "no named folders' list at the start");
      await s.until(() => / elsewhere ›$/.test(crumbs(s)), 3000, "the breadcrumb: … › elsewhere ›");
      // A note of its own: no backlinks, and why — never an empty list.
      await explorerOpen(s);
      await explorerRow(s, "stray-note.md");
      await s.keys("enter");
      await s.where("Elsewhere", /stray-note\.md/);
      await leader(s, "l", "b");
      await s.message("no backlinks in Elsewhere: it has no index");
      // No search across it.
      await leader(s, "f", "s");
      await s.message("Elsewhere has no index to search");
      // Into a vault: its own tabs; back with ctrl+o: Elsewhere's, the note where it was.
      await leader(s, "v", "v");
      await s.see("Vaults — enter goes into one; / filters");
      await s.keys("/");
      await s.type("notes");
      await s.keys("enter");
      await s.message(" notes — ");
      await s.where(/^notes(?: │|$)/);
      await s.keys("ctrl+o");
      await s.where("Elsewhere", /stray-note\.md/, 5000);
    },
  },
  {
    area: "links-and-files",
    name: "vaults: home — started in ~, home is the vault: a note of its own has its backlinks once home is walked, while nobody works; the vaults in it their own",
    covers: {
      cases: ["vault", "links/roots", "links/travel", "links/backlinks", "info"],
      commands: ["note.info", "backlinks.open"],
    },
    options: {
      home: true,
      startAt: "home",
      // The background index on, as by default, and soon at work: home's walk and index first (VV-D2).
      config: "[index]\nidle_seconds = 1\n",
      // A named folder this machine has seen: no list of them to go into first — home is a vault.
      setup: (s) => {
        s.cliIn("~/notes", "ls");
      },
    },
    run: async (s) => {
      await s.where("~"); // home, by its path
      s.expect(s.rowOf(/Folders \(\d+\)/) < 0, "home is a vault: no named folders to go into first");
      // A note of its own, at its top; its backlink lies below it, found once home is walked.
      await open(s, "todo.md");
      await leader(s, "n", "i");
      await s.status("INFO");
      await s.see(/vault +home \(~\)/);
      await s.see(/backlinks +1\b/, 20000);
      await leader(s, "l", "b");
      await s.see("Linking to");
      await s.see("household/bike-insurance.md");
      await s.keys("escape");
      // Its tree: its folders, and the vaults in it.
      await explorerOpen(s);
      await s.until(
        () => [/\shousehold$/, /\shobbies$/, /\snotes$/, /\swork$/].every((n) => listed(s, n)),
        3000,
        "home's folders and vaults listed",
      );
      // notes is a vault of its own: enter goes into it.
      await explorerRow(s, "notes");
      await s.keys("enter");
      await s.where(/^notes(?: │|$)/, /index\.md/, 5000);
      // Across roots by a relative path: a peek, o into the kestrel repository, its top the root; back.
      await s.keys("escape");
      await follow(s, ARCHITECTURE);
      await s.see(PEEK_HINT, 5000);
      await s.keys("o");
      await s.where(/^kestrel │ main\b/, /‹ docs\/architecture\.md/, 5000);
      await s.keys("ctrl+o");
      await s.where(/^notes(?: │|$)/, /index\.md/, 5000);
    },
  },
  {
    area: "links-and-files",
    name: "roots: from markers — an Obsidian vault and a zk notebook are roots, nothing written into them; root_markers in your config decides",
    covers: { cases: ["links/roots", "vault"] },
    options: {
      home: true,
      startAt: "home/hobbies/cooking/Home.md",
      setup: (s) => {
        if (!before.has(s))
          before.set(s, { cooking: tree(s.path("~/hobbies/cooking")), cycling: tree(s.path("~/hobbies/cycling")) });
      },
    },
    run: async (s) => {
      // .obsidian/ makes cooking a root: unnamed, shown by its path (21.9); its own tree in the explorer, the
      // breadcrumb naming it a vault (VV-D5).
      await s.where(/^~\/hobbies\/cooking(?: │|$)/, /‹ Home\.md/);
      await explorerOpen(s);
      await s.until(() => listed(s, /\sRecipes$/), 3000, "cooking's own tree");
      await s.until(() => /^~ › hobbies › \S+ cooking ›$/.test(crumbs(s)), 3000, "the breadcrumb: cooking a vault");
      // -: the view a folder up, hobbies a level at a time — cooking highlighted and unfolded (its Recipes under it),
      // cycling a vault beside it, unfolded in place by l; a file of it opened goes into it, the view staying.
      await s.keys("-");
      await s.until(() => listed(s, /\scycling$/), 3000, "hobbies listed");
      s.expect(listed(s, /\sRecipes$/), "cooking still unfolded under it");
      await explorerRow(s, "cycling");
      await s.keys("l");
      await s.until(() => listed(s, /202608151900-index\.md$/), 3000, "cycling unfolded");
      await explorerRow(s, "202608151900-index\\.md");
      await s.keys("enter");
      await s.where(/^~\/hobbies\/cycling(?: │|$)/, /‹ 202608151900-index\.md/, 5000);
      await explorerOpen(s);
      await s.until(() => listed(s, /\scooking$/), 3000, "the explorer still in hobbies");
      // .zk/ makes cycling one.
      await s.restart({ startAt: "home/hobbies/cycling/202608151900-index.md" });
      await s.where(/^~\/hobbies\/cycling(?: │|$)/, /‹ 202608151900-index\.md/);
      await s.quit();
      // Opened, read, quit: neither has a file more or less, a byte changed in size — no .slipbox/ made.
      const was = before.get(s)!;
      s.expect(JSON.stringify(tree(s.path("~/hobbies/cooking"))) === JSON.stringify(was.cooking), "cooking as it was");
      s.expect(JSON.stringify(tree(s.path("~/hobbies/cycling"))) === JSON.stringify(was.cycling), "cycling as it was");
      // Your config says what marks a vault: without .obsidian, cooking is a folder of home (VV-D2), its note by its
      // path from home, the view at home, no vault named in it — cooking in home's tree once home is walked, while
      // nobody works (the config's last table is [index]: a second would be no TOML).
      const config = join(s.dir, "config", "slipbox", "config.toml");
      writeFileSync(
        config,
        `${readFileSync(config, "utf8")}idle_seconds = 1\n\n[walk]\nroot_markers = [".git", ".slipbox"]\n`,
      );
      await s.restart({ startAt: "home/hobbies/cooking/Home.md" });
      await s.where("~", /‹ hobbies\/cooking\/Home\.md/);
      await explorerOpen(s);
      await s.until(() => listed(s, /\scooking$/), 20_000, "cooking, a folder of home's tree");
      s.expect(!/cooking/.test(crumbs(s)), `the view at home: ${crumbs(s)}`);
    },
  },
  {
    area: "links-and-files",
    name: "view: a worktree kept outside the view chosen — the view zooms out to the common parent, only both paths unfolded (VV-D5)",
    covers: { cases: ["vault", "explorer", "multiple-roots"], commands: ["git.worktrees"] },
    options: { home: true, startAt: "home/work/kestrel/README.md" },
    run: async (s) => {
      // The view starts at the vault: kestrel's top.
      await s.where(/^kestrel │ main\b/, /‹ README\.md/);
      await explorerOpen(s);
      await s.until(() => /^~ › work › \S+ kestrel ›$/.test(crumbs(s)), 3000, "the view at kestrel");
      s.expect(!listed(s, /\sproduct$/), "kestrel's neighbours outside the view");
      await s.keys("escape");
      // The agent's worktree, kept beside the main checkout (~/work/kestrel-agent-sync-retry): chosen, gone into.
      await s.ex("worktrees");
      await s.see("Worktrees (2) — enter: this note there");
      await s.type("sync-retry");
      await s.keys("enter");
      await s.where(/^kestrel │ agent\/sync-retry\b/, /‹ README\.md/, 5000);
      // The view zoomed out to ~/work, the common parent; the breadcrumb leads on to the worktree, where you went.
      await explorerOpen(s);
      await s.until(
        () => /^~ › work › \S+ kestrel-agent/.test(crumbs(s)),
        3000,
        "the view at ~/work, the worktree past it in the breadcrumb",
      );
      // Both paths unfolded — kestrel's folders listed, the worktree's tree under it, the vault open — and only
      // them: the other repositories folded. ~/work is listed off the main thread: its rows once it's read; and
      // kestrel's own rows a read later, beside the vault open (macOS's CI drew kestrel before its folders, #6).
      await s.until(() => listed(s, /\skestrel$/), 3000, "~/work listed");
      for (const n of [/\skestrel$/, /\skestrel-agent-sync-retry\b/, /\sproduct$/, /\sinfra$/])
        s.expect(listed(s, n), `${n.source} in the view`);
      await s.until(
        () => explorer(s).filter((r) => names(r, /\sdocs$/)).length === 2,
        3000,
        "docs/ under each of the two",
      );
      s.expect(!listed(s, /\sprd$/) && !listed(s, /\sk8s$/), "product and infra folded");
    },
  },
  {
    area: "links-and-files",
    name: "view: z zooms in on a folder, - out a level; a click on the breadcrumb zooms back in, or out (VV-D5)",
    covers: { cases: ["explorer", "mouse"] },
    options: { home: true, startAt: "home/work/kestrel/README.md" },
    run: async (s) => {
      await explorerOpen(s);
      await s.until(() => /^~ › work › \S+ kestrel ›$/.test(crumbs(s)), 3000, "the view at kestrel");
      // z on a folder: the view at it, what's above it in the breadcrumb.
      await explorerRow(s, "docs");
      await s.keys("z");
      await s.until(() => / kestrel › docs ›$/.test(crumbs(s)), 3000, "z: the view at docs");
      await s.until(() => listed(s, /\sarchitecture\.md$/), 3000, "docs' notes");
      s.expect(!listed(s, /\sREADME\.md$/), "the README, above the view, not listed");
      // -: a level up, docs unfolded in it, and in the breadcrumb past the view.
      await s.keys("-");
      await s.until(() => / kestrel › docs$/.test(crumbs(s)), 3000, "-: the view at kestrel, docs past it");
      await s.until(() => listed(s, /\sREADME\.md$/), 3000, "the README in the view again");
      // A click on docs, past the view, zooms back in; one on work, above it, out.
      await clickCrumb(s, "docs");
      await s.until(() => / kestrel › docs ›$/.test(crumbs(s)), 3000, "the click: the view at docs again");
      await clickCrumb(s, "work");
      await s.until(() => /^~ › work › \S+ kestrel › docs$/.test(crumbs(s)), 3000, "the click: the view at ~/work");
      await s.until(() => listed(s, /\sproduct$/), 3000, "work's repositories");
    },
  },
  {
    area: "links-and-files",
    name: "roots: where a file is — a root by its name, an unnamed one by its path; :folders goes into one; a file of home's a link leads to peeked at, o into home; a loose one peeked at, o beside (21.9, 21.10, VV-D2)",
    covers: { cases: ["links/named-folders", "links/roots", "vault"], commands: ["folders.open"] },
    options: { home: true, startAt: "home/notes/index.md" },
    run: async (s) => {
      await s.where(/^notes(?: │|$)/); // named by its .slipbox/
      s.cliIn("~/hobbies/photography", "ls"); // known here
      await leader(s, "v", "v");
      await s.see("Vaults — enter goes into one; / filters");
      await s.keys("/");
      await s.type("photography");
      await s.keys("enter");
      await s.message(" photography — "); // as the switch says it: name — path
      await s.where(/^photography(?: │|$)/);
      // An Obsidian vault with no .slipbox/ name and no remote: its path, from home.
      await s.restart({ startAt: "home/hobbies/cooking/Home.md" });
      await s.where(/^~\/hobbies\/cooking(?: │|$)/);
      // A file of home's (VV-D2) a link leads to, out of this vault: peeked at, home naming it (VV-D7); o goes into
      // home, the note open there; ctrl+o back.
      await s.restart({ startAt: "home/notes/daily/2026-09-22.md" });
      await follow(s, "the worker log");
      await s.see("~ › Downloads/sync-worker-2026-09-22.log.md", 5000);
      await s.keys("o");
      await s.notSee(PEEK_HINT);
      await s.where("~", /‹ Downloads\/sync-worker-2026-09-22\.log\.md/, 5000);
      await s.see("§ sync-worker log, 2026-09-22", 10000); // read and drawn
      await s.keys("ctrl+o");
      await s.where(/^notes(?: │|$)/, /2026-09-22\.md/, 5000);
      // A file of Elsewhere's a link leads to: peeked at, Elsewhere naming it; o goes into Elsewhere, its tabs.
      s.write("~/notes/daily/2026-09-22.md", `[elsewhere](${join(s.dir, "elsewhere", "stray-note.md")})\n`);
      await s.restart({ startAt: "home/notes/daily/2026-09-22.md", setup: downloadsElsewhere });
      await follow(s, "elsewhere");
      await s.see("Elsewhere › ", 5000);
      await s.keys("o");
      await s.notSee(PEEK_HINT);
      await s.where("Elsewhere", /stray-note\.md/, 5000);
    },
  },
  {
    area: "links-and-files",
    name: "index: the background auto-index finds $HOME's roots while nobody works",
    covers: { cases: ["links/index", "vault"] },
    options: { home: true, startAt: "home/notes/index.md", config: "[index]\nbackground = true\nidle_seconds = 1\n" },
    run: async (s) => {
      // Hands off (a key would pause it): the roots list fills with roots never opened.
      const registry = join(s.dir, "state", "slipbox", "roots.json");
      const found = (rel: string) =>
        existsSync(registry) && readFileSync(registry, "utf8").includes(JSON.stringify(s.path(rel)));
      const roots = ["~/hobbies/photography", "~/work/product", "~/hobbies/cycling"];
      s.expect(!roots.some(found), "none known before it ran");
      await s.until(() => roots.every(found), 60_000, "the auto-index to find photography, product and cycling");
      // The named ones among them (21.6): photography by its .slipbox/ name, product by its remote; cycling (.zk/) has none.
      await leader(s, "v", "v");
      await s.see("Vaults — enter goes into one; / filters");
      await s.keys("/");
      await s.see(/photography +~\/hobbies\/photography/);
      await s.see(/product +~\/work\/product/);
    },
  },
  {
    area: "links-and-files",
    name: "index: across a quit — an outside edit's backlink at the next start; a damaged cache rebuilt; space v r reindexes",
    covers: { cases: ["links/index", "links/backlinks"], commands: ["backlinks.open", "vault.reindex"] },
    options: { home: true, startAt: "home/notes/people/priya-nair.md" },
    run: async (s) => {
      const linker = "~/notes/meetings/2026-10-07-outside.md";
      await leader(s, "l", "b");
      await s.see("Linking to", 10000); // once every note is read
      await s.notSee("2026-10-07-outside");
      await s.keys("escape");
      await s.quit();
      // Written while slipbox was closed: no watcher saw it.
      s.write(linker, "# Outside\n\nAsked [Priya](../people/priya-nair.md) about the hiring plan.\n");
      await s.start();
      await leader(s, "l", "b");
      await s.see("2026-10-07-outside", 5000);
      await s.keys("escape");
      await s.quit();
      // Every cache file garbage: started anyway, the note drawn, its backlinks rebuilt.
      const cache = join(s.dir, "cache", "slipbox");
      const files = (readdirSync(cache, { recursive: true }) as string[]).filter((f) =>
        statSync(join(cache, f)).isFile(),
      );
      s.expect(
        files.some((f) => f.endsWith("index.json")),
        "an index in the cache",
      );
      for (const f of files) writeFileSync(join(cache, f), "\x00garbage, not an index\n");
      await s.start();
      await s.see("Priya Nair", 5000);
      await leader(s, "l", "b");
      await s.see("2026-10-07-outside", 8000);
      await s.keys("escape");
      // Reindexed by hand: the folder walked again, said so.
      await leader(s, "v", "r");
      await s.message(/reindex/i, 8000);
    },
  },
];
