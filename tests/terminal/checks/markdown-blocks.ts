// Markdown headings, lists, quotes, paragraphs and wrapping.

import { type Check, pos } from "../check.ts";
import type { Session, StyledRun } from "../session.ts";
import { line, tablesAligned } from "../support/reading.ts";

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

export const MARKDOWN_BLOCKS: Check[] = [
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
    name: "paragraphs, rules and HTML: soft breaks join, each kind of hard break breaks; --- a rule; HTML document content rendered; each comment hidden, inline HTML formatted",
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
      // HTML document content is rendered; comments, including an unclosed comment, remain hidden.
      await s.restart({ startAt: "home/work/kestrel/docs/qa/theme-showcase.md" });
      await s.see("Inline HTML that renders as its text: press Ctrl+S, x2, H2O");
      await s.see("An inline comment  in a paragraph");
      await s.notSee("this part is hidden");
      await s.ex("300");
      await s.keys("z", "z");
      await s.see("A div, shown verbatim and dim.");
      await s.see("A details block");
      await s.notSee('<div class="note">');
      await s.notSee("<summary>");
      await s.keys("G");
      await s.see("Last visible line.");
      await s.see("Visible between comments.");
      await s.notSee("A heading inside a comment");
      await s.notSee("one-line comment");
      await s.notSee("<!-- never closed");
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
];
