// Pictures sized to their window, shown at their own size on a click (issue #52), read off the screen as Kitty's
// Unicode placeholders: each cell names the picture's row and column it shows, so a check sees how big a picture is
// drawn, which part of it shows, and where. In the reading area; reading.ts is past the size limit.

import { placeholderCell } from "../../../src/tui/placeholders.ts";
import type { Check } from "../check.ts";
import type { Session } from "../session.ts";

const NOTES = "home/work/product/releases/2.3-notes.md";
const PLAN = "home/work/product/releases/2.3-plan.md";

/** A picture as it shows: where its cells start on screen, and which of its rows and columns they are. */
interface Shown {
  x: number;
  y: number;
  rows: number[];
  cols: number[];
}

/** The pictures on screen, a run of rows of placeholder cells each: the topmost first. */
function pictures(s: Session): Shown[] {
  const out: Shown[] = [];
  let cur: Shown | null = null;
  s.term.cells().forEach((line, y) => {
    let x = 0;
    let any = false;
    for (const cell of line) {
      const at = placeholderCell(cell.text);
      if (at) {
        if (!cur) {
          cur = { x, y, rows: [], cols: [] };
          out.push(cur);
        }
        if (!any) cur.x = Math.min(cur.x, x);
        any = true;
        if (!cur.rows.includes(at.row)) cur.rows.push(at.row);
        if (!cur.cols.includes(at.col)) cur.cols.push(at.col);
      }
      x += cell.width;
    }
    if (!any) cur = null;
  });
  return out;
}

const first = (s: Session) => pictures(s)[0] ?? null;
const width = (p: Shown) => p.cols.length;
const left = (p: Shown) => Math.min(...p.cols);

/** Until the first picture on screen is as `ok` says. */
async function drawn(s: Session, ok: (p: Shown) => boolean, what: string): Promise<Shown> {
  await s.until(
    () => {
      const p = first(s);
      return !!p && ok(p);
    },
    undefined,
    what,
  );
  return first(s)!;
}

/** A click (SGR's press and release) on the screen's cell (x, y), counted from 0. */
async function click(s: Session, x: number, y: number): Promise<void> {
  await s.send(`\x1b[<0;${x + 1};${y + 1}M`);
  await s.send(`\x1b[<0;${x + 1};${y + 1}m`);
}

/** To the picture's ▣ line, at the window's top: the picture whole below it, fitted. */
async function toPicture(s: Session, alt: string): Promise<void> {
  await s.keys("/");
  await s.type(alt);
  await s.keys("enter", "escape", "z", "t");
  await s.until(() => s.rowOf(alt) >= 0 && s.rowOf(alt) < 14, undefined, `${alt} near the window's top`);
}

const ALT = "The route planner on a laptop";

