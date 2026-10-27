// Problems (1.7, 19.x): the Problems panel's two tabs — the file on screen's problems from every source, and the
// root's — the marks in the text, and going to a problem.

import { join, relative } from "node:path";
import { placeAt } from "../editing/editing.ts";
import type { LinkProblem } from "../../../core/workspace/graph/graph.ts";
import { visibleLint, type LintVisibility } from "../../../core/documents/diagnostics/lint-visibility.ts";
import { parseMarkdown, type ParsedNote } from "../../../core/documents/markdown/parse.ts";
import type { LintIssue } from "../../../core/documents/diagnostics/lint.ts";
import { srcAt } from "../../../core/rendering/layout/ir.ts";
import {
  atLeast,
  frontmatterFindings,
  lintProblems,
  noteProblems,
  type Problem,
  SEVERITIES,
  syntaxProblems,
} from "../../../core/documents/diagnostics/diagnostics.ts";
import type { NoteBuffer } from "../buffers/buffer.ts";
import { match } from "../../shell/overlays/match.ts";
import { keyChar } from "../../shell/input/keys.ts";
import type { App, View } from "../../app/runtime/app.ts";
import { readText } from "../../../core/foundation/platform/fsutil.ts";

/** The Problems panel and the problems marked in the text. */
export class Problems {
  constructor(readonly app: App) {}

  /** The Problems panel (1.7, at the bottom): shown or not, its tab, each tab's place. */
  panel: ProblemsPanel = {
    shown: false,
    tab: "file",
    height: null,
    file: { selected: 0, scroll: 0, filter: "", filtering: false },
    all: { selected: 0, scroll: 0, filter: "", filtering: false },
  };
  /** The Problems panel's folded sections (All), by name (1.7). */
  folded = new Set<string>();
  showAllLint = false;
  private vaultParses = new Map<string, ParsedNote | null>();
  private vaultIssues: LintIssue[] | null = null;
  private vaultGeneration = -1;

  /** Visibility is recalculated from retained findings whenever view settings change. */
  private lintVisibility(issues: readonly LintIssue[], parsed: ParsedNote | null): LintVisibility {
    return visibleLint(
      issues,
      parsed,
      this.app.config.lint,
      { wrap: this.app.ui.wrap, codeWrap: this.app.ui.wrap && this.app.ui.code_wrap === "wrap" },
      this.showAllLint,
    );
  }

  private fileLint(view: View): LintVisibility {
    const buf = view.buf;
    return this.lintVisibility(buf.lint?.issues ?? [], buf.kind.group === "note" ? buf.parsed : null);
  }

  private vaultLint(): LintVisibility {
    const issues = this.app.languages.vaultLint.issues ?? null;
    if (issues !== this.vaultIssues || this.app.graph.generation !== this.vaultGeneration) {
      this.vaultParses.clear();
      this.vaultIssues = issues;
      this.vaultGeneration = this.app.graph.generation;
    }
    const shown: LintIssue[] = [];
    const hidden: LintVisibility["hidden"] = new Map();
    const files = new Map<string, LintIssue[]>();
    for (const issue of issues ?? []) {
      const list = files.get(issue.file) ?? [];
      list.push(issue);
      files.set(issue.file, list);
    }
    for (const [file, list] of files) {
      if (!this.vaultParses.has(file)) {
        let parsed: ParsedNote | null = null;
        try {
          parsed = parseMarkdown(readText(file).text);
        } catch {
          /* Unreadable files keep their findings. */
        }
        this.vaultParses.set(file, parsed);
      }
      const result = this.lintVisibility(list, this.vaultParses.get(file)!);
      shown.push(...result.shown);
      for (const [reason, count] of result.hidden) hidden.set(reason, (hidden.get(reason) ?? 0) + count);
    }
    return { shown, hidden };
  }

  hiddenCaption(): string {
    const v = this.app.view;
    const result =
      this.panel.tab === "all"
        ? this.vaultLint()
        : v && v.buf.lint?.version === v.buf.version
          ? this.fileLint(v)
          : null;
    const reasons = [...(result?.hidden ?? [])].map(
      ([reason, count]) => `${count} ${this.showAllLint ? "revealed" : "hidden"}: ${reason}`,
    );
    return reasons.length ? `${reasons.join("; ")} (a: ${this.showAllLint ? "hide again" : "show all"})` : "";
  }

