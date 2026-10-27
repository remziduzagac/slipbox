import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runCli } from "../../../../src/cli/cli.ts";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { applyPlan, planUndo } from "../../../../src/core/workspace/mutations/rename/rename.ts";
import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";

import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("the converter: links made plain paths (20.1)", () => {
  let made = 0;
  const vault = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), `slipbox-convert-${++made}-`));
    mkdirSync(join(dir, ".slipbox"));
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(join(dir, rel, ".."), { recursive: true });
      writeFileSync(join(dir, rel), text);
    }
    return { dir, g: openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true) };
  };
  const B = "# B\n\n## Second Part\n\nA paragraph ^blk\n";

  test("each form: relative to the note, text kept, headings as checked slugs, blocks, anchors, sizes; what can't be, left and said", async () => {
    const { planConvert } = await import("../../../../src/core/workspace/links/convert.ts");
    const { g } = vault({
      "notes/a.md": [
        "---",
        'related: "[[b]]"',
        "---",
        "# A",
        "",
        "Plain [[b]], aliased [[b|the B]], heading [[b#Second Part]], block [[b#^blk]] and [[b^blk]].",
        "Here: [[#Local]]. Spaces: [[with space]]. Root: [r](/c/c.md#top), [web](/missing.md).",
        "![[img/pic.png|300]]",
        "",
        "![[b#Second Part]]",
        "",
        "Code `[[b]]` stays; [[nope]], ![[gone.png]], [[b#No Such]] and [[b#^none]] stay.",
        "",
        "| a | b |",
        "| --- | --- |",
        "| [[b\\|in a table]] | x |",
        "",
        "## Local",
        "",
      ].join("\n"),
      "b.md": B,
      "img/pic.png": "png",
      "c/c.md": "# C\n",
      "c/with space.md": "# W\n",
    });
    // A `/…` link naming the filesystem's own path already means what it will: left.
    writeFileSync(join(g.root, "notes", "abs.md"), `[abs](${join(g.root, "c", "c.md")})\n`);
    g.build(true);
    expect(planConvert(g, ["notes/abs.md"]).files).toEqual([]);
    const plan = planConvert(g);
    expect(plan.kind).toBe("convert");
    expect(plan.files.map((f) => f.shown)).toEqual(["notes/a.md"]);
    expect(plan.files[0]!.next.split("\n")).toEqual([
      "---",
      'related: "[[b]]"', // frontmatter: no link to the index, left
      "---",
      "# A",
      "",
      "Plain [b](../b.md), aliased [the B](../b.md), heading [b › Second Part](../b.md#second-part), block [b › ^blk](../b.md#^blk) and [b › ^blk](../b.md#^blk).",
      "Here: [Local](#local). Spaces: [with space](../c/with%20space.md). Root: [r](../c/c.md#top), [web](/missing.md).",
      "![pic.png|300](../img/pic.png)",
      "",
      "![b › Second Part](../b.md#second-part)",
      "",
      "Code `[[b]]` stays; [[nope]], ![[gone.png]], [[b#No Such]] and [[b#^none]] stay.",
      "",
      "| a | b |",
      "| --- | --- |",
      "| [in a table](../b.md) | x |",
      "",
      "## Local",
      "",
    ]);
    expect(plan.skipped.map((s) => s.reason).sort()).toEqual([
      '![[gone.png]]: no file "gone.png" — left as it is',
      "/missing.md: nothing there — left as it is",
      '[[b#No Such]]: no heading "No Such" there — left as it is',
      "[[b#^none]]: no block ^none there — left as it is",
      '[[nope]]: no note named "nope" — left as it is',
    ]);
    expect(plan.ambiguous).toEqual([]);
  });

  test("a link several notes answer to: listed with its candidates, left; picked, converted", async () => {
    const { planConvert } = await import("../../../../src/core/workspace/links/convert.ts");
    const { g } = vault({ "r.md": "See [[dup]].\n", "x/dup.md": "# X\n", "y/dup.md": "# Y\n" });
    const plan = planConvert(g);
    expect(plan.files).toEqual([]);
    expect(plan.ambiguous).toEqual([
      { key: "r.md:1:5", shown: "r.md", line: 1, written: "[[dup]]", candidates: ["x/dup.md", "y/dup.md"] },
    ]);
    const picked = planConvert(g, undefined, new Map([["r.md:1:5", "y/dup.md"]]));
    expect(picked.ambiguous).toEqual([]);
    expect(picked.files[0]!.next).toBe("See [dup](y/dup.md).\n");
    // A pick that isn't one of its candidates is no pick.
    expect(planConvert(g, undefined, new Map([["r.md:1:5", "elsewhere.md"]])).ambiguous).toHaveLength(1);
  });

  test("written only as planned (a file changed since is refused, nothing written); undone byte for byte; one note alone", async () => {
    const { planConvert } = await import("../../../../src/core/workspace/links/convert.ts");
    const { dir, g } = vault({ "a.md": "[[b]] and [[b]]\n", "c.md": "[[b]]\n", "b.md": B });
    const stale = planConvert(g);
    writeFileSync(join(dir, "c.md"), "[[b]] edited\n");
    expect(() => applyPlan(g, stale)).toThrow("c.md changed since the preview; nothing changed");
    expect(readFileSync(join(dir, "a.md"), "utf8")).toBe("[[b]] and [[b]]\n");
    g.build(true);
    // Wikilinks are read from the file as it is: an index older than it changes nothing.
    writeFileSync(join(dir, "a.md"), "[[b]] gone\n");
    expect(planConvert(g, ["a.md"]).files[0]!.next).toBe("[b](b.md) gone\n");
    // A link from the root is the index's: two it knows, one left on the line — the one there
    // converted, the other said, never written twice.
    writeFileSync(join(dir, "r.md"), "[x](/b.md) and [x](/b.md)\n");
    g.build(true);
    writeFileSync(join(dir, "r.md"), "[x](/b.md) gone\n");
    const older = planConvert(g, ["r.md"]);
    expect(older.files[0]!.next).toBe("[x](b.md) gone\n");
    expect(older.skipped.map((s) => s.reason)).toEqual(["/b.md: not where the index has it (the file changed since)"]);
    writeFileSync(join(dir, "r.md"), "nothing here\n");
    writeFileSync(join(dir, "a.md"), "[[b]] and [[b]]\n");
    // One note's links only.
    expect(planConvert(g, ["a.md"]).files.map((f) => [f.shown, f.next])).toEqual([
      ["a.md", "[b](b.md) and [b](b.md)\n"],
    ]);
    applyPlan(g, planConvert(g));
    expect(readFileSync(join(dir, "a.md"), "utf8")).toBe("[b](b.md) and [b](b.md)\n");
    expect(readFileSync(join(dir, "c.md"), "utf8")).toBe("[b](b.md) edited\n");
    g.build(true);
    const undo = planUndo(g);
    expect(undo.kind).toBe("convert");
    applyPlan(g, undo);
    expect(readFileSync(join(dir, "a.md"), "utf8")).toBe("[[b]] and [[b]]\n");
    expect(readFileSync(join(dir, "c.md"), "utf8")).toBe("[[b]] edited\n");
  });

  test("links from the root found in their own span (a shorter one first on the line; an image inside a link); reference links by their definition, once", async () => {
    const { planConvert } = await import("../../../../src/core/workspace/links/convert.ts");
    const { g } = vault({
      "n/a.md": [
        "[a](/c/c.md)[a much longer text than the first link has](/c/c.md)",
        "[![i](/c/c.md)](/c/c.md)",
        "",
        "[x][r] and [y][r]; [z][s].",
        "",
        "[r]: /c/c.md",
        "[s]: </c/c.md#top>",
        "",
      ].join("\n"),
      "c/c.md": "# C\n",
    });
    const plan = planConvert(g);
    expect(plan.skipped).toEqual([]);
    expect(plan.files[0]!.next.split("\n")).toEqual([
      "[a](../c/c.md)[a much longer text than the first link has](../c/c.md)",
      "[![i](../c/c.md)](../c/c.md)",
      "",
      "[x][r] and [y][r]; [z][s].",
      "",
      "[r]: ../c/c.md",
      "[s]: <../c/c.md#top>",
      "",
    ]);
  });

  test("a link's text stays literal: what markdown would act on in a label is escaped; a table's | too; a heading with no slug is left", async () => {
    const { planConvert } = await import("../../../../src/core/workspace/links/convert.ts");
    const { parseMarkdown } = await import("../../../../src/core/documents/markdown/parse.ts");
    const { g } = vault({
      "a.md":
        "[[b|a\\]] [[b|2*3*4]] [[b|x<y>]] [[b|`c`]] [[b|snake_case and _x_]] [[b|a & b ~ c]]\n\n| p |\n| --- |\n| ![[pic.png\\|300]] |\n\n[[e#🎉]]\n",
      "b.md": B,
      "e.md": "# E\n\n## 🎉\n",
      "pic.png": "png",
    });
    const plan = planConvert(g);
    const out = plan.files[0]!.next;
    expect(out.split("\n")[0]).toBe(
      "[a\\\\](b.md) [2\\*3\\*4](b.md) [x\\<y>](b.md) [\\`c\\`](b.md) [snake_case and \\_x\\_](b.md) [a \\& b \\~ c](b.md)",
    );
    // Read back: one link each, its text exactly the alias.
    const para = (
      parseMarkdown(out).tree.children[0] as { children: { type: string; children?: { value?: string }[] }[] }
    ).children.filter((c) => c.type === "link");
    expect(para.map((l) => (l.children ?? []).map((t) => t.value).join(""))).toEqual([
      "a\\",
      "2*3*4",
      "x<y>",
      "`c`",
      "snake_case and _x_",
      "a & b ~ c",
    ]);
    expect(out).toContain("| ![pic.png\\|300](pic.png) |"); // the table's divider kept escaped
    expect(out).toContain("[[e#🎉]]");
    expect(plan.skipped.map((s) => s.reason)).toEqual([
      '[[e#🎉]]: the heading "🎉" has no slug to link to — left as it is',
    ]);
  });

  test("a conversion with nothing to change isn't logged: undo still takes back the last real one", async () => {
    const { planConvert } = await import("../../../../src/core/workspace/links/convert.ts");
    const { dir, g } = vault({ "a.md": "[[b]]\n", "b.md": B });
    applyPlan(g, planConvert(g));
    g.build(true);
    const nothing = planConvert(g);
    expect(nothing.files).toEqual([]);
    applyPlan(g, nothing);
    g.build(true);
    const undo = planUndo(g);
    expect(undo.files.map((f) => f.shown)).toEqual(["a.md"]);
    applyPlan(g, undo);
    expect(readFileSync(join(dir, "a.md"), "utf8")).toBe("[[b]]\n");
  });

  test("the CLI: --dry-run shows it, ambiguous and skipped ones said; without, it's written; slipbox undo takes it back", async () => {
    const { dir } = vault({ "a.md": "[[b]], [[dup]], [[nope]]\n", "b.md": B, "x/dup.md": "", "y/dup.md": "" });
    const run = async (args: string[]) => {
      const out: string[] = [];
      const code = await runCli([...args, "--json"], {
        out: (s: string) => out.push(s),
        err: () => {},
        stdin: async () => "",
        isTTY: false,
        columns: 80,
        cwd: dir,
        env: process.env,
      });
      return { code, json: JSON.parse(out.join("")) };
    };
    // A note named: its links only.
    writeFileSync(join(dir, "other.md"), "[[b]]\n");
    expect(
      (await run(["convert-links", "a.md", "--dry-run"])).json.data.files.map((f: { path: string }) => f.path),
    ).toEqual(["a.md"]);
    const dry = await run(["convert-links", "--dry-run"]);
    expect(dry.code).toBe(0);
    expect(dry.json.data).toMatchObject({
      kind: "convert",
      dryRun: true,
      files: [
        {
          path: "a.md",
          edits: [{ line: 1, before: "[[b]], [[dup]], [[nope]]", after: "[b](b.md), [[dup]], [[nope]]" }],
        },
        { path: "other.md" },
      ],
    });
    expect(dry.json.data.ambiguous).toMatchObject([{ written: "[[dup]]", candidates: ["x/dup.md", "y/dup.md"] }]);
    expect(dry.json.warnings).toContain('a.md:1: [[nope]]: no note named "nope" — left as it is');
    expect(
      dry.json.warnings.some((w: string) => w.startsWith("a.md:1: [[dup]] matches 2 notes (x/dup.md, y/dup.md)")),
    ).toBe(true);
    expect(readFileSync(join(dir, "a.md"), "utf8")).toBe("[[b]], [[dup]], [[nope]]\n");
    expect((await run(["convert-links"])).code).toBe(0);
    expect(readFileSync(join(dir, "a.md"), "utf8")).toBe("[b](b.md), [[dup]], [[nope]]\n");
    expect((await run(["undo"])).json.data.kind).toBe("convert");
    expect(readFileSync(join(dir, "a.md"), "utf8")).toBe("[[b]], [[dup]], [[nope]]\n");
  });

  test("a note embedded by its path (`![…](note.md)`) is drawn in place as `![[note]]` is; its heading by the fragment's slug", async () => {
    const { g } = vault({
      "host.md": "# Host\n\n![inner](sub/inner.md)\n\n![part](sub/inner.md#second-part)\n\n![a picture](pic.png)\n",
      // A path from its own folder, not a name looked up: `inner.md` beside notes/far.md isn't there.
      "notes/far.md": "![not here](inner.md)\n",
      "sub/inner.md": "# Inner\n\nFirst.\n\n## Second Part\n\nSecond.\n",
      "pic.png": "png",
    });
    const { layoutNote } = await import("../../../../src/core/documents/model/note.ts");
    const { parseMarkdown } = await import("../../../../src/core/documents/markdown/parse.ts");
    const { glyphsFor } = await import("../../../../src/core/rendering/theme/glyphs.ts");
    const l = layoutNote(parseMarkdown(readFileSync(g.abs("host.md"), "utf8")), g, "host.md", {
      width: 60,
      glyphs: glyphsFor("unicode"),
      showUrls: false,
    });
    const rows = l.lines.map((r) =>
      r.spans
        .map((x) => x.text)
        .join("")
        .trimEnd(),
    );
    expect(rows.slice(0, 13)).toEqual([
      "▌ Host",
      "",
      "⧉ inner",
      "▎ ▌ Inner",
      "▎",
      "▎ First.",
      "▎",
      "▎ ▌ Second Part",
      "▎",
      "▎ Second.",
      "",
      "⧉ inner › Second Part",
      "▎ ▌ Second Part",
    ]);
    expect(rows.some((r) => r.includes("⧉ pic"))).toBe(false); // a picture stays a picture
    const far = layoutNote(parseMarkdown(readFileSync(g.abs("notes/far.md"), "utf8")), g, "notes/far.md", {
      width: 60,
      glyphs: glyphsFor("unicode"),
      showUrls: false,
    });
    expect(far.embedded ?? []).toEqual([]);
    // The header links to the note by its path, the fragment kept, and follows as a path does.
    expect(l.links.filter((x) => x.text.startsWith("inner")).map((x) => [x.kind, x.target])).toEqual([
      ["image", "sub/inner.md"],
      ["image", "sub/inner.md#second-part"],
    ]);
  });
});

