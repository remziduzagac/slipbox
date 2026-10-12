// The source control view (plan 26.2), the left panel's third: the checkout's changed files by section — in conflict,
// staged, changed and not staged, untracked — each opened up into its changes (`l`): a staged file's against the last
// commit, a changed one's against what's staged, as on disk. `s` stages a file or a change, `u` unstages one, `d`
// discards one (asking first: an untracked file goes to the trash), `a` stages everything and `U` unstages it, `.`
// shows a file's or a change's diff; `enter` opens the file there. The explorer's keymap, read this view's way.

import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { changeDiff, type GitChange, gitChanges } from "../core/gitsigns.ts";
import { showLater } from "../core/gitops.ts";
import {
  discardFile,
  type GitDone,
  replaceLines,
  sections,
  stageAll,
  stageChange,
  stageFile,
  type StatusEntry,
  unstageAll,
  unstageChange,
  unstageFile,
} from "../core/gitstage.ts";
import { climbsOut } from "../core/fsutil.ts";
import { sanitize } from "../core/sanitize.ts";
import { match } from "./match.ts";
import type { App } from "./app.ts";

export type GitSection = "conflicted" | "staged" | "unstaged" | "untracked";

/** A row of the view: a section's heading, a file in it, or one of its changes. */
export interface GitRow {
  kind: "heading" | "file" | "change";
  section: GitSection;
  label: string;
  hint: string;
  /** A file's (and its change's) entry; a change's, the change. */
  entry?: StatusEntry;
  change?: GitChange;
}

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

function textsOf(app: App, path: string): Texts | null {
  const c = app.checkout;
  if (!c) return null;
  let all = texts.get(app);
  if (!all) texts.set(app, (all = new Map()));
  const t = all.get(path);
  if (t?.generation === app.gitGeneration) return t;
  const fresh: Texts = { generation: app.gitGeneration, head: undefined, index: undefined, ready: Promise.resolve() };
  all.set(path, fresh);
  fresh.ready = Promise.all([showLater(c, "HEAD", path), showLater(c, "", path)]).then(([head, index]) => {
    fresh.head = head;
    fresh.index = index;
    app.host.requestRender();
  });
  return fresh;
}

/** A file in the checkout, as on disk ("" when it isn't there). */
function onDisk(app: App, path: string): string {
  const abs = join(app.checkout!.root, path);
  try {
    return existsSync(abs) ? readFileSync(abs, "utf8") : "";
  } catch {
    return "";
  }
}

/** A file's changes in a section — a staged file's against the last commit, a changed one's against the index — or null while git reads. */
export function fileChanges(app: App, e: StatusEntry, section: GitSection): GitChange[] | null {
  if (section !== "staged" && section !== "unstaged") return [];
  const t = textsOf(app, e.path);
  if (!t || t.head === undefined || t.index === undefined) return null;
  return section === "staged"
    ? gitChanges(t.head ?? "", t.index ?? "")
    : gitChanges(t.index ?? "", onDisk(app, e.path));
}

