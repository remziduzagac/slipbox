import { type Check, leader, MEETING, problemListed, signed } from "../check.ts";
import { sleep } from "../session.ts";
import { numberStyle } from "../support/diagnostics.ts";
import { typedAtEnd } from "../support/outside-and-code.ts";

export const PROBLEMS_AND_LINT: Check[] = [
  // --- the Problems panel -----------------------------------------------------------------------
  {
    area: "outside-and-code",
    name: "problems: space v p — the All tab lists the vault's broken links and orphans by note; enter goes onto one",
    covers: { cases: ["problems"], commands: ["problems.open"] },
    run: async (s) => {
      await leader(s, "v", "p");
      await s.status("PROBLEMS");
      await s.see(/This file \(\d+\) +All \(\d+\)/); // its tabs, across the bottom
      await s.see(/Broken links \(\d+\)/);
      // A note nothing links to, under Orphans (filtered: the panel is a third of the screen).
      await s.keys("/");
      await s.type("broken-front");
      await s.see(/Orphans \(\d+\)/);
      await s.see(/scratch\/broken-front/);
      await s.keys("escape");
      // Filtered to the rota: partners-and-names's row, over its link to a note not written yet; enter opens it
      // there, on the link.
      await s.keys("/");
      await s.type("visiting-rota");
      await s.see(/L16 +visiting-rota\.md/);
      await s.keys("enter");
      await s.status("partners-and-names.md");
      await s.status("→ visiting-rota.md (unresolved)");
    },
  },
  {
    area: "outside-and-code",
    name: "problems: space n q — this file's problems with their lines, spaced; j shows the next, enter goes there; / filters; ctrl+w + resizes; tab to All, q closes; ⚠ 0 with none",
    covers: { cases: ["problems"], commands: ["problems.file"] },
    // Three pictures not taken yet, a paragraph apart.
    options: { open: "equipment/instrument-inventory.md" },
    run: async (s) => {
      await s.status(signed("{warning} 3"), 5000);
      await leader(s, "n", "q");
      await s.status("PROBLEMS");
      await s.see(/This file \(3\) +All \(\d+\)/);
      // Each problem: its sign, line:col, the message, who found it; under it, its line.
      await s.see(signed("{warning} 139:1 +broken link: images/lyra-slit\\.png +slipbox unresolved"));
      await s.see("![Lyra slit assembly](images/lyra-slit.png)");
      await s.see(signed("{warning} 143:1 +broken link: images/tern-frame\\.jpg"));
      // j: the note on the next one, the panel keeping the keys.
      await s.keys("j");
      await s.status(/L143:/);
      await s.status("PROBLEMS");
      // enter: there, the note has the keys; the panel stays.
      await s.keys("enter");
      await s.until(() => !s.statusLine().includes("PROBLEMS"), 3000, "the note's keys again");
      await s.status(/L143:/);
      await s.see("This file (3)");
      // A blank row under the tabs, and between the problems.
      await leader(s, "n", "q");
      await s.status("PROBLEMS");
      // Read once the panel is drawn with the keys: what's wrong, or null.
      const spacing = (): string | null => {
        const rows = s.screen();
        const tabs = rows.findIndex((r) => r.includes("This file (3)"));
        if (tabs < 0 || rows[tabs + 1]?.trim() !== "") return "a blank row under the tabs";
        const second = rows.findIndex((r) => signed("{warning} 143:1").test(r));
        if (!(second > 0 && rows[second - 1]!.trim() === "")) return "a blank row between the problems";
        return null;
      };
      await s
        .until(() => spacing() === null, undefined, "the panel spaced")
        .catch(() => s.expect(false, spacing() ?? "the panel spaced"));
      // / filters it: by the line's text.
      await s.keys("/");
      await s.type("flat field");
      await s.see("› flat field");
      await s.until(() => !signed("{warning} 139:1").test(s.text()), 3000, "the other problems filtered out");
      await s.see(signed("{warning} 147:1"));
      await s.keys("escape");
      // Resized as a window: ctrl+w + a row taller, then resize mode's j another; esc leaves it.
      const tabs = () => s.screen().findIndex((r) => r.includes("This file (3)"));
      const was = tabs();
      await s.keys("ctrl+w", "+");
      await s.status("RESIZE");
      await s.keys("j");
      await s.until(() => tabs() === was - 2, 3000, "the panel two rows taller");
      await s.keys("escape");
      await s.status("PROBLEMS");
      // tab: All; q closes it.
      await s.keys("tab");
      await s.see(/Broken links \(\d+\)/);
      await s.keys("q");
      await s.until(() => !s.text().includes("This file ("), 3000, "the panel closed");
      // The status line's path between back and forward.
      await s.status(/‹ equipment\/instrument-inventory\.md ›/);
      // A note with no problems: the panel's button on the status line instead, `⚠ 0` (a Nerd icon or `!`).
      await s.ex("e home.md");
      await s.status(/‹ home\.md › +\S+ 0 /);
    },
  },

  // --- linters ------------------------------------------------------------------------------------

  ...[
    { wrap: true, code: "scroll", follow: true, ignore: false, count: 2, hidden: 2 },
    { wrap: false, code: "scroll", follow: true, ignore: false, count: 3, hidden: 1 },
    { wrap: true, code: "wrap", follow: true, ignore: false, count: 1, hidden: 3 },
    { wrap: false, code: "wrap", follow: true, ignore: false, count: 3, hidden: 1 },
    { wrap: true, code: "wrap", follow: false, ignore: false, count: 4, hidden: 0 },
    { wrap: true, code: "scroll", follow: true, ignore: true, count: 1, hidden: 3 },
  ].map(
    (settings): Check => ({
      area: "editing",
      name: `lint visibility: wrap=${settings.wrap}, code=${settings.code}, follow=${settings.follow}, ignore=${settings.ignore}`,
      covers: { cases: ["lint", "problems"], commands: ["problems.show_all"] },
      options: {
        home: true,
        startAt: "home/notes/lint-visibility.md",
        config: `[ui]\nwrap = ${settings.wrap}\n[render]\ncode_wrap = "${settings.code}"\n[lint]\nenabled = "on"\nfollow_view = ${settings.follow}\nignore = ${settings.ignore ? '["MD033"]' : "[]"}\ncommand = ["sh", "-c", ${JSON.stringify(`for f; do case "$f" in */lint-visibility.md) for line in 3 7 10; do printf '%s:%s:1 error MD013/line-length Long line\\n' "$f" "$line"; done; printf '%s:3:1 error MD033/no-inline-html Inline HTML\\n' "$f";; esac; done; exit 1`)}, "lint"]\n`,
        setup: (s) =>
          s.write(
            "~/notes/lint-visibility.md",
            "# Visibility\n\nParagraph\n\n| A |\n| - |\n| B |\n\n```ts\nlong code\n```\n",
          ),
      },
      run: async (s) => {
        await s.status(signed(`{warning} ${settings.count}`), 10000);
        await leader(s, "n", "q");
        await s.see(`This file (${settings.count})`);
        if (settings.hidden) {
          await s.see("hidden:");
          await s.see("a: show all");
          await s.keys("a");
          await s.see("This file (4)");
          await s.see("revealed:");
          await s.keys("a");
          await s.see(`This file (${settings.count})`);
        } else {
          await s.notSee("hidden:");
          await s.keys("a");
          await s.see("This file (4)");
        }
      },
    }),
  ),

  {
    area: "outside-and-code",
    name: "lint: a stand-in linter's finding — on the status line, beside its line (its number, or the bar's sign), marked at a level; in Problems, enter goes to its line",
    covers: {
      cases: ["lint", "problems"],
      commands: ["ui.line_numbers", "ui.problems_bar", "ui.problem_marks", "problems.open", "problems.file"],
    },
    // markdownlint-cli2's output, from sh: one finding, on home.md's line 3.
    options: {
      config: `[lint]\nfollow_view = false\nenabled = "on"\ncommand = ["sh", "-c", ${JSON.stringify(`for f; do case "$f" in */home.md) printf '%s:3:6 error MD013/line-length Line length [Expected: 80]\\n' "$f";; esac; done; exit 1`)}, "lint"]\n`,
    },
    run: async (s) => {
      await s.status(signed("{warning} 1"), 6000); // how many of each severity (19.8); the linter runs once the note opens
      // Line numbers on, the default: no bar, line 3's number stands for the sign — in the warning's colour, bold.
      await s.until(
        () => {
          const [bad, good] = [numberStyle(s, 3, "Welcome to the"), numberStyle(s, 5, "there to exercise")];
          return !!bad && !!good && bad.fg !== good.fg && bad.bold && !good.bold;
        },
        3000,
        "line 3's number in the warning's colour, bold",
      );
      // Line numbers off: the problems bar (19.9), the warning's sign beside its line; off and back.
      await leader(s, "u", "n");
      await s.message("Line numbers: off");
      await s.see(signed("[│┃] +{warning} +Welcome to the observatory"));
      await leader(s, "u", "d");
      await s.message("Problems bar: off");
      await s.notSee(signed("{warning} +Welcome to the observatory"));
      await leader(s, "u", "d");
      await s.see(signed("[│┃] +{warning} +Welcome to the observatory"));
      // The marks (19.10): a level, cycled from errors through warnings and all to off, and back.
      for (const level of ["warnings and up", "all", "off", "errors"]) {
        await leader(s, "u", "shift+d");
        await s.message(`Problems marked in the text: ${level}`);
      }
      await leader(s, "v", "p");
      await s.see(/Lint \(1\)/);
      await s.see(/L3 +MD013 line-len/); // cut to the panel
      await s.keys("/");
      await s.type("MD013");
      await s.keys("enter");
      await s.status("L3:1"); // rendered: the line's start
      // What it says, in the panel's This file (the status line counts it).
      await problemListed(s, signed("{warning} 3:6 +line-length: Line length \\[Expected: 80\\] +markdownlint MD013"));
    },
  },
  {
    area: "outside-and-code",
    name: "linters: a quick one's finding shows while a slow one beside it still runs (19.19)",
    covers: { cases: ["lint", "problems"] },
    // Two linters of the user's own for Dockerfiles: one finding `apt-get install` without `-y` at once, one asleep.
    options: {
      open: "Dockerfile",
      setup: (s) => s.write("Dockerfile", "FROM x\nRUN apt-get install gcc\n"),
      config: [
        "[lint]",
        'enabled = "auto"', // the default, which the checks turn off unless a check says
        "[linter.quick]",
        `lint-command = ${JSON.stringify("grep -n 'apt-get install' | sed 's/^\\([0-9]*\\):.*/stdin:\\1:1: [error] install without -y/'; exit 1")}`,
        'lint-formats = ["%f:%l:%c: [%trror] %m"]',
        "[linter.slow]",
        'lint-command = "sleep 25"',
        "[[language]]",
        'name = "dockerfile"',
        'linters = ["quick", "slow"]',
        "",
      ].join("\n"),
    },
    run: async (s) => {
      // No key pressed: the quick one's finding is on the status line while the slow one still sleeps, long before its
      // 25 s are up (CI's waits are 30 s at least). Opening the file, other work draws the screen within a second too:
      // the unit test ("a file's linters: …") is the one that fails if a linter's answer isn't drawn as it comes.
      const t0 = Date.now();
      await s.status(signed("{error} 1"), 10_000);
      s.expect(Date.now() - t0 < 15_000, `the quick one's finding shown while the slow one ran: ${Date.now() - t0} ms`);
    },
  },
  {
    area: "outside-and-code",
    name: "lint: as it flows — a finding after a save, hidden while unsaved, gone once fixed and saved",
    covers: { cases: ["lint"], commands: ["note.save"] },
    // A stand-in linter in markdownlint-cli2's format: a line with TODO is a finding.
    options: {
      open: MEETING,
      config: `[lint]\nenabled = "on"\ncommand = ["sh", "-c", ${JSON.stringify('rc=0; for f; do for l in $(grep -n TODO "$f" | cut -d: -f1); do printf \'%s:%s:1 error MD099/todo-left A TODO is left\\n\' "$f" "$l"; rc=1; done; done; exit $rc')}, "lint"]\n`,
    },
    run: async (s) => {
      await s.see("Tomasz: book the courier");
      await typedAtEnd(s, "TODO: check the dome heater");
      // Unsaved: the linter reads the file, so nothing yet — a while later, still nothing.
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
      await s.until(
        () => !signed("{warning} (MD|[1-9])").test(s.statusLine()),
        5000,
        "no finding once fixed and saved",
      );
    },
  },
];
