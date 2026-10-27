import { MODES } from "../../shell/input/modes.ts";
import { stringWidth } from "../../../core/foundation/text/width.ts";

/** Below this, a heading is cut no further: the breadcrumb drops it instead. */
const CRUMB_MIN = 8;
/** Fewer columns than this, and no breadcrumb is drawn at all. */
export const CRUMB_FLOOR = 4;
/**
 * The columns a breadcrumb keeps before the mode's buttons beside it shorten (HDR-D4, HDR-D7): room for its icon and a
 * space, `… ›` and an innermost heading cut to `CRUMB_MIN` — crumbLayout's narrowest form but `…` alone — whatever the
 * headings the cursor is under or the mode, so the buttons don't change form as either does (well over the 4 columns
 * drawBreadcrumb draws in).
 */
export function crumbLeast(glyphs: { crumb: string; crumbIcon: string }): number {
  return stringWidth(glyphs.crumbIcon) + 1 + 1 + stringWidth(` ${glyphs.crumb} `) + CRUMB_MIN;
}
/**
 * Which headings a breadcrumb shows in `room` columns, each with its width, and where `…` stands
 * for the hidden ones. All of them if they fit; else the first, `…` and as many of the innermost as
 * fit; else the first and the last, cut (down to 8 columns each); else `…` and the last; else `…`.
 */
export function crumbLayout(widths: number[], room: number, sepW: number): ({ i: number; w: number } | "more")[] {
  const n = widths.length;
  if (!n || room < 1) return [];
  type Part = { i: number; w: number } | "more";
  const width = (parts: Part[]) => parts.reduce((a, p) => a + (p === "more" ? 1 : p.w), 0) + (parts.length - 1) * sepW;
  const all = widths.map((w, i) => ({ i, w }));
  if (width(all) <= room) return all;
  const last = all[n - 1]!;
  if (n >= 3) {
    for (let k = 2; k < n; k++) {
      const parts: Part[] = [all[0]!, "more", ...all.slice(k)];
      if (width(parts) <= room) return parts;
    }
  }
  const minW = (w: number) => Math.min(w, CRUMB_MIN);
  if (n >= 2) {
    // The first and the last, cut to fit; `…` between them when something is hidden.
    const fixed = sepW + (n >= 3 ? 1 + sepW : 0);
    const first = all[0]!;
    if (minW(first.w) + minW(last.w) + fixed <= room) {
      const lastW = Math.min(last.w, room - fixed - minW(first.w));
      const firstW = Math.min(first.w, room - fixed - lastW);
      return n >= 3
        ? [{ i: 0, w: firstW }, "more", { i: n - 1, w: lastW }]
        : [
            { i: 0, w: firstW },
            { i: n - 1, w: lastW },
          ];
    }
    if (1 + sepW + minW(last.w) <= room) return ["more", { i: n - 1, w: Math.min(last.w, room - 1 - sepW) }];
    return ["more"];
  }
  if (minW(last.w) <= room) return [{ i: 0, w: Math.min(last.w, room) }];
  return ["more"];
}

/** The buttons' forms, widest first: every label, every letter, the selected one's letter alone; none. */
export type ModeForm = "letters" | "selected" | "none";

/** A label, or its letter, as drawn: a space either side. */
export const labelOf = (m: (typeof MODES)[number]) => ` ${m.label[0]} `;

/** Each form's width: every label, every letter, one letter (the widest, whichever is selected). */
export const FORM_WIDTH: Record<Exclude<ModeForm, "none">, number> = {
  letters: MODES.reduce((a, m) => a + stringWidth(labelOf(m)), 0),
  selected: Math.max(...MODES.map((m) => stringWidth(labelOf(m)))),
};

/**
 * The buttons' form in `room` columns, the breadcrumb wanting `least` of them, its margins aside (HDR-D4): the widest
 * that leaves it those, else the selected letter as long as it fits at all.
 */
export function modeButtons(room: number, least: number): ModeForm {
  // The breadcrumb's columns are those between the name and the buttons less one at each end.
  const keep = least > 0 ? least + 2 : 0;
  if (FORM_WIDTH.letters + keep <= room) return "letters";
  return room >= FORM_WIDTH.selected ? "selected" : "none";
}
