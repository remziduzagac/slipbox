// Reporting a problem (RPT): the report's window opened by its key, the palette and help; the screen and where you were
// added on your say; sent by the browser, a copy or gh — each program a fake on the check's PATH, the clipboard its
// file. In the navigating area, as help's: its own file, navigating.ts being past the size limit.

import { chmodSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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
      s.expect(!onDisk(s).includes("It froze on opening"), "the report on no disk");
      // Quitting isn't refused by it, nor asks.
      await s.keys("escape");
      await s.ex("qa");
      await s.until(() => s.exited(), 5000, "slipbox to quit, the report not stopping it");
      s.expect(!onDisk(s).includes("It froze on opening"), "nothing of it written on quitting");
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
      setup: (s) => fake(s, "xdg-open", "exit 0"),
    },
    run: async (s) => {
      await leader(s, "r");
      await s.type("Links lose their anchors");
      await s.keys("escape", "ctrl+s");
      await s.see(MENU);
      await s.see("(o) Open the bug form in your browser, filled in");
      await s.keys("o");
      await s.until(() => kept(s, "xdg-open", "argv") !== "", 5000, "xdg-open to be run");
      const url = new URL(kept(s, "xdg-open", "argv").trim());
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
      setup: (s) => fake(s, "xdg-open", "exit 0"),
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
      s.expect(kept(s, "xdg-open", "argv") === "", "no browser run over SSH");
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
          "issue\ncreate\n--repo\nremziduzagac/slipbox\n--title\nCrash on open\n--body-file\n-\n",
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
