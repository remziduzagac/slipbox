import type { Role } from "../../../../core/rendering/theme/theme.ts";
import { stringWidth, truncateStart, truncate } from "../../../../core/foundation/text/width.ts";

export type LocationItem = { text: string; id: string; role: Role; compact?: string };
/** Location survives narrowing; tracking gives way before branch, then the changed count. */
export function fitLocation(items: LocationItem[], width: number, separator: string, tight = false): LocationItem[] {
  const out = items.map((item) => ({ ...item }));
  const size = () =>
    out.reduce((n, item) => n + stringWidth(item.text) + (tight ? 0 : 2), tight ? 0 : 2) +
    Math.max(0, out.length - 1) * stringWidth(separator);
  const branch = out.find((item) => item.id === "top:branch");
  if (size() > width && branch) branch.text = branch.compact ?? branch.text;
  if (size() > width && branch)
    branch.text = truncate(branch.text, Math.max(4, stringWidth(branch.text) - (size() - width)));
  if (size() > width && branch) out.splice(out.indexOf(branch), 1);
  if (size() > width) {
    const changed = out.findIndex((item) => item.id === "top:changed");
    if (changed >= 0) out.splice(changed, 1);
  }
  for (const item of out) {
    if (size() <= width) break;
    const at = item.text.indexOf(" ");
    const glyph = item.text.slice(0, at + 1);
    const name = item.text.slice(at + 1);
    const target = Math.max(1, stringWidth(name) - (size() - width));
    item.text = glyph + truncateStart(name, target);
  }
  return out;
}
