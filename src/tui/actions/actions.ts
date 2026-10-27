// Command implementations for the TUI. Ids and titles come from core/application/commands/catalog.ts, so the CLI
// can list them and the parity test can check them; registerActions registers each one, its work
// done here (the app's own: escape, copying, the UI settings, the theme, the scratch, quitting) or
// in the actions-*.ts module of its area (D235). The keys are in keys.ts and docs/manual/keys.md.

import { cancelGitRead } from "../gitquery.ts";
import { clearScratch, dropEmptyAsks, formatEntry, readScratch } from "../../core/workspace/mutations/capture.ts";
import { COMMAND_SPECS } from "../../core/application/commands/catalog.ts";
import type { Command } from "../../core/application/commands/registry.ts";
import { listThemes, loadTheme } from "../../core/rendering/theme/index.ts";
import type { App, ListItem, UiState, View } from "../app/runtime/app.ts";
import * as C from "../documents/editing/cursor.ts";
import * as E from "../documents/editing/editing.ts";
import { shellFilter, shellRun, shellStop } from "../documents/editing/shellrun.ts";
import { parseBang } from "../../core/foundation/platform/shell.ts";
import { prettyKey } from "../shell/input/keys.ts";
import { openPalette, openHelp } from "../palette.ts";
import { viewActions } from "./documents/actions-view.ts";
import { editActions } from "./documents/actions-edit.ts";
import { linkActions, linkTarget } from "./documents/actions-links.ts";
import { findActions } from "./documents/actions-find.ts";
import { paneActions } from "../actions-panes.ts";
import { fileActions } from "../actions-files.ts";
import { lspActions } from "../actions-lsp.ts";

export type Run = Command<App>["run"];

// biome-ignore lint/suspicious/noConfusingVoidType: nothing when no note is open, as an action's run returns
export function withView<T>(a: App, fn: (v: View) => T): T | void {
  const v = a.view;
  if (!v) return a.message("info", "no note open");
  return fn(v); // an async command's promise goes back to the dispatcher, which awaits it
}

export function lay(a: App, v: View) {
  return a.currentLayout(v);
}

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
  { key: "window_header", id: "ui.window_header", title: "Window header" },
  { key: "breadcrumb", id: "ui.breadcrumb", title: "Breadcrumb" },
  { key: "problems_bar", id: "ui.problems_bar", title: "Problems bar" },
  { key: "spell", id: "ui.spell", title: "Spelling" },
];

/** The marks' levels in turn (`space u shift+d`), and how each is said. */
const MARKS_NEXT = { off: "error", error: "warning", warning: "info", info: "off" } as const;
const MARKS_SAID = { off: "off", error: "errors", warning: "warnings and up", info: "all" } as const;
/** Where the scratch opens, as the UI settings say it. */
const SCRATCH_SAID = { float: "floating", right: "on the right" } as const;
/** A code block too wide, as the UI settings say it. */
const CODE_WRAP_SAID = { scroll: "scroll sideways", wrap: "wrap" } as const;

function toggle(a: App, key: keyof UiState, title: string): void {
  const next = !a.ui[key];
  a.settings.setUi(key, next as never);
  a.message("info", `${title}: ${next ? "on" : "off"}`);
}

function pickTheme(a: App): void {
  const before = a.ui.theme;
  const themes = listThemes();
  a.overlays.openList({
    title: "Theme (live preview)",
    items: themes.map((t) => ({ label: t.name, hint: t.source, data: t.name })),
    selected: themes.findIndex((t) => t.name === before),
    move: (item) => {
      a.theme = a.settings.themeNamed(item.data as string).theme;
    },
    accept: (item) => {
      a.settings.setUi("theme", item.data as string);
      a.message("info", `theme ${a.theme.name} · theme = "${a.theme.name}" in config makes it the default`);
    },
    // Back to the setting as it is now (a config reload may have changed it while the list was open).
    cancel: () => {
      a.theme = a.settings.themeNamed(a.ui.theme).theme;
    },
  });
}

