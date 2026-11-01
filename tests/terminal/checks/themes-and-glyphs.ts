// Theme previews, role overrides and glyphs.

import { cpSync } from "node:fs";
import { join } from "node:path";
import { loadTheme } from "../../../src/core/rendering/theme/index.ts";
import { type Check, leader } from "../check.ts";

export const THEMES_AND_GLYPHS: Check[] = [
  {
    area: "reading",
    name: "themes: space u t lists the built-ins and your own, each previewed as the list moves; esc goes back, enter keeps one; :theme names one",
    covers: { cases: ["themes", "theme"], commands: ["theme.pick", "theme.set"] },
    options: {
      home: true,
      startAt: "home/work/kestrel/docs/qa/theme-showcase.md",
      // The team's themes, put where your own go, as their README says.
      setup: (s) =>
        cpSync(s.path("~/work/infra/dotfiles/slipbox/themes"), join(s.dir, "config", "slipbox", "themes"), {
          recursive: true,
        }),
    },
    run: async (s) => {
      const themes = join(s.dir, "config", "slipbox", "themes");
      const h2 = (name: string) => loadTheme(name, themes).theme.roles.h2.fg!.toLowerCase();
      const drawn = () => s.styleOf("H2 band")?.fg?.toLowerCase() ?? "";
      await s.until(() => drawn() === h2("tokyo-night"), 3000, "the heading in tokyo-night's colour");
      await leader(s, "u", "t");
      await s.see("Theme (live preview)");
      await s.see(/kestrel-dark\s+.*\S/); // a file of yours, listed with the built-ins
      await s.see(/gruvbox-light\s+built-in/);
      // Moving the list previews: the note drawn in the theme the list is on.
      await s.type("dracula");
      await s.until(() => drawn() === h2("dracula"), 3000, "the heading in dracula's colour, previewed");
      await s.keys("escape");
      await s.until(() => drawn() === h2("tokyo-night"), 3000, "back to tokyo-night after esc");
      await leader(s, "u", "t");
      await s.type("nord");
      await s.keys("enter");
      await s.message(/theme nord/);
      await s.until(() => drawn() === h2("nord"), 3000, "the heading in nord's colour, kept");
      // All four Tokyo Night variants apply their own heading foreground and background live.
      for (const name of ["tokyo-night-moon", "tokyo-night-storm", "tokyo-night-day", "tokyo-night"]) {
        const expected = loadTheme(name, themes).theme.roles.h2;
        await s.ex(`theme ${name}`);
        await s.until(
          () => drawn() === expected.fg && s.styleOf("H2 band")?.bg?.toLowerCase() === expected.bg,
          3000,
          `${name}'s heading colours applied`,
        );
      }
      // By name, a file's theme: the team's kestrel-dark.
      await s.ex("theme kestrel-dark");
      await s.until(() => drawn() === h2("kestrel-dark"), 3000, "the heading in kestrel-dark's colour");
    },
  },

  {
    area: "reading",
    name: "colors: [colors] overrides a role in every theme, [colors.nord] under nord alone",
    covers: { cases: ["colors"], commands: ["theme.set"] },
    options: {
      home: true,
      startAt: "home/work/kestrel/docs/qa/theme-showcase.md",
      config: '[colors]\nh1 = "#ff00aa"\n\n[colors.nord]\nh2 = "#00ff00"\n',
    },
    run: async (s) => {
      const fg = (t: string) => s.styleOf(t)?.fg?.toLowerCase() ?? "";
      await s.until(() => fg("H1 band") === "#ff00aa", 3000, "the h1 in [colors]' colour");
      const tokyo = loadTheme("tokyo-night", "/nonexistent").theme.roles;
      s.expect(fg("H2 band") === tokyo.h2.fg!.toLowerCase(), `the h2 tokyo-night's own: ${fg("H2 band")}`);
      await s.ex("theme nord");
      await s.until(() => fg("H2 band") === "#00ff00", 3000, "the h2 in [colors.nord]'s colour");
      s.expect(fg("H1 band") === "#ff00aa", "the h1 override under nord too");
      await s.ex("theme dracula");
      const dracula = loadTheme("dracula", "/nonexistent").theme.roles;
      await s.until(() => fg("H2 band") === dracula.h2.fg!.toLowerCase(), 3000, "the h2 dracula's own again");
    },
  },

  {
    area: "reading",
    name: "glyphs: space u g previews each set; :glyphs ascii draws bullets, boxes, bars, headings and tables in ASCII; unicode again",
    covers: { cases: ["glyphs"], commands: ["glyphs.pick", "glyphs.set"] },
    options: { home: true, startAt: "home/work/kestrel/docs/qa/glyphs.md" },
    run: async (s) => {
      await s.ex("glyphs unicode");
      await s.see("• first level");
      await s.see("☐ open task");
      await s.see("☑ done task");
      await s.see("▎ One level of quote.");
      await s.ex("glyphs ascii");
      await s.see("* first level");
      await s.see("[ ] open task");
      await s.see("[x] done task");
      await s.see("| One level of quote.");
      await s.see("### Third level, with the third icon");
      s.expect(s.rowOf("•") < 0 && s.rowOf("☐") < 0 && s.rowOf("▎") < 0, "nothing of unicode's left");
      // The picker: the list moves, the note previews it; enter keeps it.
      await leader(s, "u", "g");
      await s.see("Glyphs (live preview)");
      await s.type("unicode");
      await s.see("• first level");
      await s.keys("enter");
      await s.message("glyphs: unicode");
      await s.see("☑ done task");
    },
  },
];
