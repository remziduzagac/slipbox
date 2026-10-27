import { describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
const sandbox = makeSandbox();

describe("review round 1", () => {
  test("UI settings survive a start with a path; an explicit theme beats a remembered one", async () => {
    const root = mkdtempSync(join(sandbox, "vault-"));
    cpSync(join(import.meta.dir, "../../../fixtures", "vault"), root, { recursive: true, verbatimSymlinks: true });
    const a = await harness({ root, open: "notes/alpha.md" });
    a.app.settings.setUi("line_numbers", true);
    a.app.session.save();
    const b = await harness({ root, open: "notes/beta.md" }); // with a path: tabs not restored
    expect(b.app.ui.line_numbers).toBe(true);
    b.app.settings.setUi("theme", "nord");
    b.app.session.save();
    const c = await harness({ root, open: "notes/beta.md", themeName: "dracula" });
    expect(c.app.ui.theme).toBe("dracula");
  }); // 29 harnesses
});

describe("UI settings (space u)", () => {
  test("cursorline, line numbers, readable width, zen, urls", async () => {
    const h = await harness({ open: "notes/alpha.md", width: 200 });
    // The band on the cursor row is drawn, and goes: a cell past the text on that row.
    const band = () => {
      const p = h.app.geometry!.panes[0]!;
      const c = h.canvas();
      return c.styles[p.y + h.app.view!.cur.row - h.app.view!.top]![p.x + p.w - 3]?.bg ?? null;
    };
    const withBand = band();
    await h.keys("space", "u", "l");
    expect(h.app.ui.cursorline).toBe(false);
    expect(band()).not.toEqual(withBand);
    await h.keys("space", "u", "n");
    expect(h.app.ui.line_numbers).toBe(true);
    const pane = h.app.geometry!.panes[0]!;
    expect(h.canvas().line(pane.y).slice(pane.x, pane.textX).trim()).toBe("1");
    // The gutter in a shade of its own down the window, past the text's end too; the text's columns the page's.
    const c = h.canvas();
    const gutter = h.app.theme.roles.gutter.bg!;
    for (const y of [pane.y + 1, pane.y + pane.h - 1]) {
      for (let x = pane.x; x < pane.textX - 1; x++) expect(c.styles[y]![x]!.bg).toBe(gutter);
      // A column of the page's between it and the text.
      expect([c.line(y)[pane.textX - 1], c.styles[y]![pane.textX - 1]!.bg]).toEqual([" ", h.app.theme.bg]);
      expect(c.styles[y]![pane.textX]!.bg).not.toBe(gutter);
    }
    const full = h.app.currentLayout(h.app.view!).width;
    expect(full).toBeGreaterThan(100); // 200 columns: the toggle below has something to cap
    await h.keys("space", "u", "shift+w");
    expect(h.app.currentLayout(h.app.view!).width).toBeLessThanOrEqual(100);
    await h.keys("space", "u", "z");
    const f = h.frame();
    expect(f).not.toContain("READ");
    expect(f).not.toContain("▸ notes");
    await h.keys("space", "u", "r");
    expect(h.app.ui.urls).toBe(true);
    expect(h.frame()).toContain("<https://example.invalid>");
  });
  test("ASCII glyphs: the whole screen is ASCII, the chrome's own marks too (a console without Unicode)", async () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-ascii-"));
    mkdirSync(join(root, ".slipbox"));
    writeFileSync(
      join(root, "index.md"),
      "# Index\n\n- [the long one](a-rather-long-note-name-for-cutting-in-the-tab-strip.md)\n- [ ] a task\n\n> [!warning] Careful\n> text\n",
    );
    writeFileSync(join(root, "a-rather-long-note-name-for-cutting-in-the-tab-strip.md"), "# A\n\nplain\n");
    const h = await harness({ root, width: 60, height: 20, config: (c) => (c.render.glyphs = "ascii") });
    const ascii = (f: string, what: string) => {
      const odd = [...f].filter((ch) => ch.codePointAt(0)! > 0x7e && ch !== "\n");
      if (odd.length) throw new Error(`${what}: ${[...new Set(odd)].join(" ")}\n${f}`);
    };
    ascii(h.frame(), "at the start (watching or not, the frame)");
    for (let i = 0; i < 4; i++) h.app.openInNewTab("a-rather-long-note-name-for-cutting-in-the-tab-strip.md");
    h.app.openInNewTab("index.md");
    ascii(h.frame(), "a tab's name cut");
    await h.keys("tab"); // onto the link: the status line names it
    ascii(h.frame(), "a link under the cursor");
    await h.keys("space");
    ascii(h.frame(), "the leader's popup");
    await h.keys("escape", "space", "n", "v", "G", "A", "x", "escape");
    ascii(h.frame(), "a change unsaved");
    await h.keys("/", "t", "a", "s", "k");
    ascii(h.frame(), "the find row");
  });
  test("theme and glyph pickers preview live and esc restores", async () => {
    const h = await harness();
    await h.keys("space", "u", "t", "down");
    expect(h.app.theme.name).not.toBe("tokyo-night");
    await h.keys("escape");
    expect(h.app.theme.name).toBe("tokyo-night");
    await h.keys("space", "u", "g", "down");
    expect(h.app.glyphs.mode).toBe("ascii");
    await h.keys("escape");
    expect(h.app.glyphs.mode).toBe("unicode");
    await h.keys("space", "u", "u");
    expect(h.frame()).toContain("UI settings");
  });
  test("a session override is kept only while its config default is unchanged", async () => {
    const root = makeVault();
    const h = await harness({ root, config: (c) => (c.ui.restore_session = true) });
    await h.keys("space", "u", "n", "space", "u", "t", "down", "enter");
    const theme = h.app.ui.theme;
    h.app.quit();
    const again = await harness({ root, open: null, config: (c) => (c.ui.restore_session = true) });
    expect(again.app.ui.line_numbers).toBe(true);
    expect(again.app.ui.theme).toBe(theme);
    const changed = await harness({
      root,
      open: null,
      config: (c) => ((c.ui.restore_session = true), (c.ui.line_numbers = true)),
    });
    expect(changed.app.settings.uiOverrides.line_numbers).toBeUndefined();
    const flipped = await harness({
      root,
      open: null,
      config: (c) => ((c.ui.restore_session = true), (c.theme = "nord")),
    });
    expect(flipped.app.ui.theme).toBe("nord");
  });
});
