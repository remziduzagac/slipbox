// Command implementations for the TUI. Ids and titles come from core/command-specs.ts, so the CLI
// can list them and the parity test can check them; this is where each one does its work. The
// keys are in keys.ts and docs/design/keymap.md.

import { join } from "node:path";
import { clearScratch, formatEntry, readScratch } from "../core/capture.ts";
import { COMMAND_GROUPS, COMMAND_SPECS, commandGroup } from "../core/command-specs.ts";
import type { Command } from "../core/commands.ts";
import type { LayoutLink } from "../core/layout/ir.ts";
import { slugify } from "../core/parse.ts";
import type { Anchor } from "../core/position.ts";
import { cacheDir, stateDir } from "../core/paths.ts";
import { listThemes, loadTheme } from "../core/theme/index.ts";
import type { App, ListItem, Loc, UiState, View } from "./app.ts";
import { computeFind } from "./app.ts";
import * as C from "./cursor.ts";
import { rank } from "./fuzzy.ts";
import { EXPLORER_ACTION_INFO, FILTER_KEYS_HELP, HISTORY_ACTION_INFO, OUTLINE_ACTION_INFO, prettyKey, RESIZE_ACTIONS, spellKey } from "./keys.ts";

type Run = Command<App>["run"];

function withView(a: App, fn: (v: View) => void): void {
  const v = a.view;
  if (!v) return a.message("info", "no note open");
  fn(v);
}

/** A cursor command: compute the target from the layout, then move (extending when asked). */
function motion(target: (a: App, v: View) => C.Pos, opts: { keepGoal?: boolean } = {}): Run {
  return (a, arg) =>
    withView(a, (v) => {
      a.moveCursor(v, target(a, v), { extend: arg === "extend", keepGoal: opts.keepGoal });
    });
}

function lay(a: App, v: View) {
  return a.currentLayout(v);
}

// ---------------------------------------------------------------------------------------------
// Links

function followLink(a: App, link: LayoutLink, inSplit: boolean): void {
  const view = a.view;
  if (!view) return;
  const from = view.buf.rel;
  const go = (path: string, heading: string | null) => {
    const anchor = heading ? headingAnchor(a, path, heading) : undefined;
    if (inSplit) {
      a.splitWith(a.tab?.orientation ?? "side");
      const t = a.tab!;
      t.active = t.views.length - 1;
    }
    a.open(path, anchor);
  };
  switch (link.kind) {
    case "footnote": {
      const layout = lay(a, view);
      const row = layout.lines.findIndex((l) => l.spans[0]?.role === "footnote" && l.spans[0].text.startsWith(`${link.target}.`));
      if (row < 0) return a.message("warn", `footnote [^${link.target}] has no definition`);
      a.pushHistory(view);
      a.moveCursor(view, { row, col: 0 });
      return;
    }
    case "wiki":
    case "embed": {
      if (!link.target) {
        if (link.heading) jumpToHeading(a, view, link.heading);
        return;
      }
      if (!from) return a.message("warn", `[[${link.target}]]: links resolve only inside the vault`);
      const r = a.graph.resolveLink({ kind: link.kind, target: link.target }, from);
      if (r.resolvedKind === "note") return go(r.path!, link.heading);
      if (r.resolvedKind === "file") return fileLink(a, r.path!);
      if (r.resolvedKind === "ambiguous") {
        return a.openList({
          title: `[[${link.target}]] matches ${r.candidates.length} notes`,
          items: r.candidates.map((c) => ({ label: c, data: c })),
          accept: (item) => go(item.data as string, link.heading),
        });
      }
      return a.message("warn", `unresolved link [[${link.target}]] — no note named "${link.target}"`);
    }
    case "markdown":
    case "image": {
      const external = /^[a-z][a-z0-9+.-]*:/i.test(link.target);
      if (!from && !external) return a.message("warn", `${link.target}: links resolve only inside the vault`);
      const r = a.graph.resolveLink({ kind: link.kind === "image" ? "image" : "markdown", target: link.target }, from ?? "");
      if (r.resolvedKind === "external") {
        a.copy(link.target, false);
        return a.message("info", `copied: ${link.target}`);
      }
      const frag = link.target.includes("#") ? decodeURIComponent(link.target.split("#")[1]!) : null;
      if (r.resolvedKind === "anchor") {
        if (frag) jumpToHeading(a, view, frag);
        return;
      }
      if (r.resolvedKind === "note") return go(r.path!, frag);
      if (r.resolvedKind === "file") return fileLink(a, r.path!);
      return a.message("warn", `broken link: ${link.target}`);
    }
  }
}

function fileLink(a: App, rel: string): void {
  a.copy(join(a.loc.root, rel), false);
  a.message("info", `attachment ${rel} — path copied (images render in a later phase)`);
}

function headingAnchor(a: App, path: string, heading: string): Anchor | undefined {
  const note = a.graph.entry(path);
  const slug = slugify(heading);
  const h = note?.headings.find((x) => x.slug === slug || x.text.toLowerCase() === heading.toLowerCase());
  if (!h) {
    a.message("warn", `no heading "${heading}" in ${path}`);
    return undefined;
  }
  const idx = note!.headings.filter((x) => x.slug === h.slug && x.line < h.line).length;
  return { heading: h.slug, headingIndex: idx, offset: 0, line: h.line };
}

function jumpToHeading(a: App, view: View, heading: string): void {
  const layout = lay(a, view);
  const slug = slugify(heading);
  const h = layout.headings.find((x) => x.slug === slug || x.text.toLowerCase() === heading.toLowerCase());
  if (!h) return a.message("warn", `no heading "${heading}" here`);
  a.pushHistory(view);
  a.moveCursor(view, { row: h.line, col: 0 });
}

