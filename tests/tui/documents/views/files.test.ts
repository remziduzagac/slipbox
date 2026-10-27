import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { tildePath } from "../../../../src/core/foundation/platform/paths.ts";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("files beyond notes (16.3–16.5)", () => {
  const setup = async () => {
    const root = makeVault();
    mkdirSync(join(root, "cfg"), { recursive: true });
    writeFileSync(join(root, "cfg", "app.toml"), '[editor]\nfont = "x" # a comment\n');
    writeFileSync(join(root, "run.py"), 'def main():\n    print("hi")  # [[alpha]] in a comment\n');
    writeFileSync(join(root, "blob.dat"), "\u0000\u0001binary");
    writeFileSync(join(root, "links-out.md"), "# L\n\nSee [the config](cfg/app.toml) and [run.py](run.py).\n");
    return root;
  };
  test("the explorer lists data files by default; `a` shows every text file; binary never", async () => {
    const h = await harness({ root: await setup(), width: 120 });
    await h.keys("space", "e"); // focus the explorer
    const paths = () => h.app.explorer.rows().map((r) => r.path);
    h.app.explorer.expanded.add("cfg");
    h.app.explorer.invalidateTree();
    expect(paths()).toContain("cfg/app.toml");
    expect(paths()).not.toContain("run.py");
    const row = h.app.explorer.rows().find((r) => r.path === "cfg/app.toml")!;
    expect(row.group).toBe("data");
    expect(h.frame()).toContain("app.toml"); // shown with its extension
    await h.keys("a");
    expect(paths()).toContain("run.py");
    expect(paths()).not.toContain("blob.dat");
    await h.keys("a");
    expect(paths()).not.toContain("run.py");
  });
  test("a code file opens in SOURCE by default, highlighted, with READ available; a note after it renders", async () => {
    // Code as [render] code = "source" opens it (Python has the code view by default, 24.x).
    const h = await harness({ root: await setup(), config: (c) => (c.render.code = false) });
    await h.app.run("note.open links-out.md");
    const v = h.app.view!;
    const links = h.app.currentLayout(v).links;
    const py = links.find((l) => l.target === "run.py")!;
    h.app.moveCursor(v, { row: py.line, col: py.col });
    await h.keys("enter");
    expect(v.buf.rel).toBe("run.py");
    expect(v.source).toBe(true);
    const layout = h.app.currentLayout(v);
    expect(layout.lines[0]!.spans.some((s) => s.role === "syn_keyword")).toBe(true); // `def`
    expect(layout.headings).toEqual([]); // `# …` in Python is no heading
    await h.keys("space", "n", "v"); // opening default does not disable READ
    expect(v.source).toBe(false);
    expect(h.app.isCodeDocument(v.buf)).toBe(true);
    await h.app.run("history.back");
    expect(v.buf.rel).toBe("links-out.md");
    expect(v.source).toBe(false); // the note renders again
  });
  test("the background index parses a big note on other threads: here, its parsed chunks are only put together (15.1)", async () => {
    const { BACKGROUND_PARSE } = await import("../../../../src/tui/documents/buffers/buffer.ts");
    const { noteChunks } = await import("../../../../src/core/documents/markdown/parse.ts");
    const root = makeVault();
    const h = await harness({ root });
    // Written after the harness's first build, with words of its own: no parse of it is cached anywhere. Twice the
    // size that goes to the threads, in chunks enough for each.
    const own = randomBytes(6).toString("hex");
    const line = (i: number) => `Line ${i} ${own} with [a link](alpha.md) and words enough.\n`;
    const count = Math.ceil((2 * BACKGROUND_PARSE) / line(0).length);
    const text = Array.from({ length: count }, (_, i) => line(i)).join("\n");
    writeFileSync(join(root, "notes", "big.md"), text);
    h.app.graph.build(true, "lazy"); // every note unparsed, as at a cold start
    expect(h.app.graph.pendingCount).toBeGreaterThan(1);
    // Each parse of the big note on this thread: how many of its chunks it had to parse itself, or "whole". What this
    // thread does is counted, not timed: a loaded machine stretches every slice (the timings are the benchmark's).
    const g = h.app.graph;
    const big = "notes/big.md";
    const here: (number | "whole")[] = [];
    const entry = g.entry.bind(g);
    g.entry = (rel, chunks) => {
      if (rel === big && g.unparsedOver(0).some((f) => f.rel === big))
        here.push(chunks ? noteChunks(text).filter((c) => !chunks.chunks.has(c.text)).length : "whole");
      return entry(rel, chunks);
    };
    h.app.watch.indexInBackground();
    await h.app.watch.whenIndexed(); // however long the threads take
    expect(g.backlinks("notes/alpha.md").filter((b) => b.from === big)).toHaveLength(count);
    expect(here).toEqual([0]); // once, every chunk of it parsed on another thread
  });
  test("a data file opens from a link, rendered; edits save; a binary file doesn't open", async () => {
    const root = await setup();
    const h = await harness({ root });
    await h.app.run("note.open links-out.md");
    const v = h.app.view!;
    const cfg = h.app.currentLayout(v).links.find((l) => l.target === "cfg/app.toml")!;
    h.app.moveCursor(v, { row: cfg.line, col: cfg.col });
    await h.keys("enter");
    expect(v.buf.rel).toBe("cfg/app.toml");
    expect(v.source).toBeFalsy(); // rendered (16.11)
    await h.keys(
      "space",
      "n",
      "v",
      "G",
      "o",
      "w",
      "r",
      "a",
      "p",
      "space",
      "=",
      "space",
      "t",
      "r",
      "u",
      "e",
      "escape",
      "ctrl+s",
    );
    expect(readFileSync(join(root, "cfg", "app.toml"), "utf8")).toBe('[editor]\nfont = "x" # a comment\nwrap = true\n');
    expect(h.app.buffer("blob.dat")).toBeNull();
    expect(h.app.messages.at(-1)!.text).toContain("binary");
    // Named like text, binary inside: a NUL in the first 8 KB (as git decides) isn't opened; one
    // past them is the file's own business.
    writeFileSync(join(root, "dump.txt"), `head\u0000${"x".repeat(100)}`);
    writeFileSync(join(root, "late.txt"), `${"x\n".repeat(5000)}\u0000`);
    expect(h.app.buffer("dump.txt")).toBeNull();
    expect(h.app.messages.at(-1)!.text).toBe("dump.txt holds binary bytes; slipbox opens text");
    expect(h.app.buffer("late.txt")).not.toBeNull();
    // A symlink in the vault leading out of it isn't a file of the vault until you follow it (VV-D6): nothing outside
    // is read through it (the CLI refuses it too). One leading to a note inside opens.
    const outside = join(realpathSync(mkdtempSync(join(tmpdir(), "slipbox-outside-"))), "secret.md");
    writeFileSync(outside, "# Secret\n");
    symlinkSync(outside, join(root, "out.md"));
    symlinkSync(join(root, "links-out.md"), join(root, "in.md"));
    expect(h.app.buffer("out.md")).toBeNull();
    expect(h.app.messages.at(-1)!.text).toBe(
      `${tildePath(join(root, "out.md"))} → ${tildePath(outside)} isn't followed — open it to choose`,
    );
    expect(h.app.buffer("in.md")?.source).toBe(readFileSync(join(root, "links-out.md"), "utf8"));
  });
  test("the switcher lists the files the explorer shows", async () => {
    const h = await harness({ root: await setup() });
    await h.keys("ctrl+p");
    const o = h.app.overlay as { items: { data: unknown }[] };
    const data = o.items.map((i) => i.data);
    expect(data).toContain("cfg/app.toml");
    expect(data).not.toContain("run.py");
  });
});
