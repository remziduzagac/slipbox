// The world changing under it: files edited, moved and deleted outside, the CLI beside it, its config rewritten,
// autosave, an editor's hand-off, linters and servers as processes.

import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadTheme } from "../../src/core/theme/index.ts";
import { explorerRow, HANDBOOK, leader, MEETING, moveTo, open, pos, problemListed, type Scenario, signed, TSC } from "./helpers.ts";
import { sleep } from "./herdr.ts";
import type { Session } from "./session.ts";

const KENJI = "people/kenji-mori.md";

/** Put the cursor on the first match of `text` (find, then back to reading). */
async function onto(s: Session, text: string): Promise<void> {
  await s.keys("/");
  await s.type(text);
  await s.keys("enter", "escape");
}

/** The vault's index written to the cache: every note parsed (the graph writes it when none is left). */
function indexCached(s: Session): boolean {
  const dir = join(s.dir, "cache", "slipbox");
  return existsSync(dir) && readdirSync(dir).some((k) => existsSync(join(dir, k, "index.json")));
}

/** In the switcher: reopened until it lists `path` (it lists what the vault had when it opened). */
async function inSwitcher(s: Session, query: string, path: string): Promise<void> {
  const end = Date.now() + 5000;
  for (;;) {
    await s.keys("ctrl+p");
    await s.see(/Open (note|\()/);
    await s.type(query);
    if (s.rowOf(path) >= 0) return;
    await s.keys("escape");
    s.expect(Date.now() < end, `the switcher to list ${path}`);
  }
}

/** A built-in theme's colour for a role's foreground (the user's theme folder never asked). */
const themeFg = (name: string, role: "h2") => loadTheme(name, "/nonexistent").theme.roles[role].fg!.toLowerCase();

/** The scenario's own config file (SLIPBOX_CONFIG), as Session wrote it. */
const configFile = (s: Session) => join(s.dir, "config", "slipbox", "config.toml");

/** A child of `pid` whose command line matches: a server slipbox started. */
function childOf(pid: number, match: RegExp): number | null {
  const out = spawnSync("ps", ["-o", "pid=,args=", "--ppid", String(pid)], { encoding: "utf8" }).stdout;
  const line = out.split("\n").find((l) => match.test(l));
  return line ? Number(line.trim().split(/\s+/)[0]) : null;
}

/** git in the vault, as a scenario's setup or an agent runs it. */
const git = (s: Session, ...args: string[]) => spawnSync("git", ["-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", s.vault, ...args]);

/** The status line's `L12:3`'s line, waited for until `ok`. */
async function lineIs(s: Session, ok: (line: number) => boolean, what: string): Promise<void> {
  await s.until(() => ok(pos(s).line), 5000, what);
}

export const OUTSIDE_SCENARIOS: Scenario[] = [
  {
    name: "world/outside: a clean note changed outside reloads, marked ↻; u brings its text back, ctrl+r theirs again",
    options: { open: KENJI },
    run: async (s) => {
      await s.see("second desk by the window");
      s.write(KENJI, s.read(KENJI).replace("second desk by the window", "third desk, by the door"));
      await s.see("third desk, by the door", 5000);
      await s.status("↻ reloaded");
      s.expect(!s.text().includes("second desk by the window"), "the old text gone from the screen");
      // The reload is an undo step of its own: u brings back what was there, unsaved now (the file is theirs).
      await s.keys("u");
      await s.see("second desk by the window");
      await s.notSee("third desk, by the door");
      await s.status("• unsaved");
      await s.keys("ctrl+r");
      await s.see("third desk, by the door");
      await s.until(() => !s.statusLine().includes("unsaved"), 3000, "back at the file's text: nothing unsaved");
      s.expect(s.read(KENJI).includes("third desk, by the door"), "nothing written: the file is still theirs");
    },
  },

  {
    name: "world/outside: links turn live and broken as notes come and go; the open note deleted is marked; a new deep folder is watched",
    options: { open: "people/partners-and-names.md" },
    run: async (s) => {
      // The link to a note not written yet, under the cursor: its status in the status line.
      await onto(s, "visiting rota, which");
      await s.status("→ visiting-rota.md (unresolved)");
      s.write("people/visiting-rota.md", "# Visiting rota\n");
      await s.status("→ visiting-rota.md (resolved)", 5000);
      rmSync(s.path("people/visiting-rota.md"));
      await s.status("→ visiting-rota.md (unresolved)", 5000);
      // The note on screen deleted: its last text stays, marked; back again, reloaded and unmarked.
      await open(s, "kenji-mori");
      const kenji = s.read(KENJI);
      rmSync(s.path(KENJI));
      await s.status("✖ deleted on disk", 5000);
      await s.see("Visiting astronomer from the Kiso-Hara");
      s.write(KENJI, kenji.replace("Visiting astronomer", "Visiting astronomer (back)"));
      await s.see("Visiting astronomer (back)", 5000);
      await s.until(() => !s.statusLine().includes("✖"), 3000, "the deleted mark gone once it's back");
      // A folder made three deep at once: its note found, and its later changes seen (watched through its depth).
      s.write("field-notes/2026/october/aurora.md", "# Aurora over the ridge\n\nFirst seen at 01:40.\n");
      await inSwitcher(s, "aurora", "field-notes/2026/october/aurora.md");
      await s.keys("enter");
      await s.status("aurora.md");
      s.write("field-notes/2026/october/aurora.md", "# Aurora over the ridge\n\nFirst seen at 01:40.\n\nSeen again at 02:10.\n");
      await s.see("Seen again at 02:10.", 5000);
    },
  },

  {
    name: "world/outside: an agent's prepend keeps your place; the lens keeps its size; the explorer keeps its selection",
    needs: { cols: 100 },
    options: { open: HANDBOOK },
    run: async (s) => {
      // The cursor on line 300; four lines prepended: still on the same text, now line 304.
      await moveTo(s, ["ctrl+g"], () => true, "the line prompt");
      await s.type("300");
      await moveTo(s, ["enter"], (l) => l === 300, "ctrl+g 300 to line 300");
      s.write(HANDBOOK, `<!-- prepended -->\nAn agent's line.\n\n<!-- end -->\n${s.read(HANDBOOK)}`);
      await lineIs(s, (l) => l === 304, "the cursor to follow its line to 304");
      await s.status("↻ reloaded");
      // The lens on a block: an append at the end of the note leaves its lines and size as they were.
      await open(s, "2026-09-14-weekly");
      await s.keys("]", "]", "j", "j");
      await leader(s, "n", "l");
      await s.status("LENS");
      const lens = () => /source · lines? (\d+(?:–\d+)?)/.exec(s.text())?.[1] ?? "";
      await s.until(() => lens() !== "", 3000, "the lens's lines");
      const lines = lens();
      s.write(MEETING, `${s.read(MEETING)}\nAppended by an agent.\n`);
      await s.status("↻ reloaded", 5000);
      await s.status("LENS");
      s.expect(lens() === lines, `the lens still on lines ${lines} (now ${lens()})`);
      await s.keys("escape", "escape");
      // The explorer on home.md; a note an agent adds sorts above it: the selection stays on home.md.
      for (let i = 0; i < 3 && !s.statusLine().includes("FILES"); i++) await leader(s, "e");
      await s.status("FILES");
      await explorerRow(s, "home");
      s.write("aaa-agent-note.md", "# An agent's note\n");
      await s.see("aaa-agent-note", 5000);
      await s.keys("enter");
      await s.status("home.md");
      s.expect(!s.statusLine().includes("aaa-agent-note"), "enter opened the row selected before the note came, not the row now in its place");
    },
  },

  {
    name: "world/outside: a note moved by hand — mv, then cp and rm the other way round — the relink offered at once; declined, its links say where, space l r relinks",
    options: {
      open: "late-note.md",
      files: { "late-note.md": "# Late\n\nAsk [Kenji](people/kenji-mori.md) about Aster.\n" },
    },
    run: async (s) => {
      await s.see("Ask Kenji about Aster.");
      // Every note's text known first: the index is cached once all are parsed. (A note moved in the
      // moment after a first, cold open, before its parse, has no text to be known by.)
      await s.until(() => indexCached(s), 5000, "the vault's notes all parsed (its index cached)");
      // mv: gone from one path, the same text at another — a move (17.12), never a quiet resolve: the
      // links it broke, their fix offered at once (21.11); enter takes it.
      renameSync(s.path(KENJI), s.path("people/kenji.md"));
      await s.see(/relink: \d+ changes? in \d+ files?/, 5000); // every note's links to it, home's too
      await s.message("moved to people/kenji.md");
      await s.keys("enter");
      await s.file("late-note.md", (t) => t.includes("[Kenji](people/kenji.md)"), "relinked to where it went");
      // The other way round: the copy arrives first, then the original goes. The offer declined, the
      // link says where it went, and space l r relinks it.
      cpSync(s.path("people/kenji.md"), s.path("people/k-mori.md"));
      await sleep(300); // two events, not one batch: the arrival seen before the removal
      rmSync(s.path("people/kenji.md"));
      await s.see(/relink: \d+ changes? in \d+ files?/, 5000);
      await s.keys("escape");
      await s.notSee(/relink: \d+ changes? in \d+ files?/);
      await onto(s, "Kenji");
      await s.status("→ people/kenji.md (unresolved)", 5000);
      await s.keys("enter");
      await s.message("people/k-mori.md: space l r relinks it", 5000); // "… moved to" ends the row above
      await leader(s, "l", "r");
      await s.see("relink: 1 change in 1 file", 5000); // this note's
      await s.keys("enter");
      await s.file("late-note.md", (t) => t.includes("[Kenji](people/k-mori.md)"), "relinked again");
    },
  },

  {
    name: "world/outside: an embedded note changed on disk — the note embedding it draws the new text",
    options: { open: "people/partners-and-names.md" },
    run: async (s) => {
      await s.see("Table A — ordinary prose, no long tokens.");
      s.write("scratch/wrap-probe.md", s.read("scratch/wrap-probe.md").replace("Table A — ordinary prose", "Table A — rewritten prose"));
      await s.see("Table A — rewritten prose, no long tokens.", 5000);
      await s.notSee("Table A — ordinary prose");
    },
  },

  {
    name: "world/outside: not watching — an outside write waits for space n r, which reloads it",
    options: { open: KENJI, config: "[watch]\nenabled = false\n" },
    run: async (s) => {
      await s.see("second desk by the window");
      await s.status("not watching");
      s.write(KENJI, s.read(KENJI).replace("second desk by the window", "third desk, by the door"));
      // Nothing reloads it by itself with the watcher off: a while later, the old text still shows.
      await sleep(2000);
      s.expect(s.text().includes("second desk by the window") && !s.text().includes("third desk"), "the outside write not shown before space n r");
      await leader(s, "n", "r");
      await s.see("third desk, by the door");
      await s.status("↻ reloaded");
    },
  },
  {
    name: "world/outside: the CLI beside it — history lists its tabs, capture shows in the open scratch, rm marks the open note gone",
    run: async (s) => {
      // Two tabs, the handbook in the second: what the CLI's history says the TUI has open, a second later.
      await s.keys("ctrl+t", "c");
      await s.see(/2 home/);
      await open(s, "operations-handbook");
      const history = () => {
        try {
          return JSON.parse(s.cli("history", "--json").out).data;
        } catch {
          return null;
        }
      };
      await s.until(
        () => {
          const h = history();
          return !!h && JSON.stringify(h.open) === JSON.stringify([["home.md"], ["handbook/operations-handbook.md"]]) && h.activeTab === 1 && h.current === "handbook/operations-handbook.md";
        },
        5000,
        "history --json to list the two tabs, the handbook current",
      );
      // The scratch (an agent's first capture made it) open; the next capture lands in it without a key
      // pressed: it's outside the vault, polled.
      s.expect(s.cli("capture", "Check the dome heater").code === 0, "slipbox capture ran");
      await leader(s, "s", "s");
      await s.status(/scratch/);
      await s.see("Check the dome heater");
      s.expect(s.cli("capture", "Ask Lena about the outreach rota").code === 0, "slipbox capture ran again");
      await s.see("Ask Lena about the outreach rota", 5000);
      // rm of the note on screen: to the trash, and marked here.
      await open(s, "kenji-mori");
      const rm = s.cli("rm", KENJI);
      s.expect(rm.code === 0, `slipbox rm ran (${rm.out})`);
      s.expect(!s.exists(KENJI), "the note gone from the vault");
      await s.status("✖ deleted on disk", 5000);
      await s.see("Visiting astronomer from the Kiso-Hara"); // its last text still shown
    },
  },

  {
    name: "world/outside: an agent's replay against the open note — append, prepend, rename, delete, recreate, an atomic rewrite, a burst",
    options: {
      home: true,
      startAt: "home/Downloads/agent-scratch.md",
      setup: (s) => s.write("~/Downloads/agent-scratch.md", "# Before the agent\n"),
    },
    run: async (s) => {
      await s.see("Before the agent");
      // The set's own script (~/work/kestrel/scripts/dev/agent-replay.sh): a pause between steps.
      const replay = Bun.spawn(["bash", s.path("~/work/kestrel/scripts/dev/agent-replay.sh"), s.path("~/Downloads")], { env: { ...process.env, PAUSE: "2.5" }, stdout: "ignore", stderr: "ignore" });
      try {
        await s.see("agent scratch", 5000); // rewritten by the agent
        await s.notSee("Before the agent");
        await s.see("first pass", 5000); // appended
        await s.see(/title\s+Agent scratch/, 5000); // frontmatter prepended: its properties
        await s.status("✖ deleted on disk", 5000); // renamed away, then deleted
        await s.see("agent scratch again", 8000); // recreated: reloaded
        await s.until(() => !s.statusLine().includes("✖"), 3000, "not marked deleted once it's back");
        await s.see("rewritten atomically", 5000); // a temp file renamed over it
        await s.see("line 10", 5000); // the last of a burst of ten writes
        await s.status("✖ deleted on disk", 5000); // and gone at the end
      } finally {
        replay.kill();
      }
    },
  },

  {
    name: "world/outside: the conflict prompt — l loads theirs (u brings yours), k keeps yours (:w asks, d diffs), m merges; letters typed never pick",
    options: { open: MEETING },
    run: async (s) => {
      const prompt = "changed on disk, and you have unsaved changes";
      const append = (line: string) => s.write(MEETING, `${s.read(MEETING)}\n${line}\n`);
      await leader(s, "n", "v");
      await s.status("SOURCE");
      // (l): theirs loaded; yours one u away.
      await s.keys("G", "o");
      await s.type("mine one");
      await s.keys("escape");
      append("theirs one");
      await s.see(prompt, 5000);
      await s.keys("l");
      await s.message("loaded theirs — u brings yours back");
      await s.see("theirs one");
      await s.notSee("mine one");
      await s.keys("u");
      await s.see("mine one");
      await s.notSee("theirs one");
      // (k): yours kept, marked; :w asks first, d shows the difference, y writes yours over theirs.
      append("theirs two");
      await s.see(prompt, 5000);
      await s.keys("k");
      await s.status("⚠ differs from disk");
      await s.ex("w");
      await s.see("changed on disk — write yours over it?");
      await s.keys("d");
      await s.see("Diff — yours → theirs");
      await s.see(/\+ ?theirs two/);
      await s.keys("escape");
      await s.see("write yours over it?");
      await s.keys("y");
      await s.file(MEETING, (t) => t.includes("mine one") && !t.includes("theirs two"), "yours written over theirs");
      // (m): yours at the end, theirs at the top — merged, both kept, unsaved until :w.
      await s.keys("G", "o");
      await s.type("mine three");
      await s.keys("escape");
      s.write(MEETING, `Theirs three, at the top.\n\n${s.read(MEETING)}`);
      await s.see(prompt, 5000);
      await s.keys("d"); // the diff, and back to the prompt
      await s.see("Diff — yours → theirs");
      await s.keys("escape");
      await s.see(prompt);
      await s.keys("m");
      await s.message("merged cleanly");
      await s.see("Theirs three, at the top.");
      await s.see("mine three");
      await s.ex("w");
      await s.file(MEETING, (t) => t.startsWith("Theirs three, at the top.") && t.includes("mine three"), "the merge written");
      // While typing: said, and the letters typed go into the text; the prompt comes after esc, with the next key.
      await s.keys("G", "o");
      await s.type("typing on ");
      append("theirs four");
      await s.message("esc, then choose what to keep", 5000);
      await s.type("lkdm");
      await s.see("typing on lkdm");
      s.expect(s.rowOf(prompt) < 0, "no prompt while typing");
      await s.keys("escape");
      await s.keys("j");
      await s.see(prompt);
      await s.keys("l");
      await s.see("theirs four");
      await s.notSee("typing on lkdm");
      s.expect(!s.read(MEETING).includes("lkdm"), "the letters typed never written");
    },
  },

  {
    name: "world/outside: your config rewritten while it runs — a theme, an alias, a key at once; a typo keeps the last good; space v c reloads what the poll can't see",
    run: async (s) => {
      const file = configFile(s);
      const base = readFileSync(file, "utf8");
      // A heading the breadcrumb doesn't repeat (it names the first): drawn in the theme's h2.
      const h2 = () => s.styleOf("Start here")?.fg?.toLowerCase() ?? "";
      await s.see("Start here");
      await s.until(() => h2() === themeFg("tokyo-night", "h2"), 3000, "the default theme's heading colour");
      const good = (theme: string) => `theme = "${theme}"\n${base}\n[aliases]\nhop = "tab.new"\n\n[keys]\n"leader y" = "tab.new"\n`;
      writeFileSync(file, good("dracula"));
      await s.message("config reloaded (file changed)", 5000);
      await s.until(() => h2() === themeFg("dracula", "h2"), 3000, "the heading in dracula's colour");
      await s.ex("hop");
      await s.see(/2 home/);
      await leader(s, "y");
      await s.see(/3 home/);
      // Saved mid-edit: a warning, and what it said before stays — the theme, the alias.
      writeFileSync(file, `theme = "nord\n${base}`);
      await s.message("Invalid TOML document", 5000); // "— keeping what it said before" is cut where the box ends
      await s.ex("hop");
      await s.see(/4 home/);
      s.expect(h2() === themeFg("dracula", "h2"), "still dracula's heading");
      // A file the poll can't tell from the last: put in place whole (renamed over it), with the mtime the
      // last one had. First a good one again, with an alias of its own so its reload is told apart.
      const t = Math.floor(Date.now() / 1000) - 100;
      const place = (text: string) => {
        writeFileSync(`${file}.new`, text);
        utimesSync(`${file}.new`, t, t);
        renameSync(`${file}.new`, file);
      };
      place(good("dracula").replace("hop =", "hip ="));
      await s.message("changed: aliases", 5000);
      place(good("monokai").replace("hop =", "hip =")); // as long as dracula's, the same mtime: only reading it tells
      await sleep(1500);
      s.expect(h2() === themeFg("dracula", "h2"), "nothing reloaded by itself");
      await leader(s, "v", "c");
      await s.message("config reloaded (manual) — changed: theme");
      await s.until(() => h2() === themeFg("monokai", "h2"), 3000, "the heading in monokai's colour");
    },
  },

  {
    name: "world/outside: a vault's config can't name your editor — warned, never run; yours runs",
    options: {
      config: "[editor]\ncommand = \"sh -c 'echo $0 > $1' {file} {dir}/ran-yours\"\n",
      setup: (s) => appendFileSync(join(s.vault, ".slipbox", "config.toml"), `\n[editor]\ncommand = "sh -c 'echo $0 > $1' {file} ${s.dir}/ran-theirs"\n`),
    },
    run: async (s) => {
      await leader(s, "m");
      await s.see("Messages");
      await s.see("sets editor.command"); // the row cut where the window ends
      await s.keys("escape");
      await leader(s, "n", "e");
      await s.until(() => existsSync(join(s.dir, "ran-yours")), 5000, "your editor to run");
      s.expect(!existsSync(join(s.dir, "ran-theirs")), "the vault's editor never ran");
    },
  },

  {
    name: "world/outside: the set's kitchen-sink config — every key once: no warnings, its leader, its layout",
    options: {
      home: true,
      startAt: "home/notes/index.md",
      noWait: true, // zen: no status line to wait for
      setup: (s) => {
        // The team's config as README.md says to install it: the file and its themes. Its linter
        // (markdownlint-cli2, with your own markdownlint config) stood in for by `true`: a scenario runs
        // nothing of yours (and the notes' own config says `auto`, which runs a named command).
        const dot = s.path("~/work/infra/dotfiles/slipbox");
        writeFileSync(configFile(s), readFileSync(join(dot, "config.toml"), "utf8").replace(/^command = \["markdownlint-cli2".*$/m, 'command = ["true"]'));
        mkdirSync(join(s.dir, "config", "slipbox", "themes"), { recursive: true });
        cpSync(join(dot, "themes"), join(s.dir, "config", "slipbox", "themes"), { recursive: true });
      },
    },
    run: async (s) => {
      await s.see("Sam's notes", 10000);
      // Keys answered at once while the notes are indexed in the background — its walk.max_file_size (8 MiB)
      // lets the set's 6 MB gps-traces.md in. Measured once it answers, so a slow answer fails here, last.
      await sleep(1000);
      const asked = Date.now();
      await s.keys(":");
      await s.see("Commands", 30000);
      const answered = Date.now() - asked;
      await s.keys("escape");
      await s.notSee("Commands");
      // zen, no top bar, no explorer; line numbers on: the note's first rows numbered 1, 2, 3.
      s.expect(!s.text().includes("Explorer") && !s.topBar().includes("slipbox"), "no explorer, no top bar (zen)");
      const numbers = s.screen().slice(0, 3).map((r) => /^\s*(\d+)\s/.exec(r)?.[1]);
      s.expect(numbers.join(",") === "1,2,3", `line numbers in the gutter (${numbers.join(",")})`);
      // Its leader is backslash: \\ m, the messages — none a warning or an error (each row ends with its level and
      // time), or none at all.
      await s.keys("\\", "m");
      await s.until(() => s.rowOf("Messages") >= 0 || s.rowOf("no messages") >= 0, 5000, "the messages, or none");
      const bad = s.screen().filter((r) => /\b(warn|error) \d\d:\d\d:\d\d\b/.test(r));
      s.expect(!bad.length, `no warning among the messages:\n${bad.join("\n")}`);
      await s.keys("escape");
      s.expect(answered < 2000, `keys answered within 2 s while it indexes (took ${answered} ms)`);
    },
  },

  {
    name: "world/outside: autosave writes an idle note — never mid-insert, never while git holds its index lock",
    options: {
      open: MEETING,
      config: "[editor]\nautosave_ms = 400\n",
      setup: (s) => {
        git(s, "init", "-q", "-b", "main");
        git(s, "add", "-A");
        git(s, "commit", "-q", "-m", "the demo");
      },
    },
    run: async (s) => {
      await leader(s, "n", "v");
      await s.status("SOURCE");
      await s.keys("G", "o");
      await s.type("Autosaved line.");
      await s.keys("escape");
      await s.file(MEETING, (t) => t.includes("Autosaved line."), "the idle note autosaved");
      // Mid-insert: a while with no key, still nothing written; esc, and it is.
      await s.keys("o");
      await s.type("Still typing.");
      await sleep(1500);
      s.expect(!s.read(MEETING).includes("Still typing."), "nothing autosaved mid-insert");
      await s.keys("escape");
      await s.file(MEETING, (t) => t.includes("Still typing."), "autosaved after esc");
      // git mid-commit: it waits for the lock to go.
      const lock = join(s.vault, ".git", "index.lock");
      writeFileSync(lock, "");
      await s.keys("o");
      await s.type("Under the lock.");
      await s.keys("escape");
      await sleep(1500);
      s.expect(!s.read(MEETING).includes("Under the lock."), "nothing autosaved while git holds index.lock");
      await s.status("• unsaved");
      rmSync(lock);
      await s.file(MEETING, (t) => t.includes("Under the lock."), "autosaved once git let go");
    },
  },

  {
    name: "world/outside: an editor that changes the note — your unsaved edit saved first, its change shown after, nothing unsaved",
    // Not watching: what shows after is the hand-off's own reload, not the watcher's.
    options: { open: KENJI, config: `[watch]\nenabled = false\n\n[editor]\ncommand = ${JSON.stringify("sh -c 'echo Added in the editor. >> \"$0\"' {file}")}\n` },
    run: async (s) => {
      await s.see("second desk by the window");
      await leader(s, "n", "v");
      await s.keys("G", "o");
      await s.type("- Typed before the hand-off.");
      await s.keys("escape");
      await s.status("• unsaved");
      await leader(s, "n", "e");
      await s.see("Added in the editor.", 5000);
      const t = s.read(KENJI);
      s.expect(t.includes("- Typed before the hand-off.\nAdded in the editor."), "the edit saved before the editor appended to it");
      await s.see("Typed before the hand-off.");
      await s.until(() => !s.statusLine().includes("unsaved"), 3000, "nothing unsaved: the file's text is the buffer's");
    },
  },

  {
    name: "world/outside: lint as it flows — a finding after a save, hidden while unsaved, gone once fixed and saved",
    // A stand-in linter in markdownlint-cli2's format: a line with TODO is a finding.
    options: {
      open: MEETING,
      config: `[lint]\nenabled = "on"\ncommand = ["sh", "-c", ${JSON.stringify('rc=0; for f; do for l in $(grep -n TODO "$f" | cut -d: -f1); do printf \'%s:%s:1 error MD099/todo-left A TODO is left\\n\' "$f" "$l"; rc=1; done; done; exit $rc')}, "lint"]\n`,
    },
    run: async (s) => {
      await s.see("Tomasz: book the courier");
      await leader(s, "n", "v");
      await s.status("SOURCE");
      await s.keys("G", "o");
      await s.type("TODO: check the dome heater");
      await s.keys("escape");
      // Unsaved: the linter reads the file, so nothing yet.
      await sleep(1000);
      const counted = () => signed("{warning} [1-9]").test(s.statusLine());
      s.expect(!counted(), "no finding for unsaved text");
      await s.keys("ctrl+s");
      await s.until(counted, 5000, "the finding counted once saved");
      await problemListed(s, signed("{warning} \\d+:1 +todo-left: A TODO is left"));
      // Typed again: hidden until the next save's run.
      await s.keys("A");
      await s.type(" soon");
      await s.keys("escape");
      await s.until(() => !counted(), 3000, "the finding hidden while unsaved");
      await s.keys("ctrl+s");
      await s.until(counted, 5000, "the finding back once saved");
      // Fixed and saved: gone.
      await s.keys("d", "d", "ctrl+s");
      await s.until(() => !signed("{warning} (MD|[1-9])").test(s.statusLine()), 5000, "no finding once fixed and saved");
    },
  },

  {
    name: "world/outside: TypeScript's server killed — said, started again, a new problem found by it",
    options: { config: `[lsp]\nenabled = true\n\n[language-server.typescript]\ncommand = ${JSON.stringify(TSC)}\n` },
    run: async (s) => {
      s.write("scratch/tool.ts", 'const n: number = "x";\nexport const m = n;\n');
      await s.ex("e scratch/tool.ts");
      await s.status(signed("{error} 1"), 15000);
      await problemListed(s, "Type 'string' is not assignable to type 'number'");
      const server = childOf(s.pid()!, /tsc|typescript/);
      s.expect(server !== null, "TypeScript's server among slipbox's children");
      process.kill(server!, "SIGKILL");
      await s.message("crashed", 5000);
      // Only a server running again finds this one.
      await s.keys("G", "o");
      await s.type("const t: string = 1;");
      await s.keys("escape");
      await problemListed(s, "Type 'number' is not assignable to type 'string'", 15000);
    },
  },
];
