// Rendering: snapshot the pure layout stage (0.4) and property-test the table allocator (2.3).

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { glyphsFor } from "../../../../../src/core/rendering/theme/glyphs.ts";
import { A_BOLD, type Layout } from "../../../../../src/core/rendering/layout/ir.ts";
import {
  type PictureSource,
  renderMarkdown,
  renderTree,
} from "../../../../../src/core/rendering/layout/markdown/render.ts";
import { dataLinks, parseData } from "../../../../../src/core/documents/model/data.ts";
import { classify } from "../../../../../src/core/documents/model/filetypes.ts";
import { parseNoteFile } from "../../../../../src/core/documents/model/readers.ts";
import { findHeading, headingFragment } from "../../../../../src/core/workspace/links/landing.ts";
import { headingsOf, parseMarkdown } from "../../../../../src/core/documents/markdown/parse.ts";
import { blend, listThemes, loadTheme } from "../../../../../src/core/rendering/theme/index.ts";
import { layoutWidth } from "../../../../../src/core/documents/model/note.ts";
import { stringWidth } from "../../../../../src/core/foundation/text/width.ts";
import { SAMPLES, samples, unicode, renderReady, text } from "../../../../support/render-layout.ts";
import { makeRenderSandbox } from "../../../../support/render-sandbox.ts";

makeRenderSandbox();

describe("snapshots of the layout IR as text", () => {
  for (const file of samples) {
    test(`${file} @ 80`, async () => {
      const src = readFileSync(join(SAMPLES, file), "utf8");
      expect(text(await renderReady(src, { width: 80, glyphs: unicode, showUrls: true }))).toMatchSnapshot();
    });
  }
  // The samples beyond markdown, each read by its own reader (16.11–16.13, 16.16, 16.17).
  const others = (readdirSync(SAMPLES, { recursive: true }) as string[])
    .filter(
      (f) =>
        /\.(toml|ya?ml|json|csv|tsv|ini|cfg|properties|env)$/.test(f) &&
        !/broken|photometry/.test(f) &&
        !f.split("/").includes(".slipbox"),
    )
    .sort(); // a vault's marker, nested ones too
  test("the samples beyond markdown are there", () => {
    expect(others.length).toBeGreaterThanOrEqual(6);
  });
  for (const file of others) {
    test(`${file} @ 80`, async () => {
      const src = readFileSync(join(SAMPLES, file), "utf8");
      const kind = classify(file, ["md"]);
      const parsed = kind.group === "data" ? parseData(kind.format, src) : { ...parseNoteFile(file, src), error: null };
      expect(parsed.error).toBeNull();
      expect(text(renderTree(parsed.tree, { width: 80, glyphs: unicode, showUrls: true }))).toMatchSnapshot();
    });
  }
  test("a big CSV: its first 2,000 rows as a table, the rest counted (logs/photometry-2026.csv)", () => {
    const src = readFileSync(join(SAMPLES, "logs", "photometry-2026.csv"), "utf8");
    const parsed = parseData("csv", src);
    expect(parsed.error).toBeNull();
    const t = parsed.tree.children[0] as unknown as {
      type: string;
      children: { position: { start: { line: number } } }[];
    };
    expect(t.type).toBe("table");
    expect(t.children.length).toBe(2001); // the header and 2,000 rows
    expect(t.children[2000]!.position.start.line).toBe(2001);
    const out = text(renderTree(parsed.tree, { width: 120, glyphs: unicode, showUrls: false }));
    expect(out).toContain("… 600 more rows");
    const cells = (t.children as unknown as { children: { children: { value?: string }[] }[] }[]).flatMap((r) =>
      r.children.map((c) => c.children[0]?.value ?? ""),
    );
    expect(cells).toContain('"comparison star C3, not C2"'); // doubled quotes read as one
  });
  test("wrap-probe @ 44 (narrow)", async () => {
    const src = readFileSync(join(SAMPLES, "scratch", "wrap-probe.md"), "utf8");
    expect(text(await renderReady(src, { width: 44, glyphs: unicode, showUrls: false }))).toMatchSnapshot();
  });
});

