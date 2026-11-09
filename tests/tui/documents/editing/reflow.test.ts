import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Config } from "../../../../src/core/application/config/config.ts";
import { offsetOf } from "../../../../src/tui/documents/editing/editing.ts";
import { makeSandbox, makeVault, harness, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

const lines = (...l: string[]) => `${l.join("\n")}\n`;

/** A list item, a quote and a paragraph, each on one line past 40 columns. */
const NOTE = lines(
  "# Packing",
  "",
  "- [ ] Book the rail pass and print the voucher with both booking numbers on it",
  "",
  "> Aiko said the queue stalled because the retry timer was never reset",
  "",
  "The route engine keeps a cache of [tiles near each rider](tiles.md), refreshed as they ride.",
);
const WRAPPED = lines(
  "# Packing",
  "",
  "- [ ] Book the rail pass and print the",
  "  voucher with both booking numbers on",
  "  it",
  "",
  "> Aiko said the queue stalled because",
  "> the retry timer was never reset",
  "",
  "The route engine keeps a cache of",
  "[tiles near each rider](tiles.md),",
  "refreshed as they ride.",
);

describe("reflow in the editor (EG-D12)", () => {
  const open = async (files: Record<string, string>, file: string, line = 1, config?: (c: Config) => void) => {
    const root = makeVault();
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), text);
    }
    const h = await harness({ root, open: file, config });
    if (!h.app.view!.source) await h.keys("ctrl+k");
    await h.app.run(`cursor.goto_line ${line}`);
    return h;
  };
  const text = (h: Harness) => h.app.view!.buf.source;
  const said = (h: Harness) => h.app.messages.at(-1)?.text ?? "";
  /** The cursor's line (from 1) and column (from 0), in the text. */
  const where = (h: Harness) => {
    const at = h.app.view!.buf.lineStarts();
    const offset = offsetOf(h.app, h.app.view!);
    const n = at.findLastIndex((s) => s <= offset);
    return [n + 1, offset - at[n]!];
  };
  const source = async (h: Harness) => {
    if (!h.app.view!.source) await h.keys("ctrl+k");
  };
  const width40 = (c: Config) => {
    c.editor.text_width = 40;
  };

  test("g q i p wraps a list item, a quote and a paragraph; g shift+q i p joins each back; u undoes each in one step", async () => {
    const h = await open({ "pack.md": NOTE }, "pack.md", 3, width40);
    await h.keys("g", "q", "i", "p");
    await h.app.run("cursor.goto_line 7");
    await h.keys("g", "q", "i", "p");
    await h.app.run("cursor.goto_line 10");
    await h.keys("g", "q", "i", "p");
    expect(text(h)).toBe(WRAPPED);
    expect(said(h)).toBe("wrapped 1 paragraph to 40 columns (editor.text_width)");
    // The cursor on the last line wrapped, at its first non-blank.
    expect(where(h)).toEqual([12, 0]);
    // Back, each to one line, from the last.
    await h.keys("g", "shift+q", "i", "p");
    await h.app.run("cursor.goto_line 7");
    await h.keys("g", "shift+q", "i", "p");
    expect(where(h)).toEqual([7, 0]);
    await h.app.run("cursor.goto_line 4");
    await h.keys("g", "shift+q", "i", "p");
    expect(text(h)).toBe(NOTE);
    expect(said(h)).toBe("unwrapped 1 paragraph, each to one line");
    // One undo step each.
    await h.keys("u");
    expect(text(h)).toBe(lines(...WRAPPED.split("\n").slice(0, 6), ...NOTE.split("\n").slice(4, 7)));
    await h.keys("u", "u");
    expect(text(h)).toBe(WRAPPED);
  });

  test("g q q and a count; . does it again; a selection's g q and g shift+q; nothing to do is said", async () => {
    const h = await open({ "pack.md": NOTE }, "pack.md", 3, width40);
    await h.keys("g", "q", "q");
    expect(text(h).split("\n").slice(2, 5)).toEqual(WRAPPED.split("\n").slice(2, 5));
    // . on the quote: the same there.
    await h.app.run("cursor.goto_line 7");
    await h.keys(".");
    expect(text(h).split("\n").slice(6, 8)).toEqual(WRAPPED.split("\n").slice(6, 8));
    // A selection of the lines, joined; then wrapped again with g q.
    await h.app.run("cursor.goto_line 3");
    await h.keys("shift+v", "4", "j", "g", "shift+q");
    expect(h.app.view!.visual).toBeFalsy();
    expect(text(h)).toBe(
      NOTE.replace(WRAPPED.split("\n").slice(9).join("\n"), WRAPPED.split("\n").slice(9).join("\n")),
    );
    expect(said(h)).toBe("unwrapped 2 paragraphs, each to one line");
    await h.app.run("cursor.goto_line 3");
    await h.keys("shift+v", "shift+g", "g", "q");
    expect(text(h)).toBe(WRAPPED);
    // Again: already so, said; a heading has no paragraph.
    await h.app.run("cursor.goto_line 3");
    await h.keys("3", "g", "q", "q");
    expect(said(h)).toBe("1 paragraph already wrapped to 40 columns (editor.text_width)");
    await h.app.run("cursor.goto_line 1");
    await h.keys("g", "q", "q");
    expect(said(h)).toContain("no paragraph here to reflow");
    expect(text(h)).toBe(WRAPPED);
    // Doubled, g shift+q takes the line's paragraph.
    await h.app.run("cursor.goto_line 4");
    await h.keys("g", "shift+q", "shift+q");
    expect(text(h).split("\n").slice(0, 5)).toEqual([
      ...NOTE.split("\n").slice(0, 3),
      ...WRAPPED.split("\n").slice(5, 7),
    ]);
  });

  test(":reflow [width] and :unwrap: the cursor's paragraph, a range, the selection's lines typed for you", async () => {
    const h = await open({ "pack.md": NOTE }, "pack.md", 3, width40);
    await h.app.run("edit.reflow 50");
    expect(text(h).split("\n").slice(2, 4)).toEqual([
      "- [ ] Book the rail pass and print the voucher",
      "  with both booking numbers on it",
    ]);
    expect(said(h)).toBe("wrapped 1 paragraph to 50 columns (:reflow 50)");
    await h.app.run("edit.unwrap");
    expect(text(h)).toBe(NOTE);
    // %: the whole note, at the width from the settings.
    await h.app.run("edit.reflow %");
    expect(text(h)).toBe(WRAPPED);
    await h.app.run("edit.unwrap 1,20");
    expect(text(h)).toBe(NOTE);
    // From a selection, the palette types '<,'> before the command, and its lines are the range.
    await h.app.run("cursor.goto_line 5");
    await h.keys("shift+v", "2", "j", ":");
    for (const ch of "reflow 30") await h.keys(ch === " " ? "space" : ch);
    await h.keys("enter");
    expect(h.app.view!.visual).toBeFalsy();
    expect(text(h)).toBe(
      NOTE.replace(
        "> Aiko said the queue stalled because the retry timer was never reset\n\nThe route engine keeps a cache of [tiles near each rider](tiles.md), refreshed as they ride.",
        "> Aiko said the queue stalled\n> because the retry timer was\n> never reset\n\nThe route engine keeps a cache\nof\n[tiles near each rider](tiles.md),\nrefreshed as they ride.",
      ),
    );
    // A width that isn't one is said; :unwrap takes none.
    await h.app.run("edit.reflow wide");
    expect(said(h)).toContain(":reflow takes a width of 1 to 1000 columns");
    await h.app.run("edit.unwrap 30");
    expect(said(h)).toBe(":unwrap takes no width (30)");
  });

  test("the width from the file's markdownlint config, else its .editorconfig, else 80; a code file has no paragraphs", async () => {
    const long = lines(`${"word ".repeat(40).trim()}`);
    const h = await open(
      {
        "docs/.markdownlint-cli2.jsonc": '// ours\n{ "config": { "MD013": { "line_length": 60 } } }',
        "docs/guide.md": long,
        "other/.editorconfig": "[*.md]\nmax_line_length = 50\n",
        "other/note.md": long,
        "plain.md": long,
        "code.ts": `const a = "${"x ".repeat(50)}";\n`,
      },
      "docs/guide.md",
    );
    await h.keys("g", "q", "q");
    expect(
      Math.max(
        ...text(h)
          .split("\n")
          .map((l) => l.length),
      ),
    ).toBe(59);
    expect(said(h)).toBe("wrapped 1 paragraph to 60 columns (MD013 in docs/.markdownlint-cli2.jsonc)");
    await h.app.run("file.open other/note.md");
    await source(h);
    await h.keys("g", "q", "q");
    expect(said(h)).toBe("wrapped 1 paragraph to 50 columns (.editorconfig)");
    await h.app.run("file.open plain.md");
    await source(h);
    await h.keys("g", "q", "q");
    expect(said(h)).toBe("wrapped 1 paragraph to 80 columns (the default)");
    await h.app.run("file.open code.ts");
    await source(h);
    const before = text(h);
    await h.keys("g", "q", "q");
    expect(said(h)).toBe("reflow wraps a Markdown note's paragraphs — this file has none");
    expect(text(h)).toBe(before);
  });
});
