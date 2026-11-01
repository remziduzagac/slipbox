import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { newParseCache } from "../../../src/core/documents/markdown/parse.ts";
import { parseNoteFile } from "../../../src/core/documents/model/readers.ts";
import { loadTheme } from "../../../src/core/rendering/theme/index.ts";
import { type Check, leader } from "../check.ts";
import { type Session, sleep } from "../session.ts";

/** A built-in theme's colour for a role's foreground (the user's theme folder never asked). */
const themeFg = (name: string, role: "h2") => loadTheme(name, "/nonexistent").theme.roles[role].fg!.toLowerCase();

/** The check's own config file (SLIPBOX_CONFIG), as Session wrote it. */
const configFile = (s: Session) => join(s.dir, "config", "slipbox", "config.toml");

/**
 * How long this runner takes to parse a note on one thread (ms): a sixteenth of it parsed here, times sixteen. Less
 * than the whole takes (a long note's parse grows faster than its length), so a bound it sets is no looser than the
 * work it stands for.
 */
function parseEstimate(file: string): number {
  const text = readFileSync(file, "utf8");
  const part = text.slice(0, text.lastIndexOf("\n", text.length / 16) + 1);
  const t0 = performance.now();
  parseNoteFile(file, part, newParseCache());
  return (performance.now() - t0) * 16;
}

/** The kitchen-sink check's measure of its 6 MB note's parse on this runner (ms), taken before slipbox starts. */
let bigParse = 0;

export const CONFIGURATION: Check[] = [
  // --- your config, your editor, autosave ---------------------------------------------------------
  {
    area: "outside-and-code",
    name: "config: yours rewritten while it runs — a theme, an alias, a key at once; a typo keeps the last good; space v c reloads what the poll can't see",
    covers: { cases: ["config", "watching"], commands: ["config.reload", "tab.new"] },
    run: async (s) => {
      const file = configFile(s);
      const base = readFileSync(file, "utf8");
      // A heading the breadcrumb doesn't repeat (it names the first): drawn in the theme's h2.
      const h2 = () => s.styleOf("Start here")?.fg?.toLowerCase() ?? "";
      await s.see("Start here");
      await s.until(() => h2() === themeFg("tokyo-night", "h2"), 3000, "the default theme's heading colour");
      const good = (theme: string) =>
        `theme = "${theme}"\n${base}\n[aliases]\nhop = "tab.new"\n\n[keys]\n"leader y" = "tab.new"\n`;
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
      // A while later, nothing reloaded by itself.
      await sleep(1500);
      s.expect(h2() === themeFg("dracula", "h2"), "nothing reloaded by itself");
      await leader(s, "v", "c");
      await s.message("config reloaded (manual) — changed: theme");
      await s.until(() => h2() === themeFg("monokai", "h2"), 3000, "the heading in monokai's colour");
    },
  },
  {
    area: "outside-and-code",
    name: "config: a folder's config can't name your editor — warned, never run; yours runs",
    covers: { cases: ["config"], commands: ["messages.open", "note.edit"] },
    // Kestrel's .slipbox/config.toml names VS Code for everyone: ignored, warned. Yours writes where it ran.
    options: {
      home: true,
      startAt: "home/work/kestrel/README.md",
      config: "[editor]\ncommand = \"sh -c 'echo $0 > $1' {file} {dir}/ran-yours\"\n",
    },
    run: async (s) => {
      // Among the messages, the warning: its row cut where the window ends, enter copies it whole.
      await leader(s, "m");
      await s.see("Messages");
      await s.type("sets editor.command");
      await s.see(/kestrel\/\.slipbox\/config\.toml sets/);
      await s.keys("enter");
      await s.until(() => s.clipboard().includes("sets editor.command"), 3000, "the warning copied");
      s.expect(
        /kestrel\/\.slipbox\/config\.toml sets editor\.command, which only your own/.test(s.clipboard()),
        s.clipboard(),
      );
      await leader(s, "n", "e");
      const ran = join(s.dir, "ran-yours");
      await s.until(() => existsSync(ran), 5000, "your editor to run");
      s.expect(readFileSync(ran, "utf8").trim().endsWith("work/kestrel/README.md"), "yours ran, on the note");
    },
  },
  {
    area: "outside-and-code",
    name: "config: the set's kitchen-sink config — every key once: no warnings, its leader, its layout",
    alone: true,
    covers: { cases: ["config"], commands: ["palette.open"] },
    options: {
      home: true,
      startAt: "home/notes/index.md",
      noWait: true, // zen: no status line to wait for
      setup: (s) => {
        // The team's config as README.md says to install it: the file and its themes. Its linter
        // (markdownlint-cli2, with your own markdownlint config) stood in for by `true`: a check runs
        // nothing of yours (and the notes' own config says `auto`, which runs a named command).
        const dot = s.path("~/work/infra/dotfiles/slipbox");
        writeFileSync(
          configFile(s),
          readFileSync(join(dot, "config.toml"), "utf8").replace(
            /^command = \["markdownlint-cli2".*$/m,
            'command = ["true"]',
          ),
        );
        mkdirSync(join(s.dir, "config", "slipbox", "themes"), { recursive: true });
        cpSync(join(dot, "themes"), join(s.dir, "config", "slipbox", "themes"), { recursive: true });
        // What a key would wait for if that note were parsed where keys are read: measured here, before slipbox
        // starts, on this runner as it is now.
        bigParse = parseEstimate(s.path("~/notes/research/gps-traces.md"));
      },
    },
    run: async (s) => {
      await s.see("Sam's notes", 10000);
      // Keys answered at once while the notes are indexed in the background — its walk.max_file_size (8 MiB)
      // lets the set's 6 MB gps-traces.md in. Measured once it answers, so a slow answer fails here, last.
      // The key alone, timed to the screen showing its answer: `keys` would add its own settling, which waits for a
      // quiet the indexing's progress keeps from coming.
      const asked = Date.now();
      s.term.key(":");
      await s.see("Commands", 30000);
      const answered = Date.now() - asked;
      await s.keys("escape");
      await s.notSee("Commands");
      // Zen keeps the permanent bar, hides the explorer; the note's first rows below it are numbered 1, 2, 3.
      s.expect(
        !s.text().includes("Explorer") && s.topBar().includes("slipbox"),
        "zen hides the explorer and retains the permanent bar",
      );
      const numbers = s
        .screen()
        .slice(1, 4)
        .map((r) => /^\s*(\d+)\s/.exec(r)?.[1]);
      s.expect(numbers.join(",") === "1,2,3", `line numbers in the gutter (${numbers.join(",")})`);
      // Its leader is backslash: \\ m, the messages — none a warning or an error (each row ends with its level and
      // time), or none at all.
      await s.keys("\\", "m");
      await s.until(() => s.rowOf("Messages") >= 0 || s.rowOf("no messages") >= 0, 5000, "the messages, or none");
      const bad = s.screen().filter((r) => /\b(warn|error) \d\d:\d\d:\d\d\b/.test(r));
      s.expect(!bad.length, `no warning among the messages:\n${bad.join("\n")}`);
      await s.keys("escape");
      // Sooner than the 6 MB note's parse: it's parsed on other threads, and a key waiting for it on the main thread
      // would wait as long as this runner takes to parse it on one. Measured on this runner, not a fixed bound: a
      // shared one's speed comes and goes (a CI runner has answered in two seconds, and in five).
      s.expect(
        answered < bigParse,
        `keys answered while it indexes, before its big note's parse (${answered} ms; ${Math.round(bigParse)} ms)`,
      );
    },
  },
];