describe("blocks and inlines (2.2)", () => {
  const r = (md: string, width = 60) => text(renderMarkdown(md, { width, glyphs: unicode, showUrls: false }));
  test("headings, lists, tasks, quotes, rules", () => {
    expect(r("# Title\n\n- a\n  - b\n- [x] done\n- [ ] todo\n\n> quoted\n\n---\n")).toMatchSnapshot();
  });
  test("callouts", () => {
    expect(r("> [!warning] Mind the gap\n> Body text here.\n\n> [!NOTE]\n> Plain note.\n")).toMatchSnapshot();
  });
  test("code blocks are full width, labelled, and hard-wrapped", () => {
    const layout = renderMarkdown("```ts\nconst x = 1; // a comment that is long enough to wrap around\n```\n", {
      width: 40,
      glyphs: unicode,
      showUrls: false,
    });
    expect(layout.lines.every((l) => l.fill === "code_block")).toBe(true);
    expect(text(layout)).toMatchSnapshot();
    const roles = new Set(layout.lines.flatMap((l) => l.spans.map((s) => s.role)));
    expect(roles.has("syn_keyword")).toBe(true);
    expect(roles.has("syn_comment")).toBe(true);
    // A label wider than the row is cut with …: nothing left for the last defence to clip.
    const long = renderMarkdown("```a-very-long-language-name-that-is-wider-than-the-row\nx\n```\n", {
      width: 24,
      glyphs: unicode,
      showUrls: false,
    });
    expect(long.clipped ?? 0).toBe(0);
    expect(long.lines[0]!.spans.map((s) => s.text).join("")).toBe("a-very-long-language-n… ");
  });
  test("with codeScroll, a block too wide keeps each line whole on one row, to scroll sideways; in a list or a quote, from past its indent; one that fits, or printed, as before", () => {
    const long = "find . -name '*.md' -newer index.md | xargs grep -l 'TODO' | sort | uniq -c";
    const md = `\`\`\`sh\n${long}\nls\n\`\`\`\n`;
    const opts = { width: 40, glyphs: unicode, showUrls: false, codeScroll: true };
    const l = renderMarkdown(md, opts);
    expect(l.clipped).toBe(0);
    expect(l.lines.length).toBe(4); // the label, a row per line, the last row
    const scroll = { x: 1, w: 38, total: stringWidth(long) };
    expect(l.lines.map((x) => x.scroll)).toEqual([
      { ...scroll, part: "top" },
      scroll,
      scroll,
      { ...scroll, part: "bar" },
    ]);
    expect(l.lines[1]!.spans.map((x) => x.text).join("")).toBe(` ${long}`);
    expect(l.lines[1]!.spans.slice(1).every((x) => x.src === 2)).toBe(true);
    expect(text(l)).not.toContain("↪");
    expect(l.lines.every((x) => x.fill === "code_block")).toBe(true);
    // Inside a list item and a quote: where its code starts moves past what's before it.
    const inList = renderMarkdown(`- item\n\n  \`\`\`sh\n  ${long}\n  \`\`\`\n`, opts);
    const row = inList.lines.find((x) => x.scroll && !x.scroll.part)!;
    expect(row.scroll!.x).toBe(3);
    expect([...row.spans.map((x) => x.text).join("")].slice(3).join("")).toBe(long);
    const inQuote = renderMarkdown(`> \`\`\`sh\n> ${long}\n> \`\`\`\n`, opts);
    expect(inQuote.lines.find((x) => x.scroll && !x.scroll.part)!.scroll!.x).toBe(3);
    // Room for every line: no scroll, as before.
    expect(renderMarkdown("```sh\nls\n```\n", opts).lines.some((x) => x.scroll)).toBe(false);
    // Without it (what's printed; [render] code_wrap = "wrap"): wrapped, the rows after the first marked ↪.
    const wrapped = renderMarkdown(md, { ...opts, codeScroll: false });
    expect(wrapped.lines.some((x) => x.scroll)).toBe(false);
    expect(wrapped.lines.length).toBeGreaterThan(4);
    expect(wrapped.lines[2]!.spans[0]!.text).toBe("↪");
    // A display's maths too wide falls back to its code, which scrolls too.
    const maths = renderMarkdown(`$$\n${"x + ".repeat(30)}y\n$$\n`, opts);
    expect(text(maths)).toContain("math — too wide to draw");
    expect(maths.lines.some((x) => x.scroll && !x.scroll.part)).toBe(true);
  });
  test("escapes never reach the IR (2.9)", () => {
    const out = r("red \x1b[31mtext\x1b[0m and `\x1b]52;c;aGk=\x07code`");
    expect(out).not.toContain("\x1b");
    expect(out).toContain("red text");
  });
  test("links: statuses become roles; hard breaks and <br> split lines", () => {
    const layout = renderMarkdown("[a](a.md) [b](b.md) [[c]] [x](https://e.invalid)<br>next", {
      width: 60,
      glyphs: unicode,
      showUrls: false,
      resolveLink: (_k, t) => (t === "a.md" ? "resolved" : "unresolved"),
    });
    const roles = layout.lines[0]!.spans.filter((s) => s.link !== undefined).map((s) => s.role);
    expect(roles).toEqual(["link", "link_unresolved", "link_unresolved", "link"]); // [[c]] a link again (21.3)
    expect(layout.lines[0]!.spans.map((s) => s.text).join("")).toBe("a b c x");
    expect(layout.lines[1]!.spans.map((s) => s.text).join("")).toBe("next");
    expect(layout.links.map((l) => [l.line, l.col])).toEqual([
      [0, 0],
      [0, 2],
      [0, 4],
      [0, 6],
    ]);
  });
  test("Obsidian's ==highlight== on a background of its own, a link inside it too; `a == b`, `===x===`, `\\==y==` text; %%comments%% hidden — the space where one was made one, a paragraph of them no row, one over blank lines (a list's last line closing it) no rows", () => {
    const md =
      "%% Check with Mum. %%\n\nA ==splash of **vanilla** and [[Dal]]== here; a == b, ===x===, \\==y==.\nText %% a note %% goes on, %%across\nlines%% to the end, %%a last word%%\nthe last line %%really%%.\n\n%%\nA block, [[Dal]] in it:\n\n- over a blank line;\n- a list, the closing marks its last item's.\n%%\n\nAfter.\n";
    const layout = renderMarkdown(md, { width: 100, glyphs: unicode, showUrls: false, resolveLink: () => "resolved" });
    expect(text(layout)).toBe(
      "A splash of vanilla and Dal here; a == b, ===x===, ==y==. Text goes on, to the end, the last line.\n\nAfter.",
    );
    const spans = layout.lines[0]!.spans;
    expect(spans.filter((s) => s.role === "highlight" || s.bg === "highlight").map((s) => [s.text, s.role])).toEqual([
      ["splash of ", "highlight"],
      ["vanilla", "highlight"],
      [" and ", "highlight"],
      ["Dal", "wikilink"],
    ]);
    expect(spans.find((s) => s.text === "vanilla")!.attrs & A_BOLD).toBe(A_BOLD);
    // Rows keep their source lines: after a comment across lines, line 5's words; after one that ends a line, line 6's;
    // After. is line 15.
    expect(spans.find((s) => s.text.includes("to the end"))!.src).toBe(5);
    expect(spans.find((s) => s.text.includes("the last line"))!.src).toBe(6);
    expect(layout.lines.at(-1)!.src).toBe(15);
    // A comment over blank lines closes only at a `%%` of its own: an escaped one is text, and so is all of it.
    expect(text(renderMarkdown("%% opens\n\nends \\%%\n", { width: 60, glyphs: unicode, showUrls: false }))).toBe(
      "%% opens\n\nends %%",
    );
    // Only the links drawn are the layout's; a comment's are still the note's (what the index reads), only not drawn.
    expect(layout.links.map((l) => l.target)).toEqual(["Dal"]);
    expect(JSON.stringify(parseMarkdown(md).tree).match(/"wikiLink"/g)).toHaveLength(2);
    // Every theme draws it: a background, or reverse where there's no colour.
    for (const { name } of listThemes()) {
      const h = loadTheme(name).theme.roles.highlight;
      expect([name, !!(h.bg || h.inverse)]).toEqual([name, true]);
    }
  });
  test("a picture embedded by name: its name shown, an image's glyph; `|300`, `|240x180` its size, other words its alt", () => {
    const shown = (md: string) => {
      const l = renderMarkdown(md, { width: 60, glyphs: unicode, showUrls: false, resolveLink: () => "resolved" });
      return l.lines[0]!.spans.filter((s) => s.link !== undefined).map((s) => [s.text, s.role]);
    };
    const img = unicode.image;
    expect(shown("a ![[attachments/dal.png|300]] b")).toEqual([[`${img} dal.png`, "image"]]);
    expect(shown("a ![[flip.JPG|240x180]] b")).toEqual([[`${img} flip.JPG`, "image"]]);
    expect(shown("a ![[dal.png|the finished dal]] b")).toEqual([[`${img} the finished dal`, "image"]]);
    expect(shown("a ![[dal.png|dal for 4]] b")).toEqual([[`${img} dal for 4`, "image"]]);
    // Not a picture: a note's or a file's embed, its `|…` its words still.
    expect(shown("a ![[Dal|300]] ![[pantry.csv]] b")).toEqual([
      [`${unicode.embed} 300`, "embed"],
      [`${unicode.embed} pantry.csv`, "embed"],
    ]);
  });
  test("a picture embedded by name, alone in its paragraph, is asked for by its name and Obsidian's size (12.13); a note's embed, one beside text, a link to one, isn't", () => {
    const asked: PictureSource[] = [];
    const picture = (from: PictureSource) => (asked.push(from), { src: "/pictures/p.png", cols: 4, rows: 2 });
    const md =
      "![[dal.png]]\n\n![[a/dal.png|300]]\n\n![[flip.JPG|240x180]]\n\n![[dal.png|the finished dal]]\n\n![[Dal|300]]\n\nbeside ![[dal.png]] text\n\n[[dal.png]]\n";
    const l = renderMarkdown(md, { width: 60, glyphs: unicode, showUrls: false, picture });
    expect(asked).toEqual([
      { name: "dal.png", size: null },
      { name: "a/dal.png", size: { width: 300, height: null } },
      { name: "flip.JPG", size: { width: 240, height: 180 } },
      { name: "dal.png", size: null },
    ]);
    // Each picture precedes its boxed caption.
    const rows = l.lines.map((x) => (x.image ? "picture" : x.spans.map((s) => s.text).join("")));
    expect(rows.slice(0, 2)).toEqual(["picture", ""]);
    expect(l.lines[3]!.caption?.top).toBe(true);
    expect(rows[4]).toContain(`${unicode.image} dal.png`);
  });
  test("source lines survive wrapping (3.5 anchors on them)", () => {
    const layout = renderMarkdown("# H\n\npara one\nline two\n\nsecond para\n", {
      width: 6,
      glyphs: unicode,
      showUrls: false,
    });
    const srcs = layout.lines.filter((l) => l.spans.length).map((l) => l.src);
    expect(srcs[0]).toBe(1);
    expect(srcs).toContain(4);
    expect(srcs[srcs.length - 1]).toBe(6);
  });
  test("an unterminated escape in a code block keeps the block's lines and their source lines", () => {
    const layout = renderMarkdown("para\n\n```\nline one \x1b]0;title\nline two\nline three\n```\n\nafter\n", {
      width: 40,
      glyphs: unicode,
      showUrls: false,
    });
    const rows = layout.lines.map(
      (l) =>
        [
          l.src,
          l.spans
            .map((s) => s.text)
            .join("")
            .trim(),
        ] as const,
    );
    expect(rows.filter(([, t]) => t.startsWith("line"))).toEqual([
      [4, "line one"],
      [5, "line two"],
      [6, "line three"],
    ]);
    expect(rows.at(-1)).toEqual([9, "after"]);
  });
  test("frontmatter renders as properties, with the parse error when broken", () => {
    expect(r("---\ntitle: T\ntags: [a, b]\n---\n\nbody\n")).toMatchSnapshot();
    expect(r("---\ntitle: [unclosed\n---\n\nbody\n")).toContain("title: [unclosed");
  });
  test("a table that cannot fit collapses to records instead of overflowing", () => {
    const md = "| one | two | three | four | five |\n|---|---|---|---|---|\n| a | b | c | d | e |\n";
    const out = r(md, 24);
    expect(out).toMatch(/^one {4}a$/m);
    expect(out).toMatch(/^five {3}e$/m);
  });
});

