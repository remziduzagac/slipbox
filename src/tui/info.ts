// The Info view (3.19): the file on screen — its vault, its path, its properties, its links and backlinks, its git
// state — in folding sections, each row copied, followed or run.

import { listTasks } from "../core/documents/editing/tasks.ts";
import { placeAt } from "./editing.ts";
import { type ConventionPart, conventionOf, describeConvention } from "../core/workspace/links/convention.ts";
import { ELSEWHERE, rootLabel } from "../core/workspace/vaults/names.ts";
import { match } from "./match.ts";
import type { App } from "./app.ts";

/** The Info view. */
export class Info {
  constructor(readonly app: App) {}

  /** The Info view's folded sections, by name (3.19). */
  folded = new Set<string>();
  cache: { key: string; rows: Omit<InfoRow, "folded">[] } | null = null;

  // The Info view (3.19): what the file on screen is — where, which vault, its size and dates, its
  // text's counts and state — its properties (the frontmatter), its tags, its links and backlinks.

  /** The Info view's rows, sections folded as the view has them, filtered by `/`. */
  rows(): InfoRow[] {
    const q = this.app.rightView === "info" ? (this.app.outline.filter ?? "") : "";
    const out: InfoRow[] = [];
    let section: InfoRow | null = null;
    let kept: InfoRow[] = [];
    const flush = () => {
      if (section && (!q || kept.length)) out.push(section, ...(section.folded ? [] : kept));
      kept = [];
    };
    for (const r of this.data()) {
      if (r.heading) {
        flush();
        section = { ...r, folded: !q && this.folded.has(r.section) };
      } else if (!q || match(q, r.text)) kept.push({ ...r, folded: false });
    }
    flush();
    return out;
  }

