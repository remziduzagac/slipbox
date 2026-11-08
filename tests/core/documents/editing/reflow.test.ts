import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

type Mode = "wrap" | "join";

/** The note after reflow of lines `first` to `last` (all by default): the edits made, from the last. */
async function reflowed(source: string, mode: Mode, width = 40, first = 1, last = 1e9): Promise<string> {
  const { reflow } = await import("../../../../src/core/documents/editing/reflow.ts");
  const { parseMarkdown } = await import("../../../../src/core/documents/markdown/parse.ts");
  const r = reflow(source, parseMarkdown(source).tree, first, last, mode, width);
  let out = source;
  for (const e of [...r.edits].reverse()) out = out.slice(0, e.from) + e.text + out.slice(e.to);
  return out;
}
const wrap = (s: string, width = 40, first?: number, last?: number) => reflowed(s, "wrap", width, first, last);
const join = (s: string, width = 40, first?: number, last?: number) => reflowed(s, "join", width, first, last);
const lines = (...l: string[]) => `${l.join("\n")}\n`;

describe("reflow, both ways (EG-D12)", () => {
  test("a paragraph: wrapped at spaces to the width, every line within it; joined back to one line", async () => {
    const one = lines(
      "The route engine keeps a cache of tiles near each rider, refreshed as they ride, and drops the rest at night.",
    );
    const wrapped = lines(
      "The route engine keeps a cache of tiles",
      "near each rider, refreshed as they ride,",
      "and drops the rest at night.",
    );
    expect(await wrap(one)).toBe(wrapped);
    expect(await join(wrapped)).toBe(one);
    // Ragged lines and runs of spaces are laid out again; each line is as full as the width lets it be.
    expect(
      await wrap(
        lines(
          "The route engine",
          "keeps a cache   of tiles near each",
          "rider, refreshed as they ride,",
          "and drops the rest at night.",
        ),
      ),
    ).toBe(wrapped);
  });

  test("list items: the marker on the first line, the rest at the item's text — a task's box on its first line only", async () => {
    const note = lines(
      "- [ ] Book the rail pass and print the voucher with both booking numbers on it",
      "- Pack the charger",
      "10. The tenth step, which runs past the width and so has to wrap onto another line",
      "- Outer item",
      "  - An inner item that is long enough to need a second line at this width",
    );
    expect(await wrap(note)).toBe(
      lines(
        "- [ ] Book the rail pass and print the",
        "  voucher with both booking numbers on",
        "  it",
        "- Pack the charger",
        "10. The tenth step, which runs past the",
        "    width and so has to wrap onto",
        "    another line",
        "- Outer item",
        "  - An inner item that is long enough to",
        "    need a second line at this width",
      ),
    );
    expect(await join(await wrap(note))).toBe(note);
    // The indent its continuation already has is kept, where it's deeper than the item's text.
    const hanging = lines("- [ ] Book the rail pass and print", "      the voucher with both booking numbers on it");
    expect(await wrap(hanging)).toBe(
      lines("- [ ] Book the rail pass and print the", "      voucher with both booking numbers", "      on it"),
    );
  });

  test("quotes: `>` on every line, nested ones and those in a list item too; a lazy line gets its `>` back", async () => {
    const note = lines(
      "> Aiko said the queue stalled because the retry timer was never reset after a failed sync",
      "lazy line too",
      "",
      "> > A quote in a quote, which also runs on past the width of forty columns",
      "",
      "- An item",
      "  > With a quote in it that runs on past the width of forty columns",
      "",
      "> - A list in a quote, whose item runs on past the width of forty columns",
    );
    expect(await wrap(note)).toBe(
      lines(
        "> Aiko said the queue stalled because",
        "> the retry timer was never reset after",
        "> a failed sync lazy line too",
        "",
        "> > A quote in a quote, which also runs",
        "> > on past the width of forty columns",
        "",
        "- An item",
        "  > With a quote in it that runs on past",
        "  > the width of forty columns",
        "",
        "> - A list in a quote, whose item runs",
        ">   on past the width of forty columns",
      ),
    );
    expect(await join(await wrap(note))).toBe(
      lines(
        "> Aiko said the queue stalled because the retry timer was never reset after a failed sync lazy line too",
        "",
        "> > A quote in a quote, which also runs on past the width of forty columns",
        "",
        "- An item",
        "  > With a quote in it that runs on past the width of forty columns",
        "",
        "> - A list in a quote, whose item runs on past the width of forty columns",
      ),
    );
  });

  test("hard breaks, two spaces or a backslash, still end their lines both ways; what's between them is laid out", async () => {
    const note = lines(
      "Roses are red, violets are blue, and this line goes on and on  ",
      "a second line after two spaces,\\",
      "a third after a backslash.",
    );
    expect(await wrap(note)).toBe(
      lines(
        "Roses are red, violets are blue, and",
        "this line goes on and on  ",
        "a second line after two spaces,\\",
        "a third after a backslash.",
      ),
    );
    expect(await join(await wrap(note))).toBe(note);
    // A quote's break, with its `>`.
    expect(await join(lines("> one", "> two  ", "> three"))).toBe(lines("> one two  ", "> three"));
  });

  test("links, wikilinks, code spans, images, maths, inline HTML, footnote references: never broken", async () => {
    const note = lines(
      'See [the sync rewrite plan](../projects/sync-rewrite.md) and [[sync queue|the queue]] and `retry after backoff` and ![a map](map.png) and $a + b$ and <span title="x y">this</span> and [^note] here.',
    );
    const wrapped = await wrap(note, 30);
    expect(wrapped).toBe(
      lines(
        "See",
        "[the sync rewrite plan](../projects/sync-rewrite.md)",
        "and [[sync queue|the queue]]",
        "and `retry after backoff` and",
        "![a map](map.png) and $a + b$",
        'and <span title="x y">this</span>',
        "and [^note] here.",
      ),
    );
    expect(await join(wrapped, 30)).toBe(note);
    // A link's text written over two lines is joined with one space, and stays whole.
    expect(await join(lines("Read [the whole", "plan](plan.md) today."))).toBe(
      lines("Read [the whole plan](plan.md) today."),
    );
    expect(await wrap(lines("Read [the whole", "plan](plan.md) today, before the meeting."), 20)).toBe(
      lines("Read", "[the whole plan](plan.md)", "today, before the", "meeting."),
    );
    // A hard break inside a link's text still ends its line.
    const broken = lines("See [the whole  ", "plan](plan.md) now.");
    expect(await join(broken)).toBe(broken);
  });

  test("headings, tables, fenced and indented code, HTML, maths and the front matter are left as they are", async () => {
    const note = lines(
      "---",
      "title: A note whose front matter has a long line that goes on past the width",
      "---",
      "",
      "# A heading that goes on past the width of forty columns, and stays",
      "",
      "| A table | whose row goes on past the width of forty columns |",
      "| --- | --- |",
      "",
      "```ts",
      "const a = 'a fenced line that goes on past the width of forty columns';",
      "```",
      "",
      "    an indented code line that goes on past the width of forty columns",
      "",
      "<div>An HTML block that goes on past the width of forty columns</div>",
      "",
      "$$",
      "a + b + c + d + e + f + g + h + i + j + k + l + m + n + o + p + q",
      "$$",
      "",
      "Setext heading that goes on past the width of forty columns",
      "===",
    );
    expect(await wrap(note)).toBe(note);
    expect(await join(note)).toBe(note);
  });

  test("a callout's first line is its title, kept as it is; its body is laid out", async () => {
    const note = lines(
      "> [!warning] Sync queue: a title that goes on past the width, kept",
      "> The body of the callout, which runs on past the width of forty columns.",
      "",
      "> [!note] A callout of its title alone, long enough to go past the width",
    );
    expect(await wrap(note)).toBe(
      lines(
        "> [!warning] Sync queue: a title that goes on past the width, kept",
        "> The body of the callout, which runs on",
        "> past the width of forty columns.",
        "",
        "> [!note] A callout of its title alone, long enough to go past the width",
      ),
    );
    expect(await join(await wrap(note))).toBe(note);
  });

  test("a footnote's text: its label on the first line, the rest four spaces in", async () => {
    const note = lines("[^1]: Page 212 of the second edition, where the chapter on routing starts.");
    expect(await wrap(note)).toBe(
      lines("[^1]: Page 212 of the second edition,", "    where the chapter on routing starts."),
    );
    expect(await join(await wrap(note))).toBe(note);
  });

  test("no line starts with a word that would start a block there, nor ends in a backslash: the word before goes down", async () => {
    // At 20 columns, "-", "1.", "#", ">", "+", "===", "<div>" and "```" would each start the second line: each goes
    // down with the word before it.
    for (const word of ["-", "1.", "#", ">", "+", "*", "===", "---", "<div>", "</p>", "<!--", "```js", "~~~", "$$"])
      expect({ word, out: await wrap(lines(`aaaa bbbb cccc dddd ${word} eeee ffff`), 20) }).toEqual({
        word,
        out: lines("aaaa bbbb cccc", `dddd ${word} eeee ffff`),
      });
    // A tag with attributes too.
    expect(await wrap(lines('aaaa bbbb cccc dddd <div class="x"> e'), 20)).toBe(
      lines("aaaa bbbb cccc", 'dddd <div class="x">', "e"),
    );
    // A word ending in a backslash at a line's end would make a hard break: the next word stays with it.
    expect(await wrap(lines("aaaa bbbb C:\\ dddd eeee"), 14)).toBe(lines("aaaa bbbb", "C:\\ dddd eeee"));
    // An escaped backslash ends a line freely.
    expect(await wrap(lines("aaaa bbbb x\\\\ dddd eeee"), 14)).toBe(lines("aaaa bbbb x\\\\", "dddd eeee"));
    // Nowhere to go: the word stays on its line, over the width.
    expect(await wrap(lines("aaaa - bbbb"), 4)).toBe(lines("aaaa -", "bbbb"));
    // A tag or a word that only starts like one is fine: `#tag`, `-x`.
    expect(await wrap(lines("aaaa bbbb #tag -x"), 9)).toBe(lines("aaaa bbbb", "#tag -x"));
  });

  test("the lines given: each paragraph they touch, whole, and no other; the last line made", async () => {
    const { reflow } = await import("../../../../src/core/documents/editing/reflow.ts");
    const { parseMarkdown } = await import("../../../../src/core/documents/markdown/parse.ts");
    const note = lines(
      "First paragraph that runs on past the width of forty columns.",
      "",
      "Second paragraph that runs on past",
      "the width of forty columns too.",
      "",
      "Third paragraph that runs on past the width of forty columns.",
    );
    // Line 4 is the second paragraph's last: the whole of it, and only it.
    expect(await wrap(note, 40, 4, 4)).toBe(
      lines(
        "First paragraph that runs on past the width of forty columns.",
        "",
        "Second paragraph that runs on past the",
        "width of forty columns too.",
        "",
        "Third paragraph that runs on past the width of forty columns.",
      ),
    );
    // Lines 1 to 3: the first and the second; the last line made is the second's, two lines down.
    const r = reflow(note, parseMarkdown(note).tree, 1, 3, "wrap", 40);
    expect([r.paragraphs, r.edits.length, r.lastLine]).toEqual([2, 2, 5]);
    // Nothing there to reflow: a blank line, a heading.
    expect(reflow(note, parseMarkdown(note).tree, 2, 2, "wrap", 40).paragraphs).toBe(0);
    // Already as asked: counted, no edit.
    const done = reflow(lines("short"), parseMarkdown(lines("short")).tree, 1, 1, "join", 40);
    expect([done.paragraphs, done.edits.length, done.lastLine]).toEqual([1, 0, 1]);
  });

  test("the note's own line endings, and widths as the terminal draws them: a CJK character is two columns", async () => {
    const crlf = "The route engine keeps a cache of tiles near each rider.\r\nNext.\r\n";
    expect(await wrap(crlf)).toBe("The route engine keeps a cache of tiles\r\nnear each rider. Next.\r\n");
    expect(await join("one\r\ntwo\r\n")).toBe("one two\r\n");
    // Ten columns: two words of two CJK characters (four columns each) fit with the space; a third doesn't.
    expect(await wrap(lines("京都 伏見 稲荷 大社"), 10)).toBe(lines("京都 伏見", "稲荷 大社"));
  });

  test("an Obsidian comment: a paragraph inside one over blank lines is left; one on a line stays whole", async () => {
    const note = lines("%% a comment that goes on past the width of forty columns", "", "and closes here %%");
    expect(await wrap(note)).toBe(note);
    expect(await wrap(lines("Text %% an inline comment kept whole %% after."), 20)).toBe(
      lines("Text", "%% an inline comment kept whole %%", "after."),
    );
  });

  test("round trips: wrapping is steady, joining is steady, and either way back gives the other's", async () => {
    const notes = [
      lines(
        "- [x] Ship 2.3 with route sharing and the offline sync rewrite, after the release review",
        "  - Draft the notes: what changed, what moved, what to watch for in the first week",
        "",
        "> Malik: the queue stalled at 02:14 because the retry timer was never reset  ",
        "> after a failed sync, so every device waited on the one before it.",
        "",
        "Plain prose with a [link to the runbook](../runbooks/deploy.md) and `kubectl rollout restart` in it, which goes on.",
      ),
      lines("[^a]: A note on sources, which cites the second edition and its routing chapter at length."),
    ];
    for (const note of notes)
      for (const width of [20, 40, 72]) {
        const w = await wrap(note, width);
        const j = await join(note, width);
        expect(await wrap(w, width)).toBe(w);
        expect(await join(j, width)).toBe(j);
        expect(await join(w, width)).toBe(j);
        expect(await wrap(j, width)).toBe(w);
      }
  });
});