function cycleLink(a: App, dir: 1 | -1): void {
  withView(a, (v) => {
    const layout = lay(a, v);
    const links = layout.links.map((l, i) => ({ l, i })).filter((x) => x.l.line >= 0);
    if (!links.length) return a.message("info", "no links in this note");
    // Off a link, a link starting right at the cursor counts as the next one.
    const onLink = a.linkUnderCursor(v) >= 0;
    const after = (x: { l: LayoutLink }) => x.l.line > v.cur.row || (x.l.line === v.cur.row && (onLink ? x.l.col > v.cur.col : x.l.col >= v.cur.col));
    const before = (x: { l: LayoutLink }) => x.l.line < v.cur.row || (x.l.line === v.cur.row && x.l.col < v.cur.col);
    const next = dir === 1 ? (links.find(after) ?? links[0]!) : ([...links].reverse().find(before) ?? links[links.length - 1]!);
    a.moveCursor(v, { row: next.l.line, col: next.l.col });
  });
}

function linkTarget(a: App, v: View, link: LayoutLink): string {
  if (!v.buf.rel || link.kind === "footnote") return link.target;
  const r = a.graph.resolveLink({ kind: link.kind, target: link.target }, v.buf.rel);
  return r.path && r.resolvedKind !== "external" ? join(a.loc.root, r.path) : link.target;
}

// ---------------------------------------------------------------------------------------------
// The `:` prompt: fuzzy commands, plus exact aliases that win, plus argument completion.

function argCandidates(a: App, cmd: string): string[] | null {
  switch (cmd) {
    case "note.open":
      return [...a.graph.notes.keys()];
    case "theme.set":
      return listThemes().map((t) => t.name);
    case "glyphs.set":
      return ["nerd", "unicode", "ascii", "auto"];
    default:
      return null;
  }
}

/** Commands in the order of core/command-specs.ts, which follows docs/design/keymap.md. */
const SPEC_ORDER = new Map(COMMAND_SPECS.map((c, i) => [c.id, i]));
function inSpecOrder<T extends { id: string }>(commands: T[]): T[] {
  return [...commands].sort((x, y) => (SPEC_ORDER.get(x.id) ?? 1e9) - (SPEC_ORDER.get(y.id) ?? 1e9));
}

/** Run a command chosen from the palette or help, remembering it for the palette's Recent. */
function runChosen(a: App, spec: string): void {
  a.noteRecent(spec.split(" ")[0]!);
  void a.run(spec).then(() => a.host.requestRender());
}

/** A group heading: a blank row before it (unless first), the title, a rule under it. */
function heading(title: string, first: boolean): ListItem[] {
  return [...(first ? [] : [{ label: "", header: true, data: null }]), { label: title, header: true, data: null }, { label: "", header: true, rule: true, data: null }];
}

/** Items under group headings, in the groups' order (docs/design/keymap.md). */
function grouped(items: ListItem[], groupOf: (item: ListItem) => string, order: string[], first = true): ListItem[] {
  const out: ListItem[] = [];
  for (const title of order) {
    const members = items.filter((i) => groupOf(i) === title);
    if (members.length) out.push(...heading(title, first && !out.length), ...members);
  }
  return out;
}

/**
 * At most three bindings shown, plain ones first (a variant like "extend the selection" after);
 * the rest go to the footer.
 */
function topKeys(keys: string[], variants: Set<string>, desc: string): { keys: string[]; more: string[]; detail: string } {
  const ordered = [...keys.filter((k) => !variants.has(k)), ...keys.filter((k) => variants.has(k))];
  return { keys: ordered.slice(0, 3), more: ordered.slice(3), detail: desc };
}

/**
 * The palette (`:`): for doing things. An empty query shows Recent, then every command by group;
 * typing ranks the best match first. Each command shows its first key and alias; the selected
 * one's description is in the footer.
 */
