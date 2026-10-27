import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness, statusRow, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
const sandbox = makeSandbox();

describe("problems where they are: the bar, the marks, the status line (19.8–19.11)", () => {
  const vault = (text = "# P\n\nSee [twin](twin.png) here.\n\nAnd [nope](nope.md) there.\n") => {
    const root = makeVault();
    mkdirSync(join(root, "x"));
    mkdirSync(join(root, "y"));
    writeFileSync(join(root, "x", "twin.md"), "# X\n");
    writeFileSync(join(root, "y", "twin.md"), "# Y\n");
    writeFileSync(join(root, "p.md"), text);
    return root;
  };
  /** The row showing `text`, its cells, and their styles. */
  const rowOf = (h: Harness, text: string) => {
    const c = h.canvas();
    const rows = c.toString().split("\n");
    const y = rows.findIndex((r) => r.includes(text));
    const cellsOf = [...rows[y]!];
    const left = cellsOf.indexOf("┃");
    return {
      cells: cellsOf,
      styles: c.styles[y]!,
      bar: cellsOf[left + 2]!,
      count: cellsOf[left + 3]!,
      barFg: c.styles[y]![left + 2]!.fg,
      at: (s: string) => cellsOf.join("").indexOf(s),
    };
  };

  test("the bar: a line's worst problem's sign in its colour, the count past one; the status line says what", async () => {
    const h = await harness({
      root: vault("# P\n\nSee [twin](twin.png) here.\n\nAnd [nope](nope.md) there.\n\nTwo [a](a.png) [b](b.png).\n"),
      open: "p.md",
    });
    h.frame();
    const see = rowOf(h, "See");
    expect([see.bar, see.count]).toEqual(["⚠", " "]); // one: no count
    expect(see.barFg).toBe(h.app.theme.roles.warn.fg!);
    expect([rowOf(h, "Two").bar, rowOf(h, "Two").count]).toEqual(["⚠", "2"]);
    // A warning, below the marks' default level (errors): not marked in the text.
    expect(see.styles[see.at("twin")]!.fg).not.toBe(h.app.theme.roles.problem_warn.fg!);
    // nope.md is a note not written yet: information, under the default threshold.
    expect(rowOf(h, "And").bar).toBe(" ");
    expect(statusRow(h.frame())).toContain("⚠ 3");
    await h.app.run("cursor.goto_line 3");
    expect(statusRow(h.frame())).toContain("⚠ 3"); // on a problem's line too: the counts only
    expect(statusRow(h.frame())).not.toContain("twin.png");
    // Each glyph set its own signs: ASCII's letters, the Nerd Font's icons.
    for (const [glyphs, sign] of [
      ["ascii", "W"],
      ["nerd", "\u{ea6c}"],
    ] as const) {
      const g = await harness({ root: vault(), open: "p.md", config: (c) => (c.render.glyphs = glyphs) });
      const rows = g.frame().split("\n");
      expect(rows.find((r) => r.includes("See"))).toContain(`${sign}   See`); // the sign, no count, the bar's space, the page's
    }
  });

  test('[diagnostics] severity = "info": the notes not written yet too, in their colour', async () => {
    const h = await harness({ root: vault(), open: "p.md", config: (c) => (c.diagnostics.severity = "info") });
    h.frame();
    const and = rowOf(h, "And");
    expect(and.bar).toBe("ℹ");
    expect(and.barFg).toBe(h.app.theme.roles.info.fg!);
    expect(statusRow(h.frame())).toMatch(/⚠ 1 {2}ℹ 1/);
  });

  test('space u d hides the bar (the text takes its room); bar = "off" never shows it', async () => {
    const h = await harness({ root: vault(), open: "p.md" });
    h.frame();
    const before = rowOf(h, "See").at("See");
    await h.keys("space", "u", "d");
    expect(rowOf(h, "See").at("See")).toBe(before - 4); // the bar's three, the page's column after it
    expect(h.app.messages.at(-1)!.text).toBe("Problems bar: off");
    const off = await harness({ root: vault(), open: "p.md", config: (c) => (c.diagnostics.bar = "off") });
    off.frame();
    expect(rowOf(off, "See").at("See")).toBe(before - 4);
  });

  test("the marks: a level — errors by default; space u shift+d cycles errors → warnings → all → off", async () => {
    // A merge's conflict left in it: an error; a broken link, a warning; a note not written yet, information.
    const text =
      "# P\n\nSee [twin](twin.png) here.\n\nAnd [nope](nope.md) there.\n\n<<<<<<< ours\nmine\n=======\ntheirs\n>>>>>>> other\n";
    const h = await harness({ root: vault(text), open: "p.md", config: (c) => (c.diagnostics.severity = "info") });
    await h.app.run("view.source");
    const roles = h.app.theme.roles;
    const marked = () => ({
      error: rowOf(h, "mine").styles[rowOf(h, "mine").at("mine")]!.fg === roles.problem_error.fg,
      warning: rowOf(h, "See").styles[rowOf(h, "See").at("[twin")]!.fg === roles.problem_warn.fg,
      info: rowOf(h, "And").styles[rowOf(h, "And").at("[nope")]!.fg === roles.problem_info.fg,
    });
    expect(
      h.app.problems
        .ofView(h.app.view!)
        .map((p) => p.severity)
        .sort(),
    ).toEqual(["error", "info", "warning"]);
    expect(h.app.ui.problem_marks).toBe("error");
    expect(marked()).toEqual({ error: true, warning: false, info: false });
    await h.keys("space", "u", "shift+d");
    expect(h.app.messages.at(-1)!.text).toBe("Problems marked in the text: warnings and up");
    expect(marked()).toEqual({ error: true, warning: true, info: false });
    await h.keys("space", "u", "shift+d");
    expect(h.app.messages.at(-1)!.text).toBe("Problems marked in the text: all");
    expect(marked()).toEqual({ error: true, warning: true, info: true });
    await h.keys("space", "u", "shift+d");
    expect(h.app.messages.at(-1)!.text).toBe("Problems marked in the text: off");
    expect(marked()).toEqual({ error: false, warning: false, info: false });
    await h.keys("space", "u", "shift+d");
    expect(h.app.ui.problem_marks).toBe("error");
    // An older config's true and false: every severity shown, and none.
    for (const [old, level] of [
      [true, "info"],
      [false, "off"],
    ] as const) {
      const dir = mkdtempSync(join(sandbox, "marks-"));
      writeFileSync(join(dir, "config.toml"), `[diagnostics]\nmarks = ${old}\n`);
      const { loadConfig } = await import("../../../../src/core/application/config/config.ts");
      expect(loadConfig({ configFile: join(dir, "config.toml"), vaultFile: null }).config.diagnostics.marks).toBe(
        level,
      );
    }
  });

  test("auto: no bar while a note has had no problems; once it has, it stays as they go", async () => {
    const root = vault("# P\n\nSee [twin](x/twin.md) here.\n");
    const h = await harness({ root, open: "p.md" });
    h.frame();
    const clean = rowOf(h, "See").at("See");
    writeFileSync(join(root, "p.md"), "# P\n\nSee [twin](twin.png) here.\n");
    h.app.watch.applyChanges({ changes: [{ rel: "p.md", kind: "changed", isNote: true }], rescan: false });
    h.frame();
    expect(rowOf(h, "See").at("See")).toBe(clean + 4);
    writeFileSync(join(root, "p.md"), "# P\n\nSee [twin](x/twin.md) here.\n");
    h.app.watch.applyChanges({ changes: [{ rel: "p.md", kind: "changed", isNote: true }], rescan: false });
    h.frame();
    expect(rowOf(h, "See").bar).toBe(" ");
    expect(rowOf(h, "See").at("See")).toBe(clean + 4); // kept: the text doesn't move back
  });

  test("in source mode the mark is the link's own characters", async () => {
    const h = await harness({ root: vault(), open: "p.md", config: (c) => (c.diagnostics.marks = "warning") });
    await h.app.run("view.source");
    h.frame();
    const see = rowOf(h, "See [twin](twin.png)");
    const warn = h.app.theme.roles.problem_warn.fg!;
    expect(see.styles[see.at("[twin](twin.png)")]!.fg).toBe(warn);
    expect(see.styles[see.at("[twin](twin.png)") + 15]!.fg).toBe(warn);
    expect(see.styles[see.at(" here")]!.fg).not.toBe(warn);
  });
});