function pickGlyphs(a: App): void {
  const before = a.ui.glyphs;
  const sets = ["nerd", "unicode", "ascii", "auto"];
  const preview = (mode: string) => {
    a.glyphs = a.settings.glyphSet(mode);
    a.relayoutAll();
  };
  a.overlays.openList({
    title: "Glyphs (live preview)",
    items: sets.map((s) => ({ label: s, hint: s === "auto" ? "detect from the terminal" : undefined, data: s })),
    selected: Math.max(0, sets.indexOf(before)),
    move: (item) => preview(item.data as string),
    accept: (item) => {
      a.settings.setUi("glyphs", item.data as string);
      a.message("info", `glyphs: ${item.data}`);
    },
    cancel: () => preview(a.ui.glyphs), // the setting now, not when the list opened
  });
}

export function registerActions(app: App): void {
  const impl: Record<string, Run> = {
    ...viewActions(),
    ...editActions(),
    ...linkActions(),
    ...findActions(),
    ...paneActions(),
    ...fileActions(),
    ...lspActions(),
    "app.escape": (a) => {
      cancelGitRead(a);
      const v = a.view;
      if (!v) return;
      const floating = a.floating && v === a.floating.view;
      if (v.sel || v.visual) Object.assign(v, { visual: null, sel: null });
      // The floating scratch is a window like any (#43): esc leaves its lens first, and closes it last.
      else if (floating && a.floating?.kind === "scratch" && v.live) a.lens.setViewMode(v, "rendered");
      else if (floating && !v.find)
        return a.overlays.leaveFloating(); // the floating editor: closed, written back (3.20); a diff's, back where it was opened
      else if (v.live)
        a.lens.setViewMode(v, "rendered"); // esc in normal mode closes the lens
      else if (v.find) v.find = null;
      else if (a.region !== "content") a.region = "content";
    },
    "copy.smart": (a) =>
      withView(a, (v) => {
        if (v.sel) {
          a.copy(a.views.selectionText(v));
          Object.assign(v, { visual: null, sel: null });
          return;
        }
        const row = C.cells(lay(a, v).lines[v.cur.row])
          .map((c) => c.g)
          .join("")
          .trim();
        if (row) a.copy(row);
        else a.message("info", "nothing on this row to copy");
      }),
    "copy.selection": (a) =>
      withView(a, (v) => {
        if (!v.sel) return a.message("info", `nothing selected · ${prettyKey("ctrl+q")} quits`);
        a.copy(a.views.selectionText(v));
      }),
    "copy.path": (a) => withView(a, (v) => void a.copy(v.buf.abs)),
    "copy.ref": (a) =>
      withView(a, (v) => void a.copy(`${v.buf.rel ?? v.buf.abs}:${lay(a, v).lines[v.cur.row]?.src ?? 1}`)),
    "copy.link": (a) =>
      withView(a, (v) => {
        const i = a.linking.linkUnderCursor(v);
        if (i < 0) return a.message("info", "no link under the cursor");
        a.copy(linkTarget(a, v, lay(a, v).links[i]!));
      }),
    "app.save_quit": (a) => {
      for (const v of a.allViews()) if (v.insert) E.stopInsert(a, v);
      for (const b of a.dirtyBuffers()) if (!a.saving.save(b)) return;
      a.saving.requestQuit();
    },
    "app.quit_force": (a) => a.saving.requestQuit(true),
    // Upgrading and restarting (UPG): never awaited, so the keys go on while it asks or waits.
    "app.restart": (a) => void a.updates.restart(),
    "background.open": (a) => a.background.open(),
    "background.cancel": (a, id) => a.background.cancel(id),
    "background.restart": (a, id) => a.background.restart(id),
    "background.pause": (a, id) => a.background.pause(id),
    "background.dismiss": (a, id) => a.background.dismiss(id),
    "app.about": (a) => a.updates.about(),
    "app.release_notes": (a) => a.updates.copyReleaseNotes(),
    "explorer.focus": (a) => {
      a.panels.switchLeftView("explorer");
      a.panels.showSidebar(true);
      a.region = "sidebar";
    },
    "app.upgrade": (a) => void a.updates.check(),
    "palette.open": (a) => openPalette(a),
    // Your shell (25.7): what you type, run; lines filtered through it. Without the command, the `:` line asks it.
    "shell.run": (a, arg) => (arg?.trim() ? shellRun(a, arg) : openPalette(a, "!")),
    "shell.filter": (a, arg) =>
      arg?.trim() && parseBang(arg)?.range ? shellFilter(a, arg) : openPalette(a, a.view?.sel ? "!" : ".!"),
    "shell.stop": (a) => shellStop(a),
    // ui
    "ui.list": (a) => {
      const onOff = (b: boolean) => (b ? "on" : "off");
      const items: ListItem[] = [
        { label: "Theme", hint: a.ui.theme, data: "theme.pick" },
        { label: "Glyphs", hint: a.ui.glyphs, data: "glyphs.pick" },
        ...UI_TOGGLES.map((t) => ({ label: t.title, hint: onOff(a.ui[t.key] as boolean), data: t.id })),
        { label: "Problems marked in the text", hint: MARKS_SAID[a.ui.problem_marks], data: "ui.problem_marks" },
        { label: "Code cells", hint: a.ui.code_cells === "box" ? "boxes" : "bands", data: "ui.code_cells" },
        { label: "Code blocks", hint: CODE_WRAP_SAID[a.ui.code_wrap], data: "ui.code_wrap" },
        { label: "Scratch opens", hint: SCRATCH_SAID[a.ui.scratch_in], data: "ui.scratch_in" },
        { label: "Hidden files in the explorer", hint: onOff(a.ui.hidden_files), data: "explorer.toggle_hidden" },
      ];
      a.overlays.openList({
        title: "UI settings — enter changes one",
        items,
        accept: (item) => void a.run(item.data as string).then(() => a.host.requestRender()),
      });
    },
    "theme.pick": (a) => {
      if (process.env.NO_COLOR) a.message("info", "NO_COLOR is set: the theme you pick applies once it's unset");
      pickTheme(a);
    },
    "theme.set": (a, arg) => {
      if (!arg) return pickTheme(a);
      const t = loadTheme(arg);
      if (t.warning) return a.message("warn", t.warning);
      a.settings.setUi("theme", arg);
      if (process.env.NO_COLOR) a.message("info", `NO_COLOR is set: theme ${arg} applies once it's unset`);
    },
    "glyphs.pick": (a) => pickGlyphs(a),
    "glyphs.set": (a, arg) => {
      if (!arg || !["nerd", "unicode", "ascii", "auto"].includes(arg))
        return a.message("warn", "glyphs: nerd, unicode, ascii or auto");
      a.settings.setUi("glyphs", arg);
    },
    // scratch
    "scratch.open": (a) => a.scratch.open(),
    "scratch.open_right": (a) => a.scratch.open("right"),
    "scratch.add": (a) =>
      withView(a, (v) => {
        const layout = lay(a, v);
        if (v.sel) {
          const [p, q] = C.ordered(v.sel.anchor, v.cur);
          const r1 = layout.lines[p.row]?.src ?? 1;
          const r2 = layout.lines[q.row]?.src ?? r1;
          a.scratch.capture(
            formatEntry(
              {
                ref: { path: v.buf.abs, startLine: r1, endLine: r2 },
                snippetText: a.views.selectionText(v),
                lang: "",
                ask: true,
              },
              a.loc.root,
            ),
          );
          Object.assign(v, { visual: null, sel: null });
          return;
        }
        const line = layout.lines[v.cur.row]?.src ?? 1;
        a.scratch.capture(
          formatEntry({ ref: { path: v.buf.abs, startLine: line, endLine: line }, ask: true }, a.loc.root),
        );
      }),
    "context.copy": (a) => a.handoff.copyContext(),
    "scratch.copy": (a) => {
      const text = readScratch(a.scratch.location());
      if (!text.trim()) return a.message("info", "the scratch is empty");
      a.copy(dropEmptyAsks(text));
    },
    "scratch.clear": (a) => {
      a.overlays.confirm("Clear the scratch?", () => {
        clearScratch(a.scratch.location());
        a.message("info", "scratch cleared");
        const buf = a.buffers.get(a.scratch.location().path);
        if (buf) a.watch.reloadBuffer(buf);
      });
    },
    "config.reload": (a) => a.settings.reload("manual"),
    "messages.open": (a) => {
      if (!a.messages.length) return a.message("info", "no messages");
      a.overlays.openList({
        title: "Messages",
        items: [...a.messages].reverse().map((m) => ({
          label: m.text,
          hint: `${m.level} ${new Date(m.at).toTimeString().slice(0, 8)}`,
          data: m.text,
        })),
        accept: (item) => void a.copy(item.data as string),
      });
    },
    "help.open": (a) => openHelp(a),
    "help.report": (a, arg) => a.report.open(arg),
    "help.report_send": (a, arg) => a.report.send(arg),
    "app.quit": (a) => a.saving.requestQuit(),
  };
  impl["html.details_toggle"] = (a) => {
    if (!a.html.toggle()) a.message("info", "no HTML details summary here");
  };
  for (const t of UI_TOGGLES) impl[t.id] = (a) => toggle(a, t.key, t.title);
  // The marks, a level now (off → errors → warnings and up → all), not a switch.
  impl["ui.problem_marks"] = (a) => {
    const next = MARKS_NEXT[a.ui.problem_marks];
    a.settings.setUi("problem_marks", next);
    a.message("info", `Problems marked in the text: ${MARKS_SAID[next]}`);
  };
  // The code view's cells (24.13): boxes or bands; the cell at the cursor, as its header's buttons.
  impl["ui.code_cells"] = (a) => {
    const next = a.ui.code_cells === "box" ? "band" : "box";
    a.settings.setUi("code_cells", next);
    a.message("info", `Code cells: ${next === "box" ? "boxes" : "bands"}`);
  };
  // A code block too wide for the window: scrolled sideways on its own, or wrapped.
  impl["ui.code_wrap"] = (a) => {
    const next = a.ui.code_wrap === "scroll" ? "wrap" : "scroll";
    a.settings.setUi("code_wrap", next);
    a.message("info", `Code blocks: ${CODE_WRAP_SAID[next]}`);
  };
  // Where the scratch opens (#43): floating, or in the window on the right.
  impl["ui.scratch_in"] = (a) => {
    const next = a.ui.scratch_in === "float" ? "right" : "float";
    a.settings.setUi("scratch_in", next);
    a.message("info", `Scratch opens: ${SCRATCH_SAID[next]}`);
  };
  for (const action of ["fold", "edit", "copy", "references", "problems", "scratch"])
    impl[`cell.${action}`] = (a) => a.code.cellAction(action);
  // The cells a change touched left open, the rest folded (GIT-D7).
  impl["cell.fold_unchanged"] = (a) => a.code.foldUnchanged();

  for (const spec of COMMAND_SPECS) {
    const run = impl[spec.id];
    if (!run) throw new Error(`command ${spec.id} is specified but not implemented`);
    app.registry.register({
      id: spec.id,
      title: spec.title,
      description: spec.desc,
      run,
      hidden: spec.id === "app.escape",
    });
  }
  for (const id of Object.keys(impl))
    if (!app.registry.get(id)) throw new Error(`command ${id} has no spec in core/application/commands/catalog.ts`);
}
