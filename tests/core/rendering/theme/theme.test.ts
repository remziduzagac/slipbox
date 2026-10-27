import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { base16ToPalette, parseBase16 } from "../../../../src/core/rendering/theme/base16.ts";
import { applyColorOverrides, listThemes, loadTheme, ROLES } from "../../../../src/core/rendering/theme/index.ts";
import { blend, hexToRgb, luminance } from "../../../../src/core/rendering/theme/theme.ts";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("themes (2.6)", () => {
  test("every built-in defines every role", () => {
    for (const t of listThemes()) {
      const { theme, warning } = loadTheme(t.name);
      expect(warning).toBeNull();
      for (const r of ROLES) expect(theme.roles[r]).toBeDefined();
    }
  });
  test("the gutter's shade is between the page's and the breadcrumb row's in every colour theme, a quieter frame", () => {
    for (const t of listThemes()) {
      const { theme } = loadTheme(t.name);
      if (theme.name === "terminal" || theme.name === "mono") continue; // sixteen colours, or none
      const [page, gutter, band] = [theme.bg, theme.roles.gutter.bg!, theme.roles.breadcrumb_band.bg!].map(luminance);
      expect([t.name, Math.min(page!, band!) < gutter! && gutter! < Math.max(page!, band!)]).toEqual([t.name, true]);
    }
  });
  test("a code cell's lines a step brighter than the frame's and the rules', dimmer than the text, in every colour theme", () => {
    for (const t of listThemes()) {
      const { theme } = loadTheme(t.name);
      if (theme.name === "terminal" || theme.name === "mono") continue;
      const [frame, cell, text] = [theme.roles.rule.fg!, theme.roles.cell_line.fg!, theme.fg].map(luminance);
      const [lo, hi] = theme.kind === "dark" ? [frame!, text!] : [text!, frame!];
      expect([t.name, lo < cell! && cell! < hi]).toEqual([t.name, true]);
    }
  });
  test("the gutter's git signs in colours of their own, softer than the explorer's: nearer the page in every colour theme, dimmed in the terminal's", () => {
    const signs = [
      ["git_sign_add", "git_new"],
      ["git_sign_change", "git_modified"],
      ["git_sign_delete", "diff_del"],
    ] as const;
    for (const t of listThemes()) {
      const { theme } = loadTheme(t.name);
      if (theme.name === "mono") continue; // no colour
      for (const [sign, explorer] of signs) {
        const s = theme.roles[sign];
        if (theme.name === "terminal") {
          expect([sign, s]).toEqual([sign, { fg: theme.roles[explorer].fg, dim: true }]);
          continue;
        }
        // Between the page and the explorer's colour: further from the page than nothing, nearer than the explorer's.
        const [page, soft, full] = [theme.bg, s.fg!, theme.roles[explorer].fg!].map(luminance);
        const far = Math.abs(full! - page!);
        const near = Math.abs(soft! - page!);
        expect([t.name, sign, near > 0 && near < far]).toEqual([t.name, sign, true]);
      }
    }
    // [colors] sets them, as any role.
    const { theme, warnings } = applyColorOverrides(loadTheme("tokyo-night").theme, {
      git_sign_add: { fg: "#336633" },
    });
    expect([theme.roles.git_sign_add.fg, warnings]).toEqual(["#336633", []]);
  });
  test("a diff's line on a tint of its sign's colour, its changed words on a stronger one, in every colour theme; bold and underlined in the terminal's and without colour", () => {
    const far = (a: string, b: string) => {
      const [x, y] = [hexToRgb(a), hexToRgb(b)];
      return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
    };
    for (const t of listThemes()) {
      const { theme } = loadTheme(t.name);
      for (const [line, word] of [
        ["diff_add", "diff_add_word"],
        ["diff_del", "diff_del_word"],
      ] as const) {
        const [l, w] = [theme.roles[line], theme.roles[word]];
        if (theme.name === "terminal" || theme.name === "mono") {
          // Sixteen colours can't be mixed with the page, and none can't tint: the words weighted instead.
          expect([t.name, word, l.bg, w.bg, !!w.bold, !!w.underline]).toEqual([
            t.name,
            word,
            undefined,
            undefined,
            true,
            true,
          ]);
          continue;
        }
        // On the way from the page to the sign's colour: the line a little of it, the words more.
        const [lineAway, wordAway] = [far(l.bg!, theme.bg), far(w.bg!, theme.bg)];
        expect([t.name, word, lineAway > 0 && wordAway > lineAway, wordAway < far(l.fg!, theme.bg)]).toEqual([
          t.name,
          word,
          true,
          true,
        ]);
      }
    }
  });
  test("the lens while it's typed into is green: its rules and label, a green tint on its rows", () => {
    const { theme } = loadTheme("tokyo-night");
    expect(theme.roles.lens_edit.fg).toBe("#9ece6a"); // the palette's green
    expect(theme.roles.lens_band_edit.bg).toBe(blend("#9ece6a", "#1a1b26", 0.07)); // over the page's background
  });
  test("unknown theme falls back to tokyo-night with a warning", () => {
    const r = loadTheme("no-such-theme");
    expect(r.theme.name).toBe("tokyo-night");
    expect(r.warning).toContain("unknown theme");
  });
  test("base16 loader accepts both scheme formats", () => {
    const slots = Array.from(
      { length: 16 },
      (_, i) => `base0${i.toString(16).toUpperCase()}: "${(i * 1111).toString(16).padStart(6, "0")}"`,
    );
    const legacy = parseBase16(`scheme: "Legacy"\n${slots.join("\n")}\n`, "x");
    const modern = parseBase16(`name: "Modern"\npalette:\n  ${slots.join("\n  ")}\n`, "x");
    expect(legacy.name).toBe("Legacy");
    expect(modern.name).toBe("Modern");
    expect(base16ToPalette(modern).blue).toBe(modern.slots.base0D!);
    expect(() => parseBase16("scheme: x\nbase00: '000000'\n", "x")).toThrow();
  });
});

describe("themes (2.6): a user's own files", () => {
  test("a user theme loads, shadowing a built-in of its name; a broken one falls back, saying which file and why", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-themes-"));
    const slots = Array.from(
      { length: 16 },
      (_, i) => `base0${i.toString(16).toUpperCase()}: "${(i * 1111).toString(16).padStart(6, "0")}"`,
    );
    writeFileSync(join(dir, "terminal.yaml"), `scheme: "Mine"\n${slots.join("\n")}\n`);
    writeFileSync(join(dir, "broken.yml"), "scheme: x\nbase00: '000000'\n");
    const mine = loadTheme("terminal", dir);
    expect(mine.warning).toBeNull();
    expect(mine.theme).toMatchObject({ name: "terminal", source: "user", bg: "#000000" });
    const broken = loadTheme("broken", dir);
    expect(broken.theme.name).toBe("tokyo-night");
    expect(broken.warning).toStartWith(`theme broken: ${join(dir, "broken.yml")}: `);
    expect(listThemes(dir).filter((t) => t.name === "terminal")).toEqual([
      { name: "terminal", source: "user", path: join(dir, "terminal.yaml") },
    ]);
    rmSync(dir, { recursive: true, force: true });
  });
});