describe("rows back to their source (the layout IR)", () => {
  test("what's at a column comes from its span's own line, else the row's; where a line's text starts", async () => {
    const { posOfSrc, srcAt } = await import("../../../../../src/core/rendering/layout/ir.ts");
    const l = renderMarkdown("# T\n\none\ntwo\nthree\n\n- a\n", { width: 40, glyphs: unicode, showUrls: false });
    const para = l.lines.find((x) => x.spans.some((s) => s.text === "two"))!;
    expect([0, 3, 4, 7, 8, 12].map((c) => srcAt(para, c))).toEqual([3, 4, 4, 5, 5, 5]); // one two three, one row of three lines
    expect(srcAt(para, 100)).toBe(3); // past the text: the row's
    const item = l.lines.find((x) => x.spans.some((s) => s.text === "a"))!;
    expect(srcAt(item, 0)).toBe(7); // the bullet has no line of its own: the row's
    expect(posOfSrc(l.lines, 4)).toEqual({ row: l.lines.indexOf(para), col: 4 });
    expect(posOfSrc(l.lines, 7)).toEqual({ row: l.lines.indexOf(item), col: 2 }); // its text, after the bullet
    expect(posOfSrc(l.lines, 2)).toBeNull(); // a blank line has no text
    expect(posOfSrc(l.lines, 99)).toBeNull();
  });
});

