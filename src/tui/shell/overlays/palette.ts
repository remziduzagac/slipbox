// The command palette (`:`) and the help list: every command by its title, its keys and the arguments it takes,
// the recent ones first; the help list by group, with the keys of the pane you're in.

import type { App, ListItem } from "../../app/runtime/app.ts";
import { classify } from "../../../core/documents/model/filetypes.ts";
import { listThemes } from "../../../core/rendering/theme/index.ts";
import { FORMATS } from "../../../core/rendering/export/index.ts";
import { rootTypes } from "../../../core/documents/diagnostics/diagnostics.ts";
import { COMMAND_SPECS, commandGroup, COMMAND_GROUPS } from "../../../core/application/commands/catalog.ts";
import {
  spellKey,
  EXPLORER_ACTION_INFO,
  HISTORY_ACTION_INFO,
  GIT_ACTION_INFO,
  PROBLEMS_ACTION_INFO,
  FILTER_KEYS_HELP,
  OUTLINE_ACTION_INFO,
  INFO_ACTION_INFO,
  FOOTNOTE_ACTION_INFO,
  RESIZE_ACTIONS,
} from "../input/keys.ts";
import { parseSubstitute } from "../../../core/documents/editing/replace.ts";
import { parseBang } from "../../../core/foundation/platform/shell.ts";
import { rank } from "./match.ts";
import { MOUSE_HELP } from "../input/mouse-help.ts";
import { REPORT_ADDS, REPORT_SENDS } from "../../app/distribution/report.ts";

// ---------------------------------------------------------------------------------------------
// The `:` prompt: matching commands, plus exact aliases that win, plus argument completion.

function argCandidates(a: App, cmd: string): string[] | null {
  switch (cmd) {
    case "note.open":
    case "window.split_side":
    case "window.split_stacked":
    case "tab.new":
    case "link.convert":
      return cmd === "note.open"
        ? [
            ...a.graph.notes.keys(),
            ...a.graph.filePaths().filter((p) => classify(p, a.config.walk.extensions).group !== "binary"),
          ]
        : [...a.graph.notes.keys()];
    case "theme.set":
      return listThemes().map((t) => t.name);
    case "glyphs.set":
      return ["nerd", "unicode", "ascii", "auto"];
    case "help.report":
      return [...REPORT_ADDS];
    case "help.report_send":
      return [...REPORT_SENDS];
    case "note.export":
      return FORMATS.map((f) => f.name);
    case "tag.list":
      return a.graph.tags().map((t) => t.tag);
    case "type.list":
      return rootTypes(a.graph).map((t) => t.name);
    default:
      return null;
  }
}

/** Commands whose argument is free text, with nothing to complete: a new name, a line, a query. */
const FREE_ARG = new Set([
  "note.create",
  "folder.create",
  "cursor.goto_line",
  "find.vault",
  "search.open",
  "note.rename",
  "heading.rename",
  "folder.name",
  "shell.run",
  "shell.filter",
]);

/** Commands in the order of core/application/commands/catalog.ts, which follows docs/manual/keys.md. */
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
  return [
    ...(first ? [] : [{ label: "", header: true, data: null }]),
    { label: title, header: true, data: null },
    { label: "", header: true, rule: true, data: null },
  ];
}

/**
 * Items under group headings, in the groups' order (docs/manual/keys.md). What no group in the
 * order claims goes under "Other", last, so nothing is ever left out.
 */
function grouped(items: ListItem[], groupOf: (item: ListItem) => string, order: string[], first = true): ListItem[] {
  const out: ListItem[] = [];
  for (const title of order) {
    const members = items.filter((i) => groupOf(i) === title);
    if (members.length) out.push(...heading(title, first && !out.length), ...members);
  }
  const rest = items.filter((i) => !order.includes(groupOf(i)));
  if (rest.length) out.push(...heading("Other", first && !out.length), ...rest);
  return out;
}

/**
 * At most three bindings shown, plain ones first (a variant like "extend the selection" after);
 * the rest go to the footer.
 */
function topKeys(
  keys: string[],
  variants: Set<string>,
  desc: string,
): { keys: string[]; more: string[]; detail: string } {
  const ordered = [...keys.filter((k) => !variants.has(k)), ...keys.filter((k) => variants.has(k))];
  return { keys: ordered.slice(0, 3), more: ordered.slice(3), detail: desc };
}

/**
 * The palette (`:`): for doing things. An empty query shows Recent, then every command by group;
 * typing ranks the best match first. Each command shows its first key and alias; the selected
 * one's description is in the footer.
 */