describe("review cycle 3 (core)", () => {
  /** A root (`.slipbox/` unless said) holding `files`, indexed. */
  const root = (files: Record<string, string>, marker = ".slipbox") => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-c3-"));
    mkdirSync(join(dir, marker));
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), text);
    }
    return { dir, g: openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true) };
  };
  const read = (dir: string, rel: string) => readFileSync(join(dir, rel), "utf8");

  test("convert-links makes a `/…` link into a nested root relative, never 'nothing there'", async () => {
    const { planConvert } = await import("../../../../src/core/workspace/links/convert.ts");
    const { dir, g } = root({
      "docs/home.md": "[x](/F/plan.md) [y](/docs/o.md)\n",
      "docs/o.md": "# O\n",
      "F/.slipbox/config.toml": "",
      "F/plan.md": "# Plan\n",
    });
    expect(g.resolveLink({ kind: "markdown", target: "/F/plan.md" }, "docs/home.md")).toMatchObject({
      resolvedKind: "note",
      path: join(dir, "F", "plan.md"),
    });
    const plan = planConvert(g);
    expect(plan.skipped).toEqual([]);
    applyPlan(g, plan);
    expect(read(dir, "docs/home.md")).toBe("[x](../F/plan.md) [y](o.md)\n");
  });
});