describe("deep nesting at the narrowest widths loses nothing (review cycle 2)", () => {
  const fixtures = [
    "> - a\n>   - b\n>\n>     | name | value |\n>     |---|---|\n>     | alpha | 1 |\n",
    "1. one\n   1. two\n      1. three\n\n         ```\n         code here\n         ```\n",
    "- - - - - 漢字\n",
    "> > > > quoted deeply with words\n",
    "text[^n]\n\n[^n]: - - a footnote in a list\n",
  ];
  for (const md of fixtures) {
    test(JSON.stringify(md.slice(0, 24)), () => {
      for (let width = 10; width <= 16; width++) {
        for (const glyphs of [glyphsFor("unicode"), glyphsFor("ascii")]) {
          const l = renderMarkdown(md, { width, glyphs, showUrls: false });
          expect(l.clipped).toBe(0);
          const shown = l.lines
            .map((x) => x.spans.map((sp) => sp.text).join(""))
            .join("")
            .replace(/[\s↪…]/g, "");
          // A word may wrap across rows (a record's value, a code line), with borders between the
          // pieces: every one of its letters must still be there, in order.
          const inOrder = (word: string) => {
            let at = 0;
            for (const ch of word) {
              at = shown.indexOf(ch, at);
              if (at < 0) return false;
              at++;
            }
            return true;
          };
          for (const word of ["alpha", "code", "here", "漢字", "deeply", "footnote"].filter((w) => md.includes(w))) {
            expect(inOrder(word)).toBe(true);
          }
        }
      }
    });
  }
});