/** The view's rows: each section's heading and files, a file opened up followed by its changes; the filter keeps files by path. */
export function gitRows(app: App): GitRow[] {
  const entries = app.gitEntries ?? [];
  const s = sections(entries);
  const q = app.sidebar.filter ?? "";
  const rows: GitRow[] = [];
  for (const section of ["conflicted", "staged", "unstaged", "untracked"] as const) {
    const files = s[section].filter((e) => !q || match(q, e.path));
    if (!files.length) continue;
    rows.push({ kind: "heading", section, label: `${TITLES[section]} (${files.length})`, hint: "" });
    for (const e of files) {
      const dir = dirname(e.path);
      rows.push({
        kind: "file",
        section,
        entry: e,
        label: `${stateLetter(e, section)} ${sanitize(basename(e.path))}`,
        hint: dir === "." ? "" : sanitize(dir),
      });
      if (!app.gitOpen.has(`${section}:${e.path}`)) continue;
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

/** A row's vault path, or null where the file is outside this root. */
function relOf(app: App, path: string): string | null {
  const rel = relative(app.loc.root, join(app.checkout!.root, path));
  return climbsOut(rel) ? null : rel;
}

/** After an operation: git asked again, its answer drawn; a failure said in git's words. */
function after(app: App, why: GitDone, said: string, follow?: string): void {
  if (why) return app.message("warn", `git: ${why}`);
  app.message("info", said);
  void app.refreshGitNow().then(() => {
    // The file staged or unstaged is selected where it went, so `u` or `s` takes it straight back: its row number
    // left alone, the list re-sorted under it, the selection landed on whatever came there (found trying 26.2 live).
    if (follow !== undefined) {
      const i = gitRows(app).findIndex((r) => r.kind === "file" && r.entry!.path === follow);
      if (i >= 0) app.sidebar.selected = i;
    }
    app.host.requestRender();
  });
}

/** An open note's buffer for a file, unsaved: refused (what git would change isn't what's open). */
function unsavedFor(app: App, path: string): boolean {
  const abs = join(app.checkout!.root, path);
  const dirty = [...app.buffers.values()].find((b) => b.abs === abs && b.dirty);
  if (dirty) app.message("warn", `unsaved: ${app.displayName(dirty)} — save it first: git works on the file on disk`);
  return !!dirty;
}

/** Open buffers of a file reloaded from disk once git has changed it there. */
function reload(app: App, path: string): void {
  const abs = join(app.checkout!.root, path);
  for (const b of app.buffers.values()) if (b.abs === abs && !b.dirty) app.reloadBuffer(b);
}

/** `s`: the selected file, or change, staged — a conflict's file marked resolved. */
function stage(app: App, row: GitRow): void {
  const c = app.checkout!;
  const e = row.entry!;
  if (row.kind === "change") {
    if (row.section !== "unstaged") return app.message("info", "that change is staged already — u unstages it");
    const t = textsOf(app, e.path);
    if (t?.index === undefined) return app.message("info", "git hasn't answered yet");
    return after(app, stageChange(c, e.path, t.index ?? "", row.change!), `staged a change of ${e.path}`, e.path);
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
function unstage(app: App, row: GitRow): void {
  const c = app.checkout!;
  const e = row.entry!;
  if (row.section !== "staged") return app.message("info", `${e.path} has nothing staged`);
  if (row.kind === "change") {
    const t = textsOf(app, e.path);
    if (t?.index === undefined) return app.message("info", "git hasn't answered yet");
    return after(app, unstageChange(c, e.path, t.index ?? "", row.change!), `unstaged a change of ${e.path}`, e.path);
  }
  after(app, unstageFile(c, e.path), `unstaged ${e.path}`, e.path);
}

/** `d`: the selected file's changes not staged, or one change, discarded — after asking; an untracked file, to the trash. */
function discard(app: App, row: GitRow): void {
  const c = app.checkout!;
  const e = row.entry!;
  if (row.section === "staged")
    return app.message("info", "staged: u unstages it first — discarding is for what isn't staged");
  if (row.section === "conflicted")
    return app.message("info", "a conflict: resolve it in the file, then s marks it resolved");
  const rel = relOf(app, e.path);
  if (row.section === "untracked") {
    if (rel === null) return app.message("warn", `${e.path} is outside this root`);
    return app.deleteItem({ rel, dir: false });
  }
  if (unsavedFor(app, e.path)) return;
  if (row.kind === "change") {
    if (rel === null) return app.message("warn", `${e.path} is outside this root`);
    const ch = row.change!;
    app.confirm(`Discard the change at line ${ch.from} of ${e.path}? It goes back to what's staged.`, () => {
      const buf = app.buffer(rel);
      if (!buf) return app.message("warn", `${e.path} can't be read`);
      buf.edit(0, buf.source.length, replaceLines(buf.source, ch.from - 1, ch.now.length, ch.was));
      if (app.saveBuffer(buf, true)) after(app, null, `discarded a change of ${e.path}`);
    });
    return;
  }
  app.confirm(`Discard the changes to ${e.path} that aren't staged? The file goes back to what's staged.`, () => {
    const why = discardFile(c, e.path);
    if (!why) reload(app, e.path);
    after(app, why, `discarded the changes to ${e.path}`);
  });
}

/** `.`: the selected file's diff, or a change's, in the floating window. */
function preview(app: App, row: GitRow): void {
  const e = row.entry!;
  const changes = row.kind === "change" ? [row.change!] : fileChanges(app, e, row.section);
  // Git still reading the file's texts: shown once it has.
  if (changes === null) return void textsOf(app, e.path)?.ready.then(() => preview(app, row));
  if (!changes.length)
    return app.message(
      "info",
      row.section === "untracked" ? `${e.path} is new: all of it` : `${e.path}: nothing to show`,
    );
  const against = row.section === "staged" ? "the last commit" : "what's staged";
  app.openHover(
    changes.map((ch) => `\`\`\`diff\n${changeDiff(ch)}\n\`\`\``).join("\n\n"),
    `${e.path} against ${against}`,
  );
}

/** `enter`: the file opened, at the change (a file's first). */
function openRow(app: App, row: GitRow): void {
  const e = row.entry!;
  const rel = relOf(app, e.path);
  if (rel === null) return app.message("warn", `${e.path} is outside this root`);
  if (!existsSync(join(app.checkout!.root, e.path)))
    return app.message("info", `${e.path} is deleted — . shows what it had`);
  app.openOrSwitchTab(rel);
  app.region = "content";
  const v = app.view;
  const place = (change: GitChange | undefined) => {
    if (v && change && app.view === v)
      app.placeAtLine(v, Math.max(1, change.kind === "delete" ? change.from - 1 : change.from));
  };
  if (row.change) return place(row.change);
  const now = fileChanges(app, e, row.section);
  if (now) return place(now[0]);
  // Git still reading: there once it has.
  void textsOf(app, e.path)?.ready.then(() => {
    place(fileChanges(app, e, row.section)?.[0]);
    app.host.requestRender();
  });
}

/** The view's keys (the explorer's keymap, read this view's way). */
export function gitViewAction(app: App, action: string): void {
  const s = app.sidebar;
  const rows = gitRows(app);
  const step = (from: number, by: number) => {
    let i = Math.max(0, Math.min(rows.length - 1, from + by));
    while (rows[i]?.kind === "heading" && i + by >= 0 && i + by < rows.length) i += by;
    return rows[i]?.kind === "heading" ? from : i;
  };
  const row = rows[s.selected];
  if (!app.checkout) return app.message("info", "not a git checkout");
  switch (action) {
    case "down":
      s.selected = step(s.selected, 1);
      return;
    case "up":
      s.selected = step(s.selected, -1);
      return;
    case "top":
      s.selected = step(-1, 1);
      return;
    case "bottom":
      s.selected = step(rows.length, -1);
      return;
    case "filter":
      s.filtering = true;
      return;
    case "all_files":
      return after(app, stageAll(app.checkout), "staged everything");
    case "undo_rename":
      return after(app, unstageAll(app.checkout), "unstaged everything");
    case "commit":
      return app.openCommitEditor(false);
    case "amend":
      return app.openCommitEditor(true);
    case "close":
      return app.showSidebar(false);
    case "leave":
      app.region = "content";
      return;
  }
  if (!row || row.kind === "heading") {
    // A section's heading: what acts on a file said, never nothing.
    if (row && (action === "open_split" || action === "restore" || action === "delete"))
      app.message(
        "info",
        "a section's heading: s, u and d act on the file selected — a stages everything, U unstages it",
      );
    return;
  }
  switch (action) {
    case "expand":
      if (row.kind === "file") app.gitOpen.add(`${row.section}:${row.entry!.path}`);
      return;
    case "collapse": {
      const key = `${row.section}:${row.entry!.path}`;
      if (row.kind === "change")
        s.selected = rows.findIndex(
          (r) => r.kind === "file" && r.section === row.section && r.entry!.path === row.entry!.path,
        );
      app.gitOpen.delete(key);
      return;
    }
    case "open_tab":
    case "open":
      return openRow(app, row);
    case "open_split":
      return stage(app, row);
    case "restore":
      return unstage(app, row);
    case "delete":
      return discard(app, row);
    case "menu":
      return preview(app, row);
  }
}