function openPalette(a: App): void {
  const commands = inSpecOrder(a.registry.list().filter((c) => !c.hidden));
  const aliasOf = new Map<string, string[]>();
  for (const [al, spec] of Object.entries(a.aliases)) {
    const list = aliasOf.get(spec) ?? [];
    list.push(`:${al}`);
    aliasOf.set(spec, list);
  }
  const commandItems: ListItem[] = commands.map((c) => {
    const keys = [...new Set([...a.keymap.keysFor(c.id), ...a.visualKeys.keysFor(c.id)])].map(spellKey);
    const aliases = aliasOf.get(c.id) ?? [];
    // Two fixed columns, the first key and the first alias (empty when there is none); the rest
    // in the footer.
    return { label: c.title, detail: c.description ?? c.id, keys: [keys[0] ?? "", aliases[0] ?? ""], more: [...keys.slice(1), ...aliases.slice(1)], data: c.id };
  });
  const byId = new Map(commandItems.map((i) => [i.data as string, i]));
  const recent = a.recentCommands.map((id) => byId.get(id)).filter((i): i is ListItem => !!i);
  const browse: ListItem[] = [
    ...(recent.length ? [...heading("Recent", true), ...recent] : []),
    ...grouped(commandItems, (i) => commandGroup(i.data as string), COMMAND_GROUPS.map((g) => g.title), !recent.length),
  ];
  a.openList({
    title: "Commands — type a name, or an alias like :q",
    items: commandItems,
    footer: true,
    alignKeysAcrossList: true,
    source: (input) => {
      if (!input.trim()) return browse;
      const m = /^(\S+)\s(.*)$/.exec(input);
      const aliasSpec = m ? a.aliases[m[1]!] : undefined;
      if (aliasSpec) {
        const cands = argCandidates(a, aliasSpec.split(" ")[0]!);
        if (cands) {
          return rank(m![2]!, cands, (x) => x, 200).map(({ item }) => ({ label: item, detail: `${m![1]} ${item}`, data: `${aliasSpec} ${item}` }));
        }
      }
      const exact = a.aliases[input.trim()];
      const ranked = rank(input.trim(), commandItems, (i) => `${i.label} ${i.detail}`).map((r) => r.item);
      if (exact) {
        const title = a.registry.get(exact.split(" ")[0]!)?.title ?? exact;
        return [{ label: title, detail: `alias for ${exact}`, keys: ["", `:${input.trim()}`], data: exact }, ...ranked.filter((i) => i.data !== exact)];
      }
      return ranked;
    },
    submit: (input) => {
      // An exact alias (optionally with an argument) wins over the fuzzy match, unless another
      // entry was picked: moved to with the keys, or clicked (its row is first while unmoved).
      const m = /^(\S+)(?:\s+(.*))?$/.exec(input.trim());
      if (!m) return false;
      const spec = a.aliases[m[1]!];
      if (!spec) return false;
      const arg = m[2]?.trim();
      if (!arg && a.overlay?.kind === "list" && a.overlay.selected > 0) return false;
      if (arg && argCandidates(a, spec.split(" ")[0]!) && a.overlay?.kind === "list") {
        // With an argument that completes, prefer the highlighted candidate.
        const sel = a.overlay.filtered[a.overlay.selected]?.item;
        a.overlay = null;
        runChosen(a, sel ? (sel.data as string) : `${spec} ${arg}`);
        return true;
      }
      a.overlay = null;
      runChosen(a, arg ? `${spec} ${arg}` : spec);
      return true;
    },
    accept: (item) => {
      if (typeof item.data === "string") runChosen(a, item.data);
    },
  });
}

/**
 * Help (`?`, `space ?`): for learning the keys. Every command with all its keys, by group, plus what
 * works inside the explorer, the outline, visual and resize mode, and the mouse. Filtering keeps
 * the groups; enter runs a command (the in-pane and mouse entries are reference only). Opened
 * from the explorer, the outline or visual mode, it starts at that section.
 */
function openHelp(a: App): void {
  const commands: ListItem[] = inSpecOrder(a.registry.list()).map((c) => {
    const plain = [...a.keymap.keysFor(c.id), ...a.visualKeys.keysFor(c.id)].map(spellKey);
    // Bindings with an argument (e.g. "cursor.down extend") are variants: shown after the plain ones.
    const variants = a.keymap.entries().filter(([, v]) => v.startsWith(`${c.id} `)).map(([k]) => spellKey(k));
    return { label: c.title, ...topKeys([...new Set([...plain, ...variants])], new Set(variants), c.description ?? c.id), data: c.id };
  });
  // An entry per action with its keys; `actions` gathers several that do the same there.
  const pane = (keymap: { keysFor(action: string): string[] }, info: Record<string, { title: string; desc: string; actions?: string[] }>): ListItem[] =>
    Object.entries(info)
      .map(([action, i]) => ({ label: i.title, ...topKeys((i.actions ?? [action]).flatMap((x) => keymap.keysFor(x)).map(spellKey), new Set(), i.desc), data: null }))
      .filter((i) => i.keys.length);
  const items: ListItem[] = [
    ...grouped(commands, (i) => commandGroup(i.data as string), COMMAND_GROUPS.map((g) => g.title)),
    ...heading("Inside the explorer", false),
    ...pane(a.explorerKeys, EXPLORER_ACTION_INFO),
    ...heading("Inside the history", false),
    ...pane(a.explorerKeys, HISTORY_ACTION_INFO),
    ...heading("Filtering a panel (/)", false),
    ...FILTER_KEYS_HELP.map(([label, keys, detail]) => ({ label, ...topKeys(keys.map((k) => (k === "type" ? k : spellKey(k))), new Set(), detail), data: null })),
    ...heading("Inside the outline", false),
    ...pane(a.outlineKeys, OUTLINE_ACTION_INFO),
    ...heading("Resize mode", false),
    ...pane(a.resizeKeys, RESIZE_ACTIONS),
    ...heading("Mouse", false),
    ...MOUSE_HELP.map(([label, keys, detail]) => ({ label, ...topKeys(keys, new Set(), detail), data: null })),
  ];
  // Start where the keys are about what you're doing: the focused pane's, or visual mode's.
  const section = a.region === "sidebar" ? (a.leftView === "history" ? "Inside the history" : "Inside the explorer") : a.region === "outline" ? "Inside the outline" : a.view?.visual ? "Selection & copy" : null;
  const at = section ? items.findIndex((i) => i.header && i.label === section) : -1; // the title row
  a.openList({
    title: "Keys — type to filter, enter runs a command",
    items,
    footer: true,
    keepGroups: true,
    selected: at >= 0 ? at + 1 : undefined,
    accept: (item) => {
      if (typeof item.data === "string") runChosen(a, item.data);
    },
  });
  // With the section's heading at the top of the list.
  if (at >= 0 && a.overlay?.kind === "list") a.overlay.scroll = at;
}

