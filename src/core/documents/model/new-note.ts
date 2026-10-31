import { extensionOf, isKnownExtension } from "./filetypes.ts";

/** A new note's name, shared by :new and opening a path not yet on disk. */
export function newNoteName(path: string): string {
  const ext = extensionOf(path);
  return !ext || !isKnownExtension(ext) ? `${path}.md` : path;
}
