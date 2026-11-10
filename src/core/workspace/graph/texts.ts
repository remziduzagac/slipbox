// A graph's notes' texts read elsewhere (SD-T6): the TUI reads the background parse's on the disk threads, a slice
// ahead (`ahead`), and gives each here as it comes; a note is parsed from the text given, never read again for it. What
// the screen draws, and what a completion asks, asks of the notes `partially`: a note whose text isn't given yet stays
// the stub its walk made, every note's list (`ensureAll`) is of what's parsed so far — shown so (`unread`), and again
// once the parse is done (SD-D12's note). Anything else that asks reads here, as before: the CLI, a test's App, and a
// key that has waited for every note's text first (`KeyReads.notes`), which finds none left to read.

import type { NoteText } from "../walk/io/notes.ts";
import type { NoteFile } from "../walk/walk.ts";

export class NoteTexts {
  /** Whether the notes' texts are read elsewhere — the TUI's, on the disk threads; null or false, here, as before. */
  elsewhere: (() => boolean) | null = null;
  /** The texts given and not parsed yet, each with the file of the walk it was read for. */
  private readonly given = new Map<string, { file: NoteFile; text: NoteText }>();
  private depth = 0;

  /** `unparsed`: the graph's notes not parsed yet, by their paths — a text is taken for one of them alone. */
  constructor(private readonly unparsed: ReadonlyMap<string, NoteFile>) {}

  /** The notes' texts are read elsewhere: the background parse parses those given, and nothing reads them here. */
  get readElsewhere(): boolean {
    return this.elsewhere?.() === true;
  }

  /** `run`, what it asks of the notes taken as they're parsed so far while their texts are read elsewhere: a note not
   *  given yet its stub, every note's lists of the parsed ones (what's drawn, a completion: SD-D12, SD-D13). */
  partially<T>(run: () => T): T {
    this.depth++;
    try {
      return run();
    } finally {
      this.depth--;
    }
  }

  /** Inside `partially`, the texts read elsewhere: what isn't parsed yet isn't read here. */
  get partial(): boolean {
    return this.depth > 0 && this.readElsewhere;
  }

  /** Inside `partially`, whether `rel` is a note whose text hasn't come: its stub, nothing of it known — a link to its
   *  heading neither found nor broken. */
  waits(rel: string): boolean {
    return this.partial && this.unparsed.has(rel) && !this.has(rel);
  }

  /** Notes not parsed yet, their texts read elsewhere: what's counted of every note is partial, and said so. */
  get unread(): boolean {
    return this.unparsed.size > 0 && this.readElsewhere;
  }

  /** `text`, read elsewhere for `file`, given for its parse — unless `file` is no longer the note's waiting to be
   *  parsed (parsed since, changed, gone, the vault built again: SD-D5). Whether it's taken. */
  give(file: NoteFile, text: NoteText): boolean {
    if (this.unparsed.get(file.rel) !== file) return false;
    this.given.set(file.rel, { file, text });
    return true;
  }

  /** The text given for `file`, taken for its parse; undefined when none was, or one for another file of its path. */
  take(file: NoteFile): NoteText | undefined {
    const had = this.given.get(file.rel);
    if (!had) return undefined;
    this.given.delete(file.rel);
    return had.file === file ? had.text : undefined;
  }

  /** The notes whose texts are given and still wait to be parsed, by their paths; those given for a file since parsed,
   *  changed or gone let go of. */
  ready(): string[] {
    for (const [rel, g] of this.given) if (this.unparsed.get(rel) !== g.file) this.given.delete(rel);
    return [...this.given.keys()];
  }

  /** Whether `rel`'s text is given, waiting for its parse. */
  has(rel: string): boolean {
    const g = this.given.get(rel);
    return !!g && g.file === this.unparsed.get(rel);
  }

  /** Every text given let go of: the vault built again, its notes' stubs new. */
  clear(): void {
    this.given.clear();
  }
}
