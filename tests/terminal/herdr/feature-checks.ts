// Real-terminal edges added after 0.5.0: modifier chords and a glyph's redraw, beyond the headless encoder.

import type { Scenario } from "./helpers.ts";

export const FEATURE_CHECKS: Scenario[] = [
  {
    name: "live list keys: alt+enter asks where, escape returns to the same filtered list",
    run: async (s) => {
      await s.keys("ctrl+p");
      await s.type("telescope");
      await s.see("telescope-comparison");
      await s.keys("alt+enter");
      await s.see(/Open .*telescope-comparison\.md where\?/);
      await s.keys("escape");
      await s.notSee(/Open .* where\?/);
      await s.see("› telescope");
      await s.see("telescope-comparison");
    },
  },
  {
    name: "live structure keys: alt+o grows, alt+i shrinks to the word and original cursor",
    options: {
      open: "live-structure.md",
      setup: (s) => s.write("live-structure.md", "# Structure\n\nalpha beta gamma.\n"),
    },
    run: async (s) => {
      await s.keys("ctrl+k");
      await s.status("SOURCE");
      await s.ex("3");
      await s.status("L3:1");
      await s.keys("alt+o");
      await s.status("VISUAL");
      await s.keys("alt+o", "alt+i", "y");
      await s.until(() => s.clipboard() === "alpha", 3000, "the grown selection shrunk back to alpha");
      await s.ex("3");
      await s.keys("alt+o");
      await s.status("VISUAL");
      await s.keys("alt+i");
      await s.until(
        () => !s.statusLine().includes("VISUAL") && /L3:1\b/.test(s.statusLine()),
        3000,
        "the word shrunk to its original cursor",
      );
    },
  },
  {
    name: "live path keys: ctrl+backspace and ctrl+w each go back exactly one folder",
    run: async (s) => {
      await s.keys("space", "f", "e");
      await s.see("Open by path — tab completes, ~ is home");
      await s.type(`${s.vault}/people/`);
      await s.see(`› ${s.vault}/people/`);
      await s.keys("ctrl+backspace");
      await s.until(
        () => s.screen().some((row) => row.includes(`› ${s.vault}/`) && !row.includes("people/")),
        3000,
        "Ctrl+Backspace to remove the final folder",
      );
      await s.type("software/");
      await s.see(`› ${s.vault}/software/`);
      await s.keys("ctrl+w");
      await s.until(
        () => s.screen().some((row) => row.includes(`› ${s.vault}/`) && !row.includes("software/")),
        3000,
        "Ctrl+W to remove the final folder",
      );
      await s.see("Open by path — tab completes, ~ is home");
    },
  },
  {
    name: "live callout widths: important title keeps its cells when search redraws it",
    options: {
      open: "live-callout.md",
      config: '[render]\nglyphs = "unicode"\n',
      setup: (s) => s.write("live-callout.md", "# Callout\n\n> [!IMPORTANT]\n> Distinct body.\n\nClosing line.\n"),
    },
    run: async (s) => {
      const title = "▎ ✱ Important";
      await s.see(title);
      const before = s.screen()[s.rowOf(title)]!;
      const col = Bun.stringWidth(before.slice(0, before.indexOf(title)));
      const intact = () => {
        const row = s.screen()[s.rowOf(title)];
        return row !== undefined && Bun.stringWidth(row.slice(0, row.indexOf(title))) === col;
      };
      await s.keys("/");
      await s.type("Distinct");
      await s.see("› Distinct");
      await s.until(intact, 3000, "the important title to retain its cells below search");
      await s.keys("escape");
      await s.notSee("› Distinct");
      await s.until(intact, 3000, "the important title to retain its cells after search closes");
      const after = s.screen()[s.rowOf(title)]!;
      s.expect(after.slice(after.indexOf(title)).trimEnd() === title, "the title restored without a gap or duplicate");
    },
  },
];
