// Unsaved editor text over a graph entry; the same maps remain owned by Graph.
import { isAbsolute, join } from "node:path";
import { readText } from "../../../foundation/platform/fsutil.ts";
import type { NoteEntry } from "../graph-types.ts";
import { extractFromSource } from "../graph-extract.ts";

export interface EditorOverlay {
  disk: NoteEntry;
  text: string;
}
interface OverlayContext {
  readonly root: string;
  readonly notes: Map<string, NoteEntry>;
  entry(rel: string): NoteEntry | undefined;
}

export function applyOverlay(
  context: OverlayContext,
  overlays: Map<string, EditorOverlay>,
  rel: string,
  text: string | null,
): boolean {
  const had = overlays.get(rel);
  if (text === null) {
    if (!had) return false;
    overlays.delete(rel);
    context.notes.set(rel, had.disk);
  } else {
    const disk = had?.disk ?? (context.notes.has(rel) ? context.entry(rel) : undefined);
    if (!disk) return false;
    overlays.set(rel, { disk, text });
    context.notes.set(
      rel,
      extractFromSource(
        { rel, abs: join(context.root, rel), size: disk.size, mtimeMs: disk.mtimeMs },
        text,
        disk.flags,
      ),
    );
  }
  return true;
}

export function overlayText(root: string, overlays: ReadonlyMap<string, EditorOverlay>, path: string): string | null {
  const rel = path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
  const over = overlays.get(rel);
  if (over) return over.text;
  try {
    return readText(isAbsolute(rel) ? rel : join(root, rel)).text;
  } catch {
    return null;
  }
}