  toggleLint(): void {
    this.showAllLint = !this.showAllLint;
    this.panel.file.selected = this.panel.file.scroll = this.panel.all.selected = this.panel.all.scroll = 0;
  }

  /** A note's own problems — its links, its conflicts — kept until the vault or the note changes. */
  private readonly noteCache = new WeakMap<NoteBuffer, { key: string; list: Problem[] }>();

  /**
   * A file's problems as they are now (19.8), from every source, at least `[diagnostics] severity`:
   * its syntax errors (16.9; in source mode and the code view, out of insert, for the text as it is), the linter's
   * findings (3.21; for the text they were found in), and a vault note's links and conflict markers
   * (while it's as saved: the graph has the file's). `any`: whether there are some at all — the syntax
   * errors of the last parse too, insert or not.
   */
  ofView(view: View, any = false): Problem[] {
    const buf = view.buf;
    const out: Problem[] = [];
    const syn = buf.syntax;
    // A language server, once it's said what it finds, has the file's syntax errors: tree-sitter's are then left out.
    // Shown in source mode and the code view alike (DF-D10).
    const shows = view.source || this.app.isCodeDocument(buf);
    if (
      syn?.errors.length &&
      !buf.serverProblems.size &&
      (any || (shows && !view.insert && syn.version === buf.version))
    )
      out.push(...syntaxProblems(syn.errors));
    if (buf.lint?.issues.length && (any || buf.lint.version === buf.version))
      out.push(...lintProblems(this.fileLint(view).shown));
    // Its language servers' (19.1), for the text they were found in: typing hides them until they answer again.
    for (const p of buf.serverProblems.values()) if (any || p.version === buf.version) out.push(...p.list);
    // Its linters' (19.19), likewise: one reading the file, until it's saved and run again.
    for (const p of buf.linterProblems.values()) if (any || p.version === buf.version) out.push(...p.list);
    if (buf.rel && this.app.graph.notes.has(buf.rel) && (any || !buf.dirty)) {
      const key = `${this.app.graph.generation}:${buf.version}`;
      let hit = this.noteCache.get(buf);
      if (hit?.key !== key) {
        hit = { key, list: noteProblems(this.app.graph, buf.rel) };
        this.noteCache.set(buf, hit);
      }
      out.push(...hit.list);
    }
    const min = this.app.config.diagnostics.severity;
    return out.filter((p) => atLeast(p.severity, min));
  }

  // The Problems panel (1.7, 19.8), at the bottom: the file on screen's problems, and the root's — links that
  // reach nothing or several notes, lint, conflicts, orphans — each opened where it is.

