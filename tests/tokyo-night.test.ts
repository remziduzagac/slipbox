import { expect, test } from "bun:test";
import { listThemes, loadTheme } from "../src/core/theme/index.ts";
import { blend } from "../src/core/theme/theme.ts";
import upstream from "./fixtures/themes/tokyo-night.json";

for (const [variant, palette] of Object.entries(upstream.palettes)) {
  const name = variant === "night" ? "tokyo-night" : `tokyo-night-${variant}`;
  test(`${name} uses the official palette throughout its document, syntax and chrome`, () => {
    const { theme, warning } = loadTheme(name, "/nonexistent");
    expect(warning).toBeNull();
    expect(listThemes("/nonexistent")).toContainEqual({ name, source: "built-in" });
    expect(theme.kind).toBe(variant === "day" ? "light" : "dark");
    expect(theme.bg).toBe(palette.bg);
    expect(theme.fg).toBe(palette.fg);
    const roles = theme.roles;
    expect(roles.dim.fg).toBe(palette.fg_dark);
    expect(roles.strong).toMatchObject({ fg: palette.fg, bold: true });
    expect(roles.code_inline).toMatchObject({ fg: palette.fg, bg: palette.bg_highlight, italic: true });
    expect(roles.code_block.bg).toBe(palette.bg_dark);
    expect(roles.border.fg).toBe(palette.fg_gutter);
    expect(roles.syn_keyword).toMatchObject({ fg: palette.magenta, bold: true });
    expect(roles.syn_function).toMatchObject({ fg: palette.blue, bold: true });
    expect(roles.syn_comment.fg).toBe(palette.comment);
    expect(roles.syn_string.fg).toBe(palette.green);
    expect(roles.syn_number.fg).toBe(palette.orange);
    expect(roles.h1.fg).toBe(palette.blue);
    expect(roles.h2.fg).toBe(palette.yellow);
    expect(roles.h4.fg).toBe(palette.teal);
    expect(roles.h5.fg).toBe(palette.magenta);
    expect(roles.h6.fg).toBe(palette.purple);
    expect(roles.wikilink.fg).toBe(palette.cyan);
    expect(roles.link_unresolved.fg).toBe(palette.red);
    expect(roles.lens_edit.fg).toBe(palette.green);
    expect(roles.lens_band_edit.bg).toBe(blend(palette.green, palette.bg, 0.07));
    for (const role of ["h1", "h2", "h3", "h4", "h5", "h6"] as const) {
      expect(roles[role].bg).toBe(blend(roles[role].fg!, palette.bg, theme.kind === "dark" ? 0.14 : 0.16));
    }
  });
}
