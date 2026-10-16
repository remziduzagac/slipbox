// The merge screen (GIT-D5): a file in conflict settled a conflict at a time, in the floating window. Each conflict a
// card — the common base, then yours and theirs, each drawn as a diff against it (GIT-D2) — and below it the file as it
// will be, updating as each is settled. `o` takes yours, `t` theirs, `b` both (yours first), `shift+b` both (theirs
// first); `e` puts the result in the file and the lens at the conflict, to settle by hand; `a` puts the conflict, with
// what's around it, into the scratch for the agent; `n` and `p` move between conflicts. Once none is left, `w` saves it
// (through App.writeBuffer) and `s` stages it, which tells git it's resolved — and the next file in conflict opens.
// Opened by `x` on a conflicted file in source control or Problems (`git.merge_screen`, `:resolve`); the conflict
// prompt's (M)erge opens it where its three-way merge leaves a conflict, `esc` going back to the prompt.

import { join } from "node:path";
import { fenceLanguage, formatEntry } from "../core/capture.ts";
import {
  type Choice,
  type Conflicted,
  choiceText,
  conflictExcerpt,
  conflictsOf,
  fromMerge,
  parseConflicts,
  resultText,
  resultView,
  withStages,
} from "../core/conflicts.ts";
import { inCheckout, inVault, showAt } from "../core/gitops.ts";
import { operationOf } from "../core/gitrebase.ts";
import { sections, stageFile } from "../core/gitstage.ts";
import { layoutScreen, type ScreenPart, screenText } from "../core/layout/diff.ts";
import type { Layout, Span } from "../core/layout/ir.ts";
import { type DiffViewRow, diffView } from "../core/merge.ts";
import { TOP } from "../core/position.ts";
import { sanitize } from "../core/sanitize.ts";
import type { App } from "./app.ts";
import { editable } from "./app.ts";
import { NoteBuffer } from "./buffer.ts";
import { diffLanguage } from "./diffview.ts";
import { keyRow } from "./review.ts";

/** A file on the merge screen: its conflicts, how each is settled, the one shown. */
export interface MergeState {
  /** The file: its vault path, its path in the checkout (null: the conflict prompt's merge, not git's). */
  rel: string;
  path: string | null;
  file: Conflicted;
  choices: (Choice | null)[];
  at: number;
  /** The text it was read from: one changed since is read again. */
  read: string;
  /** Saved as settled. */
  saved: boolean;
  /** Mid-rebase: yours is what's rebased onto, theirs the commit replayed. */
  rebasing: boolean;
  /** The conflict prompt's: the note's buffer, and the text on disk its merge was made with. */
  prompt?: { buf: NoteBuffer; theirs: string };
}

/** Each file's merge screen as it was left, by vault path: opened again on the same text, its choices are back. */
const left = new WeakMap<App, Map<string, MergeState>>();

/** The merge screen open, when the floating window is one. */
export function mergeOf(app: App): MergeState | null {
  const f = app.floating;
  return f?.kind === "merge" ? f.merge : null;
}

/** Files in conflict, as the vault names them (those outside it left out). */
export function conflictedFiles(app: App): string[] {
  const c = app.git.checkout;
  if (!c) return [];
  return sections(app.git.entries ?? [])
    .conflicted.map((e) => inVault(c, app.loc.root, e.path))
    .filter((p): p is string => p !== null);
}

/**
 * `x` on a file in conflict (source control, Problems), or `:resolve` — this note when it's in conflict, else the first
 * that is: its conflicts read from its markers, each one's base from the index's stage 1 where they don't hold it.
 */
export function openMergeScreen(app: App, rel?: string): void {
  const c = app.git.checkout;
  if (!c) return app.message("info", "not a git checkout");
  const conflicted = conflictedFiles(app);
  const here = app.view?.buf.rel ?? null;
  const target = rel ?? (here && conflicted.includes(here) ? here : conflicted[0]);
  if (!target) return app.message("info", "no file in conflict: the merge screen settles git's conflicts");
  const buf = app.buffer(target);
  if (!buf) return;
  // A file git has just changed (a rebase's next stop): read as it is now.
  if (!buf.dirty && buf.changedOnDisk()) app.watch.reloadBuffer(buf);
  const text = buf.source;
  const was = left.get(app)?.get(target);
  if (was?.read === text) return show(app, was);
  const parsed = parseConflicts(text);
  if (!conflictsOf(parsed).length)
    return app.message(
      "info",
      conflicted.includes(target)
        ? `no conflict marker left in ${target}: s in source control stages it, marking it resolved`
        : `${target} has no conflict to settle`,
    );
  const path = inCheckout(c, app.loc.root, target);
  const file = withStages(parsed, {
    base: showAt(c, ":1", path),
    ours: showAt(c, ":2", path),
    theirs: showAt(c, ":3", path),
  });
  show(app, {
    rel: target,
    path,
    file,
    choices: conflictsOf(file).map(() => null),
    at: 0,
    read: text,
    saved: false,
    rebasing: operationOf(c)?.kind === "rebase",
  });
}

