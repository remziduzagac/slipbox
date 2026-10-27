// Hand-offs (4.10): a note sent to an editor — `$EDITOR` in this terminal, or a Neovim already running — and its
// context bundle copied for an agent (9.7), unsaved notes saved first.

import { editorArgv } from "../core/documents/external-editors/editor.ts";
import { discoverNvims, NVIM_REMOTE, type NvimServer, probeNvim } from "../core/documents/external-editors/nvim.ts";
import { homedir } from "node:os";
import { buildContext } from "../core/documents/model/context.ts";
import type { NoteBuffer } from "./buffer.ts";
import { prettyKey } from "./keys.ts";
import type { App, View } from "./app.ts";

/** Hand-offs to an editor or an agent. */
export class Handoff {
  constructor(readonly app: App) {}

  /**
   * The file a hand-off gives the editor, and the line: the view's, at the cursor; from the floating
   * properties editor, its note at the top (the editor closed first, its text written back); none
   * (said) from another floating window, which isn't a file.
   */
  private target(view: View): { buf: NoteBuffer; line: number } | null {
    if (!view.buf.virtual) return { buf: view.buf, line: this.app.cursorLine(view) };
    const f = this.app.floating;
    if (f?.kind === "properties" && view === f.view)
      return this.app.overlays.closeFloating() ? { buf: f.note, line: 1 } : null;
    this.app.message("info", "nothing to hand off: this window isn't a file");
    return null;
  }

  /** Step aside for the editor (4.1): it runs in this terminal; the note reloads after it. */
  editInEditor(view: View): void {
    if (!this.app.host.runForeground) return this.app.message("error", "can't hand off to an editor here");
    const target = this.target(view);
    if (!target) return;
    const buf = target.buf;
    // The editor reads the file: unsaved changes go there first (4.10).
    if (buf.dirty && !this.app.saving.save(buf))
      return this.app.message("warn", `${this.app.displayName(buf)} isn't saved — not handing it off`);
    const argv = editorArgv(this.app.config.editor.command, buf.abs, target.line);
    const r = this.app.host.runForeground(argv);
    if (typeof r === "string") return this.app.message("error", `couldn't start ${argv[0]}: ${r}`);
    if (buf.changedOnDisk()) this.app.watch.reloadBuffer(buf);
    if (r !== 0) this.app.message("warn", `${argv[0]} exited with ${r}`);
  }

  /** How the running nvims are found and asked; tests replace these. */
  nvimDiscovery: () => NvimServer[] = () => discoverNvims();
  nvimProbe: (socket: string) => NvimServer | null = (s) => probeNvim(s);
  /** The nvim `space n s` sends to, picked once per vault and kept while it answers. */
  remoteServer: string | undefined;

  /**
   * `space n s`: the note, at the cursor's line, to an editor running elsewhere. With the nvim
   * preset (the default) or a `{server}` template, the nvim is the one picked before while it
   * answers; else the only one running; else a picker — which `choose` (`space n p`) always opens.
   */
  sendToEditor(from: View, choose = false): void {
    const target = this.target(from);
    if (!target) return;
    const view = target;
    if (view.buf.dirty && !this.app.saving.save(view.buf))
      return this.app.message("warn", `${this.app.displayName(view.buf)} isn't saved — not sending it`);
    const raw = this.app.config.editor.remote.filter((t) => t.trim());
    if (!raw.length)
      return this.app.message("info", "set [editor] remote in the config to send notes to a running editor");
    const templates = raw.length === 1 && raw[0]!.trim() === "nvim" ? NVIM_REMOTE : raw;
    if (!templates.some((t) => t.includes("{server}"))) return this.sendWith(view, templates, "");
    if (!choose && this.remoteServer) {
      const known = this.nvimProbe(this.remoteServer);
      if (known) return this.sendWith(view, templates, known);
    }
    const found = this.nvimDiscovery();
    if (!found.length)
      return this.app.message("info", "no nvim is running with a server — start nvim (0.9 or later) and try again");
    const pick = (s: NvimServer) => {
      this.remoteServer = s.socket;
      this.sendWith(view, templates, s);
    };
    if (found.length === 1 && !choose) return pick(found[0]!);
    // The nvim working where the note lives first (the closest folder), then the rest.
    const abs = view.buf.abs;
    const holds = (s: NvimServer) => !!s.cwd && (abs === s.cwd || abs.startsWith(`${s.cwd}/`));
    const ordered = [...found].sort((a, b) => Number(holds(b)) - Number(holds(a)) || b.cwd.length - a.cwd.length);
    const home = homedir();
    const tilde = (p: string) => (p === home || p.startsWith(`${home}/`) ? `~${p.slice(home.length)}` : p);
    const shown = (s: NvimServer) =>
      s.file ? (s.cwd && s.file.startsWith(`${s.cwd}/`) ? s.file.slice(s.cwd.length + 1) : tilde(s.file)) : "no file";
    this.app.overlays.openList({
      title: "Send to which nvim?",
      items: ordered.map((s) => ({
        label: tilde(s.cwd || s.socket),
        detail: shown(s),
        hint: s.socket === this.remoteServer ? "last used" : holds(s) ? "holds this note" : undefined,
        data: s,
      })),
      accept: (item) => pick(item.data as NvimServer),
    });
  }

