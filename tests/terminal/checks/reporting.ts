// Reporting a problem (RPT): the report's window opened by its key, the palette and help; the screen and where you were
// added on your say; sent by the browser, a copy or gh — each program a fake on the check's PATH, the clipboard its
// file. In the navigating area, as help's: its own file, navigating.ts being past the size limit.

import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Check, HANDBOOK, leader } from "../check.ts";
import type { Session } from "../session.ts";

/** The report's window's frame, on screen while it's open. */
const WINDOW = "ctrl+s sends it or adds the screen · esc · q leaves it";
const MENU = "Send the report — nothing has left yet";

/** A program of the check's own, on its PATH: what it's given kept beside it (`<name>.argv`, `<name>.input`). */
function fake(s: Session, name: string, answer: string): void {
  const bin = join(s.dir, "bin");
  mkdirSync(bin, { recursive: true });
  const at = join(bin, name);
  writeFileSync(
    at,
    `#!/bin/sh\nif [ "$1" = config ]; then echo octo-cat; exit 0; fi\nprintf '%s\\n' "$@" > "${at}.argv"\npwd > "${at}.cwd"\ncat > "${at}.input" </dev/null 2>/dev/null || true\n${answer}\n`,
  );
  chmodSync(at, 0o755);
}

/** gh reads its body on its input: kept whole. */
function fakeGh(s: Session): void {
  const at = join(s.dir, "bin", "gh");
  mkdirSync(join(s.dir, "bin"), { recursive: true });
  writeFileSync(
    at,
    `#!/bin/sh\nif [ "$1" = config ]; then echo octo-cat; exit 0; fi\nprintf '%s\\n' "$@" > "${at}.argv"\ncat > "${at}.input"\necho https://github.com/remziduzagac/slipbox/issues/77\n`,
  );
  chmodSync(at, 0o755);
}

const kept = (s: Session, name: string, what: "argv" | "input" | "cwd") => {
  try {
    return readFileSync(join(s.dir, "bin", `${name}.${what}`), "utf8");
  } catch {
    return "";
  }
};

/** Every file under the check's folder but the trace: nothing of a report may be in one. */
function onDisk(s: Session): string {
  let out = "";
  for (const e of readdirSync(s.dir, { withFileTypes: true, recursive: true })) {
    if (!e.isFile() || e.name === "trace" || e.parentPath.includes("node_modules")) continue;
    try {
      out += readFileSync(join(e.parentPath, e.name), "utf8");
    } catch {}
  }
  return out;
}

/** The browser's opener here: macOS's own, else a display's. Both are faked, so no check ever opens a real browser. */
const OPENER = process.platform === "darwin" ? "open" : "xdg-open";
const fakeOpeners = (s: Session, answer: string) => {
  for (const name of ["open", "xdg-open"]) fake(s, name, answer);
};

/** The PATH the fakes come first on. */
const FAKES = { PATH: `{dir}/bin:${process.env.PATH ?? "/usr/bin:/bin"}` };

