// The reference set's roots and real git: $HOME opened, the roots its markers make, a worktree, a merge's conflict, a detached HEAD.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { explorerRow, leader, moveTo, pos, problemListed, type Scenario } from "./helpers.ts";
import type { Session } from "./session.ts";

/** git in one of the set's repositories, as its owner runs it (HOME the set's); its stdout, or a failure. */
function git(s: Session, repo: string, ...args: string[]): { code: number; out: string } {
  const r = spawnSync(
    "git",
    ["-c", "user.email=sam@kestrel.dev", "-c", "user.name=Sam Rivera", "-C", s.path(repo), ...args],
    { encoding: "utf8", env: { ...process.env, HOME: s.home } },
  );
  return { code: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
}

/** What the explorer shows: each row left of its border, from its title down (empty when it's closed). */
function explorer(s: Session): string[] {
  const rows = s.screen();
  const title = rows.findIndex((r) => /Explorer/.test(r));
  if (title < 0) return [];
  const border = [...rows[title]!].findIndex((c) => c === "│" || c === "┃");
  return rows.slice(title + 1, -1).map((r) => [...r].slice(0, border).join(""));
}

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

/** On the text `at` (found with /), then enter: the link it starts followed. */
async function follow(s: Session, at: string): Promise<void> {
  await s.keys("/");
  await s.type(at);
  await s.keys("enter", "escape", "enter");
}

/** The Messages window's rows saying `needle`, counted. */
/** How many messages say `needle`: the Messages window filtered by `words` first (it shows only its newest rows). */
async function messagesSaying(s: Session, words: string, needle: RegExp): Promise<number> {
  await leader(s, "m");
  await s.see("Messages");
  await s.type(words);
  // The list's own rows: each ends with its level and time. (The boxes floating at the top right
  // say the newest messages again, on the same rows, without either.)
  const listed = new RegExp(`${needle.source}.*\\b(info|warn|error) \\d\\d:\\d\\d:\\d\\d`);
  const n = s.screen().filter((r) => listed.test(r)).length;
  await s.keys("escape");
  return n;
}

const ARCHITECTURE = "architecture. The"; // ~/notes/index.md's link into kestrel, as rendered

// The trees as they were before slipbox first opened them (setup runs at every start: taken once).
const before = new WeakMap<Session, Record<string, string[]>>();

export const GIT_SCENARIOS: Scenario[] = [
  {
    name: "world/git: $HOME opened — the known roots first, the folder a level at a time, never walked; into notes, across into a repository, and back",
    options: {
      home: true,
      startAt: "home",
      // Two roots this machine has seen: the launcher lists them over $HOME's own listing.
      setup: (s) => {
        s.cliIn("~/notes", "ls");
        s.cliIn("~/work/kestrel", "ls");
      },
    },
    run: async (s) => {
      await s.see(/Folders \(\d+\)/);
      await s.see(/\bnotes +~\/notes\b/);
      await s.see(/\bkestrel +~\/work\/kestrel\b/);
      await s.keys("escape");
      await s.status(/ ~ /); // a plain folder: its path where a vault's name would be
      // A level at a time: its folders, not what's in them (cooking is two down, kestrel one).
      for (let i = 0; i < 3 && !s.statusLine().includes("FILES"); i++) await leader(s, "e");
      await s.until(
        () =>
          ["..", "Downloads", "hobbies", "notes", "work"].every((n) =>
            explorer(s).some((r) =>
              new RegExp(`\\s${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`).test(r.trimEnd()),
            ),
          ),
        3000,
        "$HOME's own folders listed",
      );
      s.expect(!explorer(s).some((r) => /cooking|kestrel|people/.test(r)), "nothing below $HOME's own folders listed");
      // Never walked: a search finds only what lies in $HOME itself, though notes far below say it too.
      const top = readdirSync(s.home).filter(
        (f) => f.endsWith(".md") && readFileSync(join(s.home, f), "utf8").toLowerCase().includes("maqluba"),
      );
      s.expect(
        top.length > 0 && readFileSync(s.path("~/hobbies/cooking/Home.md"), "utf8").toLowerCase().includes("maqluba"),
        "maqluba both at the top and below",
      );
      await s.keys("escape");
      await leader(s, "f", "s");
      await s.type("maqluba");
      await s.see(`"maqluba" — ${top.length} files (scanned: no index here)`, 5000);
      s.expect(s.rowOf(/[│┃] hobbies\/\S*:\d+/) < 0, "no result from below $HOME");
      await s.keys("escape");
      // notes is a root in it: enter goes into it.
      for (let i = 0; i < 3 && !s.statusLine().includes("FILES"); i++) await leader(s, "e");
      await explorerRow(s, "notes");
      await s.keys("enter");
      await s.status(/ notes .*index\.md/, 5000);
      // Across roots by a relative path: into the kestrel repository, its top the root; back.
      await s.keys("escape");
      await follow(s, ARCHITECTURE);
      await s.status(/kestrel · main +‹ docs\/architecture\.md/, 5000);
      await s.keys("ctrl+o");
      await s.status(/ notes .*index\.md/, 5000);
    },
  },

  {
    name: "world/git: roots from markers — an Obsidian vault and a zk notebook are roots, nothing written into them; root_markers in your config decides",
    options: {
      home: true,
      startAt: "home/hobbies/cooking/Home.md",
      setup: (s) => {
        if (!before.has(s))
          before.set(s, { cooking: tree(s.path("~/hobbies/cooking")), cycling: tree(s.path("~/hobbies/cycling")) });
      },
    },
    run: async (s) => {
      // .obsidian/ makes cooking a root: unnamed, shown by its path (21.9); its own tree at the explorer's top, `..`
      // above it all the same (17.14: no fence at the root).
      await s.status(/ ~\/hobbies\/cooking +‹ Home\.md/);
      for (let i = 0; i < 3 && !s.statusLine().includes("FILES"); i++) await leader(s, "e");
      await s.until(() => explorer(s).some((r) => /\sRecipes\s*$/.test(r.trimEnd())), 3000, "cooking's own tree");
      s.expect(
        explorer(s).some((r) => /\s\.\.\s*$/.test(r.trimEnd())),
        "`..` above the root",
      );
      // `..`: hobbies a level at a time — cooking marked and unfolded (its Recipes under it), cycling a root beside
      // it; a file of cycling's opened switches into it, the explorer staying in hobbies.
      await s.keys("g", "g"); // `..`, the first row
      await s.keys("enter");
      await s.until(() => explorer(s).some((r) => /\scycling\s*$/.test(r.trimEnd())), 3000, "hobbies listed");
      s.expect(
        explorer(s).some((r) => /\sRecipes\s*$/.test(r.trimEnd())),
        "cooking still unfolded under it",
      );
      await explorerRow(s, "cycling");
      await s.keys("enter");
      await s.until(
        () => explorer(s).some((r) => /202608151900-index\.md\s*$/.test(r.trimEnd())),
        3000,
        "cycling unfolded",
      );
      await explorerRow(s, "202608151900-index\\.md");
      await s.keys("enter");
      await s.status(/ ~\/hobbies\/cycling +‹ 202608151900-index\.md/, 5000);
      for (let i = 0; i < 3 && !s.statusLine().includes("FILES"); i++) await leader(s, "e");
      await s.until(
        () => explorer(s).some((r) => /\scooking\s*$/.test(r.trimEnd())),
        3000,
        "the explorer still in hobbies",
      );
      // .zk/ makes cycling one.
      await s.restart({ startAt: "home/hobbies/cycling/202608151900-index.md" });
      await s.status(/ ~\/hobbies\/cycling +‹ 202608151900-index\.md/);
      await s.quit();
      // Opened, read, quit: neither has a file more or less, a byte changed in size — no .slipbox/ made.
      const was = before.get(s)!;
      s.expect(JSON.stringify(tree(s.path("~/hobbies/cooking"))) === JSON.stringify(was.cooking), "cooking as it was");
      s.expect(JSON.stringify(tree(s.path("~/hobbies/cycling"))) === JSON.stringify(was.cycling), "cycling as it was");
      // Your config says what marks a root: without .obsidian it's a plain folder, by its path, `..` above it.
      const config = join(s.dir, "config", "slipbox", "config.toml");
      writeFileSync(config, `${readFileSync(config, "utf8")}\n[walk]\nroot_markers = [".git", ".slipbox"]\n`);
      await s.restart({ startAt: "home/hobbies/cooking/Home.md" });
      await s.status(/ ~\/hobbies\/cooking +‹ Home\.md/);
      for (let i = 0; i < 3 && !s.statusLine().includes("FILES"); i++) await leader(s, "e");
      await s.until(
        () => explorer(s).some((r) => /\s\.\.\s*$/.test(r.trimEnd())),
        3000,
        "a plain folder's .. above it",
      );
    },
  },

  {
    name: "world/git: a worktree — name@branch, space g w lists both checkouts, enter opens the note in the other",
    options: { home: true, startAt: "home/work/kestrel-agent-sync-retry/README.md" },
    run: async (s) => {
      // The build's worktree of kestrel (git worktree add): named for its main checkout and its branch.
      await s.status(/kestrel@agent\/sync-retry +‹ README\.md/);
      await leader(s, "g", "w");
      await s.see("Worktrees (2) — enter: this note there");
      await s.see(/\smain\s+\/\S+\/work\/kestrel\s/); // the main checkout (after its branch icon)
      await s.see(/●\s+(\S+\s+)?agent\/sync-retry\s+\/\S+\/work\/kestrel-agent-sync-retry/); // this one, marked
      await s.type("main");
      await s.keys("enter");
      await s.status(/kestrel · main +‹ README\.md/, 5000);
      // Back: the worktree again, as a vault of its own.
      await s.keys("ctrl+o");
      await s.status(/kestrel@agent\/sync-retry +‹ README\.md/, 5000);
    },
  },

  {
    name: "world/git: a merge's conflict — Problems at its first marker, the explorer's !, gone with --abort; git mv marked R",
    options: { home: true, startAt: "home/work/kestrel/README.md" },
    run: async (s) => {
      const repo = "~/work/kestrel";
      const notes = "~/work/kestrel/docs/release-notes/2.3.md";
      // Jo's branch rewords the lines main changed too.
      s.expect(git(s, repo, "merge", "jo/release-notes-wording").code !== 0, "the merge stops on a conflict");
      const marker =
        s
          .read(notes)
          .split("\n")
          .findIndex((l) => l.startsWith("<<<<<<<")) + 1;
      s.expect(marker > 0, "the release notes hold git's markers");
      await leader(s, "v", "p");
      // Filtered to the file (the panel is a third of the screen): under Conflicts, at its first marker.
      await s.keys("/");
      await s.type("release-notes/2.3");
      await s.see(/Conflicts \(1\)/, 5000);
      await s.see("docs/release-notes/2.3.");
      // enter: the note at its first marker, the conflict said.
      await s.keys("enter");
      await s.status("docs/release-notes/2.3.md", 5000);
      await s.status(`L${marker}:1`);
      await problemListed(s, "a merge conflict: both sides are still here");
      // The explorer marks it `!` (its row unselected: a selected row shows its buttons there).
      await leader(s, "E");
      await s.status("FILES");
      await s.keys("k");
      await s.see(/2\.3\.md\s+!\s*[│┃]/, 5000);
      // Aborted: no mark, no Conflicts.
      s.expect(git(s, repo, "merge", "--abort").code === 0, "git merge --abort");
      await s.until(() => s.rowOf(/2\.3\.md\s+[│┃]/) >= 0 && s.rowOf(/2\.3\.md\s+!/) < 0, 6000, "the ! gone");
      await leader(s, "v", "p");
      await s.see(/Broken links \(\d+\)/);
      await s.notSee(/Conflicts/);
      // A rename git knows of: R at its new name.
      s.expect(git(s, repo, "mv", "docs/glossary.md", "docs/terms.md").code === 0, "git mv");
      await leader(s, "E");
      await s.see(/terms\.md\s+R\s*[│┃]/, 6000);
    },
  },

  {
    name: "world/git: a detached HEAD in the status line; a switch bringing a rename isn't a move; a rebase lands as one change",
    options: { home: true, startAt: "home/work/kestrel/docs/architecture.md" },
    run: async (s) => {
      const repo = "~/work/kestrel";
      await s.status(/kestrel · main +‹ docs\/architecture\.md/);
      // Detached: its commit where the branch would be.
      git(s, repo, "checkout", "-q", "--detach", "HEAD~1");
      const sha = git(s, repo, "rev-parse", "HEAD").out.trim();
      await s.until(
        () => {
          const m = / · ([0-9a-f]{7,40}) /.exec(s.statusLine());
          return !!m && sha.startsWith(m[1]!);
        },
        5000,
        `the status line on ${sha.slice(0, 7)}`,
      );
      git(s, repo, "checkout", "-q", "main");
      await s.status(/kestrel · main /, 5000);
      // refactor/docs-layout has docs/sync.md under architecture/: architecture.md's links to it break, but a
      // switch's files coming and going aren't moves — nothing to relink.
      s.expect(git(s, repo, "checkout", "-q", "refactor/docs-layout").code === 0, "checkout refactor/docs-layout");
      await s.message("switched to branch refactor/docs-layout", 5000);
      await s.status(/ · refactor\/docs-layout +‹ docs\/architecture\.md/);
      s.expect(
        s.read("~/work/kestrel/docs/architecture.md").includes("[sync.md](sync.md)") &&
          !s.exists("~/work/kestrel/docs/sync.md"),
        "a link the switch broke",
      );
      await leader(s, "l", "r");
      await s.see("relink: 0 changes in 0 files", 5000);
      await s.keys("escape");
      git(s, repo, "checkout", "-q", "main");
      await s.message("switched to branch main", 5000);
      // A rebase lands as one change: git holds a detached HEAD while it replays (a second and a half here, as
      // one stopped on a conflict holds it for minutes); then the branch moved on, git's renames said once, and
      // no switch said — not to the detached HEAD, nor back.
      git(s, repo, "checkout", "-q", "cleanup/remove-legacy");
      await s.message("switched to branch cleanup/remove-legacy", 5000);
      // What's said so far (the detach above is said only if a poll saw it before main was back).
      const detachedBefore = await messagesSaying(s, "switched detached", /switched to a detached HEAD/);
      const old = git(s, repo, "rev-parse", "HEAD").out.trim();
      s.expect(
        git(s, repo, "rebase", "-q", "--autostash", "--exec", "sleep 1.5", "main").code === 0,
        "the rebase applies (the local .editorconfig stashed and back)",
      );
      const renames = git(s, repo, "diff", "-M", "--name-status", old, "HEAD")
        .out.split("\n")
        .filter((l) => l.startsWith("R")).length;
      s.expect(renames > 0, "the rebase brings renames");
      await s.message("cleanup/remove-legacy moved on", 8000); // the box wraps the rest
      await s.status(/ · cleanup\/remove-legacy +‹ docs\/architecture\.md/); // the tabs stay
      s.expect(
        (await messagesSaying(s, "moved on", new RegExp(`moved on: git moved ${renames} files`))) === 1,
        "git's renames said once",
      );
      s.expect(
        (await messagesSaying(s, "switched cleanup", /switched to branch cleanup\/remove-legacy/)) === 1,
        "no switch said back to the branch",
      );
      s.expect(
        (await messagesSaying(s, "switched detached", /switched to a detached HEAD/)) === detachedBefore,
        "no detach said for the rebase",
      );
    },
  },

  {
    name: "world/git: :pin-root keeps a vault among the explorer's roots after leaving it; again, no longer",
    options: { home: true, startAt: "home/notes/index.md" },
    run: async (s) => {
      // The explorer open, on notes' tree: a row says kestrel only when it's kept as a root.
      const showsKestrel = () => explorer(s).some((r) => /kestrel/.test(r));
      const openExplorer = async () => {
        for (let i = 0; i < 3 && !s.statusLine().includes("FILES"); i++) await leader(s, "e");
        await s.until(() => explorer(s).some((r) => /\speople\s*$/.test(r.trimEnd())), 3000, "notes' tree");
        await s.keys("escape");
      };
      await follow(s, ARCHITECTURE);
      await s.status(/kestrel · main +‹ docs\/architecture\.md/, 5000);
      await s.keys("ctrl+o");
      await s.status(/ notes .*index\.md/, 5000);
      await openExplorer();
      s.expect(!showsKestrel(), "left, a followed vault goes from the roots");
      await follow(s, ARCHITECTURE);
      await s.status("docs/architecture.md", 5000);
      await s.ex("pin-root");
      await s.message(/kestrel: a root of the explorer/); // the box wraps the rest
      await s.keys("ctrl+o");
      await s.status(/ notes .*index\.md/, 5000);
      await openExplorer();
      await s.until(showsKestrel, 3000, "kestrel kept among the roots");
      // Unpinned: gone again once left.
      await follow(s, ARCHITECTURE);
      await s.status("docs/architecture.md", 5000);
      await s.ex("pin-root");
      await s.message(/kestrel: no longer kept/);
      await s.keys("ctrl+o");
      await s.status(/ notes .*index\.md/, 5000);
      await openExplorer();
      s.expect(!showsKestrel(), "unpinned, gone");
    },
  },

  {
    name: "world/git: a named folder moved by hand brings its places along, nothing asked (21.8)",
    options: { home: true, startAt: "home/hobbies/photography/index.md" },
    run: async (s) => {
      await moveTo(s, ["shift+g"], (l) => l > 10, "the end of the note");
      const left = pos(s).line;
      await s.quit();
      renameSync(s.path("~/hobbies/photography"), s.path("~/hobbies/photography-moved"));
      await s.restart({ startAt: "home/hobbies/photography-moved/index.md" });
      await s.message("photography moved here from", 5000); // the box wraps where from
      await s.notSee("did it move here?");
      await s.until(() => pos(s).line === left, 5000, `index.md at line ${left} again`);
    },
  },

  {
    name: "world/git: the background auto-index finds $HOME's roots while nobody works",
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
      await s.see(/Folders \(\d+\)/);
      await s.see(/photography +~\/hobbies\/photography/);
      await s.see(/product +~\/work\/product/);
    },
  },

  {
    name: "world/git: the index across a quit — an outside edit's backlink at the next start; a damaged cache rebuilt",
    options: { home: true, startAt: "home/notes/people/priya-nair.md" },
    run: async (s) => {
      const linker = "~/notes/meetings/2026-10-07-outside.md";
      await leader(s, "l", "b");
      await s.see("Linking to");
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
    },
  },
];
