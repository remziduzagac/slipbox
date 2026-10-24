// Commands run by your shell from the TUI (plan 25.7), as vim's `:!`: `:!cmd` in the root's folder, `%` the file's
// path, its output in a window — `enter` on a `path:line` there opens it — and `:{range}!cmd`, the lines given to it
// and replaced by what it prints, one undo step (left as they were when it fails). One at a time: `shell.stop`, and
// quitting, end it.

import { statSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { sanitize } from "../core/sanitize.ts";
import { type BangRange, expandPercent, parseBang, runShell, type ShellResult } from "../core/shell.ts";
import { type App, editable, type View } from "./app.ts";
import { cannotEdit, placeAt } from "./editing.ts";
import { exLines } from "./replacing.ts";

/** The command as the shell is given it, `%` the file's path from the root; null when it can't be (said). */
function prepared(app: App, command: string): string | null {
  if (app.shellJob) {
    app.message("warn", `still running: ${app.shellJob.command} — stop it first (shell.stop)`);
    return null;
  }
  const abs = app.view?.buf.abs;
  const cmd = expandPercent(command, abs ? relative(app.loc.root, abs) || "." : null);
  if (cmd === null) app.message("warn", "% is the file's path: this window has none");
  return cmd;
}

/**
 * Started: the job kept (one at a time), said, and `then` when it ends — the frame drawn again. `merged`: its errors
 * through its output's pipe, in the order they reach it (a window's, D?1; a filter's lines are its output alone).
 */
function launch(
  app: App,
  label: string,
  cmd: string,
  input: string | undefined,
  then: (r: ShellResult) => void,
  merged = false,
): void {
  const abs = app.view?.buf.abs;
  const job = runShell(cmd, {
    cwd: app.loc.root,
    input,
    env: { SLIPBOX_ROOT: app.loc.root, ...(abs ? { SLIPBOX_FILE: abs } : {}) },
    merged,
  });
  app.shellJob = { command: label, stop: job.stop };
  app.message("info", `running: ${label}`);
  void job.done.then((r) => {
    app.shellJob = null;
    then(r);
    app.host.requestRender();
  });
}

/** How a command ended, as a window's title and a message say it. */
function ending(r: ShellResult): string {
  return `${r.signal ? `stopped (${r.signal})` : `exit ${r.code}`}${r.truncated ? ", its output cut short" : ""}`;
}

/** A command's output in a window: a line each, `enter` on a `path:line` opening it there. No output: said. */
function showOutput(app: App, label: string, r: ShellResult): void {
  const text = r.output.replace(/\r?\n$/, "");
  if (!text) return app.message(r.code === 0 ? "info" : "warn", `${label}: ${ending(r)}, no output`);
  app.overlays.openList({
    title: `$ ${label} — ${ending(r)}`,
    items: text.split(/\r?\n/).map((l) => ({ label: sanitize(l.replace(/\t/g, "  ")) || " ", data: l })),
    accept: (item) => openPlace(app, item.data as string),
  });
}

/** A line of output naming a file of the root and a line in it (`grep -n`'s, a compiler's): that file, there. */
export function placeIn(app: App, line: string): { rel: string; line: number } | null {
  const m = /^([^:\s][^:]*?):(\d+)(?::\d+)?(?::|$)/.exec(line);
  if (!m) return null;
  const abs = isAbsolute(m[1]!) ? m[1]! : join(app.loc.root, m[1]!);
  const rel = relative(app.loc.root, abs);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  try {
    if (!statSync(abs).isFile()) return null;
  } catch {
    return null;
  }
  return { rel, line: Number(m[2]) };
}

function openPlace(app: App, line: string): void {
  const p = placeIn(app, line);
  if (!p) return;
  app.open(p.rel, { heading: null, headingIndex: 0, offset: 0, line: p.line });
  const v = app.view;
  if (v?.buf.rel === p.rel) placeAt(app, v, v.buf.lineStarts()[p.line - 1] ?? 0);
}

/**
 * `:!cmd` (`shell.run`): the command, as typed, run by your shell in the root's folder; its output in a window, its
 * errors among it where it wrote them.
 */
export function shellRun(app: App, command: string): void {
  const label = command.trim();
  const cmd = prepared(app, label);
  if (cmd !== null) launch(app, label, cmd, undefined, (r) => showOutput(app, label, r), true);
}

/**
 * `:{range}!cmd` (`shell.filter`): the lines given to the command, replaced by what it prints — one undo step — the
 * cursor on the first. A command that fails leaves them, its output in a window; so does a text changed meanwhile.
 */
export function shellFilter(app: App, text: string): void {
  const view = app.view;
  if (!view) return;
  const bang = parseBang(text);
  if (!bang?.range) return app.message("info", "lines through a command: :'<,'>!sort, :%!cmd, :.!cmd, :3,7!cmd");
  const why = cannotEdit(view);
  if (why) return app.message("warn", `${why} — not editing`);
  const span = exLines(app, view, bang.range as BangRange);
  if (typeof span === "string") return app.message("warn", span);
  // Out of visual mode, as vim's `:` leaves it: the selection's lines are the range now.
  view.sel = null;
  view.visual = null;
  const cmd = prepared(app, bang.command);
  if (cmd === null) return;
  if (!editable(view)) app.lens.setViewMode(view, app.lens.editMode(view));
  filter(app, view, span, bang.command, cmd);
}

function filter(app: App, view: View, [a, b]: [number, number], label: string, cmd: string): void {
  const buf = view.buf;
  const starts = buf.lineStarts();
  const from = starts[a - 1]!;
  const to = starts[b] ?? buf.source.length;
  const was = buf.source.slice(from, to);
  const version = buf.version;
  // Given as lines, each ended (the last line's too); taken back in the note's own line endings.
  const lf = was.replace(/\r\n/g, "\n");
  launch(app, label, cmd, lf.endsWith("\n") ? lf : `${lf}\n`, (r) => {
    const n = b - a + 1;
    const lines = `${n} line${n === 1 ? "" : "s"}`;
    if (r.code !== 0 || r.stdoutTruncated) {
      showOutput(app, label, r);
      return app.message("warn", `${label}: ${ending(r)} — the ${lines} left as they were`);
    }
    if (buf.version !== version || buf.source.slice(from, to) !== was)
      return app.message("warn", `the text changed while ${label} ran — the ${lines} left as they were`);
    let out = r.stdout.replace(/\r\n/g, "\n");
    if (!was.endsWith("\n")) out = out.replace(/\n$/, "");
    else if (out && !out.endsWith("\n")) out += "\n";
    buf.edit(from, to - from, buf.eol === "\r\n" ? out.replace(/\n/g, "\r\n") : out);
    if (app.view === view) placeAt(app, view, from);
    app.message("info", `${lines} through ${label}`);
  });
}

/** `shell.stop`: the command running, ended. */
export function shellStop(app: App): void {
  if (!app.shellJob) return app.message("info", "no command running");
  app.shellJob.stop();
}