export function openPalette(a: App, typed = ""): void {
  // From a selection: its lines are '<,'> (vim's marks), already typed, for :'<,'>s — then `typed`.
  const v = a.view;
  let input = typed;
  if (v?.sel) {
    a.views.markSelection(v);
    input = `'<,'>${typed}`;
  }
  const commands = inSpecOrder(a.registry.list().filter((c) => !c.hidden));
  const aliasOf = new Map<string, string[]>();
  for (const [al, spec] of Object.entries(a.aliases)) {
    const list = aliasOf.get(spec) ?? [];
    list.push(`:${al}`);
    aliasOf.set(spec, list);
  }
  const commandItems: ListItem[] = commands.map((c) => {
    const keys = [
      ...new Set([...a.keymap.keysFor(c.id), ...a.sourceKeys.keysFor(c.id), ...a.visualKeys.keysFor(c.id)]),
    ].map(spellKey);
    const aliases = aliasOf.get(c.id) ?? [];
    // Two fixed columns, the first key and the first alias (empty when there is none); the rest
    // in the footer.
    return {
      label: c.title,
      detail: c.description ?? c.id,
      keys: [keys[0] ?? "", aliases[0] ?? ""],
      more: [...keys.slice(1), ...aliases.slice(1)],
      data: c.id,
    };
  });
  const byId = new Map(commandItems.map((i) => [i.data as string, i]));
  const recent = a.recentCommands.map((id) => byId.get(id)).filter((i): i is ListItem => !!i);
  const browse: ListItem[] = [
    ...(recent.length ? [...heading("Recent", true), ...recent] : []),
    ...grouped(
      commandItems,
      (i) => commandGroup(i.data as string),
      COMMAND_GROUPS.map((g) => g.title),
      !recent.length,
    ),
  ];
  a.overlays.openList({
    title: "Commands — type a name, or an alias like :q",
    items: commandItems,
    footer: true,
    alignKeysAcrossList: true,
    input,
    source: (input) => {
      if (!input.trim()) return browse;
      // :42, vim's: that line.
      if (/^\s*\d+\s*$/.test(input))
        return [
          {
            label: `Go to line ${input.trim()}`,
            detail: "cursor.goto_line",
            keys: ["", `:${input.trim()}`],
            data: `cursor.goto_line ${input.trim()}`,
          },
        ];
      // A substitute (vim's :s): one entry, run by enter.
      if (parseSubstitute(input))
        return [
          { label: "Substitute", detail: input.trim(), keys: ["", ":s"], data: `find.substitute ${input.trim()}` },
        ];
      // A command for the shell (25.7): run, or lines filtered through it.
      const bang = parseBang(input);
      if (bang)
        return [
          bang.range
            ? {
                label: "Filter the lines through",
                detail: input.trim(),
                keys: ["", ":!"],
                data: `shell.filter ${input.trim()}`,
              }
            : { label: "Run in the shell", detail: bang.command, keys: ["", ":!"], data: `shell.run ${bang.command}` },
        ];
      const m = /^(\S+)\s(.*)$/.exec(input);
      const aliasSpec = m ? a.aliases[m[1]!] : undefined;
      if (aliasSpec) {
        const cands = argCandidates(a, aliasSpec.split(" ")[0]!);
        if (cands) {
          return rank(m![2]!, cands, (x) => x, 200).map(({ item }) => ({
            label: item,
            detail: `${m![1]} ${item}`,
            data: `${aliasSpec} ${item}`,
          }));
        }
      }
      const exact = a.aliases[input.trim()];
      const ranked = rank(input.trim(), commandItems, (i) => [i.label, i.detail ?? ""]).map((r) => r.item);
      if (exact) {
        const title = a.registry.get(exact.split(" ")[0]!)?.title ?? exact;
        return [
          { label: title, detail: `alias for ${exact}`, keys: ["", `:${input.trim()}`], data: exact },
          ...ranked.filter((i) => i.data !== exact),
        ];
      }
      return ranked;
    },
    submit: async (input) => {
      // :2,5s/…, :.,$s/…: ranges :s doesn't take — said, never a silent nothing.
      if (/^\s*[\d.$,+-]+s[^\w\s\\]/.test(input)) {
        a.overlay = null;
        a.message("warn", "`:s` takes the line, `%` or `'<,'>` — select the lines (V) and type :, or use :%s");
        return true;
      }
      if (parseSubstitute(input)) {
        a.overlay = null;
        await a.run(`find.substitute ${input.trim()}`);
        a.host.requestRender();
        return true;
      }
      // Run as the commands they are, as :s and :42 are: the trace of commands run counts them.
      const bang = parseBang(input);
      if (bang) {
        a.overlay = null;
        void a
          .run(bang.range ? `shell.filter ${input.trim()}` : `shell.run ${bang.command}`)
          .then(() => a.host.requestRender());
        return true;
      }
      if (/^\s*\d+\s*$/.test(input)) {
        a.overlay = null;
        void a.run(`cursor.goto_line ${input.trim()}`).then(() => a.host.requestRender());
        return true;
      }
      // An exact alias (optionally with an argument) wins over the matches, unless another
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
      // An argument the command doesn't take: the typing is probably a title ("zen mode"), which the
      // list picks; when nothing there matches either (:w other.md), it's said, never dropped.
      if (arg && !argCandidates(a, spec.split(" ")[0]!) && !FREE_ARG.has(spec) && !spec.includes(" ")) {
        if (a.overlay?.kind === "list" && a.overlay.filtered.some((e) => !e.item.header)) return false;
        a.overlay = null;
        a.message("warn", `:${m[1]} takes no argument (${arg} ignored)`);
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
 * works inside each panel view, visual and resize mode, and the mouse. Filtering keeps the
 * groups; enter runs a command (the in-pane and mouse entries are reference only). Opened from a
 * panel view or visual mode, it starts at that section.
 */
export function openHelp(a: App): void {
  const commands: ListItem[] = inSpecOrder(a.registry.list()).map((c) => {
    // Every keymap's keys: the reading ones, source mode's own ([keys.source]), visual mode's, a peek's, a review's,
    // the merge screen's and a diff's.
    const plain = [
      ...a.keymap.keysFor(c.id),
      ...a.sourceKeys.keysFor(c.id),
      ...a.visualKeys.keysFor(c.id),
      ...a.peekKeys.keysFor(c.id),
      ...a.reviewKeys.keysFor(c.id),
      ...a.mergeKeys.keysFor(c.id),
      ...a.diffKeys.keysFor(c.id),
    ].map(spellKey);
    // Bindings with an argument (e.g. "cursor.down extend") are variants: shown after the plain ones.
    const variants = a.keymap
      .entries()
      .filter(([, v]) => v.startsWith(`${c.id} `))
      .map(([k]) => spellKey(k));
    return {
      label: c.title,
      ...topKeys([...new Set([...plain, ...variants])], new Set(variants), c.description ?? c.id),
      data: c.id,
    };
  });
  // An entry per action with its keys; `actions` gathers several that do the same there.
  const pane = (
    keymap: { keysFor(action: string): string[] },
    info: Record<string, { title: string; desc: string; actions?: string[] }>,
  ): ListItem[] =>
    Object.entries(info)
      .map(([action, i]) => ({
        label: i.title,
        ...topKeys((i.actions ?? [action]).flatMap((x) => keymap.keysFor(x)).map(spellKey), new Set(), i.desc),
        data: null,
      }))
      .filter((i) => i.keys.length);
  const items: ListItem[] = [
    ...grouped(
      commands,
      (i) => commandGroup(i.data as string),
      COMMAND_GROUPS.map((g) => g.title),
    ),
    ...heading("Inside the explorer", false),
    ...pane(a.explorerKeys, EXPLORER_ACTION_INFO),
    ...heading("Inside the history", false),
    ...pane(a.explorerKeys, HISTORY_ACTION_INFO),
    ...heading("Inside the git panel", false),
    ...pane(a.gitKeys, GIT_ACTION_INFO),
    ...heading("Inside Problems", false),
    ...pane(a.problemsKeys, PROBLEMS_ACTION_INFO),
    ...heading("Filtering a panel (/)", false),
    ...FILTER_KEYS_HELP.map(([label, keys, detail]) => ({
      label,
      ...topKeys(
        keys.map((k) => (k === "type" ? k : spellKey(k))),
        new Set(),
        detail,
      ),
      data: null,
    })),
    ...heading("Inside the outline", false),
    ...pane(a.outlineKeys, OUTLINE_ACTION_INFO),
    ...heading("Inside Info", false),
    ...pane(a.infoKeys, INFO_ACTION_INFO),
    ...heading("Inside the footnotes", false),
    ...pane(a.footnoteKeys, FOOTNOTE_ACTION_INFO),
    ...heading("Resize mode", false),
    ...pane(a.resizeKeys, RESIZE_ACTIONS),
    ...heading("Mouse", false),
    ...MOUSE_HELP.map(([label, keys, detail]) => ({ label, ...topKeys(keys, new Set(), detail), data: null })),
  ];
  // Start where the keys are about what you're doing: the focused pane's view's, or visual mode's.
  const left = {
    explorer: "Inside the explorer",
    history: "Inside the history",
    git: "Inside the git panel",
  } as const;
  const right = { outline: "Inside the outline", info: "Inside Info", footnotes: "Inside the footnotes" } as const;
  const section =
    a.region === "sidebar"
      ? left[a.leftView]
      : a.region === "outline"
        ? right[a.rightView]
        : a.region === "problems"
          ? "Inside Problems"
          : a.view?.visual
            ? "Selection & copy"
            : null;
  const at = section ? items.findIndex((i) => i.header && i.label === section) : -1; // the title row
  a.overlays.openList({
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
