// Export in the TUI (10.x): notes picked, a format chosen, a place to write it asked — beside the note, or where you
// say — and written there, never over a note; over a file that isn't an earlier export only once you say so (D243).

import { prepareExport } from "../core/rendering/export/jobs.ts";
import type { PreparedExport } from "../core/rendering/export/spool.ts";
import { statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import { climbsOut, readJson, writeJson } from "../core/foundation/platform/fsutil.ts";
import {
  defaultTarget,
  type ExportFormat,
  exportTarget,
  FORMATS,
  formatFor,
  NotAnExport,
} from "../core/rendering/export/index.ts";
import { stateDir, userFolders } from "../core/foundation/platform/paths.ts";
import { openSaveAs, type SaveAsOverlay, type SavePlace } from "./saveas.ts";
import { rank } from "./match.ts";
import type { App, ListItem, ListOverlay } from "./app/runtime/app.ts";

/** Export: notes, a format, a place. */
export class Exporter {
  constructor(readonly app: App) {}

  /** The exports running, or waiting their turn: each one's own cancel. */
  private jobs = new Set<AbortController>();

  /** Every export running or waiting stopped before it's written; false where there's none (`quiet`: nothing said). */
  cancel(quiet = false): boolean {
    if (!this.jobs.size) {
      if (!quiet) this.app.message("info", "no export is running");
      return false;
    }
    for (const job of this.jobs) job.abort();
    return true;
  }

  private pathFile = "";
  private paths: Record<string, string> = {};

  lastPath(rel: string): string | null {
    const file = join(stateDir(this.app.loc), "export.json");
    if (this.pathFile !== file) {
      this.pathFile = file;
      this.paths = readJson<{ paths?: Record<string, string> }>(file, {})?.paths ?? {};
    }
    return this.paths[rel] ?? null;
  }

  /**
   * Export a note (10.x): the explorer's selected one, or this one. Its format picked — or named, `:export docx` — then
   * where asked: beside it, its name, unless you say otherwise.
   */
  exportNote(name?: string): void {
    const t = this.app.explorer.noteTarget();
    if (!t) return;
    if (!this.app.graph.notes.has(t.rel))
      return this.app.message("info", `export: ${t.rel} isn't a note — a note is exported`);
    this.chooseFormat([t.rel], name);
  }

  /**
   * Export notes as one document (10.9), a chapter each: picked from the root's notes in the order wanted — the one on
   * screen (or the explorer's) first — each pick numbered, a pick again taken out; then "Export…", first in the list
   * whatever's typed, asks the format and where, as `space n o` does.
   */
  compose(picked?: string[], input = "", selected?: number): void {
    if (!picked) {
      const t = this.app.explorer.focused()
        ? this.app.explorer.item()
        : this.app.view?.buf.rel
          ? { rel: this.app.view.buf.rel, dir: false }
          : null;
      picked = t && !t.dir && this.app.graph.notes.has(t.rel) ? [t.rel] : [];
    }
    const chosen = picked;
    const go: ListItem[] = chosen.length
      ? [
          {
            label: `Export ${chosen.length === 1 ? chosen[0] : `these ${chosen.length} notes`}…`,
            hint: "enter",
            data: null,
          },
        ]
      : [];
    const notes: ListItem[] = [...this.app.graph.notes.keys()]
      .sort()
      .map((rel) => ({ label: rel, hint: chosen.includes(rel) ? String(chosen.indexOf(rel) + 1) : "", data: rel }));
    this.app.overlays.openList({
      title: chosen.length
        ? `Notes to export, in order — ${chosen.length} picked`
        : "Notes to export, in order: pick the first",
      items: [...go, ...notes],
      // The notes filtered by what's typed; "Export…" always first.
      source: (typed) => (typed.trim() ? [...go, ...rank(typed, notes, (i) => i.label).map((r) => r.item)] : null),
      input,
      ...(selected !== undefined ? { selected } : {}),
      accept: (item) => {
        if (item.data === null) return this.chooseFormat(chosen);
        const rel = item.data as string;
        const next = chosen.includes(rel) ? chosen.filter((r) => r !== rel) : [...chosen, rel];
        // "Export…" comes and goes: the selection stays on the note.
        const shift = (next.length ? 1 : 0) - (chosen.length ? 1 : 0);
        this.compose(next, list.input, list.selected + shift);
      },
    });
    const list = this.app.overlay as ListOverlay;
  }

  /** The format for an export of `rels` picked — or named — then where asked. */
  chooseFormat(rels: string[], name?: string): void {
    if (name) {
      const format = formatFor(name);
      if (!format)
        return this.app.message("warn", `export: no format ${name} — ${FORMATS.map((f) => f.name).join(", ")}`);
      return this.browser(rels, format);
    }
    const what = rels.length === 1 ? rels[0]! : `${rels.length} notes`;
    this.app.overlays.openList({
      title: `Export ${what} as`,
      items: FORMATS.map((f) => ({ label: f.title, hint: f.name, data: f })),
      accept: (item) => this.browser(rels, item.data as ExportFormat),
    });
  }

  /**
   * Where an export goes (10.14), in a Save As window: open where you exported last (else beside the note), the note's
   * name filled in — `enter` exports there — with places down its left, the folder's folders and files, folders made.
   */
  browser(rels: string[], format: ExportFormat): void {
    const beside = defaultTarget(this.app.graph.abs(rels[0]!), format);
    const last = this.lastDir();
    const what = rels.length === 1 ? rels[0]! : `${rels.length} notes`;
    const places: SavePlace[] = [{ label: "Beside the note", path: dirname(beside) }];
    if (last && last !== dirname(beside)) places.push({ label: "Last export", path: last });
    for (const f of userFolders(this.app.home)) places.push({ label: f.name, path: f.path });
    places.push({ label: "This vault", path: this.app.loc.root });
    const o: SaveAsOverlay = openSaveAs(this.app, {
      title: `Export ${what} as ${format.title}`,
      dir: last ?? dirname(beside),
      name: basename(beside),
      places,
      accept: (path) => this.chosen(rels, format, path, o),
    });
  }

  /**
   * The file picked for an export: never a note (said, the window back); an earlier export replaced; any other file
   * there only once you say so (`n`: the window back).
   */
  private chosen(rels: string[], format: ExportFormat, path: string, o: SaveAsOverlay): void {
    let target: string;
    try {
      target = exportTarget(this.app.graph, rels[0]!, format, path, this.app.loc.root);
    } catch (err) {
      if (err instanceof NotAnExport) {
        const there = err.target;
        return this.app.overlays.confirm(
          `Replace ${this.app.graph.shownPath(there)}? It isn't an export.`,
          () => void this.write(rels, format, there, true),
          () => {
            this.app.overlay = o;
          },
        );
      }
      this.app.message("warn", `export: ${(err as Error).message}`);
      this.app.overlay = o;
      return;
    }
    void this.write(rels, format, target);
  }

  /** A folder as an export's places show it: from the root inside it, `~/` under home, else whole. */
  shownDir(dir: string): string {
    const inRoot = relative(this.app.loc.root, dir);
    if (!climbsOut(inRoot) && !isAbsolute(inRoot)) return inRoot ? `${inRoot.split(sep).join("/")}/` : "./";
    const inHome = relative(this.app.home, dir);
    if (!climbsOut(inHome) && !isAbsolute(inHome)) return inHome ? `~/${inHome.split(sep).join("/")}/` : "~/";
    return `${dir}/`;
  }

  /** The folder an export went to last from this root (kept in its state), if it's still there. */
  lastDir(): string | null {
    const dir = readJson<{ dir?: unknown }>(join(stateDir(this.app.loc), "export.json"), {}).dir;
    return typeof dir === "string" && isDir(dir) ? dir : null;
  }

  /** The notes at `rels` exported as one document to `target`, unsaved ones saved first (4.10): what's on screen. */
  async write(rels: string[], format: ExportFormat, target: string, force = false): Promise<void> {
    if (!this.app.handoff.savedForHandoff("export", "not exporting")) return;
    const shown = this.app.graph.shownPath(target);
    this.app.message("info", `exporting to ${shown}…`);
    this.app.host.requestRender();
    let files: string[];
    const controller = new AbortController();
    this.jobs.add(controller);
    const finished = this.app.background.begin(`Export to ${shown}`, () => controller.abort(), {
      restart: () => {
        void this.write(rels, format, target, force);
      },
    });
    const graph = this.app.graph;
    let output: PreparedExport | undefined;
    try {
      try {
        output = await prepareExport(graph, rels, format.name, target, {
          signal: controller.signal,
          progress: (stage) => {
            if (this.app.quitting || controller.signal.aborted) return;
            this.app.message("info", `exporting to ${shown}: ${stage}… — Cancel export stops it`);
            this.app.host.requestRender();
          },
        });
        if (controller.signal.aborted || this.app.quitting) return;
        files = await output.publish(
          target,
          () => {
            exportTarget(graph, rels[0]!, format, target, graph.root, force);
          },
          controller.signal,
          // Over once a cancel can't stop it, its document's rename begun: from then on, none is running (#68).
          () => {
            this.jobs.delete(controller);
            finished();
          },
        );
        // Where it went, for "Where you exported last": as soon as it's there, not once its staging is cleared, so the
        // window opened meanwhile opens there.
        try {
          const file = join(stateDir(graph.loc), "export.json");
          const previous = readJson<{ paths?: Record<string, string> }>(file, {});
          const paths = { ...previous?.paths, ...(rels.length === 1 ? { [rels[0]!]: target } : {}) };
          writeJson(file, {
            dir: dirname(target),
            paths,
          });
          if (this.app.graph === graph) {
            this.pathFile = file;
            this.paths = paths;
          }
        } catch {}
      } catch (err) {
        finished(controller.signal.aborted ? "stopped" : "failed", (err as Error).message);
        if (!this.app.quitting)
          this.app.message(
            controller.signal.aborted ? "info" : "error",
            controller.signal.aborted ? "export cancelled" : `export: ${shown} not written — ${(err as Error).message}`,
          );
        return;
      } finally {
        // Over, written or not: a cancel from now on finds none running (#68).
        this.jobs.delete(controller);
        finished();
      }
      const beside = files.length ? `, ${files.length} file${files.length === 1 ? "" : "s"} beside it` : "";
      // A note written where the vault never indexes it (D246): Markdown into a folder `walk.exclude` names.
      const why =
        this.app.graph === graph && graph.filter.isNoteName(basename(target)) ? this.app.files.leftOut(target) : null;
      this.app.message(
        "info",
        `exported ${rels.length === 1 ? rels[0] : `${rels.length} notes`} to ${shown} (${format.title}${why ? `, not indexed: ${why}` : ""})${beside}`,
      );
    } finally {
      // Its staging cleared once it's said: a warning from the cleanup is the newest message, not under it (#68).
      await output?.dispose().catch((error) => this.app.message("warn", `export cleanup: ${error.message}`));
      this.app.host.requestRender();
    }
  }
}

/** Whether `path` is a folder (through a link); false where nothing's there. */
export function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