  /** The file on screen's problems, every source's, by where they start: the panel's This file tab. */
  ofFile(): Problem[] {
    const v = this.app.view;
    if (!v) return [];
    return [...this.ofView(v)].sort(
      (a, b) =>
        a.start.line - b.start.line ||
        a.start.column - b.start.column ||
        SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity),
    );
  }

  /** This file's problems as its tab lists them: those its filter matches — the place, the message, who found it, the line. */
  fileRows(): Problem[] {
    const list = this.ofFile();
    const q = this.panel.file.filter;
    if (!q) return list;
    const lines = this.app.view?.buf.lines() ?? [];
    return list.filter((p) =>
      match(
        q,
        `${p.start.line}:${p.start.column} ${p.message} ${p.source} ${p.code ?? ""} ${lines[p.start.line - 1] ?? ""}`,
      ),
    );
  }

  /** The panel's problem chosen in This file, while it has the focus: marked in the text whatever the marks say. */
  chosen(): Problem | undefined {
    const p = this.panel;
    if (!p.shown || p.tab !== "file" || this.app.region !== "problems") return undefined;
    return this.fileRows()[p.file.selected];
  }

  /**
   * The panel's height (its tabs' row included) in the `rows` the windows and it share: as resized, else a third
   * of them — at least PANEL_ROWS where that's under 40% of them — always leaving the note 4; 0 when it can't have 3.
   */
  panelRows(rows: number): number {
    if (!this.panel.shown) return 0;
    const h = this.panel.height ?? Math.min(Math.max(PANEL_ROWS, Math.floor(rows / 3)), Math.floor(rows * 0.4));
    const fit = Math.min(h, rows - 5);
    return fit >= 3 ? fit : 0;
  }

  /** The panel resized to `h` rows (resize mode, a drag of its rule): kept, within what the screen allows. */
  resize(h: number): void {
    this.panel.height = Math.max(3, Math.min(200, Math.round(h)));
  }

  /**
   * A sign of the problems bar, clicked (19.9): the panel on This file, that problem chosen — the worst starting
   * there — the note on it, the panel keeping the keys.
   */
  openAt(line: number, column: number): void {
    const p = this.panel;
    p.file.filter = "";
    p.file.filtering = false;
    const list = this.fileRows();
    const i = list.findIndex((x) => x.start.line === line && x.start.column === column);
    p.shown = true;
    p.tab = "file";
    p.file.selected = Math.max(0, i);
    this.app.region = "problems";
    this.showFileProblem(list[p.file.selected]);
  }

  /**
   * The Problems panel opened on a tab and focused (`space n q` This file, `space v p` All; the status line's
   * problems, clicked, This file); already open there and focused, closed.
   */
  open(tab: "file" | "all"): void {
    const p = this.panel;
    if (p.shown && p.tab === tab && this.app.region === "problems") return this.close();
    if (tab === "all") {
      this.app.graph.forgetProblems();
      this.app.languages.lintVault();
    }
    // This file: the problem at the cursor's line, or the next one after it.
    if (tab === "file" && this.app.view) {
      const at = this.app.view.cur.row;
      const line = srcAt(
        this.app.currentLayout(this.app.view).lines[at] ?? ({ src: 1 } as never),
        this.app.view.cur.col,
      );
      const list = this.fileRows();
      const i = list.findIndex((x) => x.end.line >= line);
      p.file.selected = Math.max(0, i < 0 ? list.length - 1 : i);
    }
    p.shown = true;
    p.tab = tab;
    this.app.region = "problems";
  }

  close(): void {
    const p = this.panel;
    p.shown = false;
    p.all.filtering = false;
    p.file.filtering = false;
    if (this.app.region === "problems") this.app.region = "content";
  }

  /** The panel's keys: the explorer's moves, `tab` between its tabs; This file's moves take the cursor to the problem. */
  panelAction(action: string): void {
    const p = this.panel;
    if (action === "show_all") return void this.app.run("problems.show_all");
    if (action === "switch") {
      if (p.tab === "file") this.open("all");
      else p.tab = "file";
      return;
    }
    if (p.tab === "all") return this.action(action);
    const list = this.fileRows();
    const s = p.file;
    const go = (i: number) => {
      s.selected = Math.max(0, Math.min(list.length - 1, i));
      this.showFileProblem(list[s.selected]);
    };
    switch (action) {
      case "down":
        return go(s.selected + 1);
      case "up":
        return go(s.selected - 1);
      case "top":
        return go(0);
      case "bottom":
        return go(list.length - 1);
      case "open":
      case "open_tab":
      case "expand":
      case "open_split":
        return this.showFileProblem(list[s.selected], true);
      case "filter":
        s.filtering = true;
        return;
      case "close":
        return this.close();
      case "leave":
        this.app.region = "content";
        return;
    }
  }

  /** A problem of the file on screen: the cursor onto it — the panel keeping the focus, unless `go` (enter) moves it there. */
  showFileProblem(pr: Problem | undefined, go = false): void {
    const v = this.app.view;
    if (!v || !pr) return;
    if (go) this.app.history.push(v);
    this.app.placeAtLine(v, pr.start.line, pr.start.column);
    if (go) this.app.region = "content";
  }

  /** The panel's tab's list state: This file's or All's. */
  list(): PanelList {
    const p = this.panel;
    return p.tab === "file" ? p.file : p.all;
  }

  /** How many problems the All tab has: links, lint, conflicts — orphans, notes nothing links to, aside. */
  count(): number {
    // Elsewhere has no index to check its links across (VV-D3): none counted; the tab says why.
    if (this.app.loc.mode === "folder") return 0;
    const p = this.app.graph.problems();
    const conflicts = [...(this.app.git.states ?? [])].filter(([, st]) => st === "conflict").length;
    const frontmatter = frontmatterFindings(this.app.graph).reduce((n, f) => n + f.problems.length, 0);
    return (
      p.broken.length + p.ambiguous.length + p.fragile.length + frontmatter + this.vaultLint().shown.length + conflicts
    );
  }

  /** A click on a row of the panel: This file's selects its problem (the note shows it), a second click goes there;
   *  All's opens it in a tab (a heading folds), as `enter` does. */
  clickRow(i: number, clicks: number): void {
    const p = this.panel;
    this.app.region = "problems";
    if (p.tab === "file") {
      const list = this.fileRows();
      p.file.selected = i;
      return this.showFileProblem(list[i], clicks >= 2);
    }
    const rows = this.rows();
    const row = rows[i];
    if (!row) return;
    p.all.selected = i;
    if (row.heading) return this.action(row.folded ? "expand" : "collapse");
    // One click opens it (a tab); the second of a double-click has nothing left to do.
    if (clicks >= 2) return;
    // The clicked row, of the filtered list (as enter in the filter): the filter clears.
    p.all.filter = "";
    p.all.filtering = false;
    return this.openRow(row, rows);
  }

  /** Its rows: each section's heading (with its count), its problems under it unless folded; `/` filters. */
  rows(): ProblemRow[] {
    if (this.app.loc.mode === "folder") return [];
    const q = this.panel.all.filter;
    const p = this.app.graph.problems();
    const out: ProblemRow[] = [];
    const written = (l: LinkProblem) => (l.kind === "wiki" || l.kind === "embed" ? `[[${l.target}]]` : l.target);
    const section = (name: string, list: LinkProblem[], why: (l: LinkProblem) => string) => {
      const rows = list
        .map((l) => ({ l, label: `L${l.line}`, detail: `${written(l)}${why(l) ? `  ${why(l)}` : ""}` }))
        .filter((r) => !q || match(q, `${r.l.from} ${r.label} ${r.detail}`));
      if (q && !rows.length) return;
      const folded = !q && this.folded.has(name);
      out.push({ section: name, heading: true, label: `${name} (${list.length})`, detail: "", text: name, folded });
      if (folded) return;
      // Under the note each is in: the path once, then its problems by line.
      let note = "";
      for (const r of rows) {
        if (r.l.from !== note) {
          note = r.l.from;
          out.push({ section: name, heading: false, note, label: note, detail: "", text: note, folded: false });
        }
        out.push({
          section: name,
          heading: false,
          label: r.label,
          detail: r.detail,
          text: `${r.l.from} ${r.label} ${r.detail}`,
          folded: false,
          link: r.l,
        });
      }
    };
    section("Broken links", p.broken, (l) => l.reason ?? "");
    section("Ambiguous links", p.ambiguous, (l) => `— ${l.candidates.length} notes`);
    // Won by where they're written: a note of the name nearer would take them (code actions name them for sure).
    section("Fragile links", p.fragile, (l) => `— ${l.reason}; [[${l.fix}]] for sure`);
    // Frontmatter (22.2): notes breaking their document type's rules, by note, each finding at its line.
    const fm = frontmatterFindings(this.app.graph);
    const fmRows = fm
      .flatMap((f) =>
        f.problems.map((x) => ({ path: f.path, line: x.start.line, label: `L${x.start.line}`, detail: x.message })),
      )
      .filter((r) => !q || match(q, `${r.path} ${r.label} ${r.detail}`));
    if (fmRows.length) {
      const folded = !q && this.folded.has("Frontmatter");
      out.push({
        section: "Frontmatter",
        heading: true,
        label: `Frontmatter (${fm.reduce((n, f) => n + f.problems.length, 0)})`,
        detail: "",
        text: "Frontmatter",
        folded,
      });
      if (!folded) {
        let note = "";
        for (const r of fmRows) {
          if (r.path !== note) {
            note = r.path;
            out.push({
              section: "Frontmatter",
              heading: false,
              note,
              label: note,
              detail: "",
              text: note,
              folded: false,
            });
          }
          out.push({
            section: "Frontmatter",
            heading: false,
            label: r.label,
            detail: r.detail,
            text: `${r.path} ${r.label} ${r.detail}`,
            folded: false,
            frontmatter: { path: r.path, line: r.line },
          });
        }
      }
    }
    // Lint (3.21): the linter's findings over the vault, by note; while it runs, said so.
    if (this.app.languages.lintCmd || this.app.languages.vaultLint.issues) {
      const all = this.app.languages.vaultLint.issues ? this.vaultLint().shown : null;
      const rows = (all ?? [])
        .map((i) => ({
          i,
          rel: relative(this.app.loc.root, i.file),
          label: `L${i.line}`,
          detail: `${i.rule} ${i.name}  ${i.description}`,
        }))
        .filter((r) => !q || match(q, `${r.rel} ${r.label} ${r.detail}`));
      if (!q || rows.length) {
        const folded = !q && this.folded.has("Lint");
        out.push({
          section: "Lint",
          heading: true,
          label: all
            ? `Lint (${all.length})${this.app.languages.vaultLint.running ? " …" : ""}`
            : this.app.languages.vaultLint.skipped && !this.app.languages.vaultLint.running
              ? `Lint — not shown: ${this.app.languages.vaultLint.skipped}`
              : "Lint — linting…",
          detail: "",
          text: "Lint",
          folded,
        });
        if (!folded) {
          let note = "";
          for (const r of rows) {
            if (r.rel !== note) {
              note = r.rel;
              out.push({ section: "Lint", heading: false, note, label: note, detail: "", text: note, folded: false });
            }
            out.push({
              section: "Lint",
              heading: false,
              label: r.label,
              detail: r.detail,
              text: `${r.rel} ${r.label} ${r.detail}`,
              folded: false,
              lint: r.i,
            });
          }
        }
      }
    }
    // A merge's conflicts (5.12): the files git says are unmerged, each at its first marker.
    const conflicts = [...(this.app.git.states ?? [])]
      .filter(([, st]) => st === "conflict")
      .map(([path]) => path)
      .sort();
    const shownConflicts = conflicts.filter((n) => !q || match(q, n));
    if (shownConflicts.length) {
      const folded = !q && this.folded.has("Conflicts");
      out.push({
        section: "Conflicts",
        heading: true,
        label: `Conflicts (${conflicts.length})`,
        detail: "",
        text: "Conflicts",
        folded,
      });
      if (!folded) {
        for (const path of shownConflicts) {
          const line = conflictLine(join(this.app.loc.root, path));
          out.push({
            section: "Conflicts",
            heading: false,
            label: path,
            detail: line ? `L${line}` : "",
            text: path,
            folded: false,
            conflict: { path, line: Math.max(1, line) },
          });
        }
      }
    }
    // Orphans (9.5): each a note's row alone.
    const orphans = p.orphans.filter((n) => !q || match(q, n));
    if (!q || orphans.length) {
      const folded = !q && this.folded.has("Orphans");
      out.push({
        section: "Orphans",
        heading: true,
        label: `Orphans (${p.orphans.length})`,
        detail: "",
        text: "Orphans",
        folded,
      });
      if (!folded)
        for (const n of orphans)
          out.push({ section: "Orphans", heading: false, note: n, label: n, detail: "", text: n, folded: false });
    }
    return out;
  }

  /** Open a problem's note at it: the line, the cursor on the link. */
  jumpTo(l: LinkProblem, where: "here" | "tab" | "split" = "here"): void {
    this.app.openWhere(l.from, l.line, where);
    const v = this.app.view;
    if (v && v.buf.rel === l.from) {
      // Rendered, onto the link as drawn (the ones with its target on its line, in order); in source mode, its text.
      const same = this.at(l.from).filter((x) => x.line === l.line && x.target === l.target);
      const drawn = this.app.currentLayout(v).links.filter((x) => x.src === l.line && x.target === l.target)[
        Math.max(0, same.indexOf(l))
      ];
      if (drawn && drawn.line >= 0 && !this.app.currentLayout(v).lines[drawn.line]?.srcMap)
        this.app.moveCursor(v, { row: drawn.line, col: drawn.col });
      else placeAt(this.app, v, (v.buf.lineStarts()[l.line - 1] ?? 0) + l.column - 1);
    }
    this.app.region = "content";
    if (this.app.panels.narrow || this.app.ui.zen) this.app.sidebar.overlay = false;
  }

  /** Open a linter's finding: its note at its line (and column, when it says one). */
  jumpToLint(i: LintIssue, where: "here" | "tab" | "split" = "here"): void {
    this.app.openAt(relative(this.app.loc.root, i.file), i.line, i.column ?? 1, where);
  }

  /** A Problems row opened — in a tab by default (`enter`, a click), as the explorer opens a note: its problem; a note's
   *  row, the note at its first in that section, of `rows` (the ones shown, so a filter's pick) — an orphan's, the
   *  note. A heading's does nothing. */
  private openRow(row: ProblemRow, rows: ProblemRow[], where: "here" | "tab" | "split" = "tab"): void {
    if (row.conflict) return this.app.openAt(row.conflict.path, row.conflict.line, 1, where);
    if (row.frontmatter) return this.app.openAt(row.frontmatter.path, row.frontmatter.line, 1, where);
    if (row.link) return this.jumpTo(row.link, where);
    if (row.lint) return this.jumpToLint(row.lint, where);
    if (!row.note || row.heading) return;
    const first = rows.find(
      (r) =>
        r.section === row.section &&
        (r.link?.from === row.note || (r.lint && relative(this.app.loc.root, r.lint.file) === row.note)),
    );
    if (first?.link) return this.jumpTo(first.link, where);
    if (first?.lint) return this.jumpToLint(first.lint, where);
    this.app.openWhere(row.note, 1, where);
    this.app.region = "content";
    if (this.app.panels.narrow || this.app.ui.zen) this.app.sidebar.overlay = false;
  }

  /** A note's problems, as the graph has them. */
  private at(rel: string): LinkProblem[] {
    const p = this.app.graph.problems();
    return [...p.broken, ...p.ambiguous].filter((x) => x.from === rel);
  }

  /** The panel's All tab's keys (the explorer's keymap): move, go there, fold its sections, filter, close, leave. */
  action(action: string): void {
    const s = this.panel.all;
    const rows = this.rows();
    const row = rows[s.selected];
    switch (action) {
      case "down":
        s.selected = Math.min(rows.length - 1, s.selected + 1);
        break;
      case "up":
        s.selected = Math.max(0, s.selected - 1);
        break;
      case "top":
        s.selected = 0;
        break;
      case "bottom":
        s.selected = rows.length - 1;
        break;
      case "open":
      case "open_tab":
      case "expand":
      case "open_split":
        // As the explorer's keys: enter and l a tab of its own (or the tab showing it), o this window, s the split.
        if (!row) break;
        if (row.heading) {
          if (row.folded) this.folded.delete(row.section);
          else if (action !== "expand") this.folded.add(row.section);
        } else this.openRow(row, rows, action === "open" ? "here" : action === "open_split" ? "split" : "tab");
        break;
      case "collapse":
        if (!row) break;
        if (!row.heading) s.selected = rows.findIndex((r) => r.heading && r.section === row.section);
        else this.folded.add(row.section);
        break;
      case "filter":
        s.filtering = true;
        break;
      case "close":
        this.close();
        break;
      case "leave":
        this.app.region = "content";
        break;
      case "cut":
        // `x` on a merge's conflict: the merge screen on its file (GIT-D5).
        if (row?.conflict) void this.app.run(`git.merge_screen ${row.conflict.path}`);
        else if (row) this.app.message("info", "x opens the merge screen on a conflict's file");
        break;
      // The explorer's other actions (new, rename…) mean nothing here.
    }
  }

  /** Keys while a tab's filter has them: type, move, go there, clear. */
  filterKey(key: string): void {
    const p = this.panel;
    const s = p.tab === "file" ? p.file : p.all;
    const rows: unknown[] = p.tab === "file" ? this.fileRows() : this.rows();
    const typed = keyChar(key);
    switch (key) {
      case "escape":
      case "ctrl+c":
      case "ctrl+g":
        s.filter = "";
        s.filtering = false;
        return;
      case "enter": {
        if (p.tab === "file") {
          const pr = rows[s.selected] as Problem | undefined;
          s.filter = "";
          s.filtering = false;
          if (!pr) return;
          s.selected = Math.max(0, this.fileRows().indexOf(pr));
          return this.showFileProblem(pr, true);
        }
        const all = rows as ProblemRow[];
        // On a heading (rows that came after the typing, a section's git or lint arriving): its first problem.
        let row = all[s.selected];
        if (row?.heading) row = all.slice(s.selected).find((r) => !r.heading) ?? row;
        if (!row) return;
        s.filter = "";
        s.filtering = false;
        return this.openRow(row, all);
      }
      case "down":
      case "ctrl+n":
      case "ctrl+j":
      case "tab":
        s.selected = Math.min(rows.length - 1, s.selected + 1);
        return;
      case "up":
      case "ctrl+p":
      case "ctrl+k":
      case "shift+tab":
        s.selected = Math.max(0, s.selected - 1);
        return;
      case "backspace":
        s.filter = [...s.filter].slice(0, -1).join("");
        break;
      case "ctrl+w":
      case "ctrl+backspace":
        s.filter = s.filter.replace(/\S*\s*$/, "");
        break;
      case "ctrl+u":
        s.filter = "";
        break;
      default:
        if (typed === null) return;
        s.filter += typed;
    }
    this.refiltered();
  }

  /** A tab's filter changed (typed, pasted): the selection to the first problem shown. */
  refiltered(): void {
    const p = this.panel;
    const s = p.tab === "file" ? p.file : p.all;
    s.scroll = 0;
    s.selected =
      p.tab === "file"
        ? 0
        : Math.max(
            0,
            this.rows().findIndex((r) => !r.heading),
          );
  }
}