  /** The rows' data, for the file on screen: made again when its text, or the notes', change. */
  private data(): Omit<InfoRow, "folded">[] {
    const view = this.app.view;
    if (!view) return [];
    const b = view.buf;
    // Why it isn't indexed (VV-D9): its row's `⊘` in the explorer, or its folder's.
    const why = b.virtual ? null : this.app.explorer.marks.whyAt(b.abs);
    const exported = b.rel ? this.app.exporter.lastPath(b.rel) : null;
    const key = `${exported}:${b.key}:${b.version}:${this.app.graph.generation}:${b.dirty}:${b.deleted}:${!!b.parsing}:${why}`;
    if (this.cache?.key === key) return this.cache.rows;
    const rows: Omit<InfoRow, "folded">[] = [];
    const head = (section: string) =>
      rows.push({ section, heading: true, key: section, value: "", depth: 0, text: section });
    const row = (section: string, k: string, value: string, act?: InfoRow["act"], depth = 0) =>
      rows.push({ section, heading: false, key: k, value, depth, text: `${k} ${value}`, act: act ?? { copy: value } });
    const entry = b.rel ? this.app.graph.entry(b.rel) : undefined;
    const note = b.kind.group === "note";
    // The file.
    head("File");
    row("File", "path", b.rel ?? b.abs, { copy: b.abs });
    row(
      "File",
      "vault",
      this.app.loc.mode === "folder"
        ? `${ELSEWHERE} — outside home and every vault: no index`
        : this.app.loc.mode === "home"
          ? "home (~)"
          : rootLabel(this.app.loc),
      { copy: this.app.loc.root },
    );
    row(
      "File",
      "kind",
      note ? `note (${b.kind.format})` : `${b.kind.group === "data" ? "data" : "text"} (${b.kind.format})`,
    );
    if (b.stamp) {
      const size = b.stamp.size;
      row(
        "File",
        "size",
        size < 1024
          ? `${size} bytes`
          : size < 1048576
            ? `${(size / 1024).toFixed(1)} KB`
            : `${(size / 1048576).toFixed(1)} MB`,
      );
      row("File", "modified", new Date(b.stamp.mtimeMs).toLocaleString());
    }
    const words = b.words();
    row(
      "File",
      "words",
      note
        ? `${words.toLocaleString("en")} (~${Math.max(1, Math.round(words / 230))} min)`
        : words.toLocaleString("en"),
    );
    row("File", "lines", b.lineStarts().length.toLocaleString("en"));
    row(
      "File",
      "encoding",
      [b.invalidUtf8 ? "invalid UTF-8" : "UTF-8", b.eol === "\r\n" ? "CRLF" : "LF", ...(b.bom ? ["BOM"] : [])].join(
        ", ",
      ),
    );
    // How it's indented (25.1), and where that was found.
    const ind = b.indent();
    const said =
      ind.from === "editorconfig" ? ".editorconfig" : ind.from === "file" ? "as the file is" : "its language's";
    const onSave = [ind.trimTrailing ? "trailing whitespace trimmed" : "", ind.finalNewline ? "a final newline" : ""]
      .filter(Boolean)
      .join(", ");
    row(
      "File",
      "indent",
      `${ind.tabs ? `tabs, ${ind.tabWidth} wide` : `${ind.size} spaces`} (${said})${onSave ? `; on save: ${onSave}` : ""}`,
    );
    row(
      "File",
      "state",
      b.deleted
        ? "deleted on disk"
        : b.conflictKept
          ? "unsaved — differs from disk"
          : b.dirty
            ? "unsaved changes"
            : "saved",
    );
    if (why) row("File", "index", `not indexed: ${why}`);
    // Its properties: the frontmatter, nested maps under their keys.
    // Parsing on other threads (15.1): the properties and tasks when it's done.
    const parsed = note && !b.parsing ? b.parsed : null;
    const fm = parsed ? parsed.frontmatter : null;
    if (fm) {
      head("Properties");
      const lines = fm.raw.split("\n");
      const lineOf = (k: string, from: number) => {
        const re = new RegExp(`^\\s*\\[?\\s*["']?${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']?\\s*(\\]|[:=])`);
        const i = lines.findIndex((l, n) => n >= from && re.test(l));
        return i < 0 ? -1 : i;
      };
      const walk = (obj: Record<string, unknown>, depth: number, from: number) => {
        for (const [k, v] of Object.entries(obj)) {
          const at = lineOf(k, from);
          const act = at >= 0 ? { line: at + 2 } : undefined;
          if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
            row("Properties", k, "", act, depth);
            walk(v as Record<string, unknown>, depth + 1, Math.max(from, at));
          } else {
            const shown = Array.isArray(v)
              ? v.map((x) => (x && typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ")
              : v instanceof Date
                ? v.toISOString().slice(0, 10)
                : String(v);
            row("Properties", k, shown, act, depth);
          }
        }
      };
      if (fm.error) row("Properties", "error", fm.error, { line: 1 });
      else if (fm.data) walk(fm.data, 0, 0);
    }
    // Its tags.
    const tags = entry?.tags ?? [];
    if (tags.length) {
      head("Tags");
      for (const t of tags) row("Tags", `#${t}`, "", { tag: t });
    }
    // What it links to and what links to it.
    head("Links");
    const links = b.rel ? this.app.graph.linksOf(b.rel) : [];
    const broken = links.filter((l) => l.resolvedKind === "unresolved").length;
    row("Links", "links", `${links.length}${broken ? ` (${broken} unresolved)` : ""}`, { run: "links.open" });
    row(
      "Links",
      "backlinks",
      // Elsewhere has no index (VV-D3): none to count, said so, not shown as none.
      this.app.loc.mode === "folder"
        ? `none in ${ELSEWHERE}: it has no index`
        : String(b.rel ? this.app.graph.backlinks(b.rel).length : 0),
      { run: "backlinks.open" },
    );
    row("Links", "headings", String(this.app.currentLayout(view).headings.length), { run: "outline.toggle" });
    if (note) {
      row("Links", "footnotes", String(this.app.footnotes.list().length), { run: "footnotes.toggle" });
      const tasks = parsed ? listTasks(parsed.tree) : [];
      if (tasks.length) row("Links", "tasks", `${tasks.filter((t) => t.checked).length} of ${tasks.length} done`);
      // How the links slipbox makes here look (21.4), and what said so (every note read, as for the
      // backlinks) — short, for a narrow panel: `y` copies it whole, as `slipbox info` says it.
      const c = conventionOf(this.app.graph, this.app.config, this.app.settings.origins);
      const copy = { copy: describeConvention(c) };
      const by = (p: ConventionPart<string>) =>
        p.source === "setting"
          ? "setting"
          : p.source === "tool"
            ? c.tool === "obsidian"
              ? "Obsidian"
              : "zk"
            : p.source === "notes"
              ? `notes ${p.share}%`
              : "ours";
      const one = new Set([c.style, c.path, c.extension].map(by)).size === 1;
      const shown = (value: string, p: ConventionPart<string>) => (one ? value : `${value} (${by(p)})`);
      row("Links", "writes", shown(c.style.value === "wiki" ? "wikilinks" : "markdown", c.style), copy);
      row(
        "Links",
        "path",
        shown({ relative: "relative", root: "from the vault's top", name: "by name" }[c.path.value], c.path),
        copy,
        1,
      );
      row("Links", ".md", shown(c.extension.value, c.extension), copy, 1);
      if (one) row("Links", "from", by(c.style), copy, 1);
    }
    if (note) {
      head("Export");
      row("Export", "Export…", exported ?? "Choose a format", {
        run: "note.export",
        ...(exported ? { copy: exported } : {}),
      });
    }
    this.cache = { key, rows };
    return rows;
  }

  /** `enter` on an Info row: a property's line, a tag's notes, a list or view, else its value copied. */
  openRow(row: InfoRow): void {
    if (row.heading) {
      // This row's section, whatever is selected (from the filter, the rows it's among are gone).
      if (!this.folded.delete(row.section)) this.folded.add(row.section);
      this.app.outline.selected = Math.max(
        0,
        this.rows().findIndex((r) => r.heading && r.section === row.section),
      );
      return;
    }
    const act = row.act;
    const view = this.app.view;
    if (!act || !view) return;
    if ("tag" in act) return this.app.search.openTagNotes(act.tag);
    if ("run" in act) {
      this.app.region = "content";
      return void this.app.run(act.run);
    }
    if ("line" in act) {
      this.app.history.push(view);
      placeAt(this.app, view, view.buf.lineStarts()[act.line - 1] ?? 0);
      this.app.region = "content";
      if (this.app.panels.narrow || this.app.ui.zen) this.app.outline.overlay = false;
      return;
    }
    this.app.copy(act.copy);
  }

  /** The Info view's keys (the outline's keymap, and `y`): move, open, fold its sections, filter, copy. */
  action(action: string): void {
    this.app.outline.pinned = false;
    if (action === "filter") {
      this.app.outline.filtering = true;
      return;
    }
    const rows = this.rows();
    const row = rows[this.app.outline.selected];
    switch (action) {
      case "down":
        this.app.outline.selected = Math.min(rows.length - 1, this.app.outline.selected + 1);
        break;
      case "up":
        this.app.outline.selected = Math.max(0, this.app.outline.selected - 1);
        break;
      case "top":
        this.app.outline.selected = 0;
        break;
      case "bottom":
        this.app.outline.selected = rows.length - 1;
        break;
      case "jump":
        if (row) this.openRow(row);
        break;
      case "fold":
        if (!row) break;
        if (!row.heading) this.app.outline.selected = rows.findIndex((r) => r.heading && r.section === row.section);
        else this.folded.add(row.section);
        break;
      case "unfold":
        if (row?.heading) this.folded.delete(row.section);
        break;
      case "export":
        if (this.app.view?.buf.kind.group === "note") {
          this.app.region = "content";
          void this.app.run("note.export");
        }
        break;
      case "copy":
        if (row?.section === "Export" && !row.heading && !(row.act && "copy" in row.act && row.act.copy)) {
          this.app.message("info", "no export for this note yet");
          break;
        }
        if (row && !row.heading) this.app.copy(row.act && "copy" in row.act && row.act.copy ? row.act.copy : row.value);
        break;
      case "edit":
        return this.app.properties.open();
      case "close":
        this.app.panels.showOutline(false);
        break;
      case "leave":
        this.app.region = "content";
        if (this.app.panels.narrow || this.app.ui.zen) this.app.outline.overlay = false;
        break;
      default:
        this.app.message("error", `unknown Info action: ${action}`);
    }
  }
}

/**
 * One row of the Info view (3.19): a section's heading, or a name and its value under one. `act`:
 * what `enter` does with it.
 */
export interface InfoRow {
  section: string;
  heading: boolean;
  key: string;
  value: string;
  /** A nested property's depth under its section. */
  depth: number;
  /** What the filter matches. */
  text: string;
  folded: boolean;
  act?: { copy: string } | { line: number } | { tag: string } | { run: string; copy?: string };
}
