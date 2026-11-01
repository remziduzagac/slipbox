// Markdown content, tables, code blocks, embeds and footnotes.

import { type Check, leader, open, opened } from "../check.ts";
import { followLink, tablesAligned } from "../support/reading.ts";

export const MARKDOWN_CONTENT: Check[] = [
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
];
