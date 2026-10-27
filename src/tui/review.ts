// Reviewing a change, a hunk at a time (GIT-D3): `v` in source control (`git.review`, `:review`) walks the working
// tree's changes against what's staged — the gutter's hunks (26.1), as the files are on disk — across every changed file
// in path order, an untracked one as wholly added. Each hunk is drawn as every diff is (GIT-D2), in the floating window,
// its file, its place among all of them and the keys above it: `y` keeps it (stages it, as source control's `s` stages
// a change), `x` reverts it (its lines put back as staged, in the file, saved at once, one undo step there — a file with
// unsaved typing skipped, and said; one changed since the review read it left as it is, and said), `c` writes a note
// for the agent into the scratch with the file and its lines, `n` and `p` move, `enter` goes to it in its file, `esc`
// ends. The end says what was kept, reverted and noted, and that `space s y` copies the notes. Nothing is committed.

import { beginGitRead } from "./gitquery.ts";
import { lstatSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { type BlockDiff, blockDiff } from "../core/foundation/text/blockdiff.ts";
import { inVault, showLater } from "../core/gitops.ts";
import { findChange, hunkEntry, hunkLines, hunkView, movedBy, type Tally, tallyText } from "../core/gitreview.ts";
import { type GitChange, gitChanges } from "../core/gitsigns.ts";
import { discardFile, replaceLines, sections, stageChange, stageFile } from "../core/gitstage.ts";
import { layoutScreen, type ScreenPart, screenText } from "../core/layout/screen.ts";
import { type Layout, type Span, srcAt } from "../core/layout/ir.ts";
import { comparable } from "../core/merge.ts";
import { TOP } from "../core/position.ts";
import { sanitize } from "../core/foundation/text/sanitize.ts";
import type { App } from "./app.ts";
import { NoteBuffer } from "./buffer.ts";
import { asBlocks, diffLanguage, isNote, LINES_ONLY, sideBySide, switchedText } from "./diffview.ts";

/** A note's change as its blocks before and after: the file with this change undone against the file as it is. */
function hunkBlocks(it: Item): BlockDiff {
  const at = it.change.from - 1;
  const was = [...it.now.slice(0, at), ...it.change.was, ...it.now.slice(at + it.change.now.length)];
  const text = (ls: string[]) => (ls.length ? `${ls.join("\n")}\n` : "");
  return blockDiff(text(was), text(it.now), new Set(), { heads: false, folds: false });
}

/** A hunk of the review, and what was done with it. */
interface Item {
  /** The file: from the checkout's top folder; from the vault's (null outside it); absolute. */
  path: string;
  rel: string | null;
  abs: string;
  /** A file git tracks, changed; one it doesn't, wholly added; one deleted. */
  kind: "changed" | "untracked" | "deleted";
  change: GitChange;
  /** The file's lines when the review read it: the lines shown around the hunk. */
  now: string[];
  state: "open" | "kept" | "reverted" | "skipped";
  noted: boolean;
}

/** A review under way: its hunks, the one shown, and where each line of that one's diff is in its file (null: a head's,
 *  a fold's). */
export interface Review {
  items: Item[];
  at: number;
  lines: (number | null)[];
  /** `tab` switched a note's hunks from what `[git] diff` draws them as: its lines for its blocks, or back. */
  switched?: boolean;
}

/** The rows above a hunk's diff: its file and place, the keys, a blank one. */
const HEAD = 3;

/** The review open, when the floating window is one. */
export function reviewOf(app: App): Review | null {
  const f = app.floating;
  return f?.kind === "review" ? f.review : null;
}

/** A text's lines as its changes have them (`gitChanges`): its line breaks either kind, a final one ending the last
 *  line, no byte order mark. */
function linesOf(text: string): string[] {
  const ls = comparable(text).split("\n");
  if (ls[ls.length - 1] === "") ls.pop();
  return ls;
}

/** A file in the checkout as it is on disk: null when it isn't a text file there (gone, a folder, binary). */
function onDisk(abs: string): string | null {
  try {
    if (!statSync(abs).isFile()) return null;
    const text = readFileSync(abs, "utf8");
    return text.slice(0, 8192).includes("\u0000") ? null : text;
  } catch {
    return null;
  }
}

/** `v` in source control: the working tree's changes against what's staged, a hunk at a time. */
export function openReview(app: App): void {
  const c = app.git.checkout;
  if (!c) return app.message("info", "not a git checkout");
  if (reviewOf(app)) return;
  const view = app.view;
  void app.git.refreshNow().then(async () => {
    if (app.quitting || app.git.checkout?.root !== c.root || app.view !== view) return;
    const query = beginGitRead(app, "Reading review versions", true);
    const s = sections(app.git.entries ?? []);
    const files = [
      ...s.unstaged.map((e) => ({ e, untracked: false })),
      ...s.untracked.map((e) => ({ e, untracked: true })),
    ].sort((a, b) => a.e.path.localeCompare(b.e.path));
    const items: Item[] = [];
    for (const { e, untracked } of files) {
      const abs = join(c.root, e.path);
      const deleted = e.y === "D";
      const text = deleted ? "" : onDisk(abs);
      if (text === null) continue;
      const staged = untracked ? null : await showLater(c, "", e.path, query.signal);
      if (!query.current()) return;
      if (!untracked && staged === null) continue;
      const now = linesOf(text);
      const kind = untracked ? "untracked" : deleted ? "deleted" : "changed";
      const rel = inVault(c, app.loc.root, e.path);
      for (const change of gitChanges(staged, text))
        items.push({ path: e.path, rel, abs, kind, change, now, state: "open", noted: false });
    }
    if (!items.length)
      return app.message("info", "nothing to review: the working tree has no change that isn't staged");
    show(app, { items, at: 0, lines: [] });
    app.host.requestRender();
  });
}

/** What a hunk's state says above it. */
const STATE: Record<Item["state"], string> = {
  open: "",
  kept: "kept: staged",
  reverted: "reverted: as staged",
  skipped: "skipped: unsaved typing",
};

/** A row of keys: each key, then what it does. */
export function keyRow(keys: [string, string][]): Span[] {
  return keys.flatMap(([k, what], i): Span[] => [
    { text: `${i ? "  " : ""}${k}`, role: "keycap", attrs: 0 },
    { text: ` ${what}`, role: "dim", attrs: 0 },
  ]);
}

/** The review showing hunk `r.at`, in the floating window: its file and place, the keys, its diff. */
function show(app: App, r: Review): void {
  const it = r.items[r.at]!;
  if (app.floating && app.floating.kind !== "review" && !app.overlays.closeFloating()) return;
  const here = r.items.filter((x) => x.path === it.path);
  const { from, to } = hunkLines(it.change);
  const state = [STATE[it.state], it.noted ? "noted for the agent" : ""].filter(Boolean).join(" · ");
  const head: Span[] = [
    { text: sanitize(it.path), role: "strong", attrs: 0 },
    {
      text: `  ${from === to ? `line ${from}` : `lines ${from}–${to}`} · change ${here.indexOf(it) + 1} of ${here.length} here, ${r.at + 1} of ${r.items.length} in all`,
      role: "dim",
      attrs: 0,
    },
    ...(it.kind === "changed"
      ? []
      : [{ text: `  ${it.kind === "untracked" ? "new file" : "deleted"}`, role: "dim" as const, attrs: 0 }]),
    ...(state ? [{ text: `  ${state}`, role: "git_new" as const, attrs: 0 }] : []),
  ];
  const keys = keyRow([
    ["y", "keep"],
    ["x", "revert"],
    ["c", "note for the agent"],
    ["n", "next"],
    ["p", "previous"],
    ["enter", "go there"],
    ["esc", "end"],
  ]);
  // Drawn as every diff is (GIT-D2): a note's as its blocks before and after — the file as staged against as it is,
  // this change alone, so its paragraphs are whole — a code file's as its lines, side by side where there's room.
  const view = hunkView(it.change, it.now);
  const drawn = asBlocks(app, it.abs, r.switched) ? hunkBlocks(it) : null;
  const blocks = drawn?.units.length ? drawn : null; // a change of blank lines alone: its lines
  r.lines = blocks
    ? blocks.units.map((u) => u.line)
    : view.rows.map((row) => (row.kind === "@@" || row.kind === "fold" ? null : row.line));
  const parts: ScreenPart[] = [
    { spans: head },
    { spans: keys },
    { spans: [] },
    blocks ? { blocks } : { rows: view.rows, from: view.before, to: view.after },
  ];
  const { language, tabWidth } = diffLanguage(app, it.abs, view.after);
  const buf = new NoteBuffer(null, `review:${it.path}`, `review:${it.path}`);
  buf.kind = { group: "text", format: "text" };
  buf.virtual = { save: () => true };
  buf.readOnly = "the review is read-only: y keeps a change, x reverts it";
  let made: { key: string; layout: Layout } | null = null;
  buf.drawn = (width, how) => {
    const key = `${width}:${how.glyphs.mode}:${how.wrap}:${how.codeScroll}`;
    if (made?.key !== key) {
      const split = sideBySide(app, it.abs, width);
      made = { key, layout: layoutScreen(parts, { width, language, tabWidth, split, ...how }) };
    }
    return made.layout;
  };
  buf.loadText(screenText(parts));
  const v = app.makeView(buf, { ...TOP }, { anchor: { ...TOP }, sub: 0, col: 0 });
  app.floating = { kind: "review", view: v, title: `Review — ${r.at + 1} of ${r.items.length}`, review: r };
  app.region = "content";
}

/** After a hunk is dealt with: the next one still open after it (else before it), or — none left — the review's end. */
function onward(app: App, r: Review): void {
  const n = r.items.length;
  for (let k = 1; k <= n; k++) {
    const i = (r.at + k) % n;
    const it = r.items[i]!;
    if (it.state === "open" && !it.noted) {
      r.at = i;
      return show(app, r);
    }
  }
  endReview(app);
}

/** The hunk among its file's changes now — the index or the file may have moved — the index's text, and the file's. */
async function fresh(app: App, it: Item): Promise<{ staged: string; change: GitChange; text: string } | null> {
  const query = beginGitRead(app, "Reading staged version", true);
  const review = reviewOf(app);
  const staged = await showLater(app.git.checkout!, "", it.path, query.signal);
  if (!query.current() || reviewOf(app) !== review || review?.items[review.at] !== it) return null;
  const text = onDisk(it.abs);
  if (staged === null || text === null) return null;
  const change = findChange(gitChanges(staged, text), it.change);
  return change ? { staged, change, text } : null;
}

/** Whether something is at `abs`, a file or not. */
function there(abs: string): boolean {
  try {
    lstatSync(abs);
    return true;
  } catch {
    return false;
  }
}

/**
 * Why a whole file's hunk isn't as the review read it any more — a deleted file there again, a new one changed — or
 * null when it is (or the hunk is a changed file's, found again by its lines).
 */
function notAsRead(it: Item): string | null {
  if (it.kind === "deleted") return there(it.abs) ? `${it.path} is there again since the review read it` : null;
  if (it.kind !== "untracked") return null;
  const text = onDisk(it.abs);
  const now = text === null ? null : linesOf(text);
  return now && now.length === it.now.length && now.every((l, i) => l === it.now[i])
    ? null
    : `${it.path} changed since the review read it`;
}

/** The file's other hunks once `done` was reverted or kept: where the review looks for them now, and their lines. */
function moveOthers(r: Review, it: Item, done: GitChange, how: "reverted" | "kept", now?: string[]): void {
  for (const x of r.items) {
    if (x === it || x.path !== it.path) continue;
    x.change = movedBy(x.change, done, how);
    if (now) x.now = now;
  }
}

/** The review asked for, and its hunk: null (said) when none is open. */
function current(app: App, key: string, what: string): { r: Review; it: Item } | null {
  const r = reviewOf(app);
  if (!r) {
    app.message("info", `${key} ${what} in a review — v in source control starts one (:review)`);
    return null;
  }
  return { r, it: r.items[r.at]! };
}

/** `y`: the hunk kept — staged, as source control's `s` stages a change (a new or deleted file, whole). */
export async function reviewKeep(app: App): Promise<void> {
  const cur = current(app, "y", "keeps a change");
  if (!cur) return;
  const { r, it } = cur;
  if (it.state === "kept") return app.message("info", "kept already: staged");
  if (it.state === "reverted") return app.message("info", "reverted already — u in the file brings it back");
  const c = app.git.checkout!;
  let why: string | null;
  if (it.kind === "changed") {
    const now = await fresh(app, it);
    if (!now) return app.message("warn", `${it.path} changed since the review read it: that change isn't there now`);
    why = stageChange(c, it.path, now.staged, now.change);
    if (!why) moveOthers(r, it, now.change, "kept");
  } else {
    const moved = notAsRead(it);
    if (moved) return app.message("warn", `${moved}: left as it is`);
    why = stageFile(c, it.path);
  }
  if (why) return app.message("warn", `git: ${why}`);
  it.state = "kept";
  app.message("info", `kept: staged a change of ${it.path}`);
  void app.git.refreshNow().then(() => app.host.requestRender());
  onward(app, r);
}

/** Skipped: a file with unsaved typing, never written over; said, and on to the next. */
function skip(app: App, r: Review, it: Item): void {
  it.state = "skipped";
  app.message("warn", `skipped: ${it.path} has unsaved typing — save it, then x reverts the change`);
  onward(app, r);
}

/**
 * `x`: the hunk reverted — its lines put back as staged, in the file, saved at once; one undo step there. A file with
 * unsaved typing is skipped, and said; a new file goes to the trash (asked first); a deleted one comes back. Each only
 * while the file is as the review read it — the hunk where it was, a deleted file still gone, a new one unchanged —
 * else it's left as it is, and said.
 */
export async function reviewRevert(app: App): Promise<void> {
  const cur = current(app, "x", "reverts a change");
  if (!cur) return;
  const { r, it } = cur;
  if (it.state === "reverted") return app.message("info", "reverted already — u in the file brings it back");
  if (it.state === "kept") return app.message("info", "kept already: staged — u in source control unstages it");
  if (it.rel === null) return app.message("warn", `${it.path} is outside this vault: slipbox writes only inside it`);
  const open = [...app.buffers.values()].find((b) => b.abs === it.abs);
  if (open?.dirty) return skip(app, r, it);
  // A whole file's: only while it's as the review read it — a deleted one not made again, a new one not changed.
  const moved = notAsRead(it);
  if (moved) return app.message("warn", `${moved}: left as it is`);
  if (it.kind === "deleted") {
    const why = discardFile(app.git.checkout!, it.path);
    if (why) return app.message("warn", `git: ${why}`);
    if (open) app.watch.reloadBuffer(open);
    return reverted(app, r, it, `${it.path} is back as staged`);
  }
  if (it.kind === "untracked")
    return app.files.deleteItem({ rel: it.rel, dir: false }, () =>
      reverted(app, r, it, `${it.path} went to the trash`),
    );
  const now = await fresh(app, it);
  if (!now) return app.message("warn", `${it.path} changed since the review read it: that change isn't there now`);
  const buf = app.buffer(it.rel);
  if (!buf) return;
  if (buf.dirty) return skip(app, r, it);
  // The hunk's lines are the disk's: a buffer not read again since the file changed (the watcher off, or not yet run)
  // is read again first, so the edit lands on the lines the review found.
  const disk = now.text.replace(/^\uFEFF/, "");
  if (buf.source !== disk) app.watch.reloadBuffer(buf);
  if (buf.dirty || buf.source !== disk)
    return app.message("warn", `${it.path} changed since the review read it: left as it is`);
  // The text with the hunk's lines as staged, made as one edit of what differs: one undo step in the file.
  const ch = now.change;
  const next = replaceLines(buf.source, ch.from - 1, ch.now.length, ch.was);
  const was = buf.source;
  let a = 0;
  while (a < was.length && a < next.length && was[a] === next[a]) a++;
  let z = 0;
  while (z < was.length - a && z < next.length - a && was[was.length - 1 - z] === next[next.length - 1 - z]) z++;
  buf.edit(a, was.length - a - z, next.slice(a, next.length - z));
  for (const v of app.allViews()) if (v.buf === buf) v.layoutKey = "";
  moveOthers(r, it, ch, "reverted", linesOf(buf.source));
  if (!app.saving.save(buf, true)) return app.message("warn", `${it.path}: reverted, but not saved — :w saves it`);
  reverted(app, r, it, `reverted a change of ${it.path}, saved — u in the file brings it back`);
}

function reverted(app: App, r: Review, it: Item, said: string): void {
  it.state = "reverted";
  app.message("info", said);
  void app.git.refreshNow().then(() => app.host.requestRender());
  if (reviewOf(app) === r) onward(app, r);
}

/** `c`: a note for the agent on the hunk — asked for, then into the scratch with the file, its lines and its diff. */
export function reviewNote(app: App): void {
  const cur = current(app, "c", "writes a note for the agent");
  if (!cur) return;
  const { r, it } = cur;
  app.overlays.prompt("note for the agent: ", (note) => {
    if (app.scratch.add(hunkEntry(it.abs, it.change, note.trim(), app.loc.root)) === null) return;
    it.noted = true;
    app.message("info", `noted: ${it.path} in the scratch${app.scratch.notIndexed()} for the agent`);
    if (reviewOf(app) === r) onward(app, r);
  });
}

/** `n` and `p`: the next hunk, or the one before. */
export function reviewStep(app: App, by: 1 | -1): void {
  const cur = current(app, by > 0 ? "n" : "p", "moves through the changes");
  if (!cur) return;
  const { r } = cur;
  const i = r.at + by;
  if (i < 0 || i >= r.items.length)
    return app.message("info", by > 0 ? "the last change — esc ends the review" : "the first change");
  r.at = i;
  show(app, r);
}

/**
 * `tab` (`git.diff_view`, as in the diff window): a note's hunks drawn as their lines, or as their blocks again — this
 * one and the rest of the review's. A code file's has only its lines, and says so.
 */
export function reviewSwitch(app: App): void {
  const cur = current(app, "tab", "switches a note's change between its blocks and its lines");
  if (!cur) return;
  const { r, it } = cur;
  if (!isNote(app, it.abs)) return app.message("info", LINES_ONLY);
  r.switched = !r.switched;
  show(app, r);
  app.message("info", switchedText(asBlocks(app, it.abs, r.switched)));
}

/** `enter`: the review ended, and the hunk opened in its file — at the cursor's line of it, else its first. */
export function reviewGo(app: App): void {
  const cur = current(app, "enter", "goes to a change");
  if (!cur) return;
  const { r, it } = cur;
  if (it.rel === null) return app.message("warn", `${it.path} is outside this vault`);
  if (it.kind === "deleted") return app.message("info", `${it.path} is deleted — x brings it back`);
  const v = app.floating!.view;
  // The line of what's under the cursor: in a paragraph laid out again, its word's own.
  const row = app.currentLayout(v).lines[v.cur.row];
  const line = r.lines[(row ? srcAt(row, v.cur.col) : 0) - HEAD - 1] ?? hunkLines(it.change).from;
  if (!app.overlays.closeFloating()) return;
  app.openAt(it.rel, line);
}

/** The review's end (none left): the window closed, what it did said. */
export function endReview(app: App): void {
  const r = reviewOf(app);
  if (!r) return;
  app.floating = null;
  reviewEnded(app, r);
}

/** What a review did, said as it closes — by `esc`, `q`, or another window taking its place. */
export function reviewEnded(app: App, r: Review): void {
  const t: Tally = { kept: 0, reverted: 0, noted: 0, skipped: 0, left: 0 };
  for (const it of r.items) {
    if (it.noted) t.noted++;
    if (it.state === "kept") t.kept++;
    else if (it.state === "reverted") t.reverted++;
    else if (it.state === "skipped") t.skipped++;
    else if (!it.noted) t.left++;
  }
  app.message("info", tallyText(t));
}