/** The mouse, for help: [what, how, detail]. */
const MOUSE_HELP: [string, string[], string][] = [
  ["Move the cursor", ["click"], "Moves the cursor to where you click in a note; on a link, follows it"],
  ["Select and copy", ["drag"], "Selects the text you drag over and copies it on release"],
  ["Select a word / a row", ["double-click", "triple-click"], "Selects the word or the whole row, and copies it"],
  ["Scroll", ["wheel"], "Scrolls the note, a pane or a list, or switches tabs"],
  ["Show a panel's view", ["click"], "On a rail: ≡ the explorer, ◷ the history, ▤ the outline; again hides it"],
  ["Open a note as a tab", ["click"], "In the explorer: opens the note as a tab; on a folder, folds or unfolds it"],
  ["Jump to a place", ["click"], "In the history: moves the window back or forward to that place"],
  ["Jump to a heading", ["click"], "In the outline or a breadcrumb: moves the note there; on ▾ / ▸, folds"],
  ["Switch, reorder, close tabs", ["click", "drag", "middle-click"], "On the tab strip: switches, drags to reorder, closes (so does ×)"],
  ["Resize panes and splits", ["drag"], "Drags a border to resize what's beside it"],
  ["Scroll to a place", ["click", "drag"], "On a scrollbar (either direction): jumps there, or drags the thumb"],
  ["Open the heading path", ["click"], "On the breadcrumb's …: the whole path as a dropdown"],
  ["Copy the note's path", ["click"], "On the path in the status line: copies the absolute path"],
];

// ---------------------------------------------------------------------------------------------
// UI settings

const UI_TOGGLES: { key: keyof UiState; id: string; title: string }[] = [
  { key: "readable_width", id: "ui.readable", title: "Readable width" },
  { key: "zen", id: "ui.zen", title: "Zen mode" },
  { key: "cursorline", id: "ui.cursorline", title: "Cursor-row highlight" },
  { key: "line_numbers", id: "ui.line_numbers", title: "Line numbers" },
  { key: "wrap", id: "ui.wrap", title: "Wrap long lines" },
  { key: "urls", id: "ui.urls", title: "Show link URLs" },
  { key: "mouse", id: "ui.mouse", title: "Mouse" },
];

function toggle(a: App, key: keyof UiState, title: string): void {
  const next = !a.ui[key];
  a.setUi(key, next as never);
  a.message("info", `${title}: ${next ? "on" : "off"}`);
}

function pickTheme(a: App): void {
  const before = a.ui.theme;
  const themes = listThemes();
  a.openList({
    title: "Theme (live preview)",
    items: themes.map((t) => ({ label: t.name, hint: t.source, data: t.name })),
    selected: themes.findIndex((t) => t.name === before),
    move: (item) => {
      a.theme = a.themeNamed(item.data as string).theme;
    },
    accept: (item) => {
      a.setUi("theme", item.data as string);
      a.message("info", `theme ${a.theme.name} · theme = "${a.theme.name}" in config makes it the default`);
    },
    cancel: () => {
      a.theme = a.themeNamed(before).theme;
    },
  });
}

function pickGlyphs(a: App): void {
  const before = a.ui.glyphs;
  const sets = ["nerd", "unicode", "ascii", "auto"];
  const preview = (mode: string) => {
    a.glyphs = a.glyphSet(mode);
    a.relayoutAll();
  };
  a.openList({
    title: "Glyphs (live preview)",
    items: sets.map((s) => ({ label: s, hint: s === "auto" ? "detect from the terminal" : undefined, data: s })),
    selected: Math.max(0, sets.indexOf(before)),
    move: (item) => preview(item.data as string),
    accept: (item) => {
      a.setUi("glyphs", item.data as string);
      a.message("info", `glyphs: ${item.data}`);
    },
    cancel: () => preview(before),
  });
}

// ---------------------------------------------------------------------------------------------

function infoList(a: App, title: string, rows: [string, string][]): void {
  const w = Math.max(...rows.map(([k]) => k.length));
  a.openList({
    title: `${title} — enter copies a line`,
    filterable: false,
    items: rows.map(([k, v]) => ({ label: `${k.padEnd(w)}  ${v}`, data: `${k}: ${v}` })),
    accept: (item) => void a.copy(item.data as string),
  });
}

/**
 * `n` / `shift+n`, as in vim: the next match after the cursor (or before it), wrapping around the
 * note, wherever the cursor has moved since the last one.
 */
function findStep(a: App, dir: 1 | -1, from?: { row: number; col: number }): void {
  const v = a.view;
  if (!v?.find || !v.find.matches.length) return a.message("info", "no search — ctrl+f or / starts one");
  const ms = v.find.matches;
  const n = ms.length;
  const at = from ?? v.cur;
  const cmp = (m: { row: number; col: number }) => (m.row - at.row) * 1e9 + (m.col - at.col);
  let i = dir === 1 ? ms.findIndex((m) => cmp(m) > 0) : ms.findLastIndex((m) => cmp(m) < 0);
  const wrapped = i < 0;
  if (wrapped) i = dir === 1 ? 0 : n - 1;
  v.find.current = i;
  const m = ms[i]!;
  a.moveCursor(v, { row: m.row, col: m.col });
  a.message("info", `${i + 1}/${n}  ${v.find.query}${wrapped ? (dir === 1 ? "  (from the top)" : "  (from the bottom)") : ""}`);
}

/**
 * `*` / `#`, as in vim: search for the whole word under the cursor (or, off a word, the next one on
 * its row), forward or backward from it.
 */
function findWord(a: App, dir: 1 | -1): void {
  const v = a.view;
  if (!v) return;
  const layout = lay(a, v);
  const cs = C.cells(layout.lines[v.cur.row]);
  const isWord = (g: string) => /^[\p{L}\p{N}_]/u.test(g);
  let k = cs.findIndex((c) => c.x + c.w > v.cur.col);
  if (k >= 0) while (k < cs.length && !isWord(cs[k]!.g)) k++;
  if (k < 0 || k >= cs.length) return a.message("info", "no word under the cursor");
  let s = k;
  while (s > 0 && isWord(cs[s - 1]!.g)) s--;
  let e = k;
  while (e < cs.length - 1 && isWord(cs[e + 1]!.g)) e++;
  const word = cs.slice(s, e + 1).map((c) => c.g).join("");
  v.find = computeFind(layout, word, 0, true);
  // From the word's start: forward skips this one, backward finds the one before it.
  findStep(a, dir, { row: v.cur.row, col: cs[s]!.x });
}

