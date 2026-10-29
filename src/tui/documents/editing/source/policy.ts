// Existing edit admission and document-mode selection.

import type { App, View } from "../../../app/runtime/app.ts";
import { editable } from "../editable.ts";

/** Why a buffer can't be edited, or null when it can. */
export function cannotEdit(view: Pick<View, "buf">): string | null {
  if (view.buf.readOnly) return view.buf.readOnly;
  if (view.buf.deleted) return `${view.buf.key} was deleted on disk`;
  if (view.buf.invalidUtf8) return `${view.buf.key} isn't valid UTF-8 — editing would change bytes it doesn't show`;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Insert mode
/** What the lens shows of a file, as its messages say: a note's markdown, code, a data file's own format (`the YAML`). */
export function lensWhat(buf: View["buf"]): string {
  const group = buf.kind.group;
  return group === "text" ? "code" : group === "data" ? buf.kind.format.toUpperCase() : "markdown";
}

/**
 * An editing key on a rendered window switches it to editing (`[editor] edit_in`). To source mode: the key goes on and
 * edits. To the lens: the lens opens on the cursor's block as written, and the key's second press edits — as `esc esc`
 * leaves, the editing first, then the lens. True when the key goes on to edit.
 */
export function toEditing(app: App, view: View): boolean {
  if (editable(view)) return true;
  const mode = app.lens.editMode(view);
  app.lens.setViewMode(view, mode);
  return mode !== "live";
}