export const PICTURES: Check[] = [
  {
    area: "reading",
    name: "pictures: fitted to the window; a click or z p shows one at its own size, z h, z l and the wheel scroll it, a click fits it again",
    covers: { cases: ["inline"], commands: ["picture.size", "picture.scroll_left", "picture.scroll_right"] },
    options: { home: true, startAt: NOTES, size: { cols: 100, rows: 40 }, graphics: true },
    run: async (s) => {
      await s.see("Plan on a laptop");
      await toPicture(s, ALT);
      // Fitted: whole, from its first row and column, as wide as the text and no wider than its own 169 columns.
      const fitted = await drawn(s, (p) => p.rows.includes(0) && left(p) === 0, "the screenshot drawn");
      s.expect(width(fitted) < 169 && width(fitted) > 40, `fitted to the window: ${width(fitted)} columns`);
      const rows = fitted.rows.length;
      // A click on it: at its own size — taller, its columns from 0 still, more of them than fit.
      await click(s, fitted.x + 3, fitted.y + 2);
      await s.message(/own size/);
      const own = await drawn(s, (p) => p.rows.length > rows, "the screenshot at its own size, taller");
      const room = width(own);
      s.expect(left(own) === 0 && room >= width(fitted), `its first columns, as many as the window has: ${room}`);
      // z l: a quarter of the window to the right; z h back.
      await s.keys("z", "l");
      await drawn(s, (p) => left(p) === Math.floor(room / 4), "scrolled a quarter of the window right");
      await s.keys("z", "h");
      await drawn(s, (p) => left(p) === 0, "scrolled back to its left edge");
      // The wheel sideways over it: 6 columns a notch.
      await s.send(`\x1b[<67;${own.x + 4};${own.y + 3}M`);
      await drawn(s, (p) => left(p) === 6, "the wheel's notch, 6 columns");
      // Clicked again: fitted, as before.
      await click(s, own.x + 3, own.y + 2);
      await s.message(/fitted/);
      await drawn(s, (p) => p.rows.length === rows && left(p) === 0 && width(p) === width(fitted), "fitted again");
      // From its ▣ line, where the click left the cursor: z p, both ways; z l, fitted, says how.
      await s.keys("z", "l");
      await s.message(/z p shows/);
      await s.keys("z", "p");
      await drawn(s, (p) => p.rows.length > rows, "z p: at its own size");
      await s.keys("z", "p");
      await drawn(s, (p) => p.rows.length === rows, "z p again: fitted");
    },
  },
  {
    area: "reading",
    name: "pictures: they follow the window — narrower, shorter down to the floor, a stacked split, wrapping off",
    covers: { cases: ["inline"] },
    options: { home: true, startAt: NOTES, size: { cols: 120, rows: 40 }, graphics: true },
    run: async (s) => {
      await s.see("Plan on a laptop");
      await toPicture(s, ALT);
      const wide = await drawn(s, (p) => p.rows.includes(0), "the screenshot drawn");
      // Narrower: drawn narrower, once the size has rested.
      await s.resize(90, 40);
      const narrow = await drawn(s, (p) => width(p) < width(wide), "narrower with the window");
      // Shorter than 12 rows for it: the floor's 12 rows, 43 columns at 8 × 16 cells — taller than the window.
      await s.resize(90, 16);
      await drawn(s, (p) => width(p) < width(narrow) && width(p) === 43, "the floor's size in a short window");
      // A stacked split: each window's half the height, the picture fitted to it.
      await s.resize(120, 40);
      await drawn(s, (p) => width(p) === width(wide), "as wide as before");
      await s.keys("ctrl+w", "s");
      await drawn(s, (p) => width(p) < width(wide), "fitted to the split's shorter window");
      await s.keys("ctrl+w", "o");
      await drawn(s, (p) => width(p) === width(wide), "one window again");
      // Wrapping off: fitted to the window still; at its own size, the window scrolls over it.
      await s.keys("alt+z");
      await s.message(/wrap/i);
      // (The window's text columns whole: wrapped text keeps an inset, a picture with wrapping off doesn't.)
      const fitted = await drawn(
        s,
        (p) => p.rows.includes(0) && left(p) === 0 && width(p) < 169,
        "fitted, wrapping off",
      );
      await click(s, fitted.x + 3, fitted.y + 2);
      await s.message(/own size/);
      const own = await drawn(s, (p) => p.rows.length > fitted.rows.length, "at its own size, wrapping off");
      await s.keys("z", "l");
      await drawn(s, (p) => left(p) === Math.floor(width(own) / 4), "the window scrolled a quarter to the right");
    },
  },
  {
    area: "reading",
    name: "pictures: one in an embedded note is fitted inside its frame, and a click shows it at its own size",
    covers: { cases: ["inline", "embeds"] },
    options: { home: true, startAt: PLAN, size: { cols: 120, rows: 40 }, graphics: true },
    run: async (s) => {
      await s.see("What the notes say of the planner");
      await s.keys("/");
      await s.type("Plan on a laptop");
      await s.keys("enter", "escape", "z", "t");
      const framed = await drawn(s, (p) => p.rows.includes(0), "the screenshot in the embedded note");
      const row = s.screen()[framed.y - 1] ?? "";
      s.expect(framed.x >= 2, `past the frame's bar: at column ${framed.x}\n${row}`);
      await click(s, framed.x + 3, framed.y + 2);
      await s.message(/own size/);
      await drawn(s, (p) => p.rows.length > framed.rows.length, "at its own size, in its frame");
      await s.keys("z", "l");
      await drawn(s, (p) => left(p) > 0, "scrolled inside its frame");
    },
  },
  {
    area: "reading",
    name: "pictures: where the terminal draws none, z p on a ▣ line says why",
    covers: { cases: ["inline"] },
    options: { home: true, startAt: NOTES, size: { cols: 100, rows: 40 } },
    run: async (s) => {
      await s.see("Plan on a laptop");
      await toPicture(s, ALT);
      await s.keys("z", "p");
      await s.message(/no pictures drawn/);
    },
  },
];
