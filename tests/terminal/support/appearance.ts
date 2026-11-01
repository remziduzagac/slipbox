import { loadTheme } from "../../../src/core/rendering/theme/index.ts";
import type { Session, StyledRun } from "../session.ts";

/** Every place `needle` starts on screen, with the style its first character is drawn in. */
export function stylesOf(s: Session, needle: string): StyledRun[] {
  const found: StyledRun[] = [];
  for (const row of s.runs()) {
    const plain = row.map((r) => r.text).join("");
    for (let at = plain.indexOf(needle); at >= 0; at = plain.indexOf(needle, at + 1)) {
      let n = 0;
      for (const r of row) {
        if (at < n + r.text.length) {
          found.push(r);
          break;
        }
        n += r.text.length;
      }
    }
  }
  return found;
}

/** Wait until `needle` is drawn somewhere in `fg` (a heading in its role's colour, say). */
export async function drawnIn(s: Session, needle: string, fg: string, what: string): Promise<void> {
  await s.until(() => stylesOf(s, needle).some((r) => r.fg === fg), 3000, what);
}

export const TOKYO = loadTheme("tokyo-night").theme;
export const NORD = loadTheme("nord").theme;
