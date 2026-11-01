import type { Check } from "../check.ts";
import { stylesOf, drawnIn, TOKYO, NORD } from "../support/appearance.ts";

export const APPEARANCE: Check[] = [
  // --- colours and glyphs ---------------------------------------------------------------------
  {
    area: "navigating",
    name: "colours: the theme's roles as drawn; :theme switches; [colors] overrides, per theme too",
    covers: { cases: ["theme", "colors"], commands: ["theme.set"] },
    options: { config: '[colors]\nh2 = "#ff00aa"\n\n[colors.nord]\nlink = "#00ff00"\n' },
    run: async (s) => {
      // tokyo-night: the link and inline code in their roles; the h2 in the override's colour.
      await drawnIn(s, "operations-handbook", TOKYO.roles.link.fg!, "a link in tokyo-night's link colour");
      await drawnIn(s, "people/contacts.md", TOKYO.roles.code_inline.fg!, "inline code in its role's colour");
      s.expect(
        stylesOf(s, "people/contacts.md").some((r) => r.bg === TOKYO.roles.code_inline.bg),
        "inline code on its role's background",
      );
      await drawnIn(s, "Start here", "#ff00aa", "the h2 in [colors]' colour");
      // :theme nord: nord's colours, its own [colors.nord] link, the global h2 still.
      await s.ex("theme nord");
      await drawnIn(s, "operations-handbook", "#00ff00", "the link in [colors.nord]'s colour");
      await drawnIn(s, "people/contacts.md", NORD.roles.code_inline.fg!, "inline code in nord's colour");
      await drawnIn(s, "Start here", "#ff00aa", "the h2 override under nord too");
      s.expect(
        !stylesOf(s, "people/contacts.md").some((r) => r.fg === TOKYO.roles.code_inline.fg),
        "tokyo-night's code colour gone",
      );
    },
  },
  {
    area: "navigating",
    name: "colours: --theme draws its colours from the start; NO_COLOR draws none",
    covers: { cases: ["theme", "colors"] },
    options: { args: ["--theme", "nord"] },
    run: async (s) => {
      // What's drawn is that theme's: the heading in nord's h2 colour, not tokyo-night's.
      await drawnIn(s, "Start here", NORD.roles.h2.fg!, "a heading in nord's h2 colour");
      s.expect(
        !stylesOf(s, "Start here").some((r) => r.fg === TOKYO.roles.h2.fg),
        "no heading in tokyo-night's colour under --theme nord",
      );
      // NO_COLOR: nothing with text on it is coloured at all.
      await s.restart({ args: [], env: { NO_COLOR: "1" } });
      await s.see("Start here");
      const coloured = s
        .runs()
        .flat()
        .filter((r) => r.text.trim() && (r.fg !== null || r.bg !== null));
      s.expect(!coloured.length, `no colour under NO_COLOR: ${JSON.stringify(coloured.slice(0, 3))}`);
    },
  },
  {
    area: "navigating",
    name: "glyphs: SLIPBOX_GLYPHS=ascii, and a locale that isn't UTF-8, draw the frame in ASCII",
    covers: { cases: ["glyphs"] },
    options: { env: { SLIPBOX_GLYPHS: "unicode" } },
    run: async (s) => {
      // The frame's rule (the row under the top bar) and the explorer's buttons: Unicode, then ASCII.
      const rule = () => s.screen()[1] ?? "";
      await s.until(() => /[━─]/.test(rule()), 3000, "the Unicode frame");
      await s.see("≡");
      const envs: Record<string, string>[] = [
        { SLIPBOX_GLYPHS: "ascii" },
        { SLIPBOX_GLYPHS: "", LC_ALL: "", LC_CTYPE: "", LANG: "C" },
      ];
      for (const env of envs) {
        await s.restart({ env });
        await s.until(
          () => /^[\x20-\x7e]+$/.test(rule().trimEnd()) && rule().includes("-"),
          3000,
          `an ASCII frame (${JSON.stringify(env)})`,
        );
        s.expect(
          s.rowOf("≡") < 0 && s.rowOf("◷") < 0 && s.rowOf("×") < 0,
          `no Unicode buttons (${JSON.stringify(env)})`,
        );
        await s.see(/1 home\.md x/); // the tab's close button
      }
    },
  },
];
