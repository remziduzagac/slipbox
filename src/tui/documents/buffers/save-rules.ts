import { saveRules } from "../../../core/documents/editing/indent.ts";
import type { NoteBuffer } from "./buffer.ts";

/** Apply the file's saving rules as one undo step, preserving the unchanged text. */
export function applySaveRules(buf: NoteBuffer): void {
  if (buf.virtual) return;
  const next = saveRules(buf.source, buf.indent());
  if (next === buf.source) return;
  const a = buf.source;
  let head = 0;
  while (head < a.length && head < next.length && a[head] === next[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < next.length - head && a[a.length - 1 - tail] === next[next.length - 1 - tail])
    tail++;
  buf.endStep(head);
  buf.edit(head, a.length - head - tail, next.slice(head, next.length - tail), head);
  buf.endStep(head);
}