export const REPORTING: Check[] = [
  {
    area: "navigating",
    name: "report: space r opens it, the facts filled in, typing on the title; esc twice leaves, kept; nothing on disk",
    covers: { cases: ["help"], commands: ["help.report"] },
    options: { size: { cols: 120, rows: 34 } },
    run: async (s) => {
      await leader(s, "r");
      await s.see("Report a problem");
      await s.see(WINDOW);
      await s.see("### What happened");
      await s.status("INSERT");
      await s.type("It froze on opening");
      await s.see("It froze on opening");
      s.expect(!s.statusLine().includes("unsaved"), "a report is never unsaved: it's never saved anywhere");
      await s.keys("escape");
      await s.see(WINDOW);
      // The facts at its end: the terminal's, its size.
      await s.keys("shift+g");
      await s.see(/TERM xterm-256color, 120×34/);
      await s.keys("g", "g");
      await s.keys("escape");
      await s.notSee(WINDOW);
      // Opened again, as it was left; from the palette, and from help.
      await s.ex("report");
      await s.see("It froze on opening");
      await s.keys("q");
      await s.notSee(WINDOW);
      await s.keys("?");
      await s.see("Keys — type to filter");
      await s.type("report a problem");
      await s.keys("enter");
      await s.see("It froze on opening");
      // `:w!` has no file to force: it's `:w`, the menu.
      await s.ex("w!");
      await s.see(MENU);
      await s.keys("escape");
      s.expect(!onDisk(s).includes("It froze on opening"), "the report on no disk");
      const ran = join(import.meta.dir, "..", "..", "..");
      s.expect(!existsSync(join(ran, "report:")) && !existsSync(join(ran, "report")), "nor where slipbox ran");
      // Quitting isn't refused by it, nor asks.
      await s.keys("escape");
      await s.ex("qa");
      await s.until(() => s.exited(), 5000, "slipbox to quit, the report not stopping it");
      s.expect(!onDisk(s).includes("It froze on opening"), "nothing of it written on quitting");
    },
  },
  {
    area: "navigating",
    name: "report: keys sent at once with space r land in it, never in the note under it",
    covers: { cases: ["help"], commands: ["help.report"] },
    options: { size: { cols: 120, rows: 34 } },
    run: async (s) => {
      await s.see("Halden Ridge Observatory");
      await s.send(" rBurst title");
      await s.see(WINDOW);
      await s.see(/ 3 {2}Burst title/);
      await s.status("INSERT");
      await s.keys("escape", "escape");
      await s.notSee(WINDOW);
      await s.status("READ");
      s.expect(!s.text().includes("Burst title"), "nothing of it in the note");
    },
  },
  {
    area: "navigating",
    name: "report: the screen as text and where you were, added in full on your say, the palette not in it; u takes it out",
    covers: { cases: ["help"], commands: ["help.report", "help.report_send", "edit.undo"] },
    options: { size: { cols: 120, rows: 34 }, open: HANDBOOK },
    run: async (s) => {
      await s.see("Operations Handbook");
      await s.keys("j", "j");
      // The palette that ran it is gone from the screen kept: the frame after the command.
      await s.ex("report where");
      await s.see("Where it was:");
      await s.see(/handbook\/operations-handbook\.md, line \d+, rendered/);
      await s.keys("ctrl+s");
      await s.see(MENU);
      await s.see("(s) Add the screen as text");
      await s.notSee("(w) Add where you were");
      await s.keys("s");
      await s.see("The screen, 120×34, as the report opened:");
      // The screen as it was under the palette, in full: the handbook, never the `:` line that ran it.
      await s.keys("ctrl+s", "c");
      await s.until(() => s.clipboard().includes("The screen, 120×34"), 5000, "the report copied");
      const copied = s.clipboard();
      const screen = copied.slice(copied.indexOf("The screen, 120×34"));
      s.expect(/Operations Handbook/.test(screen), "the handbook as it was on screen");
      s.expect(!screen.includes("report where"), "not the palette's line");
      s.expect(screen.split("\n").length >= 34, "every row of the screen");
      await s.keys("u");
      await s.notSee("The screen, 120×34");
      await s.see("Where it was:");
      await s.keys("ctrl+s");
      await s.see("(s) Add the screen as text");
    },
  },
  {
    area: "navigating",
    name: "report: sent by the browser, the address or the report copied, one thing at a time",
    covers: { cases: ["help"], commands: ["help.report", "help.report_send"] },
    options: {
      size: { cols: 120, rows: 34 },
      env: { ...FAKES, DISPLAY: ":9" },
      setup: (s) => fakeOpeners(s, "exit 0"),
    },
    run: async (s) => {
      await leader(s, "r");
      await s.type("Links lose their anchors");
      await s.keys("escape", "ctrl+s");
      await s.see(MENU);
      await s.see("(o) Open the bug form in your browser, filled in");
      await s.keys("o");
      await s.until(() => kept(s, OPENER, "argv") !== "", 5000, `${OPENER} to be run`);
      const url = new URL(kept(s, OPENER, "argv").trim());
      s.expect(url.origin === "https://github.com", `the bug form's address: ${url.href}`);
      s.expect(url.searchParams.get("title") === "Links lose their anchors", "the title in it");
      s.expect(url.searchParams.get("template") === "bug_report.yml", "the bug form");
      s.expect(!!url.searchParams.get("version") && !!url.searchParams.get("terminal"), "the facts in it");
      await s.message("the bug form is opening in your browser");
      s.expect(s.clipboard() === "", "the browser opened: nothing copied");
      await s.keys("ctrl+s", "a");
      await s.until(() => s.clipboard() === url.href, 5000, "the address copied");
      await s.keys("ctrl+s", "c");
      await s.until(() => s.clipboard().startsWith("Links lose their anchors\n"), 5000, "the report copied");
      s.expect(s.clipboard().includes("### Terminal\n\n"), "the report as written, the facts in it");
      s.expect(!s.clipboard().includes("<!--"), "the guide left out");
    },
  },
  {
    area: "navigating",
    name: "report: over SSH, no browser: the address copied, to open on your own machine",
    covers: { cases: ["help"], commands: ["help.report", "help.report_send"] },
    options: {
      size: { cols: 120, rows: 34 },
      env: { ...FAKES, DISPLAY: ":9", SSH_CONNECTION: "203.0.113.9 52144 198.51.100.4 22" },
      setup: (s) => fakeOpeners(s, "exit 0"),
    },
    run: async (s) => {
      await leader(s, "r");
      await s.keys("escape", "shift+g");
      await s.see(/TERM xterm-256color, 120×34, over SSH/);
      s.expect(!s.text().includes("203.0.113.9"), "SSH said, its address never");
      await s.keys("ctrl+s");
      await s.see(MENU);
      await s.see("(a) Copy the bug form's address, filled in");
      s.expect(!s.text().includes("(o) Open the bug form"), "no browser to open over SSH");
      await s.keys("a");
      await s.until(() => s.clipboard().startsWith("https://github.com/"), 5000, "the address copied");
      s.expect(kept(s, OPENER, "argv") === "", "no browser run over SSH");
    },
  },
  {
    area: "navigating",
    name: "report: posted with gh after a yes naming the title, repository and account; no runs nothing",
    covers: { cases: ["help"], commands: ["help.report", "help.report_send"] },
    options: { size: { cols: 120, rows: 34 }, env: FAKES, setup: fakeGh },
    run: async (s) => {
      await leader(s, "r");
      await s.type("Crash on open");
      // What happened, typed under its heading.
      await s.keys("escape", "j", "j", "j", "j", "o");
      await s.type("it froze");
      await s.keys("escape", "ctrl+s");
      await s.see("(g) Post it with gh");
      await s.keys("g");
      // The question, wrapped in its window.
      await s.see('Post "Crash on open" on remziduzagac/slipbox as octo-cat?');
      await s.see("Anyone can read it.");
      await s.keys("n");
      await s.notSee("Anyone can read it.");
      s.expect(kept(s, "gh", "argv") === "", "no, then nothing posted");
      await s.keys("ctrl+s", "g");
      await s.see("Anyone can read it.");
      await s.keys("y");
      // Its message wraps in its box: its start, then the whole in the list of messages.
      await s.message("posted:");
      await s.notSee(WINDOW);
      await leader(s, "m");
      await s.see("posted: https://github.com/remziduzagac/slipbox/issues/77");
      await s.keys("escape");
      s.expect(
        kept(s, "gh", "argv") ===
          "issue\ncreate\n--repo\ngithub.com/remziduzagac/slipbox\n--title\nCrash on open\n--body-file\n-\n",
        `gh's arguments: ${JSON.stringify(kept(s, "gh", "argv"))}`,
      );
      const body = kept(s, "gh", "input");
      s.expect(
        /^### What happened\n\n+it froze\n/.test(body),
        `the body as written: ${JSON.stringify(body.slice(0, 80))}`,
      );
      s.expect(!body.includes("Crash on open") && !body.includes("<!--"), "the title and guide not in the body");
      // Posted, the draft is dropped: a new report starts afresh.
      await leader(s, "r");
      await s.see(WINDOW);
      s.expect(!s.text().includes("it froze"), "a new report");
    },
  },
  {
    area: "navigating",
    name: "report: into an edited draft, the screen at the end of What slipbox sees; refused while a fence is open",
    covers: { cases: ["help"], commands: ["help.report", "help.report_send"] },
    options: { size: { cols: 120, rows: 34 } },
    run: async (s) => {
      await leader(s, "r");
      await s.type("Edited draft");
      await s.keys("escape", "/");
      await s.type("### What happened");
      await s.keys("enter", "o");
      await s.type("it broke");
      await s.keys("enter");
      await s.type("```");
      await s.keys("enter");
      await s.type("a fence left open");
      await s.keys("escape", "ctrl+s", "s");
      await s.message("a fence is left open");
      s.expect(!s.text().includes("The screen, 120×34"), "not added while a fence is open");
      // Nor an address made: where each field ends isn't clear.
      await s.keys("ctrl+s");
      // A header, drawn in capitals.
      await s.see(/a fence is left open: where each field ends isn't clear/i);
      s.expect(!s.text().includes("(a) Copy the bug form's address"), "no address while a fence is open");
      await s.keys("escape");
      // Closed, and a What slipbox sees of your own, in the middle, with a heading of your own after it.
      await s.keys("o");
      await s.type("```");
      await s.keys("enter");
      await s.type("### What slipbox sees");
      await s.keys("enter");
      await s.type("my own notes");
      await s.keys("enter");
      await s.type("### Logs");
      await s.keys("enter");
      await s.type("a log line");
      await s.keys("escape", "ctrl+s", "s");
      await s.see("The screen, 120×34, as the report opened:");
      await s.keys("ctrl+s", "c");
      await s.until(() => s.clipboard().startsWith("Edited draft\n"), 5000, "the report copied");
      // The copy said as it was made: to the state folder's file, no clipboard here.
      await s.message("copied the report to");
      const r = s.clipboard();
      const at = (t: string) => r.indexOf(t);
      s.expect(at("a log line") < at("The screen, 120×34"), "after the section's own heading and text");
      s.expect(at("The screen, 120×34") < at("### What you expected"), "before the next label");
      s.expect(at("a fence left open\n```") > 0, "the fence of your own kept as written");
    },
  },
  {
    area: "navigating",
    name: "report: the screen too long for the address: left out, said, v copies it; the opener failing copies the address",
    covers: { cases: ["help"], commands: ["help.report", "help.report_send", "messages.open"] },
    options: {
      size: { cols: 120, rows: 34 },
      env: { ...FAKES, DISPLAY: ":9" },
      setup: (s) => fakeOpeners(s, "exit 3"),
    },
    run: async (s) => {
      await leader(s, "r");
      await s.type("Too long");
      await s.keys("escape", "ctrl+s", "s");
      await s.see("The screen, 120×34, as the report opened:");
      await s.keys("ctrl+s");
      await s.see("(v) Copy What slipbox sees, to paste into its field");
      await s.see("filled in but What slipbox sees: v copies it");
      await s.keys("v");
      await s.until(() => s.clipboard().startsWith("The screen, 120×34"), 5000, "What slipbox sees copied");
      s.expect(!s.clipboard().includes("```text"), "without slipbox's fence: the form fences that field itself");
      await s.keys("ctrl+s", "o");
      await s.until(() => s.clipboard().startsWith("https://github.com/"), 8000, "the address copied instead");
      const url = new URL(s.clipboard().trim());
      s.expect(url.searchParams.get("title") === "Too long" && !url.searchParams.has("output"), "all but the screen");
      s.expect(kept(s, OPENER, "argv").trim() === url.href, "the opener was given the same address");
      await leader(s, "m");
      await s.type("exited with 3");
      await s.see(/ 1\/1 ┘/);
      await s.keys("escape");
    },
  },
  {
    area: "navigating",
    name: "report: gh failing: its words said, the draft kept; closed while gh was asked, said",
    covers: { cases: ["help"], commands: ["help.report", "help.report_send"] },
    options: {
      size: { cols: 120, rows: 34 },
      env: FAKES,
      setup: (s) => {
        const at = join(s.dir, "bin", "gh");
        mkdirSync(join(s.dir, "bin"), { recursive: true });
        writeFileSync(
          at,
          "#!/bin/sh\nif [ \"$1\" = config ]; then sleep 1; echo octo-cat; exit 0; fi\ncat >/dev/null\necho 'HTTP 422: Validation Failed' >&2\nexit 1\n",
        );
        chmodSync(at, 0o755);
      },
    },
    run: async (s) => {
      await leader(s, "r");
      await s.type("Kept on failure");
      await s.keys("escape", "/");
      await s.type("### What happened");
      await s.keys("enter", "o");
      await s.type("it froze");
      // Closed while gh is asked for its account (a second, here): nothing asked over what's there, said.
      // The first esc clears the search that found What happened; the next leaves the window.
      await s.keys("escape", "ctrl+s", "g", "escape", "escape");
      await s.message("the report was closed");
      s.expect(!s.text().includes("Anyone can read it."), "no question over the note");
      await leader(s, "r");
      await s.keys("ctrl+s", "g");
      await s.see("Anyone can read it.");
      await s.keys("y");
      await s.message("HTTP 422");
      await leader(s, "r");
      await s.see("Kept on failure");
      await s.see("it froze");
    },
  },
  {
    area: "navigating",
    name: "report: slipbox report beside it, in a folder whose settings are broken: the facts, no warning",
    covers: { cases: ["help"] },
    options: {
      size: { cols: 120, rows: 34 },
      setup: (s) => s.write(".slipbox/config.toml", `${s.read(".slipbox/config.toml")}\n[links\nstyle = = \n`),
    },
    run: async (s) => {
      const r = s.cli("report", "--json");
      s.expect(r.code === 0, `exit 0: ${r.out.slice(0, 200)}`);
      const j = JSON.parse(r.out);
      s.expect(j.ok && j.warnings.length === 0, "no warning of the folder's settings");
      s.expect(/^TERM xterm-256color/.test(j.data.fields.terminal), `the terminal: ${j.data.fields.terminal}`);
      s.expect(
        j.data.url.startsWith("https://github.com/remziduzagac/slipbox/issues/new?template=bug_report.yml"),
        "the form",
      );
    },
  },
  {
    area: "navigating",
    name: "report: a comment left open is said in the menu, no address made; left, focus is back in the explorer",
    covers: { cases: ["help"], commands: ["help.report", "help.report_send", "explorer.cycle"] },
    options: { size: { cols: 120, rows: 34 } },
    run: async (s) => {
      await leader(s, "e");
      await s.status("FILES");
      await leader(s, "r");
      await s.see(WINDOW);
      await s.type("Crash <!-- see below");
      await s.keys("escape", "ctrl+s");
      await s.see(/a comment \(<!--\) is left open: github hides everything after it/i);
      s.expect(!s.text().includes("(a) Copy the bug form's address"), "no address while a comment is open");
      await s.keys("escape", "escape");
      await s.notSee(WINDOW);
      await s.status("FILES");
    },
  },
  {
    area: "navigating",
    name: "report: a folder's keys can't send a report, which runs a program: ignored, said",
    covers: { cases: ["config"] },
    options: {
      size: { cols: 140, rows: 34 },
      setup: (s) =>
        s.write(".slipbox/config.toml", `${s.read(".slipbox/config.toml")}\n[keys]\n"g r" = "help.report_send gh"\n`),
    },
    run: async (s) => {
      await leader(s, "m");
      await s.see("Messages");
      // The message is the one the command's name finds: its row cut at the window's width.
      await s.type("help.report_send");
      await s.see(/config: .*config\.toml binds keys\.g r/);
      await s.see(/ 1\/1 ┘/);
    },
  },
];