  private sendWith(view: { buf: NoteBuffer; line: number }, templates: string[], server: NvimServer | ""): void {
    const run = this.app.host.runDetached;
    if (!run) return this.app.message("error", "can't start an editor from here");
    const line = view.line;
    // Each command a template of its own; no {file} means none is appended (nvim's --remote-send).
    const socket = server ? server.socket : "";
    const cmds = templates.map((t) => editorArgv(t, view.buf.abs, line, process.env, false, socket));
    const cwd = server ? server.cwd : "";
    const where = cwd ? ` (${cwd.split("/").pop()})` : "";
    this.app.message("info", `sent to ${cmds[0]![0]}${where} at line ${line}`);
    void (async () => {
      for (const argv of cmds) {
        const r = await run(argv);
        if (r === 0) continue;
        this.app.message(
          "error",
          typeof r === "string" ? `couldn't start ${argv[0]}: ${r}` : `${argv.slice(0, 2).join(" ")} exited with ${r}`,
        );
        this.app.host.requestRender();
        return;
      }
    })();
  }

  /**
   * The note's context bundle (9.7) on the clipboard: it, what it links to and what links to it
   * (`[context]`), as one markdown document for an agent. A handoff (4.10): unsaved notes are
   * saved first, so the bundle holds what's on screen.
   */
  copyContext(): void {
    const buf = this.app.view?.buf;
    if (!buf || buf.rel === null || buf.virtual) return this.app.message("info", "context: open a note first");
    if (!this.savedForHandoff("context", "not copying")) return;
    const b = buildContext(this.app.graph, [buf.rel], this.app.config.context);
    const n = (k: number, one: string) => `${k} ${one}${k === 1 ? "" : "s"}`;
    const links = b.items.filter((i) => i.why === "link").length;
    const backs = b.items.filter((i) => i.why === "backlink").length;
    const out = b.left.filter((l) => l.reason === "limit").length;
    this.app.copy(
      b.text,
      true,
      `the context of ${buf.rel}: ${n(b.items.length, "file")} (${links} linked, ${backs} linking to it${out ? `; ${out} past the limit` : ""}), ${b.text.length} characters`,
    );
  }

  /**
   * Every unsaved note saved, for a hand-off that reads them from disk (4.10): true when they are. When one couldn't be,
   * false, and said — never silent: `what` the hand-off, `not` what it didn't do.
   */
  savedForHandoff(what: string, not: string): boolean {
    for (const d of this.app.dirtyBuffers()) {
      if (d.virtual || this.app.saving.save(d, true)) continue;
      // Changed on disk meanwhile, the resolve's key; otherwise the write failed, and its error above says why.
      if (!d.changedOnDisk() || d.deleted)
        this.app.message("warn", `${what}: ${this.app.displayName(d)} couldn't be saved — ${not}`);
      else {
        const key = this.app.keymap.keysFor("note.resolve")[0];
        this.app.message(
          "warn",
          `${what}: ${this.app.displayName(d)} changed on disk while unsaved — ${key ? prettyKey(key, this.app.leader) : "note.resolve"} resolves it first`,
        );
      }
      return false;
    }
    return true;
  }
}