describe("review cycle 2 (rendering)", () => {
  const lay = (md: string, width = 60, showUrls = false) =>
    renderMarkdown(md, { width, glyphs: glyphsFor("unicode"), showUrls });
  const rows = (l: Layout) =>
    l.lines.map((x) =>
      x.spans
        .map((s) => s.text)
        .join("")
        .trimEnd(),
    );
  test("every link drawn is placed: in a record's header, and a badge's outer link", () => {
    const records = lay("| [[Alpha]] | [b](http://b) | c |\n|---|---|---|\n| 1 | 2 | 3 |\n", 12);
    expect(records.links.every((l) => l.line >= 0)).toBe(true);
    const badge = lay("[![build](b.svg)](https://ci.example.org)\n");
    const ci = badge.links.find((l) => l.target === "https://ci.example.org")!;
    expect(ci.line).toBe(0);
    expect(badge.links.some((l) => l.target === "b.svg")).toBe(false); // the image is the link's text
  });
  test("soft breaks join Han and kana, never Hangul words or emoji", () => {
    expect(rows(lay("漢字\nかな"))[0]).toBe("漢字かな");
    expect(rows(lay("한국어\n문장"))[0]).toBe("한국어 문장");
    expect(rows(lay("Shipped 🎉\n🚀 next"))[0]).toBe("Shipped 🎉 🚀 next");
  });
  test("with URLs shown, a URL the text already is isn't repeated", () => {
    expect(rows(lay("visit www.example.com\n", 60, true))[0]).toBe("visit www.example.com");
    expect(rows(lay("[](https://empty.example.org)\n", 60, true))[0]).toBe("https://empty.example.org");
    expect(rows(lay("[docs](https://docs.example.org)\n", 60, true))[0]).toContain("<https://docs.example.org>");
  });
  test("the mono theme (NO_COLOR) marks links and code, and link statuses differ", () => {
    const mono = loadTheme("mono").theme;
    for (const r of ["link", "wikilink", "link_unresolved", "code_inline", "footnote", "image"] as const) {
      const st = mono.roles[r];
      expect(!!(st.bold || st.italic || st.underline || st.dim)).toBe(true);
    }
    expect(JSON.stringify(mono.roles.link_unresolved)).not.toBe(JSON.stringify(mono.roles.wikilink));
  });
});

describe("review cycle 4 (markdown against the specs)", () => {
  const lay = (md: string, width = 60) => renderMarkdown(md, { width, glyphs: glyphsFor("unicode"), showUrls: false });
  const rows = (l: Layout) =>
    l.lines.map((x) =>
      x.spans
        .map((s) => s.text)
        .join("")
        .trimEnd(),
    );
  test("a heading's text and slug are the outline's: no footnote marks or image glyphs; repeats share a slug", () => {
    const l = lay("# Title[^1]\n\n# ![logo](l.png) Project\n\n# A\n\n# A\n\n[^1]: n\n");
    expect(l.headings.map((h) => [h.text, h.slug])).toEqual([
      ["Title", "title"],
      ["Project", "project"],
      ["A", "a"],
      ["A", "a"],
    ]);
  });
  test("footnote definitions are marked by identifier, with their paragraphs apart", () => {
    const l = lay("See[^Note].\n\n[^Note]: First.\n\n    Second.\n");
    expect(l.lines.find((x) => x.footnoteDef !== undefined)?.footnoteDef).toBe("note");
    const r = rows(l);
    expect(r[r.findIndex((x) => x.includes("First.")) + 1]).toBe("");
  });
  test("no-break spaces don't break; text between comments stays; the first definition wins", () => {
    expect(rows(lay("aaaa bbbb 10\u00a0km cccc\n", 12))).toEqual(["aaaa bbbb", "10\u00a0km cccc"]);
    expect(rows(lay("<!-- a --> middle <!-- b -->\n")).join("")).toContain("middle");
    expect(lay("[foo]\n\n[foo]: /first\n[foo]: /second\n").links[0]!.target).toBe("/first");
  });
  test("numbered tasks keep their numbers; indented code reports its own lines", () => {
    expect(rows(lay("1. [ ] a\n2. [x] b\n"))[0]).toMatch(/^1\. /);
    const code = lay("text\n\n    code1\n    code2\n");
    const c1 = code.lines.find((x) =>
      x.spans
        .map((s) => s.text)
        .join("")
        .includes("code1"),
    )!;
    expect(c1.src).toBe(3);
  });
});

