// The reference set's content in a real terminal: code in every grammar, data beyond halden's,
// hostile text, wide characters lining up, big files, odd files.

import { lstatSync, readlinkSync } from "node:fs";
import { UNSAFE } from "../../src/core/sanitize.ts";
import { leader, moveTo, pos, type Scenario } from "./helpers.ts";
import type { Session } from "./session.ts";

const KESTREL = "home/work/kestrel/README.md";
const INFRA = "home/work/infra/README.md";

/**
 * A command line at `:`, typed and seen before enter: in a root the size of a repository the
 * palette lists its files for `:e` first, and an enter sent before it has the text is lost.
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
 * Every table on screen lines up: each row from a table's `┌` to its `└` has a border at the
 * column the top row's `┐` is at, and no row is wider than the pane. A character slipbox measured
 * otherwise than the terminal shifts the rest of its row, and its border with it.
 *
 * Except a row with a spacing mark (\p{Mc}: Devanagari's ि ा ी). slipbox counts as OpenTUI does
 * (a unit test holds the two together); herdr's terminal, libghostty, gives such a mark a column of
 * its own, and this check measures the screen with Bun's widths, as OpenTUI's: between the terminal
 * and OpenTUI, past what slipbox can say.
 */
function tablesAligned(s: Session, where: string): number {
  const rows = s.screen();
  let tables = 0;
  for (const [i, r] of rows.entries()) {
    s.expect(Bun.stringWidth(r) <= s.pane.cols, `${where}: row ${i} is wider than the pane (${Bun.stringWidth(r)} > ${s.pane.cols})`);
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
      s.expect(!!border && "│┤╡┘┃".includes(border.g), `${where}: row ${j}'s right border isn't at column ${right.col}\n${rows[j]}`);
      if (edge.g === "└") break;
    }
    tables++;
  }
  return tables;
}

