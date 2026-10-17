// The git panel's working tree (plan 26.2, GIT-D8): the checkout's changed files by section — in conflict, staged,
// changed and not staged, untracked — each opened up into its changes (`l`): a staged file's against the last commit, a
// changed one's against what's staged, as on disk. `s` stages a file or a change, `u` unstages one, `d` discards one
// (asking first: an untracked file goes to the trash); on a section's heading, its files all at once, in one call;
// `a` stages everything and `U` unstages it. `enter` shows a file's or a change's diff, `o` opens the file there. The panel's keys,
// buttons and mouse are gitpanel.ts's and gitmouse.ts's; these are what they run.

import { existsSync, lstatSync, readlinkSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { type GitChange, gitChanges } from "../core/gitsigns.ts";
import { showLater } from "../core/gitops.ts";
import {
  discardFile,
  discardFiles,
  type GitDone,
  replaceLines,
  sections,
  stageAll,
  stageChange,
  stageFile,
  stageFiles,
  type StatusEntry,
  unstageAll,
  unstageChange,
  unstageFile,
} from "../core/gitstage.ts";
import { climbsOut, decodeText, readRegular } from "../core/fsutil.ts";
import { sanitize } from "../core/sanitize.ts";
import { openDiff } from "./diffview.ts";
import { match } from "./match.ts";
import type { HeadingRow } from "./gitpanel.ts";
import type { App } from "./app.ts";

export type GitSection = "conflicted" | "staged" | "unstaged" | "untracked";

/** A changed file in a section of the working tree: its state letter and name, its folder dimmed after it. */
export interface FileRow {
  kind: "file";
  section: GitSection;
  entry: StatusEntry;
  label: string;
  hint: string;
}

/** One change of a file opened up: where it is, its first line dimmed after it. */
export interface ChangeRow {
  kind: "change";
  section: GitSection;
  entry: StatusEntry;
  change: GitChange;
  label: string;
  hint: string;
}

export type WorkRow = FileRow | ChangeRow;

const TITLES: Record<GitSection, string> = {
  conflicted: "Conflicts",
  staged: "Staged",
  unstaged: "Changes",
  untracked: "Untracked",
};

/** A file's state as one letter: what's staged in Staged, the working tree's elsewhere. */
export function stateLetter(e: StatusEntry, section: GitSection): string {
  return section === "conflicted" ? "U" : section === "untracked" ? "?" : section === "staged" ? e.x : e.y;
}

/** A file's texts for its changes (by its path and the git generation they were read in): the last commit's, the index's. */
interface Texts {
  generation: number;
  head: string | null | undefined;
  index: string | null | undefined;
  /** Settled once both are read. */
  ready: Promise<void>;
}

/** Each opened-up file's texts, read from git in the background. */
const texts = new WeakMap<App, Map<string, Texts>>();

/**
 * A file's texts: the last commit's — a staged rename's (or copy's) under the name it had there (`from`), so its diff is
 * what changed, not the whole file added — and the index's, under the name it has now.
 */
function textsOf(app: App, e: Pick<StatusEntry, "path" | "from">): Texts | null {
  const c = app.git.checkout;
  if (!c) return null;
  let all = texts.get(app);
  if (!all) texts.set(app, (all = new Map()));
  const key = `${e.from ?? ""}\0${e.path}`;
  const t = all.get(key);
  if (t?.generation === app.git.generation) return t;
  const fresh: Texts = { generation: app.git.generation, head: undefined, index: undefined, ready: Promise.resolve() };
  all.set(key, fresh);
  fresh.ready = Promise.all([showLater(c, "HEAD", e.from ?? e.path), showLater(c, "", e.path)]).then(
    ([head, index]) => {
      fresh.head = head;
      fresh.index = index;
      app.host.requestRender();
    },
  );
  return fresh;
}

/** The largest file a diff reads from disk: past it, the diff isn't shown. */
export const DIFF_MAX = 8 * 1024 * 1024;

/**
 * A file on disk as a diff reads it: "" when it isn't there; a link as git keeps one, the path it leads to, never
 * followed; else its text — or why not, when it isn't a regular file or is larger than `DIFF_MAX`.
 */
export function readForDiff(abs: string): string | { why: string } {
  let st: ReturnType<typeof lstatSync>;
  try {
    st = lstatSync(abs);
  } catch {
    return "";
  }
  try {
    if (st.isSymbolicLink()) return readlinkSync(abs);
    if (!st.isFile()) return { why: "not a regular file: no diff shown" };
    if (st.size > DIFF_MAX) return { why: `larger than ${DIFF_MAX / (1024 * 1024)} MB: no diff shown` };
    return decodeText(readRegular(abs, DIFF_MAX)).text;
  } catch (err) {
    return { why: `can't be read: ${(err as Error).message}` };
  }
}

/** A file in the checkout, as on disk ("" when it isn't there, or can't be read for a diff). */
function onDisk(app: App, path: string): string {
  const r = readForDiff(join(app.git.checkout!.root, path));
  return typeof r === "string" ? r : "";
}

/** A file's changes in a section — a staged file's against the last commit, a changed one's against the index — or null while git reads. */
export function fileChanges(app: App, e: StatusEntry, section: GitSection): GitChange[] | null {
  if (section !== "staged" && section !== "unstaged") return [];
  const t = textsOf(app, e);
  if (!t || t.head === undefined || t.index === undefined) return null;
  return section === "staged"
    ? gitChanges(t.head ?? "", t.index ?? "")
    : gitChanges(t.index ?? "", onDisk(app, e.path));
}

/**
 * The working tree's rows: each section's heading and, unfolded, its files, a file opened up followed by its changes;
 * the filter keeps files by path.
 */
export function workRows(app: App): (HeadingRow | WorkRow)[] {
  const s = sections(app.git.entries ?? []);
  const q = app.sidebar.filter ?? "";
  const rows: (HeadingRow | WorkRow)[] = [];
  for (const section of ["conflicted", "staged", "unstaged", "untracked"] as const) {
    const files = s[section].filter((e) => !q || match(q, e.path));
    if (!files.length) continue;
    rows.push({ kind: "heading", section, label: `${TITLES[section]} (${files.length})` });
    if (app.gitPanel.folded.has(section) && !q) continue;
    for (const e of files) {
      const dir = dirname(e.path);
      // A rename staged says so: `R old.md → new.md`, the folder after it; moved to another folder, both paths whole.
      const was = section === "staged" && e.from ? e.from : null;
      const same = was !== null && dirname(was) === dir;
      rows.push({
        kind: "file",
        section,
        entry: e,
        label: `${stateLetter(e, section)} ${sanitize(was === null ? basename(e.path) : same ? `${basename(was)} → ${basename(e.path)}` : `${was} → ${e.path}`)}`,
        hint: dir === "." || (was !== null && !same) ? "" : sanitize(dir),
      });
      if (!app.git.opened.has(`${section}:${e.path}`)) continue;
      for (const change of fileChanges(app, e, section) ?? []) {
        const first = sanitize((change.now[0] ?? change.was[0] ?? "").trim());
        rows.push({
          kind: "change",
          section,
          entry: e,
          change,
          label: `  ${change.kind === "delete" ? `−${change.was.length}` : `${change.from}`} ${change.kind}`,
          hint: first,
        });
      }
    }
  }
  return rows;
}

/** A path of the checkout's as the vault's, or null where it's outside this vault. */
export function relOf(app: App, path: string): string | null {
  const rel = relative(app.loc.root, join(app.git.checkout!.root, path));
  return climbsOut(rel) ? null : rel;
}

/** After an operation: git asked again, its answer drawn; a failure said in git's words. */
function after(app: App, why: GitDone, said: string, follow?: string): void {
  if (why) return app.message("warn", `git: ${why}`);
  app.message("info", said);
  void app.git.refreshNow().then(() => {
    // The file staged or unstaged is selected where it went, so `u` or `s` takes it straight back: its row number
    // left alone, the list re-sorted under it, the selection landed on whatever came there (found trying 26.2 live).
    if (follow !== undefined) {
      const i = app.gitPanel.rows().findIndex((r) => r.kind === "file" && r.entry.path === follow);
      if (i >= 0) app.sidebar.selected = i;
    }
    app.host.requestRender();
  });
}

/** An open note's buffer for a file, unsaved: refused (what git would change isn't what's open). */
function unsavedFor(app: App, path: string): boolean {
  const abs = join(app.git.checkout!.root, path);
  const dirty = [...app.buffers.values()].find((b) => b.abs === abs && b.dirty);
  if (dirty) app.message("warn", `unsaved: ${app.displayName(dirty)} — save it first: git works on the file on disk`);
  return !!dirty;
}

/** Open buffers of a file reloaded from disk once git has changed it there. */
function reload(app: App, path: string): void {
  const abs = join(app.git.checkout!.root, path);
  for (const b of app.buffers.values()) if (b.abs === abs && !b.dirty) app.watch.reloadBuffer(b);
}

/** `s`: the selected file, or change, staged — a conflict's file marked resolved. */
function stage(app: App, row: WorkRow): void {
  const c = app.git.checkout!;
  const e = row.entry;
  if (row.kind === "change") {
    if (row.section !== "unstaged") return app.message("info", "that change is staged already — u unstages it");
    const t = textsOf(app, e);
    if (t?.index === undefined) return app.message("info", "git hasn't answered yet");
    return after(app, stageChange(c, e.path, t.index ?? "", row.change), `staged a change of ${e.path}`, e.path);
  }
  if (row.section === "staged") return app.message("info", `${e.path} is staged — u unstages it`);
  after(
    app,
    stageFile(c, e.path),
    row.section === "conflicted" ? `${e.path} marked resolved` : `staged ${e.path}`,
    e.path,
  );
}

/** `u`: the selected file, or change, unstaged. */
function unstage(app: App, row: WorkRow): void {
  const c = app.git.checkout!;
  const e = row.entry;
  if (row.section !== "staged") return app.message("info", `${e.path} has nothing staged`);
  if (row.kind === "change") {
    const t = textsOf(app, e);
    if (t?.index === undefined) return app.message("info", "git hasn't answered yet");
    return after(app, unstageChange(c, e.path, t.index ?? "", row.change), `unstaged a change of ${e.path}`, e.path);
  }
  after(app, unstageFile(c, e.path, e.from), `unstaged ${e.path}`, e.path);
}

/** `d`: the selected file's changes not staged, or one change, discarded — after asking; an untracked file, to the trash. */
function discard(app: App, row: WorkRow): void {
  const c = app.git.checkout!;
  const e = row.entry;
  if (row.section === "staged")
    return app.message("info", "staged: u unstages it first — discarding is for what isn't staged");
  if (row.section === "conflicted")
    return app.message("info", "a conflict: resolve it in the file, then s marks it resolved");
  const rel = relOf(app, e.path);
  if (row.section === "untracked") {
    if (rel === null) return app.message("warn", `${e.path} is outside this vault`);
    return app.files.deleteItem({ rel, dir: false });
  }
  if (unsavedFor(app, e.path)) return;
  if (row.kind === "change") {
    if (rel === null) return app.message("warn", `${e.path} is outside this vault`);
    const ch = row.change;
    app.overlays.confirm(`Discard the change at line ${ch.from} of ${e.path}? It goes back to what's staged.`, () => {
      const buf = app.buffer(rel);
      if (!buf) return app.message("warn", `${e.path} can't be read`);
      buf.edit(0, buf.source.length, replaceLines(buf.source, ch.from - 1, ch.now.length, ch.was));
      if (app.saving.save(buf, true)) after(app, null, `discarded a change of ${e.path}`);
    });
    return;
  }
  app.overlays.confirm(
    `Discard the changes to ${e.path} that aren't staged? The file goes back to what's staged.`,
    () => {
      const why = discardFile(c, e.path);
      if (!why) reload(app, e.path);
      after(app, why, `discarded the changes to ${e.path}`);
    },
  );
}

/** The diff window's `esc`: back to the panel, when it's still there and was where the diff was asked from. */
export function backToPanel(app: App): () => void {
  const from = app.region;
  return () => {
    if (from === "sidebar" && app.panels.sidebarShown && app.leftView === "git") app.region = "sidebar";
  };
}

/**
 * `enter`: the selected file's diff, or a change's, in the diff window (GIT-D2) — a staged one's against the last
 * commit (a rename's against the name it had there, titled `old → new`), a changed one's against what's staged, an
 * untracked file all added; `enter` on a line there opens the file at it, `esc` comes back here.
 */
export function showWorkDiff(app: App, row: WorkRow): void {
  const e = row.entry;
  const t = textsOf(app, e);
  if (!t) return;
  if (t.head === undefined || t.index === undefined) {
    void t.ready.then(() => {
      showWorkDiff(app, row);
      app.host.requestRender();
    });
    return;
  }
  const rel = relOf(app, e.path);
  const staged = row.section === "staged";
  const before = staged ? (t.head ?? "") : row.section === "untracked" ? "" : (t.index ?? "");
  const disk = staged ? "" : readForDiff(join(app.git.checkout!.root, e.path));
  if (typeof disk !== "string") return app.message("info", `${e.path}: ${disk.why}`);
  const now = staged ? (t.index ?? "") : disk;
  const against = staged ? "the last commit" : row.section === "untracked" ? "nothing: it's new" : "what's staged";
  // A rename staged: from the name it had in the last commit.
  const named = staged && e.from ? `${e.from} → ${e.path}` : e.path;
  openDiff(app, {
    before,
    now,
    path: rel ?? join(app.git.checkout!.root, e.path),
    title: `${sanitize(named)} against ${against} — esc: source control`,
    none: `${e.path}: nothing to show`,
    back: backToPanel(app),
    go: (line) => {
      if (rel !== null && existsSync(join(app.loc.root, rel))) app.openAt(rel, line);
    },
  });
}

/** `o`: the file opened, at the change (a file's first). */
export function openWorkFile(app: App, row: WorkRow): void {
  const e = row.entry;
  const rel = relOf(app, e.path);
  if (rel === null) return app.message("warn", `${e.path} is outside this vault`);
  if (!existsSync(join(app.git.checkout!.root, e.path)))
    return app.message("info", `${e.path} is deleted — enter shows what it had`);
  app.openOrSwitchTab(rel);
  app.region = "content";
  const v = app.view;
  const place = (change: GitChange | undefined) => {
    if (v && change && app.view === v)
      app.placeAtLine(v, Math.max(1, change.kind === "delete" ? change.from - 1 : change.from));
  };
  if (row.kind === "change") return place(row.change);
  const now = fileChanges(app, e, row.section);
  if (now) return place(now[0]);
  // Git still reading: there once it has.
  void textsOf(app, e)?.ready.then(() => {
    place(fileChanges(app, e, row.section)?.[0]);
    app.host.requestRender();
  });
}

/** A working-tree row's action, by the panel's keys, its buttons or its menu. */
export function workAction(app: App, row: WorkRow, action: string): void {
  switch (action) {
    case "expand":
      if (row.kind === "file") app.git.opened.add(`${row.section}:${row.entry.path}`);
      return;
    case "collapse":
      if (row.kind === "change")
        app.sidebar.selected = app.gitPanel
          .rows()
          .findIndex((r) => r.kind === "file" && r.section === row.section && r.entry.path === row.entry.path);
      app.git.opened.delete(`${row.section}:${row.entry.path}`);
      return;
    case "open":
      return showWorkDiff(app, row);
    case "go":
      return openWorkFile(app, row);
    case "stage":
      return stage(app, row);
    case "unstage":
      return unstage(app, row);
    case "discard":
      return discard(app, row);
  }
}

/**
 * A section's files all at once (GIT-D8, its heading's buttons): staged — Changes' or Untracked's, or everything — or
 * unstaged, or Changes' discarded, after asking (untracked files are left where they are).
 */
export function sectionAction(app: App, section: GitSection | "all", op: string): void {
  const c = app.git.checkout;
  if (!c) return;
  const s = sections(app.git.entries ?? []);
  const files = (n: number) => `${n} file${n === 1 ? "" : "s"}`;
  if (op === "stage") {
    if (section === "all") return after(app, stageAll(c), "staged everything");
    if (section === "staged") return app.message("info", "staged already — u unstages them");
    if (section === "conflicted") return app.message("info", "a conflict: resolve each, then s marks it resolved");
    const list = s[section];
    return after(
      app,
      stageFiles(
        c,
        list.map((e) => e.path),
      ),
      `staged ${files(list.length)}`,
    );
  }
  if (op === "unstage") {
    if (section !== "staged" && section !== "all") return app.message("info", "nothing staged there");
    return after(app, unstageAll(c), "unstaged everything");
  }
  if (op === "discard") {
    if (section !== "unstaged")
      return app.message("info", "on Changes' heading, d discards every change that isn't staged");
    const list = s.unstaged;
    if (list.some((e) => unsavedFor(app, e.path))) return;
    app.overlays.confirm(
      `Discard every change that isn't staged, in ${files(list.length)}? They go back to what's staged; untracked files stay.`,
      () => {
        const why = discardFiles(
          c,
          list.map((e) => e.path),
        );
        for (const e of list) reload(app, e.path);
        after(app, why, `discarded the changes to ${files(list.length)}`);
      },
    );
  }
}