describe("review cycle 5 (render, from mutation testing)", () => {
  test("an escape before a tab in a code block doesn't move the tab stop", () => {
    const rows = (code: string) =>
      renderMarkdown(`\`\`\`\n${code}\n\`\`\`\n`, {
        width: 60,
        glyphs: glyphsFor("unicode"),
        showUrls: false,
      }).lines.map((l) => l.spans.map((s) => s.text).join(""));
    expect(rows("ab\x1b[31mcd\x1b[0mef\tgh")).toEqual(rows("abcdef\tgh"));
  });
});

describe("review cycle 5 (render: what the snapshots can't see)", () => {
  test("each callout kind takes its own role; GitHub's capitals too; TOML frontmatter is a properties block", () => {
    const roleOf = (kind: string) => {
      const l = renderMarkdown(`> [!${kind}] T\n> body\n`, {
        width: 60,
        glyphs: glyphsFor("unicode"),
        showUrls: false,
      });
      return l.lines[0]!.spans.find((s) => s.role.startsWith("callout_"))?.role;
    };
    expect(roleOf("note")).toBe("callout_note");
    expect(roleOf("tip")).toBe("callout_tip");
    expect(roleOf("IMPORTANT")).toBe("callout_important");
    expect(roleOf("warning")).toBe("callout_warning");
    expect(roleOf("caution")).toBe("callout_caution");
    expect(roleOf("bug")).toBe("callout_caution");
    // Lookalikes stay quotes: unclosed, a space after the !, no !, and an escaped bracket — the
    // author wanted the brackets — in a quote inside a list too (the escape is only in the source).
    for (const src of ["> [!note text\n", "> [! note] t\n", "> [note]\n", "> \\[!note] t\n", "- > \\[!tip] t\n"]) {
      const l = renderMarkdown(src, { width: 60, glyphs: glyphsFor("unicode"), showUrls: false });
      expect(l.lines.flatMap((x) => x.spans.map((sp) => sp.role)).some((r) => r.startsWith("callout_"))).toBe(false);
      expect(l.lines.map((x) => x.spans.map((sp) => sp.text).join("")).join("\n")).toContain("[");
    }
    const fm = renderMarkdown('+++\ntitle = "T"\ntags = ["a"]\n+++\n\nx\n', {
      width: 60,
      glyphs: glyphsFor("unicode"),
      showUrls: false,
    });
    const rows = fm.lines.map((l) => l.spans.map((s) => s.text).join(""));
    expect(rows[0]).toContain("properties");
    expect(rows.some((r) => /title\s+T/.test(r))).toBe(true);
    expect(rows.some((r) => r.includes("+++"))).toBe(false);
  });
});