/**
 * The conflict prompt's (M)erge (5.5) where its three-way merge leaves a conflict: the note's text as loaded (the base),
 * as typed (yours) and on disk (theirs), settled on the merge screen; `esc` goes back to the prompt.
 */
export function openPromptMerge(app: App, buf: NoteBuffer, theirs: string): void {
  const file = fromMerge(buf.baseText, buf.source, theirs);
  show(app, {
    rel: buf.rel ?? buf.abs,
    path: null,
    file,
    choices: conflictsOf(file).map(() => null),
    at: 0,
    read: buf.source,
    saved: false,
    rebasing: false,
    prompt: { buf, theirs },
  });
}

const text = (ls: string[]) => (ls.length ? `${ls.join("\n")}\n` : "");
/** Lines as a diff's unchanged rows. */
const plain = (ls: string[]): DiffViewRow[] => ls.map((t, i) => ({ kind: " ", text: t, line: i + 1, own: i + 1 }));
/** A row of labels: the first strong, the rest dim. */
const label = (first: string, rest = "", role: Span["role"] = "diff_head"): ScreenPart => ({
  spans: [{ text: first, role, attrs: 0 }, ...(rest ? [{ text: rest, role: "dim" as const, attrs: 0 }] : [])],
});

/** The merge screen on conflict `m.at`: its card, then the file as it will be. */
function show(app: App, m: MergeState): void {
  if (app.floating && app.floating.kind !== "merge" && !app.overlays.closeFloating()) return;
  let all = left.get(app);
  if (!all) left.set(app, (all = new Map()));
  if (!m.prompt) all.set(m.rel, m);
  const conflicts = conflictsOf(m.file);
  const c = conflicts[m.at]!;
  const choice = m.choices[m.at] ?? null;
  const settled = m.choices.filter(Boolean).length;
  const result = resultView(m.file, m.choices);
  const named = (l: string) => (l ? ` · ${sanitize(l)}` : "");
  // A side against the base: its diff; unchanged, its lines as they are; no base known, the side whole.
  const side = (ls: string[]): ScreenPart => {
    const from = c.base === null ? "" : text(c.base);
    const rows = diffView(from, text(ls), new Set(), Number.MAX_SAFE_INTEGER).filter((r) => r.kind !== "@@");
    return rows.length ? { rows, from, to: text(ls) } : { rows: plain(ls), from: text(ls), to: text(ls) };
  };
  const against = c.base === null ? "" : ", against the base";
  const parts: ScreenPart[] = [
    {
      spans: [
        { text: `Conflict ${m.at + 1} of ${conflicts.length}`, role: "strong", attrs: 0 },
        { text: ` · line ${result.lines[m.at] ?? c.line} · `, role: "dim", attrs: 0 },
        { text: choiceText(choice), role: choice ? "git_new" : "git_conflict", attrs: 0 },
      ],
    },
    {
      spans: keyRow([
        ["o", "yours"],
        ["t", "theirs"],
        ["b", "both"],
        ["shift+b", "both, theirs first"],
        ["e", "edit in the lens"],
        ["a", "to the agent"],
        ["n", "next"],
        ["p", "previous"],
        ["w", "save"],
        ...(m.path === null ? [] : ([["s", "stage"]] as [string, string][])),
      ]),
    },
    ...(m.rebasing
      ? [label("Rebasing: ", "yours is what's rebased onto; theirs, the commit being replayed", "dim")]
      : []),
    { spans: [] },
    c.base === null
      ? label("Base", " · not known: neither the markers nor git's index hold it")
      : label("Base", c.base.length ? "" : " · empty: both sides added here"),
    ...(c.base?.length ? [{ rows: plain(c.base), from: text(c.base), to: text(c.base) }] : []),
    label(`Yours${named(c.oursLabel)}`, against),
    side(c.ours),
    label(`Theirs${named(c.theirsLabel)}`, against),
    side(c.theirs),
    { spans: [] },
    label(
      "The result",
      ` · ${settled} of ${conflicts.length} settled${settled < conflicts.length ? "" : m.saved ? " · saved" : " — w saves it"}`,
      "strong",
    ),
    { rows: result.rows, from: result.text, to: result.text },
  ];
  const { language, tabWidth } = diffLanguage(app, m.prompt?.buf.abs ?? join(app.loc.root, m.rel), m.read);
  const buf = new NoteBuffer(null, `merge:${m.rel}`, `merge:${m.rel}`);
  buf.kind = { group: "text", format: "text" };
  // `:w` and ctrl+s save the result, as `w` does.
  buf.virtual = { save: () => mergeSave(app) };
  buf.readOnly = "the merge screen is read-only: o, t and b settle a conflict, e edits it in the lens";
  let made: { key: string; layout: Layout } | null = null;
  buf.drawn = (width, how) => {
    const key = `${width}:${how.glyphs.mode}:${how.wrap}:${how.codeScroll}`;
    if (made?.key !== key) made = { key, layout: layoutScreen(parts, { width, language, tabWidth, ...how }) };
    return made.layout;
  };
  buf.loadText(screenText(parts));
  const v = app.makeView(buf, { ...TOP }, { anchor: { ...TOP }, sub: 0, col: 0 });
  app.floating = { kind: "merge", view: v, title: `Merge — ${sanitize(m.rel)}`, merge: m };
  app.region = "content";
}