export const CONTENT_SCENARIOS: Scenario[] = [
  {
    name: "world/content: code in every grammar — Go, Rust, Lua, shell, JavaScript, TSX: outlines, breadcrumbs, a syntax error",
    needs: { cols: 80 },
    options: { home: true, startAt: KESTREL },
    run: async (s) => {
      // Each file's outline from its grammar (loaded lazily, then drawn again): the heading picker
      // lists a definition with its line — a row the file's own text never has — and inside a
      // nested definition the breadcrumb names both levels.
      const files: [string, string, number, RegExp][] = [
        ["tools/uploader/main.go", "Map", 37, /§ .*Start/],
        ["crates/route-engine/src/lib.rs", "heuristic", 94, /impl Point\s*›\s*new/],
        ["scripts/dev/kestrel.lua", "Route:distance", 33, /Route:describe\s*›\s*pad/],
        ["scripts/lib.sh", "tail_log", 30, /version_of\s*›\s*inner/],
        ["src/legacy/app.js", "compare", 35, /Route\s*›\s*constructor/],
        ["src/App.tsx", "useRoutes", 11, /§ .*useRoutes/],
      ];
      const crumbAt: Record<string, number> = { "tools/uploader/main.go": 30, "crates/route-engine/src/lib.rs": 45, "scripts/dev/kestrel.lua": 29, "scripts/lib.sh": 16, "src/legacy/app.js": 27, "src/App.tsx": 12 };
      for (const [rel, symbol, defLine, crumbs] of files) {
        await edit(s, rel);
        await s.status("SOURCE");
        await leader(s, "f", "o");
        await s.see(`Headings — ${rel.split("/").at(-1)}`, 5000);
        await s.see(new RegExp(`${symbol.replace(/[.:]/g, "\\$&")}\\s+${defLine}\\s*│`));
        await s.keys("escape");
        await line(s, crumbAt[rel]!);
        await s.until(() => crumbs.test(crumb(s)), 5000, `${rel}'s breadcrumb at line ${crumbAt[rel]}: ${crumbs}`);
      }
      // A TypeScript file left by a bad rebase: its errors counted on the status line.
      await edit(s, "src/sync/stray-token.ts");
      await s.status(/✖ ?\d/, 5000);
      // And a Go file's: another grammar's errors, the same way.
      await edit(s, "tools/uploader/broken.go");
      await s.status(/✖ ?\d/, 5000);
    },
  },
  {
    name: "world/content: a 4,000-line TypeScript file opens, G reaches its end, keys answer at once",
    options: { home: true, startAt: KESTREL },
    run: async (s) => {
      await edit(s, "src/generated/routes-big.ts");
      await s.status("SOURCE");
      // Its outline: a class near its end, found by the grammar on a file this size.
      await leader(s, "f", "o");
      await s.see(/Headings — routes-big\.ts/, 8000);
      await s.type("RouteTable19");
      await s.see(/RouteTable19\s+4091\s*│/);
      // Picked: the cursor at its line.
      await moveTo(s, ["enter"], (l) => l === 4091, "enter on RouteTable19 to its line");
      await moveTo(s, ["G"], (l) => l >= 4300, "G to the end of 4,304 lines");
      // Keys answer at once there: each move lands within the usual wait, not after a re-parse.
      const end = pos(s).line;
      await moveTo(s, ["k", "k", "k"], (l) => l === end - 3, "k three times");
      await moveTo(s, ["g", "g"], (l) => l === 1, "gg back to the top");
      await moveTo(s, ["4", "0", "0", "0", "G"], (l) => l === 4000, "4000G");
      await s.until(() => /RouteTable18/.test(crumb(s)), 5000, "the breadcrumb in RouteTable18 at line 4000");
    },
  },
  {
    name: "world/content: data beyond halden's — .properties, a jsonc tsconfig, .env, multi-document YAML, big JSON, a file that doesn't parse",
    options: { home: true, startAt: INFRA },
    run: async (s) => {
      const parses = async () => {
        await s.status(/READ/);
        s.expect(!s.text().includes("doesn't parse"), "no parse error said");
      };
      // Java's .properties: `!` comments are comments (a key's, after its value), and a value that
      // goes on after a backslash is one value.
      await edit(s, "config/legacy-archive.properties");
      await parses();
      await s.see(/archive\.target\.bucket\s+kestrel-archive-eu\s+# Where the archive goes/);
      await s.see(/archive\.sources\s+\/var\/lib\/kestrel\/routes, \/var\/lib\/kestrel\/gpx-uploads, \/var\/lib\/kestrel\/offline-bundles, \/var\/lib\/kestrel\/exports/);
      // Several YAML documents: a row each.
      await edit(s, "k8s/api.yaml");
      await parses();
      await s.see(/document 1/);
      await s.see(/document 2/);
      // A TOML file that doesn't parse: its source, and why.
      await edit(s, "config/broken/unclosed-string.toml");
      await s.status("SOURCE");
      await s.message(/doesn't parse/);
      // kestrel's tsconfig.json has comments and trailing commas, as editors allow: it renders.
      await s.restart({ startAt: KESTREL });
      await edit(s, "tsconfig.json");
      await parses();
      await s.see(/target\s+ES2022/);
      await s.see(/strict\s+true/);
      // A 3,248-line lock file: G at its end at once.
      await edit(s, "package-lock.json");
      await parses();
      await moveTo(s, ["G"], (l) => l > 3200, "G to the lock file's end");
      // A 290 KB JSON on one line (Downloads, a plain folder): a tree, its last route reached.
      await s.restart({ startAt: "home/Downloads/routes-export.min.json" });
      await parses();
      await s.see(/routes/);
      await s.keys("G");
      await s.see("Route 399 via the ridge road", 5000);
      // An .env: export prefixes dropped; a quoted value unquoted, with its comment after it.
      await s.restart({ startAt: INFRA });
      await edit(s, "config/prod.env");
      await parses();
      await s.see(/NODE_ENV\s+production/);
      await s.see(/TILE_ATTRIBUTION\s+\(c\) OpenStreetMap contributors/);
      await s.see(/SYNC_ENDPOINT\s+https:\/\/sync\.kestrel\.dev\/v2\s+# the worker/);
    },
  },
  {
    name: "world/content: hostile text in note bodies, a log, data values never reaches the terminal: no title set, no screen cleared",
    options: { home: true, startAt: "home/notes/research/terminal-escapes-in-logs.md" },
    run: async (s) => {
      // What an escape that got through would do: control or bidi characters left in the screen's
      // cells, the title changed (OSC 0), the screen cleared or the cursor moved (the frame's top
      // bar, the explorer's title or the status line gone). Checked at the top, the end, and back.
      const intact = async (name: string) => {
        await s.status(name, 5000);
        for (const keys of [[], ["G"], ["g", "g"]]) {
          await s.keys(...keys);
          const t = s.text();
          s.expect(!UNSAFE.test(t.replace(/\n/g, "")), `${name}: a control or bidi character on screen`);
          const title = s.title();
          s.expect(title.startsWith("slipbox — ") && title.endsWith(name), `${name}: the title is still slipbox's (got ${JSON.stringify(title)})`);
          s.expect(s.topBar().includes("slipbox") && t.includes("Explorer") && s.statusLine().includes(name), `${name}: the frame drawn whole`);
        }
        // It still answers: j moves the cursor.
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
    name: "world/content: wide characters line up — CJK, fullwidth, emoji, flags, combining, Thai, Devanagari, Arabic: tables' borders in one column; l steps a character",
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
      // In Japanese prose, l moves one character at a time — two columns each (the status line's
      // column counts cells) — and the cursor's cell, drawn in its own colour, is that character.
      await s.restart({ startAt: "home/hobbies/photography/trips/京都/2026-08-24-伏見稲荷.md" });
      await line(s, 10);
      await moveTo(s, ["0"], (_, c) => c === 1, "0 to the line's start");
      await moveTo(s, ["l", "l", "l"], (_, c) => c === 7, "l three times: three wide characters on");
      const cursor = () => {
        const row = s.runs().find((r) => r.map((x) => x.text).join("").includes("千本鳥居は"));
        // The cursor's colour is the one run on its row no other run shares.
        const bgs = (row ?? []).map((r) => r.bg);
        return (row ?? []).find((r) => r.text.trim() && bgs.filter((b) => b === r.bg).length === 1)?.text ?? "";
      };
      await s.until(() => cursor() === "居", 3000, `the cursor on 居, the fourth character (on ${JSON.stringify(cursor())})`);
      await moveTo(s, ["h"], (_, c) => c === 5, "h one wide character back");
      await s.until(() => cursor() === "鳥", 3000, `the cursor on 鳥 (on ${JSON.stringify(cursor())})`);
    },
  },
  {
    name: "world/content: big content stays responsive — a 2 MB note, the cap's skipped file never searched, a table torture note, a training log",
    options: { home: true, startAt: "home/Downloads/huge-note.md" },
    run: async (s) => {
      // 2 MB, 52,000 lines: parsed on other threads, then drawn; its end, and back, at once.
      const lines = s.read("~/Downloads/huge-note.md").split("\n").length;
      await s.see("All-hands archive", 15_000);
      await s.keys("G");
      await s.until(() => pos(s).line >= lines - 3, 10_000, `G to the 2 MB note's end (line ${lines})`);
      const end = pos(s).line;
      await moveTo(s, ["k"], (l) => l < end, "k answers at the end of a 2 MB note");
      await moveTo(s, ["g", "g"], (l) => l === 1, "gg back to the top");
      // Over walk.max_file_size: the vault lists it as skipped, and search never reads it (a
      // coordinate only it has finds nothing).
      await s.restart({ startAt: "home/notes/index.md" });
      await leader(s, "v", "i");
      await s.see(/research\/gps-traces\.md — larger than walk\.max_file_size/);
      await s.keys("escape");
      await leader(s, "f", "s");
      await s.type("47.37706");
      await s.until(() => /"47\.37706"/.test(s.text()), 5000, "the search to answer");
      s.expect(!s.text().includes("gps-traces.md:"), "search never reads the file over the cap");
      await s.keys("escape");
      // kestrel's table torture: every table lines up, page after page, to its end.
      await s.restart({ startAt: "home/work/kestrel/docs/qa/render-torture.md" });
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
    name: "world/content: odd files never hang it — /dev/zero by symlink, an unreadable note; a symlinked note saved through; one out of the root never read",
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
      await s.see(/research\/outside\.md — symlink points outside the root/);
      await s.keys("escape");
      // A symlinked note, edited and saved: written through to its target, still a symlink.
      await edit(s, "projects/kestrel-current.md");
      await leader(s, "n", "v");
      await s.status("SOURCE");
      await s.keys("G", "o");
      await s.type("Checked through the symlink.");
      await s.keys("escape", "ctrl+s");
      await s.file("~/notes/projects/kestrel-v2-3.md", (t) => t.includes("Checked through the symlink."), "the edit in the symlink's target");
      const link = s.path("~/notes/projects/kestrel-current.md");
      s.expect(lstatSync(link).isSymbolicLink() && readlinkSync(link) === "kestrel-v2-3.md", "kestrel-current.md still a symlink to kestrel-v2-3.md");
      await leader(s, "n", "v");
      // A symlink out of the root: never read, as the walk and the CLI (exit 5) refuse it.
      await ex(s, "e research/outside.md");
      await s.until(() => s.statusLine().includes("outside.md") || /outside the root|no note or file/.test(s.text()), 3000, "outside.md opened or refused");
      s.expect(!s.statusLine().includes("outside.md"), "a symlink leading out of the root isn't opened");
    },
  },
  {
    name: "world/content: line endings and a BOM — drawn without stray cells, kept by a save: BOM, CRLF, lone CR",
    options: {
      home: true,
      startAt: "home/notes/daily/2026-09-16.md",
      // The set's Windows note is meant to be CRLF throughout (its manifest says so); made so here.
      setup: (s) => s.write("~/notes/daily/2026-09-15.md", s.read("~/notes/daily/2026-09-15.md").replace(/\r?\n/g, "\r\n")),
    },
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
      // CRLF: a CR never reaches the terminal (it would send the cursor to the row's start and
      // write over the explorer); a save keeps every line's CRLF.
      await edit(s, "daily/2026-09-15.md");
      await s.see("Tuesday 15 September");
      const row = s.screen()[s.rowOf("Written on the Windows laptop")] ?? "";
      s.expect(row.indexOf("│") >= 0 && row.indexOf("│") < row.indexOf("Written"), "the CRLF note's row drawn in its place, the explorer beside it");
      s.expect(Bun.stringWidth(row) <= s.pane.cols, "the CRLF note's row no wider than the pane");
      await leader(s, "n", "v");
      await s.status("SOURCE");
      await s.keys("G", "o");
      await s.type("CRLF kept.");
      await s.keys("escape", "ctrl+s");
      await s.file("~/notes/daily/2026-09-15.md", (t) => t.includes("CRLF kept."), "the CRLF note's edit saved");
      const crlf = s.read("~/notes/daily/2026-09-15.md");
      s.expect(crlf.split("\n").length > 10 && crlf.split("\n").slice(0, -1).every((l) => l.endsWith("\r")), "every line still ends in CRLF");
      // Lone CRs (an old Mac's): lines, never one long line.
      await s.restart({ startAt: "home/Downloads/lone-cr.md" });
      await s.see("Old Mac notes");
      const pan = s.rowOf("panniers");
      const tube = s.rowOf("spare tube");
      s.expect(pan >= 0 && tube > pan && s.rowOf("Saved by the editor") > s.rowOf("Old Mac notes"), "each CR-ended line a row of its own");
    },
  },
  {
    name: "world/content: Japanese edited in source mode — w b e a character each, ciw the run, typed and saved",
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
      await s.file("~/hobbies/photography/trips/京都/2026-08-24-伏見稲荷.md", (t) => t.split("\n")[9]!.startsWith("鳥居の道、本当は千本もない。"), "ciw replaced the run, saved");
      await s.see("鳥居の道、本当は千本もない。");
    },
  },
];