describe("narrow panes: embeds, callouts and data trees cut nothing (review cycle 1, 21.x)", () => {
  const unicodeG = glyphsFor("unicode");
  const fits = (l: Layout, what: string) => {
    if (l.clipped) throw new Error(`${what} @${l.width}: ${l.clipped} row(s) had to be clipped`);
    for (const [i, line] of l.lines.entries()) {
      const w = line.spans.reduce((a, s) => a + stringWidth(s.text), 0);
      if (w > l.width) throw new Error(`${what} @${l.width}: row ${i} is ${w} wide`);
    }
  };
  test("an embed of a note with a table and a list, nested or not, at widths 6 to 24", () => {
    const inner = parseNoteFile("inner.md", "| name | value |\n|---|---|\n| alpha | 1 |\n\n- one\n  - two words here\n")
      .tree.children;
    const embed = () => ({ path: "/v/inner.md", title: "inner", nodes: inner });
    for (const md of ["![[inner]]\n", "- a\n  - ![[inner]]\n", "> > > ![[inner]]\n"]) {
      for (let width = 6; width <= 24; width++) {
        for (const glyphs of [unicodeG, glyphsFor("ascii")])
          fits(renderMarkdown(md, { width, glyphs, showUrls: false, embed }), JSON.stringify(md));
      }
    }
  });
  test("a callout too narrow for its bar keeps its text's room, as a quote does", () => {
    const l = renderMarkdown("> [!warning] Warning\n> > [!note] Inner\n> > > [!tip] Deep words here\n", {
      width: 8,
      glyphs: unicodeG,
      showUrls: false,
    });
    fits(l, "callouts");
    const shown = l.lines.map((x) =>
      x.spans
        .map((s) => s.text)
        .join("")
        .trim(),
    );
    expect(shown.some((r) => r.includes("Warning"))).toBe(true); // not wrapped two columns wide
    expect(shown.some((r) => r.includes("words"))).toBe(true);
  });
  test("a deep data tree with records, and the reference set's data files, at 8 to 37", () => {
    const deep = parseData(
      "yaml",
      "a:\n  b:\n    c:\n      d:\n        e:\n          f:\n            long_key_name: a value of several words\n            records:\n              - name: alpha\n                value: 1\n              - name: beta\n                value: 2\n            # a comment\n            k: v\n",
    );
    expect(deep.error).toBeNull();
    const HOME = join(import.meta.dir, "../../../../..", "examples", "home");
    // The trees and key-value files under 64 KB (a CSV is one table, the big ones slow to sweep).
    const files = (readdirSync(HOME, { recursive: true }) as string[])
      .filter(
        (f) =>
          !f.split("/").includes(".slipbox") &&
          classify(f, ["md"]).group === "data" &&
          !/\.(csv|tsv)$/.test(f) &&
          statSync(join(HOME, f)).size < 65_536,
      )
      .sort();
    expect(files.length).toBeGreaterThan(20);
    const trees = [
      ["deep.yaml", deep.tree] as const,
      ...files.flatMap((f) => {
        const p = parseData(classify(f, ["md"]).format, readFileSync(join(HOME, f), "utf8"));
        return p.error ? [] : [[f, p.tree] as const];
      }),
    ];
    for (const [name, tree] of trees) {
      for (const width of [8, 12, 16, 20, 24, 37]) {
        for (const glyphs of [unicodeG, glyphsFor("ascii")])
          fits(renderTree(tree, { width, glyphs, showUrls: false }), name);
      }
    }
  });
});

describe("headings: the render, the graph and source mode read one text (review cycle 2, render)", () => {
  const md = "## Setup [^1] notes\n\n## Logo ![l](l.png) Title\n\n## a  b\n\n## Trailing [^1]\n\n[^1]: a note\n";
  test("the layout's headings are headingsOf's, inner white space kept, and a fragment lands", () => {
    const graph = headingsOf(parseMarkdown(md).tree);
    const layout = renderMarkdown(md, { width: 60, glyphs: unicode, showUrls: false }).headings;
    expect(layout.map((h) => [h.text, h.slug])).toEqual(graph.map((h) => [h.text, h.slug]));
    expect(graph.map((h) => h.slug)).toEqual(["setup--notes", "logo--title", "a--b", "trailing"]);
    // What jumpToHeading does with a fragment slipbox writes from the graph's headings.
    const heads = layout.map((h) => ({ depth: h.level, text: h.text, slug: h.slug, line: h.src, id: h.id }));
    graph.forEach((g, i) => expect(findHeading(heads, [], headingFragment(graph, i))?.line).toBe(g.line));
  });
});

describe("an HTML block's comments (review cycle 2, render)", () => {
  test("a comment over several lines keeps the rows after it on their source lines, and leaves no row", () => {
    const l = renderMarkdown("# T\n\n<div>\n<!-- a note\nspanning lines -->\n<p>x</p>\n<!-- one line -->\n</div>\n", {
      width: 60,
      glyphs: unicode,
      showUrls: false,
    });
    const rows = l.lines
      .filter((x) => x.src >= 3)
      .map((x) => [
        x.src,
        x.spans
          .map((s) => s.text)
          .join("")
          .trimEnd(),
      ]);
    expect(rows).toEqual([[6, "x"]]);
  });
});