/** The first line of a file with a merge's conflict marker, or 0. */
function conflictLine(abs: string): number {
  try {
    return (
      readText(abs)
        .text.split(/\r?\n/)
        .findIndex((l) => /^<{7}( |$)/.test(l)) + 1
    );
  } catch {
    return 0;
  }
}

/** One row of the Problems panel's All tab (1.7): a section's heading, a note with problems under it, or a problem. */
interface ProblemRow {
  section: string;
  heading: boolean;
  /** A note's row (its problems under it): its path. */
  note?: string;
  /** What's shown first: a heading's name and count, a note's path, a problem's line (`L12`). */
  label: string;
  /** How it's written, and why it's a problem. */
  detail: string;
  text: string;
  folded: boolean;
  link?: LinkProblem;
  /** A linter's finding (3.21). */
  lint?: LintIssue;
  /** A file in a merge's conflict (5.12), at its first marker. */
  conflict?: { path: string; line: number };
  /** Frontmatter that breaks its document type's rules (22.2), at its line. */
  frontmatter?: { path: string; line: number };
}

/** The Problems panel's least height (1.7), its tabs' row included, on a screen tall enough for it. */
export const PANEL_ROWS = 12;

/**
 * The Problems panel (1.7, 19.8), full width at the bottom: in tabs, the file on screen's problems — from every
 * source, each with its line — and the root's (its links' and lint's, its conflicts, its orphans). Each tab keeps its
 * selection, its first row shown and its filter (`/`).
 */
interface ProblemsPanel {
  shown: boolean;
  tab: "file" | "all";
  /** Its height, its tabs' row included, as resized (resize mode, a drag of its rule); null: a third of the screen. */
  height: number | null;
  file: PanelList;
  all: PanelList;
}

/** One of the Problems panel's lists: its selection, its first row shown, its filter and whether keys go to it. */
interface PanelList {
  selected: number;
  scroll: number;
  filter: string;
  filtering: boolean;
}
