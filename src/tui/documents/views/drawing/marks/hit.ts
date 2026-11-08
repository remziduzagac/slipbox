// A list's preview (EG-D2): its place's hit marked in the row showing it, as the link under the cursor is.

import type { Role } from "../../../../../core/rendering/theme/theme.ts";
import type { Line } from "../../../../../core/rendering/layout/ir.ts";
import { stringWidth } from "../../../../../core/foundation/text/width.ts";
import type { View } from "../../../../app/runtime/app.ts";
import { offsetMarks } from "../lines.ts";

/**
 * The columns of `line` the hit covers: in a row with source columns, its range of the line; in a rendered one, its text
 * where the row shows it, found again (a rendered row has no source columns) — else, with no text to find, the line's
 * text in the row. A row the hit's text isn't in, or of another line, has none.
 */
export function hitMarks(line: Line, hit: NonNullable<View["preview"]>): { from: number; to: number; role: Role }[] {
  if (hit.line <= 0 || line.decor) return [];
  if (line.srcMap && hit.range) {
    if (line.src !== hit.line) return [];
    return offsetMarks(line, [{ from: hit.range[0], to: hit.range[1] }], false, "link_focus");
  }
  let col = 0;
  let from = -1;
  let to = -1;
  let text = "";
  for (const s of line.spans) {
    const w = stringWidth(s.text);
    if ((s.src ?? line.src) === hit.line && s.text.trim()) {
      if (from < 0) from = col;
      to = col + w;
    }
    text += s.text;
    col += w;
  }
  if (from < 0) return [];
  if (!hit.text) return [{ from, to, role: "link_focus" }];
  const at = text.toLowerCase().indexOf(hit.text.toLowerCase());
  if (at < 0) return [];
  const a = stringWidth(text.slice(0, at));
  return [{ from: a, to: a + stringWidth(text.slice(at, at + hit.text.length)), role: "link_focus" }];
}
