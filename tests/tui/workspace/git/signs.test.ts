import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { lineOf, offsetOf } from "../../../../src/tui/documents/editing/editing.ts";
import { makeSandbox, harness, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
const sandbox = makeSandbox();

describe("changes against what's staged, in the gutter (26.1)", () => {
  const git = (cwd: string, ...args: string[]) =>
    Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]);
  const until = async (ok: () => boolean, ms = 25_000) => {
    for (const t = Date.now(); !ok() && Date.now() - t < ms; ) await Bun.sleep(20);
    return ok();
  };
  /** A root and its repository: its files committed. */
  const repo = (files: Record<string, string>) => {
    const root = mkdtempSync(join(sandbox, "signs-"));
    mkdirSync(join(root, ".slipbox"));
    for (const [rel, text] of Object.entries(files)) writeFileSync(join(root, rel), text);
    if (git(root, "init", "-q", "-b", "main").exitCode !== 0) return null;
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "start");
    return root;
  };
  /** The window's changes, once git has answered. */
  const changes = async (h: Harness) => {
    expect(await until(() => (h.frame(), h.app.git.changesOf(h.app.view!) !== null))).toBe(true);
    return h.app.git.changesOf(h.app.view!)!;
  };
  /** The gutter cell just before a row's text, and its style. Looked for in the window alone: the explorer's
   *  breadcrumb names the root's folder, `signs-` and six random letters, which may hold the text too. */
  const signAt = (h: Harness, text: string) => {
    const c = h.canvas();
    const p = h.app.geometry!.panes.find((g) => g.view === h.app.view)!;
    const row = (y: number) => c.rows[y]!.slice(p.x, p.x + p.w).join("");
    let y = p.y;
    while (y < p.y + p.h - 1 && !row(y).includes(text)) y++;
    const x = p.x + row(y).indexOf(text) - 1;
    return { ch: c.rows[y]![x], fg: c.styles[y]![x]!.fg };
  };

  test("unsaved edits signed — changed, added, deleted below; ] c and [ c go to them; a preview; one undone", async () => {
    const root = repo({ "g1.md": "one\ntwo\nthree\nfour\nfive\n" });
    if (!root) return;
    const h = await harness({ root, open: "g1.md", width: 100, height: 30 });
    if (!h.app.view!.source) await h.keys("ctrl+k");
    expect(await changes(h)).toEqual([]);
    const buf = h.app.view!.buf;
    buf.edit(0, buf.source.length, "one\nTWO\nthree\nnew\nfour\n");
    expect((await changes(h)).map((c) => `${c.kind}:${c.from}`)).toEqual(["change:2", "add:4", "delete:6"]);
    const roles = h.app.theme.roles;
    expect(signAt(h, "TWO")).toEqual({ ch: "▎", fg: roles.git_sign_change.fg! });
    expect(signAt(h, "new")).toEqual({ ch: "▎", fg: roles.git_sign_add.fg! });
    expect(signAt(h, "four")).toEqual({ ch: "▁", fg: roles.git_sign_delete.fg! });
    expect(signAt(h, "three").ch).toBe(" ");
    const line = () => lineOf(h.app.view!, offsetOf(h.app, h.app.view!));
    await h.keys("g", "g", "]", "c");
    expect(line()).toBe(2);
    await h.keys("]", "c");
    expect(line()).toBe(4);
    await h.keys("]", "c");
    expect(line()).toBe(5);
    await h.keys("]", "c");
    expect(line()).toBe(2); // around the end
    await h.keys("[", "c");
    expect(line()).toBe(5);
    // The deletion's diff, in the floating window.
    await h.app.run("git.change_preview");
    expect(h.app.floating?.kind).toBe("hover");
    expect(h.app.floating!.view.buf.source).toBe("```diff\n-five\n```\n");
    expect(h.app.floating!.title).toBe("1 line deleted after line 5, against what's staged");
    await h.keys("escape");
    // Undone: the deletion's line back at the end; then the change on line 2.
    await h.app.run("git.change_undo");
    expect(buf.source).toBe("one\nTWO\nthree\nnew\nfour\nfive\n");
    expect(h.app.messages.at(-1)?.text).toBe("the change at line 5 undone, as staged (unsaved)");
    await h.keys("g", "g", "]", "c");
    await h.app.run("git.change_undo");
    expect(buf.source).toBe("one\ntwo\nthree\nnew\nfour\nfive\n");
    await h.keys("]", "c");
    await h.app.run("git.change_undo");
    expect(buf.source).toBe("one\ntwo\nthree\nfour\nfive\n");
    expect(await changes(h)).toEqual([]);
    await h.app.run("git.change_next");
    expect(h.app.messages.at(-1)?.text).toBe("no changes against what's staged here");
  });

  test("undone in a last line with no break, in CRLF, not in a file it can't edit; a rendered row takes its strongest sign", async () => {
    const root = repo({
      "g3.md": "a\nb\n",
      "g4.md": "a\r\nb\r\n",
      "g5.md": "a\nb\n",
      "g6.md": Buffer.from([0x61, 0xff, 0x0a, 0x62, 0x0a]) as unknown as string,
    });
    if (!root) return;
    writeFileSync(join(root, "g5.md"), "new\na\nB\n");
    writeFileSync(join(root, "g6.md"), Buffer.from([0x61, 0xff, 0x0a, 0x42, 0x0a]));
    const h = await harness({ root, open: "g3.md", width: 100, height: 30 });
    if (!h.app.view!.source) await h.keys("ctrl+k");
    const undo = async (rel: string, edit?: string) => {
      h.app.open(rel, { heading: null, headingIndex: 0, offset: 0, line: 1 });
      if (!h.app.view!.source) await h.keys("ctrl+k");
      if (edit !== undefined) h.app.view!.buf.edit(0, h.app.view!.buf.source.length, edit);
      expect((await changes(h)).length).toBe(1);
      await h.keys("g", "g", "]", "c");
      await h.app.run("git.change_undo");
      return h.app.view!.buf.source;
    };
    expect(await undo("g3.md", "a\nB")).toBe("a\nb");
    expect(await undo("g4.md", "a\r\nB\r\n")).toBe("a\r\nb\r\n");
    expect(await undo("g6.md")).toBe("a\uFFFD\nB\n");
    expect(h.app.messages.at(-1)?.text).toContain("isn't valid UTF-8");
    // Rendered, a paragraph's row joining an added line and a changed one: changed.
    h.app.open("g5.md", { heading: null, headingIndex: 0, offset: 0, line: 1 });
    if (h.app.view!.source) await h.keys("ctrl+k");
    expect((await changes(h)).map((c) => c.kind)).toEqual(["add", "change"]);
    expect(signAt(h, "new a B")).toEqual({ ch: "▎", fg: h.app.theme.roles.git_sign_change.fg! });
  });

  test("staged changes aren't signed; a file git hasn't is every line added; with no gutter, a column of its own, kept", async () => {
    const root = repo({ "g2.md": "a\nb\n" });
    if (!root) return;
    const h = await harness({
      root,
      open: "g2.md",
      width: 100,
      height: 30,
      config: (c) => ((c.ui.line_numbers = false), (c.diagnostics.bar = "off")),
    });
    if (!h.app.view!.source) await h.keys("ctrl+k");
    const v = h.app.view!;
    expect(await changes(h)).toEqual([]);
    expect(h.app.views.gutterWidth(v)).toBe(0);
    v.buf.edit(0, 1, "A");
    expect((await changes(h)).map((c) => c.kind)).toEqual(["change"]);
    expect(h.app.views.gutterWidth(v)).toBe(1);
    expect(signAt(h, "A").ch).toBe("▎");
    // Saved and staged: nothing against the index; the column kept, so the text doesn't move.
    await h.keys("ctrl+s");
    git(root, "add", "g2.md");
    await h.app.git.refreshNow();
    expect(await until(() => (h.frame(), h.app.git.changesOf(v)?.length === 0))).toBe(true);
    expect(h.app.views.gutterWidth(v)).toBe(1);
    // An untracked file: every line added.
    writeFileSync(join(root, "u.md"), "x\ny\n");
    await h.app.git.refreshNow();
    h.app.open("u.md", { heading: null, headingIndex: 0, offset: 0, line: 1 });
    expect(await until(() => (h.frame(), (h.app.git.changesOf(h.app.view!) ?? []).length > 0))).toBe(true);
    expect(h.app.git.changesOf(h.app.view!)).toEqual([
      { kind: "add", from: 1, to: 2, wasAt: 0, was: [], now: ["x", "y"] },
    ]);
    // Signs off: none, and nothing to go to.
    h.app.config.git.signs = false;
    expect(h.app.git.changesOf(h.app.view!)).toBeNull();
  });

  test("where [git] signs_at puts them — before the gutter, against the text, at the window's right edge — with line numbers and without, in source mode, the rendered view and the code view", async () => {
    const long = "x".repeat(200);
    const root = repo({ "g7.md": `one\n\ntwo\n\n${long}\n`, "g8.ts": "const a = 1;\nconst b = 2;\n" });
    if (!root) return;
    for (const at of ["gutter_left", "gutter_right", "window_right"] as const)
      for (const numbers of [true, false]) {
        const h = await harness({
          root,
          open: "g7.md",
          width: 100,
          height: 30,
          config: (c) => ((c.git.signs_at = at), (c.ui.line_numbers = numbers), (c.diagnostics.bar = "off")),
        });
        const where = `${at}, numbers ${numbers ? "on" : "off"}`;
        const pane = () => h.app.geometry!.panes.find((p) => p.view === h.app.view)!;
        /** The window's sign on the row showing `text`, where `at` says it sits, its colour and its background. */
        const sign = (text: string) => {
          const c = h.canvas();
          const v = h.app.view!;
          const p = pane();
          const gutter = h.app.views.gutterWidth(v);
          const x = at === "gutter_left" ? p.textX - gutter - 1 : at === "gutter_right" ? p.textX - 1 : p.x + p.w - 2;
          const y = c.rows.findIndex((r) => r.join("").includes(text));
          return { ch: c.rows[y]?.[x], fg: c.styles[y]?.[x]?.fg, bg: c.styles[y]?.[x]?.bg, row: c.rows[y]!.join("") };
        };
        for (const mode of ["source", "rendered", "code"] as const) {
          const rel = mode === "code" ? "g8.ts" : "g7.md";
          h.app.open(rel, { heading: null, headingIndex: 0, offset: 0, line: 1 });
          // Set, not toggled: ctrl+k's notice of the mode would cover the window's right edge a while.
          h.app.lens.setViewMode(h.app.view!, mode === "source" ? "source" : "rendered");
          if (mode === "code") expect(h.app.isCodeDocument(h.app.view!.buf)).toBe(true);
          expect(await changes(h)).toEqual([]);
          const textX = pane().textX;
          const buf = h.app.view!.buf;
          const [from, to] = mode === "code" ? ["b = 2", "b = 3"] : ["two", "TWO"];
          const i = buf.source.indexOf(from);
          buf.edit(i, from.length, to);
          expect((await changes(h)).map((c) => c.kind)).toEqual(["change"]);
          const s = sign(to);
          expect([where, mode, s.ch, s.fg]).toEqual([where, mode, "▎", h.app.theme.roles.git_sign_change.fg]);
          // Before the gutter, on its shade; its last column, against the text, stays the page's.
          if (at === "gutter_left" && numbers)
            expect([where, mode, s.bg]).toEqual([where, mode, h.app.theme.roles.gutter.bg]);
          // Only against the text with no gutter does the text move (a column of their own), once a file: g7.md's
          // kept from source mode into the rendered view.
          expect([where, mode, pane().textX - textX]).toEqual([
            where,
            mode,
            at === "gutter_right" && !numbers && mode !== "rendered" ? 1 : 0,
          ]);
          // At the right edge the text wraps short of them: nothing of it in their column.
          if (at === "window_right" && mode !== "code") {
            const c = h.canvas();
            const x = pane().x + pane().w - 2;
            const rows = c.rows.filter((r) => r.join("").includes("xxxx"));
            expect([where, mode, rows.length > 1, rows.every((r) => r[x] === " ")]).toEqual([where, mode, true, true]);
            // Unwrapped in source mode, the long line runs to the window's edge, but stops short of their column.
            if (mode === "source") {
              h.app.ui.wrap = false;
              const unwrapped = h.canvas().rows.find((r) => r.join("").includes("xxxx"))!;
              h.app.ui.wrap = true;
              expect([where, unwrapped[x - 1], unwrapped[x]]).toEqual([where, "x", " "]);
            }
          }
          buf.edit(i, to.length, from);
        }
      }
  });

  test("rendered, a changed block is signed beside its rows, never on the blank row after it; a code block's blank line is (#41)", async () => {
    const root = repo({ "g9.md": "# Head\n\nOne line.\n\n- item a\n- item b\n\nLast.\n\n```text\naaa\n\nbbb\n```\n" });
    if (!root) return;
    const h = await harness({ root, open: "g9.md", width: 100, height: 30 });
    h.app.lens.setViewMode(h.app.view!, "rendered");
    expect(await changes(h)).toEqual([]);
    const buf = h.app.view!.buf;
    buf.edit(
      0,
      buf.source.length,
      "# HEAD\n\nOne LINE.\n\n- item a\n- item B\n\nLast.\n\n```text\naaa\n\n\nbbb\n```\n",
    );
    expect((await changes(h)).map((c) => `${c.kind}:${c.from}`)).toEqual([
      "change:1",
      "change:3",
      "change:6",
      "add:12",
    ]);
    const c = h.canvas();
    const rows = c.rows.map((r) => r.join(""));
    // The window's row with `text` (the last: the breadcrumb above has the heading too), and the signs' column.
    const at = (text: string) => rows.findLastIndex((r) => r.includes(text));
    const x = rows[at("One LINE.")]!.indexOf("One LINE.") - 1;
    /** The signs' column on `n` rows from `text`'s. */
    const signs = (text: string, n: number) => c.rows.slice(at(text), at(text) + n).map((r) => r[x]);
    for (const text of ["HEAD", "One LINE.", "item B"]) expect([text, ...signs(text, 2)]).toEqual([text, "▎", " "]);
    // The code block's rows: the blank line added is signed, the one it had isn't.
    expect(signs("aaa", 4)).toEqual([" ", "▎", " ", " "]);
    expect(c.styles[at("aaa") + 1]![x]!.fg).toBe(h.app.theme.roles.git_sign_add.fg!);
  });

  test("space k d folds the code view's cells that didn't change, those that did open, the cursor on the first; again, all open (GIT-D7)", async () => {
    const fn = (name: string, n: number) => `export function ${name}(): number {\n  return ${n};\n}\n`;
    const src = [fn("alpha", 1), fn("beta", 2), fn("gamma", 3), fn("delta", 4)].join("\n");
    const root = repo({ "k.ts": src });
    if (!root) return;
    const h = await harness({ root, open: "k.ts", width: 100, height: 40 });
    const v = h.app.view!;
    for (let i = 0; i < 200 && v.buf.syntax?.version !== v.buf.version; i++) {
      h.frame();
      await Bun.sleep(10);
    }
    expect([h.app.isCodeDocument(v.buf), v.source ?? false]).toEqual([true, false]);
    const cells = () => (h.app.currentLayout(v).cells ?? []).map((c) => c.title);
    expect(cells()).toEqual(["alpha", "beta", "gamma", "delta"]);
    v.buf.edit(src.indexOf("return 2"), "return 2".length, "return 22");
    v.buf.edit(v.buf.source.indexOf("return 4"), "return 4".length, "return 44");
    expect((await changes(h)).map((c) => c.from)).toEqual([6, 14]);
    await h.keys("space", "k", "d");
    expect([...v.buf.codeFolded].sort((a, b) => a - b)).toEqual([1, 9]);
    expect(h.app.messages.at(-1)?.text).toBe("2 unchanged cells folded, 2 changed ones open; again, all open");
    // Folded to their headers: their code gone, the changed ones' shown; the cursor in the first changed.
    const frame = h.frame();
    expect([frame.includes("return 1;"), frame.includes("return 22;"), frame.includes("return 44;")]).toEqual([
      false,
      true,
      true,
    ]);
    expect(h.app.cursorLine(v)).toBeGreaterThanOrEqual(5);
    expect(h.app.cursorLine(v)).toBeLessThanOrEqual(7);
    await h.keys("space", "k", "d");
    expect([v.buf.codeFolded.size, h.app.messages.at(-1)?.text]).toEqual([0, "every cell open"]);
    // Nothing changed: nothing to fold around, said.
    v.buf.edit(0, v.buf.source.length, src);
    expect(await changes(h)).toEqual([]);
    await h.keys("space", "k", "d");
    expect(h.app.messages.at(-1)?.text).toBe("nothing changed against what's staged: nothing to fold");
  });
});
