// The properties editor (3.20): a note's frontmatter in the floating window, with every editing key there is; closed
// or saved, its text goes back into the note as one undo step.

import { cannotEdit } from "./documents/editing/editing.ts";
import { TOP } from "../core/workspace/session/position.ts";
import { parseMarkdown } from "../core/documents/markdown/parse.ts";
import { NoteBuffer } from "./documents/buffers/buffer.ts";
import type { App } from "./app/runtime/app.ts";

/** The properties editor. */
export class Properties {
  constructor(readonly app: App) {}

  /** The frontmatter's span in a note's text: the fences, and the text between them; null without one. */
  private span(source: string): {
    start: number;
    end: number;
    innerStart: number;
    innerEnd: number;
    bare: boolean;
    format: "yaml" | "toml";
  } | null {
    // CRLF lines too; an empty one (the closing fence right after the opening) is tried first, so
    // it never reaches on to a `---` rule further down.
    const m = /^(---|\+\+\+)[ \t]*\r?\n(?:([\s\S]*?)\r?\n)??(---|\.\.\.|\+\+\+)[ \t]*(?:\r?\n|$)/.exec(source);
    if (!m || (m[1] === "+++") !== (m[3] === "+++")) return null;
    const innerStart = /^(---|\+\+\+)[ \t]*\r?\n/.exec(source)![0].length;
    const innerEnd = innerStart + (m[2]?.length ?? 0);
    // bare: no line between the fences, so text put there brings its own line end.
    return {
      start: 0,
      end: m[0].length,
      innerStart,
      innerEnd,
      bare: m[2] === undefined,
      format: m[1] === "+++" ? "toml" : "yaml",
    };
  }

  /** Edit the current note's properties — its frontmatter, YAML or TOML — in a floating editor (3.20). */
  open(): void {
    const view = this.app.view;
    if (this.app.floating) return;
    if (view?.buf.kind.group !== "note" || view.buf.rel === null)
      return this.app.message("info", "properties are a note's: its frontmatter");
    const why = cannotEdit(view);
    if (why) return this.app.message("warn", `${why} — not editing`);
    const note = view.buf;
    const span = this.span(note.source);
    const original = span ? note.source.slice(span.innerStart, span.innerEnd).replace(/\r\n/g, "\n") : "";
    const format = span?.format ?? "yaml";
    const buf = new NoteBuffer(null, `${note.abs}#properties`, `${note.key}#properties`);
    buf.kind = { group: "data", format };
    buf.virtual = { save: (text) => this.write(text) };
    buf.loadText(original ? `${original}\n` : "");
    const fv = this.app.makeView(buf, { ...TOP }, { anchor: { ...TOP }, sub: 0, col: 0 });
    this.app.floating = {
      kind: "properties",
      view: fv,
      note,
      format,
      original,
      title: `Properties — ${this.app.displayName(note)} (${format === "toml" ? "TOML" : "YAML"})`,
    };
    this.app.lens.setViewMode(fv, "source");
    this.app.region = "content";
  }

  /**
   * Write the floating editor's text into its note's frontmatter: one undo step there, the note
   * saved. Text that doesn't parse, or a frontmatter changed under it meanwhile, asks first; false
   * while it asks (the editor stays). `close`: asked by closing the editor, which a yes then closes;
   * from `ctrl+s` or `:wa`, a yes keeps it open, its text saved.
   */
  write(text: string, sure = false, close = false): boolean {
    const f = this.app.floating;
    if (f?.kind !== "properties") return false;
    const note = f.note;
    const body = text.replace(/\s+$/, "");
    const span = this.span(note.source);
    const now = span ? note.source.slice(span.innerStart, span.innerEnd).replace(/\r\n/g, "\n") : "";
    if (!sure && now !== f.original) {
      this.app.overlays.confirm(
        `${this.app.displayName(note)}'s properties changed while you edited them. Write yours over them?`,
        () => this.writtenAfterAsking(f, text, close),
      );
      return false;
    }
    if (!sure && body) {
      const probe = parseMarkdown(f.format === "toml" ? `+++\n${body}\n+++\n` : `---\n${body}\n---\n`).frontmatter;
      if (probe?.error) {
        this.app.overlays.confirm(
          `The properties don't parse (${probe.error.split("\n")[0]}). Write them anyway?`,
          () => this.writtenAfterAsking(f, text, close),
        );
        return false;
      }
    }
    const fence = f.format === "toml" ? "+++" : "---";
    // Written with the note's own line ends (a CRLF note stays CRLF).
    const eol = note.eol;
    const lines = body.replace(/\r?\n/g, eol);
    // Emptied: the frontmatter goes; new: it comes first.
    const edit = span
      ? body
        ? { at: span.innerStart, length: span.innerEnd - span.innerStart, text: span.bare ? `${lines}${eol}` : lines }
        : { at: 0, length: span.end, text: "" }
      : body
        ? { at: 0, length: 0, text: `${fence}${eol}${lines}${eol}${fence}${eol}` }
        : null;
    // The note gone on disk (or never valid UTF-8) meanwhile: not written, nor brought back.
    const why = cannotEdit({ buf: note });
    if (why) this.app.message("warn", `${why} — not writing the properties`);
    else if (edit && !(span && body === now)) {
      note.edit(edit.at, edit.length, edit.text); // one edit: one undo step
      for (const v of this.app.allViews()) if (v.buf === note) v.layoutKey = "";
      if (this.app.saving.save(note, true))
        this.app.message("info", `properties written to ${this.app.displayName(note)}`);
      // Any other failure has said why already.
      else if (note.changedOnDisk() && !note.deleted)
        this.app.message(
          "warn",
          `${this.app.displayName(note)}'s properties changed — not saved yet (the file changed on disk: space n w decides)`,
        );
    }
    f.original = body;
    return true;
  }

  /** A yes to writing the properties: written; then the editor closed, or (from a save) its text saved. */
  private writtenAfterAsking(f: NonNullable<App["floating"]>, text: string, close: boolean): void {
    if (!this.write(text, true, close)) return;
    if (close) this.app.floating = null;
    else if (f.view.buf.source === text) f.view.buf.markSaved();
  }
}