describe("links inside a data file's records (review cycle 2, render)", () => {
  const cases: [format: string, text: string, targets: string[], lines: number[]][] = [
    [
      "yaml",
      "schemas:\n  - name: user\n    $ref: schemas/user.json\n  - name: post\n    $ref: schemas/post.json\n",
      ["schemas/user.json", "schemas/post.json"],
      [2, 4],
    ],
    ["toml", '[[include]]\npath = "a.toml"\n[[include]]\npath = "b.toml"\n', ["a.toml", "b.toml"], [1, 3]],
    [
      "json",
      '{"servers": [\n  {"name": "a", "url": "https://a.example"},\n  {"name": "b", "url": "https://b.example"}\n]}\n',
      ["https://a.example", "https://b.example"],
      [2, 3],
    ],
  ];
  for (const [format, text, targets, lines] of cases) {
    test(`${format}: the graph reads them and the render draws them as links`, () => {
      const { tree, error } = parseData(format, text);
      expect(error).toBeNull();
      expect(tree.children.some((n) => n.type === "table")).toBe(true); // still a table
      expect(dataLinks(tree).map((l) => [l.target, l.line, l.explicit])).toEqual(
        targets.map((t, i) => [t, lines[i]!, true]),
      );
      const l = renderTree(tree, { width: 80, glyphs: unicode, showUrls: false, resolveLink: () => "unresolved" });
      expect(l.links.map((x) => [x.target, x.status])).toEqual(
        targets.map((t) => [t, t.startsWith("https:") ? "external" : "unresolved"]),
      );
      // Each drawn on its record's row, a span carrying the link.
      for (const [i, link] of l.links.entries()) {
        const row = l.lines[link.line]!;
        expect(row.src).toBe(lines[i]!);
        expect(row.spans.some((sp) => sp.link === i && sp.text === targets[i])).toBe(true);
      }
    });
  }
  test("a path-like value in a record is a link only when it resolves, as a field's is", () => {
    const { tree } = parseData("yaml", "files:\n  - name: a\n    doc: docs/a.md\n  - name: b\n    doc: docs/b.md\n");
    expect(dataLinks(tree).map((l) => [l.target, l.key, l.explicit])).toEqual([
      ["docs/a.md", "doc", false],
      ["docs/b.md", "doc", false],
    ]);
    const l = renderTree(tree, {
      width: 80,
      glyphs: unicode,
      showUrls: false,
      resolveLink: (_k, t) => (t === "docs/a.md" ? "resolved" : "unresolved"),
    });
    expect(l.links.map((x) => x.target)).toEqual(["docs/a.md"]);
  });
});

describe("what rendering.md promises (review: docs against the tests)", () => {
  const rows = (md: string, width = 60) =>
    renderMarkdown(md, { width, glyphs: unicode, showUrls: false }).lines.map((l) =>
      l.spans.map((s) => s.text).join(""),
    );
  test("records: the labels' column is a third of the width at most, a long label wrapping inside it", () => {
    const md =
      "| a rather long column label | two | three | four | five |\n|---|---|---|---|---|\n| a | b | c | d | e |\n";
    const out = rows(md, 24);
    expect(out.every((r) => stringWidth(r) <= 24)).toBe(true);
    // floor(24 / 3) = 8 columns of label, two of gap: every value starts at column 10.
    expect(out.slice(1, 5).map((r) => r.trimEnd())).toEqual(["a rather  a", "long", "column", "label"]);
    expect(out.find((r) => r.startsWith("two"))).toBe("two       b");
  });
  test("tabs expand in code and frontmatter; HTML prose collapses whitespace", () => {
    const out = rows("```\na\tb\n```\n\n`a\tb` x\n\n<div>\nc\td\n</div>\n");
    expect(out).toContain(" a   b"); // the code block's own one-column margin, then a stop of 4
    expect(out).toContain("a b x"); // inline code: a stop of 2
    expect(out.join("\n")).toContain("c d"); // HTML prose collapses whitespace
    // Frontmatter that doesn't parse is shown as written, its tabs expanded too.
    expect(rows("---\ntitle: [x\n\tq\n---\n\nbody\n")).toContain("     q");
  });
  test("readability defaults (2.7): the inset, capped at 5% of a narrow pane and never below 1", () => {
    expect(layoutWidth(120, 4)).toBe(116); // the default inset, whole
    expect(layoutWidth(60, 4)).toBe(57); // 5% of 60
    expect(layoutWidth(30, 4)).toBe(29); // 5% of 30, rounded down
    expect(layoutWidth(15, 4)).toBe(14); // 5% of 15 rounds to 0: never below 1
    expect(layoutWidth(120, 4, 80)).toBe(80); // render.max_width caps what's left
  });
  test("readability defaults (2.7): Tokyo Night's bold and inline code; every theme's heading bands blended 14% (dark) or 16% (light)", () => {
    const tn = loadTheme("tokyo-night").theme;
    expect(tn.roles.strong).toMatchObject({ fg: "#c0caf5", bold: true });
    expect(tn.roles.code_inline).toMatchObject({ fg: "#c0caf5", bg: "#292e42", italic: true });
    const kinds = new Set<string>();
    for (const { name } of listThemes()) {
      const t = loadTheme(name).theme;
      if (!t.bg.startsWith("#")) continue; // the terminal's and mono have no colours to blend
      kinds.add(t.kind);
      for (const h of ["h1", "h2", "h3", "h4", "h5", "h6"] as const) {
        expect([name, h, t.roles[h].bg]).toEqual([
          name,
          h,
          blend(t.roles[h].fg!, t.bg, t.kind === "dark" ? 0.14 : 0.16),
        ]);
      }
    }
    expect([...kinds].sort()).toEqual(["dark", "light"]);
  });
});