/** The merge screen asked for: null (said) when none is open. */
function current(app: App, key: string, what: string): MergeState | null {
  const m = mergeOf(app);
  if (!m) app.message("info", `${key} ${what} on the merge screen — x on a file in conflict opens it (:resolve)`);
  return m;
}

/** `o`, `t`, `b`, `shift+b`: the conflict settled so, and on to the next one that isn't. */
export function mergeTake(app: App, choice: Exclude<Choice, { lines: string[] }>): void {
  const m = current(app, "o, t and b", "settle a conflict");
  if (!m) return;
  m.choices[m.at] = choice;
  m.saved = false;
  const open = m.choices.filter((c) => !c).length;
  app.message(
    "info",
    `conflict ${m.at + 1}: ${choiceText(choice)} — ${open ? `${open} left` : `all settled: w saves ${m.rel}`}`,
  );
  const n = m.choices.length;
  for (let k = 1; k < n; k++)
    if (!m.choices[(m.at + k) % n]) {
      m.at = (m.at + k) % n;
      break;
    }
  show(app, m);
}

/** `n` and `p`: the next conflict, or the one before. */
export function mergeStep(app: App, by: 1 | -1): void {
  const m = current(app, by > 0 ? "n" : "p", "moves between conflicts");
  if (!m) return;
  const i = m.at + by;
  if (i < 0 || i >= m.choices.length)
    return app.message("info", by > 0 ? "the last conflict — p goes back" : "the first conflict");
  m.at = i;
  show(app, m);
}

/** The buffer the result goes into: the prompt's note, or the file's — unchanged since the screen read it. */
function target(app: App, m: MergeState): NoteBuffer | null {
  if (m.prompt) return m.prompt.buf;
  const buf = app.buffer(m.rel);
  if (buf && buf.source !== m.read) {
    app.message("warn", `${m.rel} changed since the merge screen read it — x reads it again`);
    return null;
  }
  return buf;
}

/** The result into `buf`, one undo step: the prompt's note then measured against the text on disk it merged. */
function put(app: App, m: MergeState, buf: NoteBuffer): void {
  buf.edit(0, buf.source.length, resultText(m.file, m.choices));
  if (m.prompt) buf.rebase(m.prompt.theirs);
  // Markers left: autosave mustn't write them; you save it yourself.
  buf.markers = m.choices.some((c) => !c);
  for (const v of app.allViews()) if (v.buf === buf) v.layoutKey = "";
}

/**
 * `e`: the result in the file — the conflicts settled as chosen, the rest still marked — opened at this conflict in
 * the lens, to settle by hand; unsaved. `x` reads what's left onto the merge screen again.
 */
