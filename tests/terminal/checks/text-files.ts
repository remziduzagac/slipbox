// Large, hostile and unusual text files, Unicode and line endings.

import { lstatSync, readlinkSync } from "node:fs";
import { UNSAFE } from "../../../src/core/foundation/text/sanitize.ts";
import { type Check, downloadsVault, leader, moveTo, opened, pos } from "../check.ts";
import type { Session } from "../session.ts";
import { edit, ex, line, tablesAligned } from "../support/reading.ts";

/** Nothing of a control or bidi character on screen, nor the text of an OSC that would have set the title. */
function clean(s: Session, where: string): void {
  const t = s.text();
  s.expect(!UNSAFE.test(t.replace(/\n/g, "")), `${where}: a control or bidi character on screen`);
  s.expect(!t.includes("PWNED"), `${where}: an OSC's text on screen`);
}

export const TEXT_FILES: Check[] = [
  {
    area: "reading",
    name: "hostile names: a bidi override, C1, ESC and an OSC in file names never reach the terminal",
    covers: { cases: ["hostile"], commands: ["backlinks.open"] },
    // Downloads beside home, a vault of its own: its notes walked and indexed together, their backlinks among them.
    options: { home: true, startAt: "downloads/stray-note.md", setup: downloadsVault },
    run: async (s) => {
      // The explorer lists Downloads: each hostile name drawn without what it carried.
      await s.see("invoicefdp.md");
      await s.see("escred.md");
      await s.see("c1si.md");
      await s.see("osctitle.md");
      clean(s, "the explorer");
      // The switcher lists one by name; opened, its own heading; the title stays slipbox's.
      await s.keys("ctrl+p");
      await s.see(/Open (note|\()/);
      await s.type("osc");
      await s.see(/osctitle\.md/);
      clean(s, "the switcher");
      await s.keys("enter");
      await s.see("A title in the name");
      clean(s, "the note");
      s.expect(!s.title().includes("PWNED") && s.title().startsWith("slipbox"), `the title: ${s.title()}`);
      await s.keys("ctrl+o");
      await opened(s, "stray-note.md");
      // Two of them link to the stray note: its backlinks name them, cleaned.
      await leader(s, "l", "b");
      await s.see("Linking to");
      await s.until(
        () => {
          const below = s.screen().filter((_, i) => i > s.rowOf("Linking to"));
          return below.some((r) => r.includes("escred.md")) && below.some((r) => r.includes("osctitle.md"));
        },
        3000,
        "the hostile notes among the stray note's backlinks",
      );
      clean(s, "the backlinks");
      s.expect(!UNSAFE.test(s.title()), `the title: ${JSON.stringify(s.title())}`);
    },
  },

  {
    area: "reading",
    name: "big notes: a 2 MB note parsed on other threads, then drawn; its end and back at once; re-wrapped at another width, still at its end (15.1)",
    covers: { cases: ["large", "big"], commands: ["explorer.cycle"] },
    options: { home: true, startAt: "home/Downloads/huge-note.md" },
    run: async (s) => {
      const lines = s.read("~/Downloads/huge-note.md").split("\n").length;
      await s.see("All-hands archive", 15_000);
      // Rendered, not shown as its source: its list's bullets drawn, no `#` before its heading.
      await s.see("• action: Tomás to share the sharing mock-ups");
      s.expect(!s.text().includes("# All-hands archive"), "the 2 MB note rendered, not shown as its source");
      await s.keys("G");
      await s.until(() => pos(s).line >= lines - 3, 10_000, `G to the 2 MB note's end (line ${lines})`);
      const end = pos(s).line;
      await moveTo(s, ["k"], (l) => l < end, "k answers at the end of a 2 MB note");
      await moveTo(s, ["G"], (l) => l === end, "G again");
      // The explorer focused, then closed: the whole note re-wrapped at the window's new width, the cursor still at
      // its end.
      await leader(s, "e");
      await s.status("FILES");
      await leader(s, "e");
      await s.until(() => !s.text().includes("Explorer"), 3000, "the explorer closed");
      await s.until(() => pos(s).line === end, 10_000, "still at the end after the width changed");
      await s.see("Aiko to write up the retry numbers");
      await moveTo(s, ["g", "g"], (l) => l === 1, "gg back to the top");
      await s.see("All-hands archive");
    },
  },

  {
    area: "reading",
    name: "big notes: a file over walk.max_file_size listed as skipped in the vault's info, never searched",
    covers: { cases: ["text-files"], commands: ["vault.info", "search.open"] },
    options: { home: true, startAt: "home/notes/index.md" },
    run: async (s) => {
      await leader(s, "v", "i");
      await s.see(/research\/gps-traces\.md — larger than walk\.max_file_size/);
      await s.keys("escape");
      // A coordinate only it has finds nothing.
      await leader(s, "f", "s");
      await s.type("47.37706");
      await s.until(() => /"47\.37706"/.test(s.text()), 5000, "the search to answer");
      s.expect(!s.text().includes("gps-traces.md:"), "search never reads the file over the cap");
      await s.keys("escape");
    },
  },

  {
    area: "reading",
    name: "tables: kestrel's torture note and a training log — every table lines up, page after page, to the end",
    covers: { cases: ["tables", "rendering-in-tui", "hostile"] },
    options: { home: true, startAt: "home/work/kestrel/docs/qa/render-torture.md" },
    run: async (s) => {
      let tables = 0;
      for (let i = 0; i < 12; i++) {
        tables += tablesAligned(s, `render-torture.md, page ${i + 1}`);
        await s.keys("pagedown");
      }
      s.expect(tables >= 3, `the torture note's tables checked (saw ${tables})`);
      await moveTo(s, ["G"], (l) => l >= 390, "G to the torture note's end");
      // The cycling notebook's training log: a long table, its end reached, its rows aligned.
      await s.restart({ startAt: "home/hobbies/cycling/202601010900-training-log-2026.md" });
      s.expect(tablesAligned(s, "the training log") >= 1, "the training log's table checked");
      const last = s.read("~/hobbies/cycling/202601010900-training-log-2026.md").trimEnd().split("\n").length;
      await moveTo(s, ["G"], (l) => l >= last - 2, "G to the training log's end");
      tablesAligned(s, "the training log's end");
    },
  },

  {
    area: "reading",
    name: "hostile text: escapes in a note, a log, JSON values and a fixture never reach the terminal — no title set, no screen cleared",
    covers: { cases: ["encoding", "hostile", "text-files", "data-modes"] },
    options: { home: true, startAt: "home/notes/research/terminal-escapes-in-logs.md" },
    run: async (s) => {
      // What an escape that got through would do: control or bidi characters left in the screen's cells, the title
      // changed (OSC 0), the screen cleared or the cursor moved (the frame's top bar, the explorer's title or the
      // status line gone). Checked at the top, the end, and back.
      const intact = async (name: string) => {
        await s.status(name, 5000);
        // Where it opened: the top (a data file's first stop may be its second line).
        const top = pos(s).line;
        for (const keys of [[], ["G"], ["g", "g"]]) {
          await s.keys(...keys);
          const t = s.text();
          s.expect(!UNSAFE.test(t.replace(/\n/g, "")), `${name}: a control or bidi character on screen`);
          const title = s.title();
          s.expect(
            title.startsWith("slipbox — ") && title.endsWith(name),
            `${name}: the title is still slipbox's (got ${JSON.stringify(title)})`,
          );
          s.expect(
            s.topBar().includes("slipbox") && t.includes("Explorer") && s.statusLine().includes(name),
            `${name}: the frame drawn whole`,
          );
        }
        // It still answers: j moves the cursor (from the top, once g g has taken it back there).
        await s.until(() => pos(s).line === top, undefined, `${name}: g g back to line ${top}, where it opened`);
        const at = pos(s).line;
        await moveTo(s, ["j"], (l) => l > at, `${name}: j to move after the escapes`);
      };
      await intact("terminal-escapes-in-logs.md");
      // A log with raw ANSI colours (a text file: its source).
      await s.restart({ startAt: "home/Downloads/app-2026-09-22.log" });
      await intact("app-2026-09-22.log");
      // JSON whose values hold \u001b, \u0007, \u0000 once parsed.
      await s.restart({ startAt: "home/Downloads/ticket-4711.json" });
      await intact("ticket-4711.json");
      // kestrel's fixture of every escape a markdown body can carry, and its flags file's values.
      await s.restart({ startAt: "home/work/kestrel/src/web/markdown/__fixtures__/escapes.md" });
      await intact("escapes.md");
      await edit(s, "config/feature-flags.json");
      await intact("feature-flags.json");
    },
  },

  {
    area: "reading",
    name: "width: wide characters line up — CJK, fullwidth, emoji, flags, combining, Thai, Devanagari, Arabic: tables' borders in one column; l steps a character",
    covers: { cases: ["width", "unicode", "tables"] },
    options: { home: true, startAt: "home/notes/research/unicode-in-route-names.md" },
    run: async (s) => {
      // Down the note a page at a time: every table seen lines up, and there are tables to see.
      let seen = 0;
      for (let i = 0; i < 6; i++) {
        seen += tablesAligned(s, `unicode-in-route-names.md, page ${i + 1}`);
        await s.keys("pagedown");
      }
      s.expect(seen >= 2, `tables with every width class checked (saw ${seen})`);
      // The Kyoto itinerary (Japanese cells, aligned columns) and an Arabic recipe's ingredients.
      await s.restart({ startAt: "home/hobbies/photography/trips/京都/itinerary.md" });
      await s.see("京都駅");
      s.expect(tablesAligned(s, "itinerary.md") >= 1, "the itinerary's table checked");
      await s.restart({ startAt: "home/hobbies/cooking/Recipes/Family/مقلوبة.md" });
      await s.see("Short-grain rice");
      s.expect(tablesAligned(s, "مقلوبة.md") >= 1, "the ingredients' table checked");
      // In Japanese prose, l moves one character at a time — two columns each (the status line's column counts
      // cells) — and the cursor's cell, drawn in its own colour, is that character.
      await s.restart({ startAt: "home/hobbies/photography/trips/京都/2026-08-24-伏見稲荷.md" });
      await line(s, 10);
      await moveTo(s, ["0"], (_, c) => c === 1, "0 to the line's start");
      await moveTo(s, ["l", "l", "l"], (_, c) => c === 7, "l three times: three wide characters on");
      const cursor = () => {
        const row = s.runs().find((r) =>
          r
            .map((x) => x.text)
            .join("")
            .includes("千本鳥居は"),
        );
        // The cursor's colour is the one run on its row no other run shares.
        const bgs = (row ?? []).map((r) => r.bg);
        return (row ?? []).find((r) => r.text.trim() && bgs.filter((b) => b === r.bg).length === 1)?.text ?? "";
      };
      await s.until(
        () => cursor() === "居",
        3000,
        `the cursor on 居, the fourth character (on ${JSON.stringify(cursor())})`,
      );
      await moveTo(s, ["h"], (_, c) => c === 5, "h one wide character back");
      await s.until(() => cursor() === "鳥", 3000, `the cursor on 鳥 (on ${JSON.stringify(cursor())})`);
    },
  },

  {
    area: "reading",
    name: "unicode: Japanese in source mode — w, b and e a character each, ciw the whole run, typed and saved",
    covers: { cases: ["unicode"], commands: ["view.source"] },
    options: { home: true, startAt: "home/hobbies/photography/trips/京都/2026-08-24-伏見稲荷.md" },
    run: async (s) => {
      await leader(s, "n", "v");
      await s.status("SOURCE");
      await line(s, 10);
      // 千本鳥居は、… — each character is a word for w, b and e: two columns a step.
      await moveTo(s, ["0"], (_, c) => c === 1, "0 to the line's start");
      await moveTo(s, ["w"], (_, c) => c === 3, "w to the next character");
      await moveTo(s, ["e"], (_, c) => c === 5, "e to the next character's end");
      await moveTo(s, ["b"], (_, c) => c === 3, "b back a character");
      // iw takes the whole run: 千本鳥居は, up to the comma, replaced by what's typed.
      await moveTo(s, ["0"], (_, c) => c === 1, "0 again");
      await s.keys("c", "i", "w");
      await s.status("INSERT");
      await s.type("鳥居の道");
      await s.keys("escape", "ctrl+s");
      await s.file(
        "~/hobbies/photography/trips/京都/2026-08-24-伏見稲荷.md",
        (t) => t.split("\n")[9]!.startsWith("鳥居の道、本当は千本もない。"),
        "ciw replaced the run, saved",
      );
      await s.see("鳥居の道、本当は千本もない。");
    },
  },

  {
    area: "reading",
    name: "odd files: /dev/zero by a symlink and an unreadable note refused, said; a symlink out of the root never opened; the vault's info says why each was left out",
    covers: { cases: ["text-files"], commands: ["note.open", "vault.info"] },
    options: { home: true, startAt: "home/notes/index.md" },
    run: async (s) => {
      // A note that is /dev/zero: not a file, so not opened (a read would never end).
      await ex(s, "e research/zero.md");
      await s.message('no note or file "research/zero.md"');
      await s.status("index.md");
      // An unreadable note: said, nothing opened.
      await ex(s, "e locked.md");
      await s.message("cannot read locked.md");
      await s.status("index.md");
      // Still answering.
      const at = pos(s).line;
      await moveTo(s, ["j"], (l) => l > at, "j after the odd files");
      // The vault's info says why each was left out of the walk.
      await leader(s, "v", "i");
      await s.see(/research\/zero\.md — symlink to something that isn't a file/);
      await s.see(/research\/outside\.md — link not followed: it leads out of the vault/);
      await s.keys("escape");
      // A symlink out of the vault: never read unasked, as the walk and the CLI (exit 5) leave it — opened, it asks.
      await ex(s, "e research/outside.md");
      await s.until(
        () => s.statusLine().includes("outside.md") || /Just look/.test(s.text()),
        3000,
        "outside.md opened or asked about",
      );
      s.expect(!s.statusLine().includes("outside.md"), "a symlink leading out of the vault isn't opened unasked");
      await s.keys("escape");
    },
  },

  {
    area: "reading",
    name: "odd files: a symlinked note edited and saved — written through to its target, still a symlink",
    covers: { cases: ["text-files"], commands: ["view.source", "note.save"] },
    options: { home: true, startAt: "home/notes/projects/kestrel-current.md" },
    run: async (s) => {
      await leader(s, "n", "v");
      await s.status("SOURCE");
      await s.keys("G", "o");
      await s.status("INSERT");
      await s.type("Checked through the symlink.");
      await s.keys("escape", "ctrl+s");
      await s.file(
        "~/notes/projects/kestrel-v2-3.md",
        (t) => t.includes("Checked through the symlink."),
        "the edit in the symlink's target",
      );
      const link = s.path("~/notes/projects/kestrel-current.md");
      s.expect(
        lstatSync(link).isSymbolicLink() && readlinkSync(link) === "kestrel-v2-3.md",
        "kestrel-current.md still a symlink to kestrel-v2-3.md",
      );
    },
  },

  {
    area: "reading",
    name: "line endings: a BOM before the frontmatter, CRLF and lone CRs drawn without stray cells; a save keeps the BOM and every CRLF",
    covers: { cases: ["encoding", "frontmatter"], commands: ["view.source", "note.save"] },
    options: { home: true, startAt: "home/notes/daily/2026-09-16.md" },
    run: async (s) => {
      // A BOM before the frontmatter: the properties still read, nothing drawn for the BOM.
      await s.see(/date\s+2026-09-16/);
      s.expect(!s.text().includes("\uFEFF"), "no BOM drawn");
      await leader(s, "n", "v");
      await s.status("SOURCE");
      await s.keys("G", "o");
      await s.type("BOM kept.");
      await s.keys("escape", "ctrl+s");
      await s.file("~/notes/daily/2026-09-16.md", (t) => t.includes("BOM kept."), "the edit saved");
      s.expect(s.read("~/notes/daily/2026-09-16.md").startsWith("\uFEFF---"), "the BOM kept by the save");
      await leader(s, "n", "v");
      // CRLF: a CR never reaches the terminal (it would send the cursor to the row's start and write over the
      // explorer); a save keeps every line's CRLF.
      await edit(s, "daily/2026-09-15.md");
      await s.see("Tuesday 15 September");
      const row = s.screen()[s.rowOf("Written on the Windows laptop")] ?? "";
      s.expect(
        row.indexOf("│") >= 0 && row.indexOf("│") < row.indexOf("Written"),
        "the CRLF note's row drawn in its place, the explorer beside it",
      );
      s.expect(Bun.stringWidth(row) <= s.cols, "the CRLF note's row no wider than the terminal");
      await leader(s, "n", "v");
      await s.status("SOURCE");
      await s.keys("G", "o");
      await s.type("CRLF kept.");
      await s.keys("escape", "ctrl+s");
      await s.file("~/notes/daily/2026-09-15.md", (t) => t.includes("CRLF kept."), "the CRLF note's edit saved");
      const crlf = s.read("~/notes/daily/2026-09-15.md");
      s.expect(
        crlf.split("\n").length > 10 &&
          crlf
            .split("\n")
            .slice(0, -1)
            .every((l) => l.endsWith("\r")),
        "every line still ends in CRLF",
      );
      // Lone CRs (an old Mac's): lines, never one long line.
      await s.restart({ startAt: "home/Downloads/lone-cr.md" });
      await s.see("Old Mac notes");
      const pan = s.rowOf("panniers");
      const tube = s.rowOf("spare tube");
      s.expect(
        pan >= 0 && tube > pan && s.rowOf("Saved by the editor") > s.rowOf("Old Mac notes"),
        "each CR-ended line a row of its own",
      );
    },
  },
];
