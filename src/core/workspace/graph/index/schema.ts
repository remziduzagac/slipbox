// The persisted note-index format. This module loads neither parsing nor Graph composition.
import type { NoteEntry } from "../graph-types.ts";

/** Bumped when what a note's entry holds changes: 5, content hashes (17.12). */
export const INDEX_VERSION = 13;
// 6: inline #tags (1.6); 7: where links end (11.7); 8: no wikilinks (20.22); 9: wikilinks again (21.3); 10: heading
// ids, anchors; 11: front matter links; 12: worker-parsed heading ids (15.1); 13: document HTML headings and
// anchors (#90)

export interface IndexFile {
  version: number;
  entries: Record<string, NoteEntry>;
  /** The branch checked out when it was written (5.9): from another, its vanished notes weren't moved. */
  branch?: string | null;
  /** Files the walk leaves out that were reached (20.8): indexed all the same, and kept so. */
  reached?: string[];
}