export function mergeEdit(app: App): void {
  const m = current(app, "e", "edits a conflict in the lens");
  if (!m) return;
  const buf = target(app, m);
  if (!buf) return;
  if (buf.rel === null) return app.message("warn", `${m.rel} is outside this vault: slipbox writes only inside it`);
  const line = resultView(m.file, m.choices).lines[m.at] ?? 1;
  app.floating = null;
  put(app, m, buf);
  left.get(app)?.delete(m.rel);
  app.openAt(buf.rel, line);
  const v = app.view;
  if (v?.buf === buf && !editable(v)) {
    app.lens.setViewMode(v, app.lens.editMode(v));
    app.placeAtLine(v, line);
  }
  app.message(
    "info",
    `${m.rel}, unsaved: settle conflict ${m.at + 1} by hand, then :w${m.prompt ? "" : " — x opens the merge screen on what's left"}`,
  );
}

/** `a`: the conflict, its base between the sides and the lines around it, into the scratch for the agent — a note asked. */
export function mergeAgent(app: App): void {
  const m = current(app, "a", "sends a conflict to the agent");
  if (!m) return;
  const ex = conflictExcerpt(m.file, m.at);
  if (!ex) return;
  const abs = m.prompt?.buf.abs ?? join(app.loc.root, m.rel);
  const k = m.at;
  app.overlays.prompt("note for the agent: ", (note) => {
    const entry = formatEntry(
      {
        ref: { path: abs, startLine: ex.from, endLine: ex.to },
        snippetText: ex.text,
        lang: fenceLanguage(abs),
        text: note.trim() || "a merge conflict: settle it, keeping what each side meant",
        cwd: app.loc.root,
      },
      app.loc.root,
    );
    if (app.scratch.add(entry) !== null)
      app.message("info", `conflict ${k + 1} in the scratch for the agent — space s y copies it`);
  });
}

/** `w`: the file saved as settled, once no conflict is left — through App.writeBuffer, one undo step in it. */
export function mergeSave(app: App): boolean {
  const m = current(app, "w", "saves the file");
  if (!m) return false;
  const open = m.choices.filter((c) => !c).length;
  if (open) {
    app.message("info", `${open} conflict${open === 1 ? "" : "s"} left: o, t or b settles one, e edits it in the lens`);
    return false;
  }
  const buf = target(app, m);
  if (!buf) return false;
  put(app, m, buf);
  if (!app.saving.save(buf, true)) {
    app.message("warn", `${m.rel}: not saved — it changed on disk meanwhile; :w in it says how`);
    return false;
  }
  m.read = buf.source;
  m.saved = true;
  if (m.prompt) {
    app.floating = null;
    app.message("info", `merged and saved ${app.displayName(buf)}`);
    return true;
  }
  app.message("info", `saved ${m.rel} — s stages it, marking it resolved`);
  show(app, m);
  return true;
}

/** `s`: the saved file staged — git told it's resolved — and the next file in conflict opened, if there's one. */
export function mergeStage(app: App): void {
  const m = current(app, "s", "stages the file");
  if (!m) return;
  if (m.path === null) return app.message("info", "not git's conflict: w saves it, and that's all");
  if (!m.saved)
    return app.message(
      "info",
      m.choices.some((c) => !c) ? "settle every conflict, then w saves it" : "w saves it first",
    );
  const c = app.git.checkout!;
  const why = stageFile(c, m.path);
  if (why) return app.message("warn", `git: ${why}`);
  left.get(app)?.delete(m.rel);
  app.floating = null;
  void app.git.refreshNow().then(() => {
    const next = conflictedFiles(app).find((p) => p !== m.rel);
    const op = operationOf(c);
    if (next) {
      app.message("info", `${m.rel} staged, marked resolved — next: ${next}`);
      openMergeScreen(app, next);
    } else
      app.message(
        "info",
        `${m.rel} staged, marked resolved — no conflict left${op ? `: shift+r ${op.kind === "rebase" ? "continues the rebase" : "concludes the merge"}` : ""}`,
      );
    app.host.requestRender();
  });
}

/** The merge screen closed (`esc`, `q`): the conflict prompt's goes back to the prompt; git's says how to come back. */
export function mergeClosed(app: App, m: MergeState): void {
  if (m.prompt) return app.saving.conflictPrompt(m.prompt.buf);
  const settled = m.choices.filter(Boolean).length;
  if (settled && !m.saved)
    app.message(
      "info",
      `${m.rel}: ${settled} of ${m.choices.length} settled, not saved — x opens the merge screen as you left it`,
    );
}
