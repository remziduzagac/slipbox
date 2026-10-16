// Reading: rendering, content, data files, footnotes, hostile names, the code view, themes, glyphs, pictures (by
// what's sent), start, info, privacy, trust (TT-T3).

import { cpSync, existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { UNSAFE } from "../../../src/core/sanitize.ts";
import { loadTheme } from "../../../src/core/theme/index.ts";
import {
  type Check,
  downloadsElsewhere,
  type LeftOut,
  leader,
  moveTo,
  open,
  opened,
  pos,
  SCRATCH_FLOATING,
  signed,
  TOML,
  TSC,
} from "../check.ts";
import type { Session, StyledRun } from "../session.ts";

const KESTREL = "home/work/kestrel/README.md";
const INFRA = "home/work/infra/README.md";

/**
 * A command line at `:`, typed and seen before enter: in a root the size of a repository the palette lists its files
 * for `:e` first, and an enter sent before it has the text is lost.
 */
async function ex(s: Session, command: string): Promise<void> {
  await s.keys(":");
  await s.type(command);
  await s.see(`› ${command}`);
  await s.keys("enter");
}

/** Open a file by its path in the root (`:e`), and wait for the status line to name it. */
async function edit(s: Session, rel: string): Promise<void> {
  await ex(s, `e ${rel}`);
  await s.status(rel.split("/").at(-1)!, 5000);
}

/** The breadcrumb's row (`§ …`): the window's first. */
const crumb = (s: Session) => s.screen().find((r) => r.includes("§ ")) ?? "";

/** Go to a line with :N, waiting for the status line to say so. */
async function line(s: Session, n: number): Promise<void> {
  await ex(s, String(n));
  await s.until(() => pos(s).line === n, 3000, `line ${n}`);
}

/**
 * The heading picker on the file's outline (`Headings — name`): asked again until the grammar, loaded lazily, has given
 * the file one — until then there's nothing to pick ("no headings").
 */
async function outlinePicker(s: Session, name: string): Promise<void> {
  const title = `Headings — ${name}`;
  for (let i = 0; i < 20 && s.rowOf(title) < 0; i++) {
    await leader(s, "f", "o");
    await s.until(() => s.rowOf(title) >= 0 || s.rowOf("no headings") >= 0, 3000, "the picker, or no headings yet");
    if (s.rowOf(title) < 0) await s.notSee("no headings", 6000); // the message gone, asked again
  }
  await s.see(title);
}

/** A row's graphemes with the display column each starts at — by Bun's width, not slipbox's. */
function columns(row: string): { g: string; col: number }[] {
  const out: { g: string; col: number }[] = [];
  let col = 0;
  for (const { segment } of new Intl.Segmenter().segment(row)) {
    out.push({ g: segment, col });
    col += Bun.stringWidth(segment);
  }
  return out;
}

/**
 * Every table on screen lines up: each row from a table's `┌` to its `└` has a border at the column the top row's `┐`
 * is at, and no row is wider than the terminal. A character slipbox measured otherwise than the terminal shifts the
 * rest of its row, and its border with it.
 *
 * Except a row with a spacing mark (\p{Mc}: Devanagari's ि ा ी). slipbox counts as OpenTUI does (a unit test holds
 * the two together); terminals differ on such a mark, and this check measures the screen with Bun's widths, as
 * OpenTUI's: between the terminal and OpenTUI, past what slipbox can say.
 */
function tablesAligned(s: Session, where: string): number {
  const rows = s.screen();
  let tables = 0;
  for (const [i, r] of rows.entries()) {
    s.expect(
      Bun.stringWidth(r) <= s.cols,
      `${where}: row ${i} is wider than the terminal (${Bun.stringWidth(r)} > ${s.cols})`,
    );
    const cells = columns(r);
    const top = cells.findIndex((c) => c.g === "┌");
    if (top < 0 || cells[top + 1]?.g !== "─") continue;
    const right = cells.slice(top).find((c) => c.g === "┐");
    if (!right) continue;
    const left = cells[top]!.col;
    for (let j = i + 1; j < rows.length; j++) {
      const at = columns(rows[j]!);
      const edge = at.find((c) => c.col === left);
      if (!edge || !"│├╞└┃".includes(edge.g)) break; // the table ends (or scrolls) off screen
      if (/\p{Mc}/u.test(rows[j]!)) continue;
      const border = at.find((c) => c.col === right.col);
      s.expect(
        !!border && "│┤╡┘┃".includes(border.g),
        `${where}: row ${j}'s right border isn't at column ${right.col}\n${rows[j]}`,
      );
      if (edge.g === "└") break;
    }
    tables++;
  }
  return tables;
}

/**
 * Follow the link whose text shows `text`: found (the cursor landed, on a link the status line names where it does),
 * the find row closed, enter — each seen before the next key: a grammar landing meanwhile lays the file out again.
 */
async function followLink(s: Session, text: string): Promise<void> {
  const before = s.statusLine().match(/L\d+:\d+/)?.[0];
  await s.keys("/");
  await s.type(text);
  await s.keys("enter");
  await s.until(
    () => /→ /.test(s.statusLine()) || s.statusLine().match(/L\d+:\d+/)?.[0] !== before,
    3000,
    `find to land on ${text}`,
  );
  await s.keys("escape");
  await s.notSee(`› ${text}`);
  await s.keys("enter");
}

/**
 * The style `text` is drawn in on the first row holding `on` too (a heading's mark and its text: not the breadcrumb's
 * copy of it) — past the row's first cell, where the cursor may be.
 */
function styleOn(s: Session, on: string, text: string): StyledRun | null {
  const row = s.rowOf(on);
  if (row < 0) return null;
  const runs = s.runs()[row]!;
  const at = runs
    .map((r) => r.text)
    .join("")
    .indexOf(text, s.screen()[row]!.indexOf(on) + 1);
  let n = 0;
  for (const r of runs) {
    if (at >= 0 && at < n + r.text.length) return r;
    n += r.text.length;
  }
  return null;
}

/** The newest message holding `needle`, whole (the list cuts it, its box wraps it): the list filtered, enter copies it. */
async function lastMessage(s: Session, needle: string): Promise<string> {
  await leader(s, "m");
  await s.see("Messages");
  await s.type(needle);
  await s.keys("enter");
  await s.notSee("Messages");
  return s.clipboard();
}

/** Nothing of a control or bidi character on screen, nor the text of an OSC that would have set the title. */
function clean(s: Session, where: string): void {
  const t = s.text();
  s.expect(!UNSAFE.test(t.replace(/\n/g, "")), `${where}: a control or bidi character on screen`);
  s.expect(!t.includes("PWNED"), `${where}: an OSC's text on screen`);
}

export const READING: Check[] = [
  // --- start --------------------------------------------------------------------------------------
  {
    area: "reading",
    name: "start: the demo vault's home renders; ctrl+q quits cleanly",
    covers: { cases: ["opening"], commands: ["app.quit"] },
    run: async (s) => {
      await s.see("Halden Ridge Observatory");
      await s.status("home.md");
      await s.status(/READ/);
      await s.keys("ctrl+q");
      await s.until(() => s.exited(), 5000, "slipbox to quit");
      s.expect(s.exitCode() === 0, `exit 0, not ${s.exitCode()}`);
    },
  },

  // --- markdown as the terminal draws it ----------------------------------------------------------
  {
    area: "reading",
    name: "tables: a wide table fits the window, every row closed by its right border",
    covers: { cases: ["tables"] },
    run: async (s) => {
      await open(s, "telescope-comparison");
      await s.see("┌");
      await s.see("╞");
      // Every table row closes with its right border: nothing ran past the window and got cut.
      const table = s.screen().filter((r) => r.includes("│ ") && (r.match(/│/g) ?? []).length >= 3);
      s.expect(
        table.length > 0 && table.every((r) => /│\s*(▐|$)/.test(r.trimEnd())),
        "a table row without its right border",
      );
      s.expect(tablesAligned(s, "telescope-comparison.md") >= 2, "its tables lined up");
    },
  },
  {
    area: "reading",
    name: "code blocks and properties: the frontmatter drawn as properties, a fence labelled with its language",
    covers: { cases: ["code", "frontmatter"] },
    run: async (s) => {
      await open(s, "pipeline-cookbook");
      await s.see(/≡ properties/); // the frontmatter, rendered
      await s.see(/title\s+halley and nightjar cookbook/);
      s.expect(s.rowOf(/^.*│\s+\d+\s+---\s*$/) < 0, "no frontmatter fence drawn as text");
      await s.see(/bash|python/);
    },
  },
  {
    area: "reading",
    name: "code blocks: a tree too wide scrolls sideways on its own — find, $ and 0, a sideways wheel, shift and the wheel; the UI settings wrap it instead",
    covers: { cases: ["code"], commands: ["ui.code_wrap"] },
    options: { home: true, startAt: "home/notes/projects/sync-rewrite.md", size: { cols: 100, rows: 34 } },
    run: async (s) => {
      const START = "├── config/app.toml";
      const END = "park_on_conflict";
      await s.status("sync-rewrite.md");
      // Found past the block's right edge: the block scrolls to it, the window doesn't.
      await s.keys("/");
      await s.type(END);
      await s.keys("enter", "escape");
      await s.see(END);
      await s.notSee(START);
      await s.see("Where Bramble lives"); // the paragraph above it, where it was
      // 0: the line's start, the block back; each line of it on one row, › where more is to the right.
      await s.keys("0");
      await s.see(START);
      await s.notSee(END);
      const row = s.rowOf(START);
      s.expect(/›/.test(s.screen()[row]!), `a › at the block's edge\n${s.screen()[row]}`);
      s.expect(s.rowOf("├── src/sync/retry.ts") === row - 2, "the tree's lines a row each, none wrapped");
      // $: its end.
      await s.keys("$");
      await s.see(END);
      await s.keys("0");
      await s.see(START);
      // The wheel over it, sideways (SGR's 67, right) and shift with it (68, shift and up): the block moves.
      const x = Bun.stringWidth(s.screen()[row]!.slice(0, s.screen()[row]!.indexOf("config"))) + 1;
      for (let i = 0; i < 12; i++) await s.send(`\x1b[<67;${x};${row + 1}M`);
      await s.see(END);
      await s.notSee(START);
      for (let i = 0; i < 12; i++) await s.send(`\x1b[<68;${x};${row + 1}M`);
      await s.see(START);
      await s.notSee(END);
      // Wrapping instead, from the UI settings: the line's rest on the next row, marked ↪.
      await leader(s, "u", "u");
      await s.see("UI settings");
      await s.type("Code blocks");
      await s.keys("enter");
      await s.message("Code blocks: wrap");
      await s.see(/↪/);
      const at = s.rowOf(START);
      s.expect(at >= 0 && /↪/.test(s.screen()[at + 1] ?? ""), `the line's rest on the next row\n${s.dump()}`);
    },
  },
  {
    area: "reading",
    name: "width: names in their own scripts — Japanese, Arabic, an emoji — in a table below the embeds",
    covers: { cases: ["width"] },
    run: async (s) => {
      await open(s, "partners-and-names");
      await s.see("following it offers to make it"); // visiting-rota.md exists nowhere: a note not written yet
      // Its table of scripts, below the notes it embeds (1.11).
      await s.ex("74");
      await s.see("木曽原天文同好会");
      await s.see("يوسف حداد");
      await s.see("🔭");
      tablesAligned(s, "partners-and-names.md at line 74");
    },
  },
  {
    area: "reading",
    name: "embeds: a whole note and a heading's section drawn in place; a link in one followed from where it is",
    covers: { cases: ["embeds"], commands: ["link.follow"] },
    run: async (s) => {
      await open(s, "partners-and-names");
      await s.see("⧉ wrap-probe");
      await s.see("Table A — ordinary prose, no long tokens."); // wrap-probe's text, embedded
      await s.see(/⧉ kenji-mori › Kenji Mori/);
      await s.see("Visiting astronomer from the Kiso-Hara"); // kenji-mori's section, embedded
      await s.see(/▎ .*Kenji Mori/);
      // Kenji's `../equipment/telescope-comparison.md#…`, from people/: it opens where his note means.
      await followLink(s, "telescope-comparison › Fleet");
      await opened(s, "equipment/telescope-comparison.md");
      await s.see("Fleet at a glance");
    },
  },
  {
    area: "reading",
    name: "footnotes: space n f opens the right panel's second view, its button under ▤; enter jumps to a reference; space n shift+f adds one; :footnotes toggles",
    covers: { cases: ["footnotes"], commands: ["footnotes.cycle", "footnote.add", "footnotes.toggle"] },
    run: async (s) => {
      await open(s, "partners-and-names");
      await leader(s, "n", "f");
      await s.status("FOOTNOTES");
      await s.see("Footnotes");
      await s.see(/\[1\] Counted at the/);
      await s.see(/\[charter\]/);
      await s.until(
        () => s.screen().some((r) => /▤\s*$/.test(r)) && s.screen().some((r) => /(\u{f0283}|¹|\^)\s*$/u.test(r)),
        3000,
        "the rail's ▤ and the footnotes' button under it",
      );
      await s.keys("l");
      await s.see("L95");
      await s.keys("j", "enter");
      await s.status("→ 1 (resolved)");
      // Adding one (3.18): its text asked; [^2] after the cursor's word, its definition at the end.
      await leader(s, "n", "shift+f");
      await s.see("Add a footnote — its text:");
      await s.type("Checked against the ledger");
      await s.keys("enter");
      await s.message("added footnote [^2]");
      await s.file(
        "people/partners-and-names.md",
        (t) => t.includes("[^2]: Checked against the ledger\n"),
        "the definition at the end",
      );
      await s.see(/\[2\] C/); // the row, beside the message floating over the panel
      // Back to the outline with space o: the panel's other view; :footnotes toggles them back.
      await leader(s, "o");
      await s.status("OUTLINE");
      await s.ex("footnotes");
      await s.status("FOOTNOTES");
    },
  },

  // --- notes that are big, hostile or odd ---------------------------------------------------------
  {
    area: "reading",
    name: "hostile names: a bidi override, C1, ESC and an OSC in file names never reach the terminal",
    covers: { cases: ["hostile"], commands: ["backlinks.open"] },
    // Downloads beside home, a folder outside every vault: its notes walked and indexed together (VV-D2).
    options: { home: true, startAt: "elsewhere/stray-note.md", setup: downloadsElsewhere },
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
      await s.see(/research\/outside\.md — symlink points outside the vault/);
      await s.keys("escape");
      // A symlink out of the root: never read, as the walk and the CLI (exit 5) refuse it.
      await ex(s, "e research/outside.md");
      await s.until(
        () => s.statusLine().includes("outside.md") || /outside the vault|no note or file/.test(s.text()),
        3000,
        "outside.md opened or refused",
      );
      s.expect(!s.statusLine().includes("outside.md"), "a symlink leading out of the root isn't opened");
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

  // --- data files (16.x) --------------------------------------------------------------------------
  {
    area: "reading",
    name: "data: TOML — keys lined up, a comment after its value, records as a table; a value's path followed and back",
    covers: { cases: ["toml", "data"], commands: ["link.follow", "history.back"] },
    options: { open: TOML },
    run: async (s) => {
      await s.see(/workers\s+3\s+# halved from 6/); // keys lined up, the comment after the value
      await s.see("QHY600M"); // [[telescope]] records as a table
      await s.status(/READ/);
      // A value that is a path is a link: find it, follow it, come back.
      await followLink(s, "pipeline-cookbook");
      await s.status("pipeline-cookbook.md");
      await s.keys("ctrl+o");
      await s.status("halley.toml");
    },
  },
  {
    area: "reading",
    name: "data: the lens edits one key of a TOML file on its own line; space n v shows the source",
    covers: { cases: ["data-modes"], commands: ["view.live", "view.source", "note.save"] },
    options: { open: TOML },
    run: async (s) => {
      await s.see("bias_frames");
      await s.keys("/");
      await s.type("bias_frames");
      await s.keys("enter", "escape");
      await leader(s, "n", "l");
      await s.status("LENS");
      await s.keys("A");
      await s.status("INSERT");
      await s.type("0");
      await s.keys("escape", "escape", "ctrl+s");
      await s.file(TOML, (t) => t.includes("bias_frames = 210"), "the lens edit saved");
      await leader(s, "n", "v");
      await s.status("SOURCE");
      await s.see("bias_frames = 210");
    },
  },
  {
    area: "reading",
    name: "data: CSV as a table — a quoted field with doubled quotes; past 2,000 rows counted, source mode has every line",
    covers: { cases: ["csv"], commands: ["view.source"] },
    run: async (s) => {
      await open(s, "filters.csv");
      await s.see(/│ filter\s+│ telescope/);
      await s.see('"Aster pointing model"'); // a quoted field with "" in it
      // A big CSV: the first 2,000 rows drawn, the rest counted, all of them in source mode.
      await open(s, "photometry-2026.csv");
      await s.see(/│ date\s+│ utc/);
      await s.keys("G");
      await s.see("… 600 more rows");
      await leader(s, "n", "v");
      await s.status("SOURCE");
      await moveTo(s, ["G"], (l) => l === 2601, "G to the CSV's last line in source mode");
    },
  },
  {
    area: "reading",
    name: "data: YAML — records as a table; nested maps a tree with guides at every depth, the breadcrumb following",
    covers: { cases: ["yaml"] },
    run: async (s) => {
      await open(s, "targets.yaml");
      await s.see(/│ SS Cyg\s+│ dwarf nova/);
      await open(s, "deploy.yaml");
      await s.see(/├─ 1\s*$/m);
      await s.see(/│  ├─ env/);
      await s.see(/│  │  ├─ ARCHIVE_ROOT\s+\/srv\/stacks/);
      await s.keys("/");
      await s.type("*probe"); // the api's health probe, line 22 (22G would count rows, not lines)
      await moveTo(s, ["enter", "escape"], (l) => l === 22, "find onto the api's health probe");
      await s.see(/containers\s*›\s*1\s*›\s*health/);
    },
  },
  {
    area: "reading",
    name: "data: JSON — a $ref's pointer followed to the row it names; INI keys lined up, a comment after its value",
    covers: { cases: ["json", "ini"], commands: ["link.follow"] },
    run: async (s) => {
      await open(s, "openapi.json");
      await followLink(s, "#/components/schemas/Frame");
      await s.until(() => /L5\d:/.test(s.statusLine()), 3000, "the cursor on the Frame schema's row (line 5x)");
      await open(s, "logging.ini");
      await s.see(/level\s+INFO\s+# DEBUG floods the disk/);
    },
  },
  {
    area: "reading",
    name: "data: a file that doesn't parse opens in source mode, said why — JSON and TOML alike",
    covers: { cases: ["data-modes", "toml", "json"] },
    options: { home: true, startAt: INFRA },
    run: async (s) => {
      await edit(s, "config/broken/unclosed-string.toml");
      await s.status("SOURCE");
      await s.message(/doesn't parse/);
      await s.restart({ startAt: "vault/home.md" });
      await open(s, "broken-config.json");
      await s.status("SOURCE");
      await s.message(/doesn't parse/);
      await s.see('"telescopes": ["Aster", "Brill"');
    },
  },
  {
    area: "reading",
    name: "data: Java's .properties — ! comments are comments, a value continued after a backslash one value; multi-document YAML a row each",
    covers: { cases: ["ini", "yaml", "samples-existing"] },
    options: { home: true, startAt: INFRA },
    run: async (s) => {
      await edit(s, "config/legacy-archive.properties");
      await s.status(/READ/);
      s.expect(!s.text().includes("doesn't parse"), "no parse error said");
      await s.see(/archive\.target\.bucket\s+kestrel-archive-eu\s+# Where the archive goes/);
      await s.see(
        /archive\.sources\s+\/var\/lib\/kestrel\/routes, \/var\/lib\/kestrel\/gpx-uploads, \/var\/lib\/kestrel\/offline-bundles, \/var\/lib\/kestrel\/exports/,
      );
      await edit(s, "k8s/api.yaml");
      await s.status(/READ/);
      await s.see(/document 1/);
      await s.see(/document 2/);
    },
  },
  {
    area: "reading",
    name: "data: an .env — export prefixes dropped, a quoted value unquoted, its comment after it",
    covers: { cases: ["ini", "classify"] },
    options: { home: true, startAt: INFRA },
    run: async (s) => {
      await edit(s, "config/prod.env");
      await s.status(/READ/);
      s.expect(!s.text().includes("doesn't parse"), "no parse error said");
      await s.see(/NODE_ENV\s+production/);
      await s.see(/TILE_ATTRIBUTION\s+\(c\) OpenStreetMap contributors/);
      await s.see(/SYNC_ENDPOINT\s+https:\/\/sync\.kestrel\.dev\/v2\s+# the worker/);
    },
  },
  {
    area: "reading",
    name: "data: JSON with comments and trailing commas renders; a 3,000-line lock file's end at once; 290 KB on one line a tree to its last entry",
    covers: { cases: ["json"] },
    options: { home: true, startAt: KESTREL },
    run: async (s) => {
      // kestrel's tsconfig.json has comments and trailing commas, as editors allow: it renders.
      await edit(s, "tsconfig.json");
      await s.status(/READ/);
      s.expect(!s.text().includes("doesn't parse"), "no parse error said");
      await s.see(/target\s+ES2022/);
      await s.see(/strict\s+true/);
      // A 3,248-line lock file: G at its end at once.
      await edit(s, "package-lock.json");
      await s.status(/READ/);
      await moveTo(s, ["G"], (l) => l > 3200, "G to the lock file's end");
      // A 290 KB JSON on one line (Downloads, a plain folder): a tree, its last route reached.
      await s.restart({ startAt: "home/Downloads/routes-export.min.json" });
      await s.status(/READ/);
      await s.see(/routes/);
      await s.keys("G");
      await s.see("Route 399 via the ridge road", 5000);
    },
  },

  // --- code (16.6–16.10) --------------------------------------------------------------------------
  {
    area: "reading",
    name: "code: Python's outline from its grammar, the breadcrumb inside a method; a comment's path:line followed and back",
    covers: { cases: ["code-py", "code-files"], commands: ["outline.pick", "link.follow", "history.back"] },
    // Source mode's: code opens in the code view by default, which checks of their own cover.
    options: { open: "software/halley/reduce.py", config: '[render]\ncode = "source"\n' },
    run: async (s) => {
      await s.status("SOURCE");
      await s.see("class Night:");
      // The outline is the file's definitions, nested; the picker lists each with its line beside it.
      await outlinePicker(s, "reduce.py");
      await s.see(/is_calibration\s+\d+/);
      await s.see("science");
      await s.keys("escape");
      await moveTo(s, ["4", "1", "G"], (l) => l === 41, "41G into Night.reduce");
      await s.see(/Night\s*›\s*reduce/); // the breadcrumb
      // A comment's `halley.toml:10`: enter opens the file at that line.
      await followLink(s, "halley.toml:10");
      await s.status("halley.toml");
      await s.keys("ctrl+o");
      await s.status("reduce.py");
    },
  },
  {
    area: "reading",
    name: "code: TypeScript's breadcrumb from its grammar; a comment's relative path followed",
    covers: { cases: ["code-ts"], commands: ["link.follow"] },
    options: { open: "software/nightjar/src/server.ts", config: '[render]\ncode = "source"\n' },
    run: async (s) => {
      await s.status("server.ts");
      await s.ex("40");
      await s.until(() => /FrameArchive\s*›\s*byNight/.test(s.text()), 5000, "the breadcrumb in FrameArchive.byNight");
      await followLink(s, "../openapi.json");
      await s.status("openapi.json");
    },
  },
  {
    area: "reading",
    name: "code: a syntax error counted on the status line, hidden while typing, back after",
    covers: { cases: ["code-py"], commands: ["note.open"] },
    options: { config: '[render]\ncode = "source"\n' },
    run: async (s) => {
      await s.ex("e scratch/half-written.py"); // code isn't in ctrl+p by default (files.show)
      await s.status("half-written.py");
      await s.status(signed("{error}"), 5000);
      await s.keys("G", "o");
      await s.status("INSERT");
      await s.until(() => !signed("{error}").test(s.statusLine()), 3000, "no error marks while typing");
      await s.keys("escape");
      await s.status(signed("{error}"), 5000);
    },
  },
  {
    area: "reading",
    name: "code: Go, Rust, Lua, shell, JavaScript and TSX — each outline from its grammar, the breadcrumb two levels in",
    covers: {
      cases: ["code-go", "code-rs", "code-lua", "code-sh", "code-js", "code-ts", "code-files"],
      commands: ["outline.pick", "note.open"],
    },
    options: { home: true, startAt: KESTREL },
    run: async (s) => {
      // Each file's outline from its grammar (loaded lazily, then drawn again): the heading picker lists a definition
      // with its line — a row the file's own text never has — and inside a nested definition the breadcrumb names
      // both levels.
      const files: [string, string, number, RegExp, number][] = [
        ["tools/uploader/main.go", "Map", 37, /§ .*Start/, 30],
        ["crates/route-engine/src/lib.rs", "heuristic", 94, /impl Point\s*›\s*new/, 45],
        ["scripts/dev/kestrel.lua", "Route:distance", 33, /Route:describe\s*›\s*pad/, 29],
        ["scripts/lib.sh", "tail_log", 30, /version_of\s*›\s*inner/, 16],
        ["src/legacy/app.js", "compare", 35, /Route\s*›\s*constructor/, 27],
        ["src/App.tsx", "useRoutes", 11, /§ .*useRoutes/, 12],
      ];
      for (const [rel, symbol, defLine, crumbs, at] of files) {
        await edit(s, rel);
        await outlinePicker(s, rel.split("/").at(-1)!);
        await s.see(new RegExp(`${symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+${defLine}\\s*│`));
        await s.keys("escape");
        await line(s, at);
        await s.until(() => crumbs.test(crumb(s)), 5000, `${rel}'s breadcrumb at line ${at}: ${crumbs}`);
      }
    },
  },
  {
    area: "reading",
    name: "code: syntax errors in TypeScript and Go counted on the status line, no server",
    covers: { cases: ["code-ts", "code-go"], commands: ["note.open"] },
    options: { home: true, startAt: KESTREL },
    run: async (s) => {
      // A TypeScript file left by a bad rebase: its errors counted on the status line.
      await edit(s, "src/sync/stray-token.ts");
      await s.status(signed("{error} ?\\d"), 5000);
      // And a Go file's: another grammar's errors, the same way.
      await edit(s, "tools/uploader/broken.go");
      await s.status(signed("{error} ?\\d"), 5000);
    },
  },
  {
    area: "reading",
    name: "code: a 4,000-line TypeScript file — its outline found, G at its end, keys answered at once",
    covers: { cases: ["code-ts", "large"], commands: ["outline.pick"] },
    options: { home: true, startAt: KESTREL },
    run: async (s) => {
      await edit(s, "src/generated/routes-big.ts");
      // Its outline: a class near its end, found by the grammar on a file this size.
      await outlinePicker(s, "routes-big.ts");
      await s.type("RouteTable19");
      await s.see(/RouteTable19\s+4091\s*│/);
      // Picked: the cursor at its line.
      await moveTo(s, ["enter"], (l) => l === 4091, "enter on RouteTable19 to its line");
      await moveTo(s, ["G"], (l) => l >= 4300, "G to the end of 4,304 lines");
      // Keys answer at once there: each move lands within the usual wait, not after a re-parse.
      const end = pos(s).line;
      await moveTo(s, ["k", "k", "k"], (l) => l < end, "k three times");
      await moveTo(s, ["g", "g"], (l) => l === 1, "gg back to the top");
      // The code view reads no counts (normal mode's are source mode's and the lens's): :4000.
      await line(s, 4000);
      await s.until(() => /RouteTable18/.test(crumb(s)), 5000, "the breadcrumb in RouteTable18 at line 4000");
    },
  },
  {
    area: "reading",
    name: "code view: a comment's prose drawn as text, its path a link enter follows",
    covers: { cases: ["code-ts", "code-files"], commands: ["link.follow"] },
    options: { home: true, startAt: "home/work/kestrel/src/sync/queue.ts" },
    run: async (s) => {
      // The code view (READ, not SOURCE): the first comment is prose, its `../../docs/sync.md` a link enter follows.
      await s.status(/READ/);
      await opened(s, "src/sync/queue.ts");
      await followLink(s, "../../docs/sync.md");
      await opened(s, "docs/sync.md");
      await s.status(/ kestrel[ ·]/);
    },
  },
  {
    area: "reading",
    name: "code view: a syntax error slipbox finds itself, no server — counted, and on its cell's header alone",
    covers: { cases: ["code-ts", "unicode"] },
    options: { home: true, startAt: "home/work/kestrel/src/routes/name.ts" },
    run: async (s) => {
      await s.status(/READ/);
      await s.status(signed("{error} 1"), 8000);
      // Its sign among the cell header's buttons (a count beside it only from two); the other cell's header has none.
      await s.until(
        () => s.screen().some((r) => r.includes("function: badge") && signed("{error}").test(r)),
        5000,
        "the badge function's cell header with the error's sign",
      );
      const fine = s.screen().find((r) => r.includes("function: normalise")) ?? "";
      s.expect(
        !!fine && !signed("{error}|{warning}").test(fine),
        `the normalise cell's header with no problem's sign: ${fine}`,
      );
    },
  },
  {
    area: "reading",
    name: "obsidian: a ==highlight== drawn in its own colour, %%comments%% hidden while reading; both as typed in source mode",
    covers: { cases: ["inline", "notes"], commands: ["view.source"] },
    options: { home: true, startAt: "home/hobbies/cooking/Pantry.md" },
    run: async (s) => {
      await s.see("the good olive oil.");
      await s.notSee("Cretan tin");
      await s.notSee("==bold yellow==");
      await s.see("1 cup == 2 cups of water"); // a lone == pair with spaces is text
      const [marked, plain] = [s.styleOf("bold yellow"), s.styleOf("Running low")];
      s.expect(
        !!marked && !!plain && (marked.bg !== plain.bg || marked.fg !== plain.fg),
        `the highlight drawn apart: ${JSON.stringify([marked, plain])}`,
      );
      await leader(s, "n", "v");
      await s.status("SOURCE");
      await s.see("%%the Cretan tin, not the bottle%%");
      await s.see("==bold yellow==");
      // A comment over blank lines, a list in it: gone while reading, the text around it kept.
      await s.restart({ startAt: "home/hobbies/cooking/Recipes/Family/Grandma's flan.md" });
      await s.see("never wrote it down");
      await s.notSee("Check the amounts with Mum");
      await s.notSee("and on birthdays");
      await s.notSee("Still to ask Mum");
      await s.notSee("goat's milk");
    },
  },

  // --- info, properties, the vault's own windows (3.19, 3.20) -------------------------------------
  {
    area: "reading",
    name: "info: the Info view — the file's root, properties, backlinks and tags; toggled from the palette",
    covers: { cases: ["info"], commands: ["note.info", "info.toggle"] },
    run: async (s) => {
      // The Info view (3.19): the file on screen, in the right panel — its vault, properties, links.
      await open(s, "kenji-mori");
      await leader(s, "n", "i");
      await s.status("INFO");
      await s.see(/vault +halden/);
      await s.see("Properties");
      await s.see(/building +Workshop/);
      await s.see(/backlinks +\d+/);
      // A tag's row: its notes.
      await s.keys("shift+g");
      await s.until(() => s.text().includes("#people") && s.text().includes("#visiting"), 3000, "its tags, both");
      // Its toggle, from the palette: hidden, then shown again.
      await s.keys("escape");
      await s.keys(":");
      await s.type("Show or hide the Info");
      await s.keys("enter");
      await s.until(() => !/\bINFO\b/.test(s.text()), 3000, "the Info hidden");
      await s.keys(":");
      await s.type("Show or hide the Info");
      await s.keys("enter");
      await s.see("Properties");
    },
  },
  {
    area: "reading",
    name: "properties: space n shift+p edits the frontmatter's YAML in a floating editor, written back, the Info view updated",
    covers: { cases: ["properties", "yaml-frontmatter"], commands: ["note.properties", "note.info"] },
    run: async (s) => {
      await open(s, "kenji-mori");
      await leader(s, "n", "shift+p");
      await s.see("Properties — people/kenji-mori.md (YAML)");
      await s.keys("shift+g", "o");
      await s.type("status: visiting");
      await s.keys("escape", "escape");
      await s.message("properties written");
      await s.file(
        "people/kenji-mori.md",
        (t) => t.includes("status: visiting\n---"),
        "the property in the frontmatter",
      );
      await leader(s, "n", "i");
      await s.see(/status +visiting/);
    },
  },
  {
    area: "reading",
    name: "info: the vault's info in its own window; reindex said; the config reloaded; messages; help",
    covers: {
      cases: ["info"],
      commands: ["vault.info", "vault.reindex", "config.reload", "messages.open", "help.open"],
    },
    run: async (s) => {
      await leader(s, "v", "i");
      await s.see(s.vault);
      await s.keys("escape");
      await leader(s, "v", "r");
      await s.message(/reindexed \d+ notes/);
      await leader(s, "v", "c");
      await leader(s, "m");
      await s.see("Messages");
      await s.see(/reindexed \d+ notes/);
      await s.keys("escape");
      await s.keys("?");
      await s.see("Keys — type to filter");
      await s.keys("escape");
    },
  },

  // --- trust and privacy (23.x, DF-D1, DF-D23) ----------------------------------------------------
  {
    area: "reading",
    name: "trust: a project whose own code its tools would run — asked once; y kept across a start; :untrust takes it back (23.x)",
    covers: { cases: ["code-ts"], commands: ["root.untrust"] },
    options: {
      home: true,
      startAt: "home/work/kestrel/src/sync/queue.ts",
      config: "[lsp]\nenabled = true\nauto_install = false\n",
    },
    run: async (s) => {
      // kestrel's ESLint config is code, and it has a .vscode/settings.json: what an untrusted root leaves out.
      const answers = () => readFileSync(join(s.dir, "state", "slipbox", "trust.json"), "utf8");
      const root = realpathSync(s.path("~/work/kestrel"));
      await s.see(/Trust ~\/work\/kestrel\?/, 15000); // the root opened
      await s.see(/eslint not run/);
      await s.keys("y");
      await s.message(/trusted ~\/work\/kestrel:/);
      s.expect(JSON.parse(answers()).trusted.includes(root), `trusted, kept: ${answers()}`);
      // Started again on it: not asked again.
      await s.restart();
      await s.status("queue.ts");
      await s.ex("untrust");
      await s.message("kestrel kept safe: nothing of"); // the box wraps the rest
      s.expect(s.rowOf(/Trust ~\/work\/kestrel\?/) < 0, "not asked again");
      s.expect(JSON.parse(answers()).restricted.includes(root), `kept safe: ${answers()}`);
    },
  },
  {
    area: "reading",
    name: "privacy: a root's config can't set images_remote or update.check — each warned of, ignored; its web picture asked about, not fetched (DF-D1, DF-D23)",
    covers: { cases: ["inline"], commands: ["messages.open", "link.follow"] },
    options: { home: true, startAt: "home/work/kestrel/docs/qa/links.md" },
    run: async (s) => {
      // kestrel's own .slipbox/config.toml sets both: the warnings, among the messages.
      const file = realpathSync(s.path("~/work/kestrel/.slipbox/config.toml"));
      const warning = (key: string) =>
        new RegExp(
          `^config: (${file}|~/work/kestrel/\\.slipbox/config\\.toml) sets ${key.replace(".", "\\.")}, which only your own config may set .*; ignored$`,
        );
      const said = await lastMessage(s, "images_remote");
      s.expect(warning("render.images_remote").test(said), `the warning, whole:\n${said}`);
      const check = await lastMessage(s, "update.check");
      s.expect(warning("update.check").test(check), `update.check's warning, whole:\n${check}`);
      // The folder's "show" ignored: your own (the default, ask) stands — followed, it asks; n, nothing fetched.
      await followLink(s, "A remote image");
      await s.see("Fetch this picture from https://kestrel.dev?");
      s.expect(s.rowOf("fetching https://kestrel.dev") < 0, "not fetched at once, as show would");
      await s.keys("n");
      await s.notSee("Fetch this picture from");
      s.expect(s.rowOf("fetching") < 0, "nothing fetched after n");
      const images = join(s.dir, "cache", "slipbox", "images");
      s.expect(!existsSync(images) || !readdirSync(images).length, "no picture in the cache");
    },
  },

  // --- markdown's blocks ---------------------------------------------------------------------------
  {
    area: "reading",
    name: "headings: six levels, each its colour and band; setext's two as ATX's; a heading longer than its row wraps, its band on every row",
    covers: { cases: ["headings"] },
    options: { home: true, startAt: "home/work/kestrel/docs/qa/theme-showcase.md" },
    run: async (s) => {
      await s.see("H6 band");
      // A heading's mark and text are one run: found by both, never the breadcrumb's copy of its text.
      const levels = ["H1 band", "H2 band", "H3 band", "H4 band", "H5 band", "H6 band"].map((t) =>
        styleOn(s, `▌ ${t}`, t),
      );
      const page = s.styleOf("review page for the themes");
      s.expect(
        levels.every((l) => l?.bold && l.bg && l.bg !== page?.bg),
        `each level bold, on a band: ${JSON.stringify(levels)}`,
      );
      s.expect(new Set(levels.map((l) => l!.fg)).size === 6, `six colours: ${JSON.stringify(levels)}`);
      const [h1, h2] = levels;
      // Setext: an h1 underlined with ===, as an ATX one is drawn.
      await s.restart({ startAt: "home/work/product/roadmap/q4.md" });
      await s.see("Q4 2026 roadmap");
      s.expect(s.rowOf(/^.*│\s+\d+\s+=+\s*$/) < 0, "no === drawn");
      const setext = styleOn(s, "▌ Q4 2026 roadmap", "2026 roadmap");
      // (Its colour and weight: the cursor's row, its first, has a background of its own.)
      s.expect(setext?.fg === h1!.fg && setext?.bold, `the setext h1 as an h1: ${JSON.stringify(setext)}`);
      // --- under a paragraph's line makes it an h2; at the top, where frontmatter can't be (line 2), a rule.
      await s.restart({ startAt: "home/notes/daily/2026-09-11.md" });
      await s.see("Three things happened today");
      const under = styleOn(s, "▌ Three things happened today", "things happened");
      s.expect(under?.fg === h2!.fg && under?.bold, `the setext h2 as an h2: ${JSON.stringify(under)}`);
      // A heading longer than its row: every row it wraps to on its band, to the row's end.
      await s.restart({ startAt: "home/notes/meetings/all-hands-archive.md" });
      const text = s.read("~/notes/meetings/all-hands-archive.md").split("\n");
      const at = text.findIndex((l) => l.startsWith("## Mid-year all-hands, extra session")) + 1;
      await line(s, at);
      // In the middle of the window, where it stays; the cursor off it (its row has a background of its own).
      await s.keys("z", "z", "k", "k", "k");
      await s.see("anything else anyone wrote on the whiteboard");
      // Each reading of the screen at once, its text and its colours, until the keys have all taken effect (the
      // cursor's band, moving up, crosses the heading's rows): what's wrong, or null.
      const wrong = (): string | null => {
        const [screen, runs] = [s.screen(), s.runs()];
        const first = screen.findIndex((r) => r.includes("▌ Mid-year all-hands, extra session"));
        const last = screen.findIndex((r, i) => i > first && r.includes("whiteboard"));
        const band = runs[first]?.find((x) => x.text.includes("Mid-year"))?.bg;
        if (first < 0 || last <= first || !band) return `the long heading wraps (rows ${first} to ${last})`;
        for (let r = first; r <= last; r++) {
          const banded = runs[r]!.filter((x) => x.bg === band).reduce((n, x) => n + x.text.length, 0);
          if (banded <= s.cols / 2) return `row ${r} of the long heading on its band`;
        }
        return null;
      };
      await s
        .until(() => wrong() === null, undefined, "every row of the long heading on its band")
        .catch(() => s.expect(false, wrong() ?? "the long heading on its band"));
    },
  },
  {
    area: "reading",
    name: "lists: bullets by depth, numbers lined up past 9, tasks ticked or not; an item's code, table and quote hang under it",
    covers: { cases: ["lists"] },
    options: { home: true, startAt: "home/notes/daily/2026-08-31.md", config: '[render]\nglyphs = "unicode"\n' },
    run: async (s) => {
      await s.see("• Filed the Kyoto selects under the trip note");
      // A soft-wrapped item is one: its second line joined to it.
      await s.see("• Archived two newsletters with a note to myself");
      await s.see("• Plus signs are a thing some people still use");
      await s.see(/◦ and a nested one/);
      await s.see(/▪ and a dash inside that/);
      // The item's own blocks, under its text: a table, a quote.
      const item = s.rowOf("• Follow up with Aiko on the retry design");
      const col = (row: number, ch: string) => [...s.screen()[row]!].indexOf(ch);
      const table = s.rowOf(/┌─+┬─+┐/);
      const quote = s.rowOf("Do not merge before the restart test passes");
      s.expect(item >= 0 && table > item && quote > table, "the item's table and quote after it");
      s.expect(col(table, "┌") > col(item, "•"), "the table hangs under the item's text");
      s.expect(col(quote, "▎") > col(item, "•"), "the quote hangs under the item's text");
      // Ordered: 9 and 10 end in one column.
      await s.restart({ startAt: "home/notes/meetings/2026-09-10-q4-okr-planning.md" });
      await s.see("10. Pay down the tile-cache debt");
      const nine = s.screen()[s.rowOf("9. Hire the backend engineer")]!;
      const ten = s.screen()[s.rowOf("10. Pay down the tile-cache debt")]!;
      s.expect(nine.indexOf("9.") === ten.indexOf("10.") + 1, `9. and 10. lined up:\n${nine}\n${ten}`);
      // Tasks: open and done, each its box.
      await s.restart({ startAt: "home/notes/daily/2026-09-11.md" });
      await s.see("☐ OKR comments from Priya, still waiting");
      await s.see("☑ Take the bike to the shop for the cassette");
    },
  },
  {
    area: "reading",
    name: "quotes and callouts: a quote's bar, nested deeper; each callout its icon and title, its list and code inside; lookalikes stay quotes",
    covers: { cases: ["quotes", "callouts"] },
    options: { home: true, startAt: "home/notes/daily/2026-09-23.md", config: '[render]\nglyphs = "unicode"\n' },
    run: async (s) => {
      await s.see("▎ Root cause is a retry without a ceiling.");
      await s.see("▎ ❢ Important");
      await s.see("▎ ⚠ Manual skips");
      await s.see("▎ ℹ What the postmortem must answer");
      await s.see("▎ • why the alert was on queue depth and not on queue age");
      await s.see("▎  git log --oneline --grep=retry -- api/kestrel_api/sync.py");
      await s.see("▎ ✦ Heading inside a callout");
      // Its marker not where a callout's goes: a quote, the marker as written.
      await s.see("▎ [!note without a closing bracket is still just a quote");
      await s.see("▎ There is a marker here, [!note] in the middle of the line");
      await s.see("▎ A quote whose first line is ordinary text. [!note] The marker is on the second line");
      // Quotes in quotes: a bar a level.
      await s.restart({ startAt: "home/work/kestrel/docs/qa/glyphs.md" });
      await s.see("▎ One level of quote.");
      await s.see("▎ ▎ Two levels, nested.");
      await s.see("▎ ▎ ▎ Three levels, and the bar repeats.");
    },
  },
  {
    area: "reading",
    name: "paragraphs, rules and HTML: soft breaks join, each kind of hard break breaks; --- a rule; HTML blocks as written, dim; each comment hidden, inline HTML's text kept",
    covers: { cases: ["paragraphs", "rules", "html"] },
    options: { home: true, startAt: "home/notes/daily/2026-08-19.md" },
    run: async (s) => {
      await s.see("the brevet riders Jo introduced me to."); // a soft break: one line with the next
      // Two spaces, a backslash, <br>, <br/>, <BR />: each ends its row.
      const rows = [
        "Ride Collective Ghent",
        "Korenmarkt 14",
        "9000 Ghent",
        "Belgium",
        "Attn: the Wednesday group",
        "(they asked for postcards, not email)",
      ].map((t) => s.rowOf(t));
      s.expect(
        rows.every((r, i) => r >= 0 && (i === 0 || r === rows[i - 1]! + 1)),
        `the address a line a row: ${rows}`,
      );
      s.expect(
        rows.every((r) => !/<br|<BR|\\\s*$/.test(s.screen()[r]!.replace(/[▐\s]+$/, ""))),
        "no break drawn as text",
      );
      // A rule at the top (line 2, where no frontmatter starts).
      await s.restart({ startAt: "home/notes/daily/2026-09-11.md" });
      await s.see("Friday 11 September");
      s.expect(s.rowOf(/│\s+2\s+─{20,}/) >= 0, "line 2's --- drawn as a rule");
      // HTML: a block as it's written, dimmed; comments hidden, an unclosed one to the end; inline tags dropped.
      await s.restart({ startAt: "home/work/kestrel/docs/qa/theme-showcase.md" });
      await s.see("Inline HTML that renders as its text: press Ctrl+S, x2, H2O");
      await s.see("An inline comment  in a paragraph");
      await s.notSee("this part is hidden");
      await s.ex("300");
      await s.keys("z", "z");
      await s.see('<div class="note">');
      await s.see("<summary>A details block</summary>");
      const html = s.styleOf('<div class="note">');
      await s.keys("G");
      await s.see("Last visible line.");
      const prose = s.styleOf("Visible between comments.");
      s.expect(!!html && !!prose && html.fg !== prose.fg, `the HTML dimmed: ${JSON.stringify([html, prose])}`);
      await s.notSee("A heading inside a comment");
      await s.notSee("one-line comment");
      // One never closed isn't a comment on its own: an HTML block, as written and dim, to the end.
      await s.see("<!-- never closed");
      s.expect(s.styleOf("<!-- never closed")?.fg === html?.fg, "the unclosed comment dim, as HTML is");
    },
  },
  {
    area: "reading",
    name: "wrapping: a narrow terminal wraps prose at its spaces, no row past its edge; a no-break space keeps a number with its unit",
    covers: { cases: ["wrapping"] },
    options: { home: true, startAt: "home/notes/projects/home-office.md", size: { cols: 70, rows: 40 } },
    run: async (s) => {
      const notes: [string, string][] = [
        ["home-office.md", "~/notes/projects/home-office.md"],
        ["2026-09-13.md", "~/notes/daily/2026-09-13.md"],
      ];
      const nbsp = /[\u00a0\u2007\u202f]/g;
      for (const [note, rel] of notes) {
        if (note !== "home-office.md") await s.restart({ startAt: `home/notes/daily/${note}` });
        await s.status(note);
        // Page by page to its end: no row past the terminal's edge (tables' borders where they belong), and each
        // number with its unit — a no-break space between them — on one row, wherever the row ends.
        const rows: string[] = [];
        const lines = s.read(rel).split("\n").length;
        for (let i = 0; i < 20 && pos(s).line < lines - 1; i++) {
          tablesAligned(s, `${note}, page ${i + 1}`);
          rows.push(...s.screen().map((r) => r.replace(nbsp, " ")));
          await s.keys("pagedown");
        }
        rows.push(...s.screen().map((r) => r.replace(nbsp, " ")));
        const kept = [...s.read(rel).matchAll(/\d[\d.,:]*[\u00a0\u2007\u202f]\p{L}+/gu)].map((m) => m[0]);
        s.expect(kept.length >= 3, `${note}: no-break pairs to look for (${kept.length})`);
        for (const k of kept)
          s.expect(
            rows.some((r) => r.includes(k.replace(nbsp, " "))),
            `${note}: ${JSON.stringify(k)} on one row`,
          );
      }
    },
  },

  // --- themes, colours, glyphs (2.6–2.8) ------------------------------------------------------------
  {
    area: "reading",
    name: "themes: space u t lists the built-ins and your own, each previewed as the list moves; esc goes back, enter keeps one; :theme names one",
    covers: { cases: ["themes", "theme"], commands: ["theme.pick", "theme.set"] },
    options: {
      home: true,
      startAt: "home/work/kestrel/docs/qa/theme-showcase.md",
      // The team's themes, put where your own go, as their README says.
      setup: (s) =>
        cpSync(s.path("~/work/infra/dotfiles/slipbox/themes"), join(s.dir, "config", "slipbox", "themes"), {
          recursive: true,
        }),
    },
    run: async (s) => {
      const themes = join(s.dir, "config", "slipbox", "themes");
      const h2 = (name: string) => loadTheme(name, themes).theme.roles.h2.fg!.toLowerCase();
      const drawn = () => s.styleOf("H2 band")?.fg?.toLowerCase() ?? "";
      await s.until(() => drawn() === h2("tokyo-night"), 3000, "the heading in tokyo-night's colour");
      await leader(s, "u", "t");
      await s.see("Theme (live preview)");
      await s.see(/kestrel-dark\s+.*\S/); // a file of yours, listed with the built-ins
      await s.see(/gruvbox-light\s+built-in/);
      // Moving the list previews: the note drawn in the theme the list is on.
      await s.type("dracula");
      await s.until(() => drawn() === h2("dracula"), 3000, "the heading in dracula's colour, previewed");
      await s.keys("escape");
      await s.until(() => drawn() === h2("tokyo-night"), 3000, "back to tokyo-night after esc");
      await leader(s, "u", "t");
      await s.type("nord");
      await s.keys("enter");
      await s.message(/theme nord/);
      await s.until(() => drawn() === h2("nord"), 3000, "the heading in nord's colour, kept");
      // By name, a file's theme: the team's kestrel-dark.
      await s.ex("theme kestrel-dark");
      await s.until(() => drawn() === h2("kestrel-dark"), 3000, "the heading in kestrel-dark's colour");
    },
  },
  {
    area: "reading",
    name: "colors: [colors] overrides a role in every theme, [colors.nord] under nord alone",
    covers: { cases: ["colors"], commands: ["theme.set"] },
    options: {
      home: true,
      startAt: "home/work/kestrel/docs/qa/theme-showcase.md",
      config: '[colors]\nh1 = "#ff00aa"\n\n[colors.nord]\nh2 = "#00ff00"\n',
    },
    run: async (s) => {
      const fg = (t: string) => s.styleOf(t)?.fg?.toLowerCase() ?? "";
      await s.until(() => fg("H1 band") === "#ff00aa", 3000, "the h1 in [colors]' colour");
      const tokyo = loadTheme("tokyo-night", "/nonexistent").theme.roles;
      s.expect(fg("H2 band") === tokyo.h2.fg!.toLowerCase(), `the h2 tokyo-night's own: ${fg("H2 band")}`);
      await s.ex("theme nord");
      await s.until(() => fg("H2 band") === "#00ff00", 3000, "the h2 in [colors.nord]'s colour");
      s.expect(fg("H1 band") === "#ff00aa", "the h1 override under nord too");
      await s.ex("theme dracula");
      const dracula = loadTheme("dracula", "/nonexistent").theme.roles;
      await s.until(() => fg("H2 band") === dracula.h2.fg!.toLowerCase(), 3000, "the h2 dracula's own again");
    },
  },
  {
    area: "reading",
    name: "glyphs: space u g previews each set; :glyphs ascii draws bullets, boxes, bars, headings and tables in ASCII; unicode again",
    covers: { cases: ["glyphs"], commands: ["glyphs.pick", "glyphs.set"] },
    options: { home: true, startAt: "home/work/kestrel/docs/qa/glyphs.md" },
    run: async (s) => {
      await s.ex("glyphs unicode");
      await s.see("• first level");
      await s.see("☐ open task");
      await s.see("☑ done task");
      await s.see("▎ One level of quote.");
      await s.ex("glyphs ascii");
      await s.see("* first level");
      await s.see("[ ] open task");
      await s.see("[x] done task");
      await s.see("| One level of quote.");
      await s.see("### Third level, with the third icon");
      s.expect(s.rowOf("•") < 0 && s.rowOf("☐") < 0 && s.rowOf("▎") < 0, "nothing of unicode's left");
      // The picker: the list moves, the note previews it; enter keeps it.
      await leader(s, "u", "g");
      await s.see("Glyphs (live preview)");
      await s.type("unicode");
      await s.see("• first level");
      await s.keys("enter");
      await s.message("glyphs: unicode");
      await s.see("☑ done task");
    },
  },

  // --- status, words ---------------------------------------------------------------------------------
  {
    area: "reading",
    name: "status line: the mode, the root, the file, its problems, words, the cursor's line and column and how far down; unsaved said; a selection's words",
    covers: { cases: ["status", "words"] },
    options: { home: true, startAt: "home/notes/projects/kestrel-v2-3.md" },
    run: async (s) => {
      // Counted as the status line says it counts: runs of letters and digits, each Han or kana character one, the
      // frontmatter left out.
      const count = (rel: string) => {
        const body = s.read(rel).replace(/^---\r?\n[\s\S]*?\r?\n---\s*\r?\n/, "");
        const re =
          /(?=[\p{L}ー])[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}]|[\p{L}\p{N}](?:[\p{L}\p{N}_]|['’-](?=[\p{L}\p{N}]))*/gu;
        return [...body.matchAll(re)].length.toLocaleString("en");
      };
      await s.status(/^ READ +notes +‹ projects\/kestrel-v2-3\.md › +[✖⚠] \d+ +● watching /);
      await s.status(new RegExp(` ${count("~/notes/projects/kestrel-v2-3.md")} words +L1:1 0% *$`));
      await s.keys("G");
      await s.status(/ 100% *$/);
      await s.keys("g", "g");
      // The lens, typing, unsaved.
      await s.keys("i");
      await s.status(/^ LENS /);
      await s.keys("j", "i");
      await s.status(/^ INSERT /);
      await s.type("x");
      await s.status(/› • unsaved /);
      await s.keys("escape", "escape");
      await s.status(/^ READ .*› • unsaved /);
      // A selection: its words.
      await s.keys("v", "e");
      await s.status(/^ VISUAL .* \d+ words? selected /);
      await s.keys("escape");
      // Han and kana: a word each.
      await s.ex("e daily/2026-08-24.md");
      await s.status(new RegExp(` ${count("~/notes/daily/2026-08-24.md")} words +L1:1 `));
    },
  },

  // --- headings renamed, document types (11.9, 22.x) -------------------------------------------------
  {
    area: "reading",
    name: "headings: space n h renames the heading the cursor is in — a preview of each link to it, enter, every link rewritten",
    covers: { cases: ["headings"], commands: ["heading.rename"] },
    options: { open: "equipment/telescope-comparison.md" },
    run: async (s) => {
      await s.ex("13");
      await s.see(/§ Telescope comparison › Fleet at a glance/);
      await leader(s, "n", "h");
      await s.see('rename the heading "Fleet at a glance" to:');
      await s.keys("ctrl+u");
      await s.type("The fleet");
      await s.keys("enter");
      await s.see(/Fleet at a glance → equipment\/telescope-comparison\.md#The/);
      await s.see("people/kenji-mori.md:20");
      await s.keys("enter");
      await s.file("equipment/telescope-comparison.md", (t) => t.includes("\n## The fleet\n"), "the heading renamed");
      await s.file(
        "people/kenji-mori.md",
        (t) => t.includes("(../equipment/telescope-comparison.md#the-fleet)") && !t.includes("#fleet-at-a-glance"),
        "Kenji's link to it rewritten",
      );
      await s.see(/§ Telescope comparison › The fleet/);
    },
  },
  {
    area: "reading",
    name: "document types: space f d lists them with their notes; :type adr the ADRs in order, each its status; ] t and [ t step through them",
    covers: { cases: ["notes"], commands: ["type.list", "type.next", "type.prev"] },
    options: { home: true, startAt: "home/work/kestrel/docs/adr/0002-route-engine-in-rust.md" },
    run: async (s) => {
      // The lists take each note's title from the index: built first (a loaded machine builds it late), else a note
      // not yet read is listed by its file's name.
      await s.until(() => !s.topBar().includes("indexing"), 30000, "the index built");
      await leader(s, "f", "d");
      await s.see("Document types");
      await s.see(/adr\s+4 notes/);
      await s.keys("escape");
      await s.ex("type adr");
      await s.see("adr — 4 notes");
      await s.see(/1 +ADR 1: Offline-first sync with an op log +accepted · docs\/adr\/0001-offline-first-sync\.md/);
      await s.see(/4 +ADR 4: A retry budget for the sync queue +proposed · docs\/adr\/0004-retry-budget\.md/);
      await s.keys("escape");
      await s.keys("]", "t");
      await opened(s, "docs/adr/0003-sharing-links.md");
      await s.keys("]", "t");
      await opened(s, "docs/adr/0004-retry-budget.md");
      await s.keys("[", "t");
      await s.keys("[", "t");
      await s.keys("[", "t");
      await opened(s, "docs/adr/0001-offline-first-sync.md");
    },
  },

  // --- code: languages beyond the grammars; cells (16.18–16.23, 24.13) --------------------------------
  {
    area: "reading",
    name: "code: beyond the grammars — Java in source mode, no outline; a Dockerfile's stages its outline; a Vue component's parts, each with its definitions",
    covers: { cases: ["code-misc", "classify"], commands: ["outline.pick"] },
    options: { home: true, startAt: "home/work/kestrel/legacy/GpxParser.java" },
    run: async (s) => {
      await s.status("SOURCE");
      await s.see("public class GpxParser {");
      await leader(s, "f", "o");
      await s.see(/no headings/);
      await s.restart({ startAt: "home/work/kestrel/Dockerfile" });
      await s.see("FROM rust:latest AS engine");
      await outlinePicker(s, "Dockerfile");
      await s.see("engine (rust:latest)");
      await s.see("deps (python:3.12-slim)");
      await s.keys("escape");
      await s.restart({ startAt: "home/Downloads/recipe-card-demo/RecipeCard.vue" });
      await outlinePicker(s, "RecipeCard.vue");
      await s.see(/│ template\s/);
      await s.see(/│ script setup lang="ts"/);
      await s.see(/│ {3}Recipe\s/);
      await s.see(/│ style scoped lang="scss"/);
      await s.see(/│ {3}\.card\s/);
    },
  },
  {
    area: "reading",
    name: "code cells: z a folds one to its header and opens it again; space k y copies its lines, space k s adds it to the scratch, space k e edits it in the lens, space k p its problems",
    covers: {
      cases: ["code-files"],
      commands: ["cell.fold", "cell.copy", "cell.scratch", "cell.edit", "cell.problems"],
    },
    options: { home: true, startAt: "home/work/kestrel/src/routes/name.ts" },
    run: async (s) => {
      const text = s.read("~/work/kestrel/src/routes/name.ts").split("\n");
      const badge = text.findIndex((l) => l.startsWith("export function badge")) + 1;
      const end = text.indexOf("}", badge) + 1;
      await s.see("export function badge(name: string): string {");
      await line(s, badge);
      // Folded to its header, and open again by the same key.
      await s.keys("z", "a");
      await s.notSee("export function badge(name: string): string {");
      await s.see("function: badge");
      await s.keys("z", "a");
      await s.see("export function badge(name: string): string {");
      // Its lines, as the file has them.
      await line(s, badge);
      await leader(s, "k", "y");
      await s.message(`copied badge — lines ${badge}–${end}`);
      await s.until(
        () => s.clipboard() === text.slice(badge - 1, end).join("\n"),
        3000,
        "the cell's lines on the clipboard",
      );
      // In the scratch, with its path and lines, for an agent.
      await leader(s, "k", "s");
      await s.message(`badge — lines ${badge}–${end} added to the scratch`);
      // Shown at once, floating (#43), typing a note (D229); esc then q, back at the cell.
      await s.see(SCRATCH_FLOATING);
      await s.keys("escape", "q");
      await s.notSee(SCRATCH_FLOATING);
      // Its problem (a syntax error slipbox found itself): the Problems panel on it.
      await leader(s, "k", "p");
      await s.status("PROBLEMS");
      await s.see(signed(`{error} ${badge + 2}:`));
      await s.keys("q");
      await s.until(() => !s.statusLine().includes("PROBLEMS"), 3000, "the Problems panel closed");
      // The lens on its lines whole.
      await line(s, badge);
      await leader(s, "k", "e");
      await s.status(/^ LENS /);
      await s.see(`source · lines ${badge}–${end}`);
    },
  },
  {
    area: "reading",
    name: "code cells: space k r — where the cell's definition is used, from TypeScript's own server",
    covers: { cases: ["code-ts"], commands: ["cell.references"] },
    options: {
      open: "software/nightjar/src/server.ts",
      config: `[lsp]\nenabled = true\n\n[language-server.typescript]\ncommand = ${JSON.stringify(TSC)}\n`,
    },
    run: async (s) => {
      await s.see("byNight(night: string): Frame[] {");
      const text = s.read("software/nightjar/src/server.ts").split("\n");
      const use = text.findIndex((l) => l.includes("archive.byNight(night)")) + 1;
      await line(s, text.findIndex((l) => l.includes("byNight(night: string)")) + 1);
      await leader(s, "k", "r");
      await s.see(/1 reference/, 20_000);
      await s.see(`software/nightjar/src/server.ts:${use}`);
      await s.keys("enter");
      await s.until(() => pos(s).line === use, 3000, `on its use, line ${use}`);
    },
  },

  // --- the sample set's own fixtures ------------------------------------------------------------------
  {
    area: "reading",
    name: "samples: the agent replay script edits a folder while it's shown — its note comes and goes in the explorer, the plan beside it untouched",
    covers: { cases: ["samples-meta"] },
    // Downloads beside home, a folder outside every vault, walked and watched whole (home's index leaves Downloads out).
    options: { home: true, startAt: "elsewhere/plan.md", setup: downloadsElsewhere },
    run: async (s) => {
      const dir = join(s.dir, "elsewhere");
      const plan = s.read(join(dir, "plan.md"));
      const script = s.path("~/work/kestrel/scripts/dev/agent-replay.sh");
      const env = { PATH: process.env.PATH ?? "", PAUSE: "0.3" };
      const run = Bun.spawn(["bash", script, dir], { env, stdout: "pipe" });
      await s.see("agent-scratch.md", 10_000);
      await run.exited;
      s.expect(run.exitCode === 0, `the script ran to its end (exit ${run.exitCode})`);
      await s.notSee("agent-scratch", 5000);
      await s.status("plan.md");
      s.expect(s.read(join(dir, "plan.md")) === plan, "the plan untouched");
    },
  },
];

export const LEFT_OUT_READING: LeftOut = {
  commands: {
    "cell.fold_unchanged":
      "GIT's terminal checks come in one pass when the workstream is done; tests/tui.test.ts's 'space k d folds' runs it",
  },
};
