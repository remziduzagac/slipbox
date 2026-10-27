import { type Check, pos } from "../check.ts";
import { placeholderCell } from "../../../src/tui/shell/terminal/placeholders.ts";

const NOTE = "home/notes/research/document-html.md";
export const HTML: Check[] = [
  {
    area: "reading",
    name: "document HTML: formatting, named disclosure toggle, fragment reveal and unchanged source",
    covers: { cases: ["html", "inline"], commands: ["html.details_toggle"] },
    options: { home: true, startAt: NOTE, config: '[render]\nimages = "never"\n', size: { cols: 120, rows: 45 } },
    run: async (s) => {
      await s.see("slipbox logo");
      await s.see("Bold words");
      s.expect(s.styleOf("Bold words")?.bold === true, "HTML strong is bold");
      await s.notSee("<picture>");
      await s.notSee("this content is omitted");
      await s.keys("/");
      await s.type("More about HTML");
      await s.keys("enter", "escape");
      await s.see("More about HTML");
      await s.ex("Toggle HTML details");
      await s.see("disclosure body is readable");
      await s.ex("Toggle HTML details");
      await s.notSee("disclosure body is readable");
      await s.ex("3");
      await s.keys("enter");
      await s.see("disclosure body is readable");
      s.expect(pos(s).line === 27, "the fragment lands on the original HTML heading line");
      await s.ex("Source view");
      await s.see('<h2 id="inside-html">Inside HTML</h2>');
      s.expect(
        s.read("~/notes/research/document-html.md").includes('<source media="(prefers-color-scheme: dark)"'),
        "source keeps original HTML",
      );
    },
  },
  {
    area: "reading",
    name: "document HTML pictures: exactly one themed local logo, aligned and sized through the image pipeline",
    covers: { cases: ["html"] },
    options: { home: true, startAt: NOTE, graphics: true, size: { cols: 120, rows: 45 } },
    run: async (s) => {
      await s.see("slipbox logo");
      const pictureCount = () => {
        let count = 0;
        let active = false;
        for (const row of s.term.cells()) {
          const any = row.some((cell) => !!placeholderCell(cell.text));
          if (any && !active) count++;
          active = any;
        }
        return count;
      };
      await s.until(() => pictureCount() === 2, undefined, "one picture alternative and one linked badge");
      let first = -1;
      for (const row of s.term.cells()) {
        row.forEach((cell, x) => {
          if (placeholderCell(cell.text) && first < 0) first = x;
        });
      }
      s.expect(first > 20, "the logo is centered in its container");
      await s.ex("theme tokyo-night-day");
      await s.see("slipbox logo");
      await s.until(
        () => s.term.cells().some((row) => row.some((c) => !!placeholderCell(c.text))),
        undefined,
        "HTML logo redrawn after theme change",
      );
    },
  },
];