export function registerActions(app: App): void {
  const impl: Record<string, Run> = {
    // cursor
    "cursor.left": motion((a, v) => C.left(lay(a, v), v.cur)),
    "cursor.right": motion((a, v) => C.right(lay(a, v), v.cur)),
    "cursor.up": motion((a, v) => C.vertical(lay(a, v), v.cur, -1, v.goal), { keepGoal: true }),
    "cursor.down": motion((a, v) => C.vertical(lay(a, v), v.cur, 1, v.goal), { keepGoal: true }),
    "cursor.word_prev": motion((a, v) => C.wordPrev(lay(a, v), v.cur)),
    "cursor.word_next": motion((a, v) => C.wordNext(lay(a, v), v.cur)),
    "cursor.word_end": motion((a, v) => C.wordEnd(lay(a, v), v.cur)),
    "cursor.line_start": motion((a, v) => C.lineStart(lay(a, v), v.cur)),
    "cursor.line_end": motion((a, v) => C.lineEnd(lay(a, v), v.cur)),
    "cursor.first_nonblank": motion((a, v) => C.firstNonBlank(lay(a, v), v.cur)),
    "cursor.top": motion((a, v) => C.top(lay(a, v))),
    "cursor.bottom": motion((a, v) => C.bottom(lay(a, v))),
    "cursor.heading_prev": motion((a, v) => C.headingPrev(lay(a, v), v.cur)),
    "cursor.heading_next": motion((a, v) => C.headingNext(lay(a, v), v.cur)),
    "cursor.paragraph_prev": motion((a, v) => C.paragraphPrev(lay(a, v), v.cur)),
    "cursor.paragraph_next": motion((a, v) => C.paragraphNext(lay(a, v), v.cur)),
    "cursor.half_down": (a) => withView(a, (v) => a.scrollBy(v, Math.max(1, Math.floor(v.height / 2)), true)),
    "cursor.half_up": (a) => withView(a, (v) => a.scrollBy(v, -Math.max(1, Math.floor(v.height / 2)), true)),
    "cursor.page_down": (a, arg) =>
      withView(a, (v) => {
        const n = Math.max(1, v.height - 2);
        if (arg === "extend") a.moveCursor(v, C.vertical(lay(a, v), v.cur, n, v.goal), { extend: true, keepGoal: true });
        else a.scrollBy(v, n, true);
      }),
    "cursor.page_up": (a, arg) =>
      withView(a, (v) => {
        const n = Math.max(1, v.height - 2);
        if (arg === "extend") a.moveCursor(v, C.vertical(lay(a, v), v.cur, -n, v.goal), { extend: true, keepGoal: true });
        else a.scrollBy(v, -n, true);
      }),
    // selection
    "visual.char": (a) =>
      withView(a, (v) => {
        if (v.visual === "char") return void Object.assign(v, { visual: null, sel: null });
        v.visual = "char";
        if (v.sel) v.sel.line = false;
        else a.select(v, { ...v.cur }, false);
      }),
    "visual.line": (a) =>
      withView(a, (v) => {
        if (v.visual === "line") return void Object.assign(v, { visual: null, sel: null });
        v.visual = "line";
        if (v.sel) v.sel.line = true;
        else a.select(v, { ...v.cur }, true);
      }),
    "visual.swap": (a) =>
      withView(a, (v) => {
        if (!v.sel) return;
        const anchor = v.sel.anchor;
        a.select(v, { ...v.cur }, v.sel.line);
        a.moveCursor(v, anchor);
      }),
    "visual.yank": (a) =>
      withView(a, (v) => {
        const text = a.selectionText(v);
        if (text) a.copy(text);
        Object.assign(v, { visual: null, sel: null });
      }),
    "visual.exit": (a) => withView(a, (v) => Object.assign(v, { visual: null, sel: null })),
    "app.escape": (a) => {
      const v = a.view;
      if (!v) return;
      if (v.sel || v.visual) Object.assign(v, { visual: null, sel: null });
      else if (v.find) v.find = null;
      else if (a.region !== "content") a.region = "content";
    },
    "copy.smart": (a) =>
      withView(a, (v) => {
        if (v.sel) {
          a.copy(a.selectionText(v));
          Object.assign(v, { visual: null, sel: null });
          return;
        }
        const row = C.cells(lay(a, v).lines[v.cur.row]).map((c) => c.g).join("").trim();
        if (row) a.copy(row);
        else a.message("info", "nothing on this row to copy");
      }),
    "copy.selection": (a) =>
      withView(a, (v) => {
        if (!v.sel) return a.message("info", `nothing selected · ${prettyKey("ctrl+q")} quits`);
        a.copy(a.selectionText(v));
      }),
    "copy.path": (a) => withView(a, (v) => void a.copy(v.buf.abs)),
    "copy.ref": (a) => withView(a, (v) => void a.copy(`${v.buf.rel ?? v.buf.abs}:${lay(a, v).lines[v.cur.row]?.src ?? 1}`)),
    "copy.link": (a) =>
      withView(a, (v) => {
        const i = a.linkUnderCursor(v);
        if (i < 0) return a.message("info", "no link under the cursor");
        a.copy(linkTarget(a, v, lay(a, v).links[i]!));
      }),
    // links
    "link.next": (a) => cycleLink(a, 1),
    "link.prev": (a) => cycleLink(a, -1),
    "link.follow": (a) =>
      withView(a, (v) => {
        const i = a.linkForFollow(v);
        if (i < 0) return a.message("info", `no link here · ${prettyKey("ctrl+tab")} or ${prettyKey(`${a.leader} l n`, a.leader)} goes to the next one`);
        followLink(a, lay(a, v).links[i]!, false);
      }),
    "link.follow_split": (a) =>
      withView(a, (v) => {
        const i = a.linkForFollow(v);
        if (i < 0) return a.message("info", "no link here");
        followLink(a, lay(a, v).links[i]!, true);
      }),
    "links.open": (a) =>
      withView(a, (v) => {
        const layout = lay(a, v);
        if (!layout.links.length) return a.message("info", "no links in this note");
        a.openList({
          title: `Links from ${v.buf.name}`,
          items: layout.links.map((l, i) => ({
            label: l.text,
            detail: l.kind === "markdown" || l.kind === "image" ? l.target : `[[${l.target}${l.heading ? `#${l.heading}` : ""}]]`,
            hint: l.status,
            data: i,
          })),
          accept: (item) => {
            const l = layout.links[item.data as number]!;
            if (l.line >= 0) a.moveCursor(v, { row: l.line, col: l.col });
            followLink(a, l, false);
          },
        });
      }),
    "backlinks.open": (a) =>
      withView(a, (v) => {
        if (!v.buf.rel) return a.message("info", "backlinks exist only for vault notes");
        const bl = a.graph.backlinks(v.buf.rel);
        if (!bl.length) return a.message("info", `no notes link to ${v.buf.rel}`);
        a.openList({
          title: `Linking to ${v.buf.name} (${bl.length})`,
          items: bl.map((b) => ({ label: b.from, detail: b.text, hint: `${b.line}`, data: b })),
          accept: (item) => {
            const b = item.data as { from: string; line: number };
            a.open(b.from, { heading: null, headingIndex: 0, offset: b.line - 1, line: b.line });
          },
        });
      }),
    // history
    "history.back": (a) => a.history("back"),
    "history.forward": (a) => a.history("forward"),
    // The left panel on the history, like the explorer: open and focus, focus, close.
    "history.list": (a) =>
      withView(a, (v) => {
        if (!v.back.length && !v.fwd.length && !(a.sidebarShown && a.leftView === "history")) return a.message("info", "no history yet");
        a.openLeftView("history", "cycle");
      }),
    // windows
    "window.split_side": (a) => a.splitWith("side"),
    "window.split_stacked": (a) => a.splitWith("stacked"),
    "window.focus_left": (a) => a.focusDir("left"),
    "window.focus_down": (a) => a.focusDir("down"),
    "window.focus_up": (a) => a.focusDir("up"),
    "window.focus_right": (a) => a.focusDir("right"),
    "window.other": (a) => {
      const t = a.tab;
      if (a.region !== "content") a.region = "content";
      else if (t && t.views.length > 1) t.active = (t.active + 1) % t.views.length;
    },
    "window.move_left": (a) => a.moveWindow("left"),
    "window.move_down": (a) => a.moveWindow("down"),
    "window.move_up": (a) => a.moveWindow("up"),
    "window.move_right": (a) => a.moveWindow("right"),
    "window.resize_mode": (a) => {
      a.resizeMode = true;
    },
    "window.equalize": (a) => a.resizeAction("equalize"),
    "breadcrumb.path": (a) => a.openHeadingPath(),
    // One step, then resize mode: the same key (or h j k l) goes on resizing without the chord.
    ...Object.fromEntries(
      (["wider", "narrower", "taller", "shorter"] as const).map((step) => [
        `window.${step}`,
        (a: App) => {
          a.resizeAction(step);
          a.resizeMode = true;
        },
      ]),
    ),
    "window.swap": (a) => {
      const t = a.tab;
      if (!t || t.views.length < 2) return a.message("info", "only one window");
      t.views.reverse();
      t.active = 1 - t.active;
    },
    "window.close": (a) => a.closeWindow(),
    "window.only": (a) => {
      const t = a.tab;
      if (!t || t.views.length < 2) return;
      const keep = t.views[t.active]!;
      for (const v of t.views) if (v !== keep) a.remember(v);
      t.views = [keep];
      t.active = 0;
    },
    // tabs
    "tab.new": (a) =>
      withView(a, (v) => {
        a.tabs.splice(a.activeTab + 1, 0, { views: [a.makeView(v.buf, { ...v.topAnchor }, { ...v.curAnchor })], active: 0, orientation: "side", ratio: a.config.ui.split_ratio });
        a.activeTab += 1;
      }),
    "tab.list": (a) =>
      a.openList({
        title: `Tabs (${a.tabs.length})`,
        items: a.tabs.map((t, i) => ({ label: `${i + 1}  ${a.displayName(t.views[t.active]!.buf)}`, hint: t.views.length > 1 ? "split" : undefined, data: i })),
        selected: a.activeTab,
        accept: (item) => {
          a.activeTab = item.data as number;
        },
      }),
    "tab.next": (a) => {
      if (a.tabs.length) a.activeTab = (a.activeTab + 1) % a.tabs.length;
    },
    "tab.prev": (a) => {
      if (a.tabs.length) a.activeTab = (a.activeTab - 1 + a.tabs.length) % a.tabs.length;
    },
    "tab.goto": (a, arg) => {
      const n = Number(arg) - 1;
      if (Number.isInteger(n) && n >= 0 && n < a.tabs.length) a.activeTab = n;
      else a.message("info", `no tab ${arg}`);
    },
    "tab.move_left": (a) => {
      const i = a.activeTab;
      if (i <= 0) return;
      [a.tabs[i - 1], a.tabs[i]] = [a.tabs[i]!, a.tabs[i - 1]!];
      a.activeTab = i - 1;
    },
    "tab.move_right": (a) => {
      const i = a.activeTab;
      if (i >= a.tabs.length - 1) return;
      [a.tabs[i + 1], a.tabs[i]] = [a.tabs[i]!, a.tabs[i + 1]!];
      a.activeTab = i + 1;
    },
    "tab.close": (a) => a.closeTab(),
    // panes
    // Closed (or showing the history) → open on the tree and focus; open elsewhere → focus; focused → close.
    "explorer.cycle": (a) => a.openLeftView("explorer", "cycle"),
    "explorer.reveal": (a) => {
      a.switchLeftView("explorer");
      a.sidebar.filter = "";
      a.sidebar.filtering = false;
      a.showSidebar(true);
      a.revealInSidebar();
      a.region = "sidebar";
    },
    // Like the explorer: closed → open and focus; open elsewhere → focus; focused → close.
    "outline.cycle": (a) => {
      if (!a.outlineShown) return a.openOutline();
      if (a.region !== "outline") {
        a.region = "outline";
        a.outline.pinned = false;
      } else a.showOutline(false);
    },
    // The ▤ button: show (and focus) or hide.
    "outline.toggle": (a) => {
      if (a.outlineShown) return a.showOutline(false);
      a.openOutline();
    },
    // find
    "find.open": (a) =>
      withView(a, (v) => {
        const prev = v.find;
        const start = { ...v.cur };
        a.prompt(
          "/",
          (text) => {
            // An empty search clears the find rather than leaving "/ 0/0" behind.
            if (!text) return void (v.find = null);
            v.find = computeFind(lay(a, v), text, v.find?.current ?? 0);
            if (!v.find.matches.length) a.message("info", `not found: ${text}`);
          },
          (text) => {
            v.find = computeFind(lay(a, v), text);
            const first = v.find.matches.findIndex((m) => m.row > start.row || (m.row === start.row && m.col >= start.col));
            const i = first >= 0 ? first : 0;
            const m = v.find.matches[i];
            if (m) {
              v.find.current = i;
              a.moveCursor(v, { row: m.row, col: m.col });
            }
          },
          () => {
            v.find = prev;
            a.moveCursor(v, start);
          },
        );
      }),
    "find.next": (a) => findStep(a, 1),
    "find.prev": (a) => findStep(a, -1),
    "task.toggle": (a) => withView(a, (v) => a.toggleTaskAt(v)),
    "note.edit": (a) => withView(a, (v) => a.editInEditor(v)),
    "view.source": (a) =>
      withView(a, (v) => {
        a.remember(v);
        v.source = !v.source;
        v.layoutKey = ""; // re-derive the rows from the anchors: the same source line
        v.sel = null;
        v.visual = null;
        a.message("info", v.source ? "source — the note's markdown" : "rendered");
      }),
    "note.send": (a) => withView(a, (v) => a.sendToEditor(v)),
    "note.send_pick": (a) => withView(a, (v) => a.sendToEditor(v, true)),
    "find.word_next": (a) => findWord(a, 1),
    "find.word_prev": (a) => findWord(a, -1),
    "find.clear": (a) =>
      withView(a, (v) => {
        v.find = null;
      }),
    "switcher.open": (a) => {
      const notes = [...a.graph.notes.values()];
      a.openList({
        title: `Open note (${notes.length})`,
        items: notes.map((n) => ({
          label: n.rel,
          detail: n.title !== n.rel.replace(/\.(md|markdown)$/i, "").split("/").pop() ? n.title : undefined,
          data: n.rel,
        })),
        accept: (item) => a.open(item.data as string),
      });
    },
    "outline.pick": (a) =>
      withView(a, (v) => {
        const layout = lay(a, v);
        if (!layout.headings.length) return a.message("info", "no headings in this note");
        const current = [...layout.headings].reverse().findIndex((h) => h.line <= v.cur.row);
        a.openList({
          title: `Headings — ${v.buf.name}`,
          items: layout.headings.map((h) => ({ label: h.text, indent: h.level - 1, hint: `${h.src}`, data: h.line })),
          accept: (item) => {
            a.pushHistory(v);
            a.moveCursor(v, { row: item.data as number, col: 0 });
          },
          selected: current < 0 ? 0 : layout.headings.length - 1 - current,
        });
      }),
    "palette.open": (a) => openPalette(a),
    "note.open": (a, arg) => {
      if (!arg) return void a.run("switcher.open");
      const r = a.graph.findNote(arg, a.loc.root);
      if (r.status === "resolved") return a.open(r.path);
      if (r.status === "ambiguous") return a.message("warn", `"${arg}" matches ${r.candidates.join(", ")}`);
      a.message("warn", `no note "${arg}"`);
    },
    // ui
    "ui.list": (a) => {
      const onOff = (b: boolean) => (b ? "on" : "off");
      const items: ListItem[] = [
        { label: "Theme", hint: a.ui.theme, data: "theme.pick" },
        { label: "Glyphs", hint: a.ui.glyphs, data: "glyphs.pick" },
        ...UI_TOGGLES.map((t) => ({ label: t.title, hint: onOff(a.ui[t.key] as boolean), data: t.id })),
      ];
      a.openList({ title: "UI settings — enter changes one", items, accept: (item) => void a.run(item.data as string).then(() => a.host.requestRender()) });
    },
    "theme.pick": (a) => {
      if (process.env.NO_COLOR) a.message("info", "NO_COLOR is set: the theme you pick applies once it's unset");
      pickTheme(a);
    },
    "theme.set": (a, arg) => {
      if (!arg) return pickTheme(a);
      const t = loadTheme(arg);
      if (t.warning) return a.message("warn", t.warning);
      a.setUi("theme", arg);
      if (process.env.NO_COLOR) a.message("info", `NO_COLOR is set: theme ${arg} applies once it's unset`);
    },
    "glyphs.pick": (a) => pickGlyphs(a),
    "glyphs.set": (a, arg) => {
      if (!arg || !["nerd", "unicode", "ascii", "auto"].includes(arg)) return a.message("warn", "glyphs: nerd, unicode, ascii or auto");
      a.setUi("glyphs", arg);
    },
    // scratch
    "scratch.open": (a) => {
      const loc = a.scratch();
      if (!readScratch(loc).trim()) return a.message("info", `the scratch is empty · ${prettyKey(`${a.leader} s a`, a.leader)} adds to it`);
      a.open(loc.path);
    },
    "scratch.add": (a) =>
      withView(a, (v) => {
        const layout = lay(a, v);
        if (v.sel) {
          const [p, q] = C.ordered(v.sel.anchor, v.cur);
          const r1 = layout.lines[p.row]?.src ?? 1;
          const r2 = layout.lines[q.row]?.src ?? r1;
          a.capture(formatEntry({ ref: { path: v.buf.abs, startLine: r1, endLine: r2 }, snippetText: a.selectionText(v), lang: "" }, a.loc.root));
          Object.assign(v, { visual: null, sel: null });
          return;
        }
        const line = layout.lines[v.cur.row]?.src ?? 1;
        a.capture(formatEntry({ ref: { path: v.buf.abs, startLine: line, endLine: line } }, a.loc.root));
      }),
    "scratch.copy": (a) => {
      const text = readScratch(a.scratch());
      if (!text.trim()) return a.message("info", "the scratch is empty");
      a.copy(text);
    },
    "scratch.clear": (a) => {
      a.prompt("clear the scratch? type y then enter: ", (t) => {
        if (t.trim().toLowerCase() !== "y") return;
        clearScratch(a.scratch());
        a.message("info", "scratch cleared");
        const buf = a.buffers.get(a.scratch().path);
        if (buf) a.reloadBuffer(buf);
      });
    },
    // note, vault, app
    "note.reload": (a) => withView(a, (v) => a.reloadBuffer(v.buf)),
    "note.info": (a) =>
      withView(a, (v) => {
        const b = v.buf;
        const entry = b.rel ? a.graph.entry(b.rel) : undefined;
        infoList(a, `Note — ${b.name}`, [
          ["path", b.abs],
          ["size", `${b.stamp?.size ?? 0} bytes`],
          ["modified", b.stamp ? new Date(b.stamp.mtimeMs).toLocaleString() : "?"],
          ["title", entry?.title ?? "—"],
          ["headings", String(entry?.headings.length ?? lay(a, v).headings.length)],
          ["links", String(lay(a, v).links.length)],
          ["backlinks", b.rel ? String(a.graph.backlinks(b.rel).length) : "—"],
          ["encoding", [b.invalidUtf8 ? "invalid UTF-8" : "UTF-8", ...(entry?.flags.filter((f) => f === "crlf" || f === "bom") ?? [])].join(", ")],
          ["state", b.deleted ? "deleted on disk" : "on disk"],
        ]);
      }),
    "vault.reindex": (a) => {
      a.graph.build(true, "lazy");
      a.indexInBackground();
      a.invalidateTree();
      for (const b of a.buffers.values()) b.invalidateLayouts();
      a.relayoutAll();
      a.message("info", `reindexed ${a.graph.notes.size} notes in ${a.graph.stats.ms.toFixed(0)} ms`);
    },
    "vault.info": (a) => {
      const g = a.graph;
      infoList(a, "Vault", [
        ["root", a.loc.root],
        ["mode", a.loc.mode],
        ["notes", String(g.notes.size)],
        ["indexing", a.indexing ? `${a.indexing} left` : "done"],
        ["watcher", a.watcher ? (a.watcher.degraded ? `degraded: ${a.watcher.degraded}` : `${a.watcher.watchedCount} directories${a.watcher.polledDirs.length ? `, ${a.watcher.polledDirs.length} polled` : ""}`) : "off"],
        ["cache", cacheDir(a.loc.root)],
        ["state", stateDir(a.loc.root)],
        ["scratch", a.scratch().path],
        ...g.skipped.map((s) => ["skipped", `${s.rel} — ${s.reason}`] as [string, string]),
      ]);
    },
    "config.reload": (a) => a.reloadConfig("manual"),
    "messages.open": (a) => {
      if (!a.messages.length) return a.message("info", "no messages");
      a.openList({
        title: "Messages",
        items: [...a.messages].reverse().map((m) => ({ label: m.text, hint: `${m.level} ${new Date(m.at).toTimeString().slice(0, 8)}`, data: m.text })),
        accept: (item) => void a.copy(item.data as string),
      });
    },
    "help.open": (a) => openHelp(a),
    "app.quit": (a) => a.quit(),
  };
  for (const t of UI_TOGGLES) impl[t.id] = (a) => toggle(a, t.key, t.title);

  for (const spec of COMMAND_SPECS) {
    const run = impl[spec.id];
    if (!run) throw new Error(`command ${spec.id} is specified but not implemented`);
    app.registry.register({ id: spec.id, title: spec.title, description: spec.desc, run, hidden: spec.id === "app.escape" });
  }
  for (const id of Object.keys(impl)) if (!app.registry.get(id)) throw new Error(`command ${id} has no spec in core/command-specs.ts`);
}
