// Code intelligence in the TUI: a file's syntax tree, its language servers (3.x) and linters (3.21), and the trust
// a root needs before anything it brings runs.

import { fileURLToPath, pathToFileURL } from "node:url";
import { grammarFor, type OutlineEntry, type Span as SyntaxSpan } from "../core/syntax.ts";
import type {
  DocumentSymbol,
  SymbolInformation,
  TextEdit as LspTextEdit,
  WorkspaceEdit,
} from "vscode-languageserver-protocol";
import { TextDocument } from "vscode-languageserver-textdocument";
import { SYNTAX_SOURCE_LIMIT, syntaxOnThread } from "../core/syntax-thread.ts";
import { WorkerRequestError } from "../core/foundation/workers/worker-requests.ts";
import { extensionOf } from "../core/filetypes.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { offsetOf } from "./editing.ts";
import { homedir } from "node:os";
import { type Config, loadConfig } from "../core/application/config/config.ts";
import { type LintCmd, type LintIssue, lintFailure, runLint } from "../core/lint.ts";
import { checkoutOf } from "../core/git.ts";
import { diffLines } from "../core/merge.ts";
import { tildePath } from "../core/workspace/vaults/names.ts";
import { isTrusted, setTrust, trustOf } from "../core/workspace/vaults/trust.ts";
import { languageOf, serverTable, type ServerTable } from "../core/servers/languages.ts";
import { type LinterDef, linterRoot, linterTable, runLinter } from "../core/servers/linters.ts";
import { rootFor } from "../core/servers/find.ts";
import { ServerManager } from "../core/servers/manager.ts";
import type { NoteBuffer } from "./buffer.ts";
import type { App, View, ListItem } from "./app.ts";
import { SymbolKind } from "vscode-languageserver-protocol";

/** Syntax, language servers, linters, and the trust they need. */
export class Languages {
  constructor(readonly app: App) {}

  /**
   * A source file's tree-sitter pass (16.7–16.9): grammar loading, parsing and model extraction in a worker.
   * Edits debounce for 150 ms; old replies never replace a newer revision.
   */
  ensureSyntax(buf: NoteBuffer): void {
    if (
      this.app.quitting ||
      buf.kind.group !== "text" ||
      buf.syntax?.version === buf.version ||
      this.syntaxFailed.get(buf)?.version === buf.version ||
      this.syntaxTimers.has(buf)
    )
      return;
    const previous = this.syntaxPending.get(buf);
    if (previous?.version === buf.version) return;
    previous?.abort.abort();
    const g = grammarFor(buf.kind.format, extensionOf(buf.name));
    if (!g) return;
    const run = () => {
      this.syntaxTimers.delete(buf);
      if (this.app.quitting) return;
      const version = buf.version;
      if (Buffer.byteLength(buf.source) > SYNTAX_SOURCE_LIMIT) {
        this.syntaxFailed.set(buf, { version, transient: false });
        // Said after the frame that asked: drawn now, as a message is (D263), not at the next key.
        this.app.message("warn", "code structure unavailable: source exceeds parsing budget");
        return;
      }
      const abort = new AbortController();
      const pending = { version, abort };
      this.syntaxPending.set(buf, pending);
      void syntaxOnThread(g, buf.source, abort.signal)
        .then((value) => {
          if (
            abort.signal.aborted ||
            this.app.quitting ||
            buf.version !== version ||
            this.syntaxPending.get(buf) !== pending
          )
            return;
          const spans = new Map<number, SyntaxSpan[]>();
          for (const span of value.spans) spans.set(span.line, [...(spans.get(span.line) ?? []), span]);
          const rel = buf.rel;
          const links = value.links.flatMap((link) => {
            if (link.url) return [link];
            const path = rel ? this.app.graph.commentPath(link.target, rel) : null;
            return path ? [{ ...link, href: `/${path}${link.at ? `#L${link.at}` : ""}` }] : [];
          });
          buf.syntax = { ...value, version, spans, links, languages: new Map(value.languages) };
          buf.invalidateLayouts();
          for (const view of this.app.allViews()) {
            if (view.buf !== buf) continue;
            view.layoutKey = "";
            if (view.live && !view.insert && this.app.isCodeDocument(buf)) view.liveBase = undefined;
          }
          this.app.host.requestRender();
        })
        .catch((error) => {
          if (!abort.signal.aborted && !this.app.quitting && buf.version === version) {
            // The thread's own answer is about the code; the rest (the deadline, a crash) about the thread.
            const transient = !(error instanceof WorkerRequestError && error.kind === "failed");
            this.syntaxFailed.set(buf, { version, transient });
            this.app.message(
              "warn",
              `code structure unavailable: ${(error as Error).message}${transient ? " — open it again to retry" : ""}`,
            );
            this.app.host.requestRender();
          }
        })
        .finally(() => {
          if (this.syntaxPending.get(buf) === pending) this.syntaxPending.delete(buf);
          if (!this.app.quitting && buf.version !== version) this.ensureSyntax(buf);
        });
    };
    const timer = setTimeout(run, buf.syntax ? 150 : 0);
    timer.unref();
    this.syntaxTimers.set(buf, timer);
  }

  private readonly syntaxPending = new Map<NoteBuffer, { version: number; abort: AbortController }>();
  /** The text a pass failed on, until it changes; `transient`: why was the thread's (the deadline, a crash), not the
   *  code's, and opening the file again tries once more. */
  private readonly syntaxFailed = new WeakMap<NoteBuffer, { version: number; transient: boolean }>();

  /** Opened again (16.7): a pass the thread failed for its own reason is tried again. */
  retrySyntax(buf: NoteBuffer): void {
    if (this.syntaxFailed.get(buf)?.transient) this.syntaxFailed.delete(buf);
  }

  /** Every pass let go of: those waiting for typing to pause, and those asked of the thread (its own, shared by the
   *  process, `stopSyntaxThread` stops). */
  stopSyntax(): void {
    for (const timer of this.syntaxTimers.values()) clearTimeout(timer);
    this.syntaxTimers.clear();
    for (const pending of this.syntaxPending.values()) pending.abort.abort();
    this.syntaxPending.clear();
  }

  private readonly syntaxTimers = new Map<NoteBuffer, ReturnType<typeof setTimeout>>();

  // Language servers (19.x): the code's own servers — its problems, and later hover and jumps.

  /** The servers of the files open here; null when off (`[lsp] enabled`) or in tests that don't run them. */
  servers: ServerManager | null = null;
  /** Each file's servers' trigger characters, asked once its servers run. */
  private readonly triggerCache = new Map<string, { completion: string[]; signature: string[] }>();

  /** The characters that ask a file's servers for completion and signature help (none until they've said). */
  triggers(path: string): { completion: string[]; signature: string[] } {
    const known = this.triggerCache.get(path);
    if (known) return known;
    void this.servers?.triggers(path).then((t) => this.triggerCache.set(path, t));
    return { completion: [], signature: [] };
  }
  private readonly serverTimers = new Map<NoteBuffer, ReturnType<typeof setTimeout>>();

  /** A root's trust, to be asked (23.x): when nothing else is open and no one is typing. */
  private pendingTrust: { root: string; limits: string[] } | null = null;

  /**
   * The folder a trust answer is for: the root you opened, when the project is in it — every project
   * in it with one answer — else the project's own folder. Never a plain folder you opened (`~`).
   */
  trustTarget(path: string): string {
    const r = this.app.loc.root;
    if (this.app.loc.mode === "vault" && r !== homedir() && (path === r || path.startsWith(`${r}/`))) return r;
    return checkoutOf(path)?.root ?? path;
  }

  /** A root whose own code would run, not answered for yet: asked whether you trust it, once (23.x). */
  askTrust(root: string, limits: string[]): void {
    this.pendingTrust ??= { root, limits };
    this.askTrustNow();
  }

  /** The trust question, if one waits and nothing else is open, no one typing (a typed `n` would answer it). */
  askTrustNow(): void {
    const p = this.pendingTrust;
    if (!p || this.app.overlay || this.app.allViews().some((v) => v.insert)) return;
    this.pendingTrust = null;
    const at = this.trustTarget(p.root);
    if (trustOf(at) !== null) return;
    this.app.overlays.confirm(
      `Trust ${tildePath(at)}? Its own tools would run code it holds — ${p.limits.join("; ")}. Only a folder you know (y trusts it; n keeps it safe)`,
      () => this.trustRoot(at, true),
      () => this.trustRoot(at, false),
    );
  }

  /** A root trusted, or kept restricted, remembered (23.x): its servers started again, the way it now runs. */
  trustRoot(at: string, yes: boolean): void {
    const was = isTrusted(at);
    setTrust(at, yes ? "trusted" : "restricted");
    if (!yes && isTrusted(at))
      return this.app.message("warn", `${tildePath(at)} is still trusted: your config's [trust] roots lists it`);
    if (was !== yes) {
      this.servers?.restartUnder(at);
      this.app.git.refresh();
    }
    if (yes)
      this.app.message(
        "info",
        `trusted ${tildePath(at)}: its own tools run as they would anywhere — :untrust takes it back`,
      );
    else this.app.message("info", `${tildePath(at)} kept safe: nothing of its own runs — :trust trusts it`);
  }

  private exitRegistered = false;

  /** The manager started: it starts each server when a file first needs it. */
  startServers(): void {
    if (this.servers || !this.app.config.lsp.enabled) return;
    this.servers = new ServerManager({
      starting: (label, cancel, restart) => this.app.background.begin(label, cancel, { restart }),
      table: () => serverTable(this.app.config["language-server"], this.app.config.language),
      userTable: () => this.userServerTable(),
      autoInstall: () => this.app.config.lsp.auto_install,
      problems: (path, server, version, list, raw) => {
        const buf = [...this.app.buffers.values()].find((b) => b.abs === path);
        if (!buf) return;
        // Without a version, they're for the text it was last told.
        buf.serverProblems.set(server, { version: version ?? buf.serverVersion, list, raw });
        for (const v of this.app.allViews()) if (v.buf === buf) v.layoutKey = "";
        this.app.host.requestRender();
      },
      message: (level, text) => {
        this.app.message(level, text);
        this.app.host.requestRender();
      },
      applyEdit: (edit) => {
        const r = this.applyWorkspaceEdit(edit);
        this.app.host.requestRender();
        return r.files > 0;
      },
      ask: (root, limits) => {
        this.askTrust(root, limits);
        this.app.host.requestRender();
      },
    });
    // Exiting without quitting (a signal): the servers go too.
    if (!this.exitRegistered) {
      this.exitRegistered = true;
      process.once("exit", () => this.servers?.killAll());
    }
  }

  /**
   * A file's symbols from its language server, as its outline (19.14) — only for a file tree-sitter
   * has no outline of (16.8): tree-sitter's is there at once, and leaves out the variables a server lists.
   */
  async symbols(buf: NoteBuffer): Promise<void> {
    const s = this.servers;
    if (!s || buf.kind.group === "note" || grammarFor(buf.kind.format, extensionOf(buf.name))) return;
    const version = buf.version;
    const answer = await s.request<DocumentSymbol[] | SymbolInformation[]>(
      buf.abs,
      "textDocument/documentSymbol",
      { textDocument: { uri: pathToFileURL(buf.abs).href } },
      "documentSymbolProvider",
      "document-symbols",
    );
    if (!answer || buf.version !== version) return;
    buf.serverOutline = outlineOf(answer.result);
    buf.invalidateLayouts();
    for (const v of this.app.allViews()) if (v.buf === buf) v.layoutKey = "";
    this.app.host.requestRender();
  }

  /** A server's edit as each file's text edits: `changes`, or `documentChanges`' text edits (a file to make, move or delete is left out). */
  editsOf(edit: WorkspaceEdit): { path: string; edits: LspTextEdit[] }[] {
    const out = new Map<string, LspTextEdit[]>();
    const add = (uri: string, edits: LspTextEdit[]) => {
      if (!uri.startsWith("file:")) return;
      const path = fileURLToPath(uri);
      out.set(path, [...(out.get(path) ?? []), ...edits]);
    };
    for (const [uri, edits] of Object.entries(edit.changes ?? {})) add(uri, edits);
    for (const c of edit.documentChanges ?? [])
      if ("textDocument" in c)
        add(
          c.textDocument.uri,
          c.edits.filter((e): e is LspTextEdit => "newText" in e),
        );
    return [...out].map(([path, edits]) => ({ path, edits }));
  }

  /**
   * A server's edit made (19.15), through the buffers: each file's edits one undo step; a file no window
   * shows is saved (writeBuffer), so what's on disk is the edit's; one shown is left for its saving.
   */
  applyWorkspaceEdit(edit: WorkspaceEdit): { files: number; edits: number } {
    let files = 0;
    let count = 0;
    const shown = new Set(this.app.allViews().map((v) => v.buf));
    for (const { path, edits } of this.editsOf(edit)) {
      const inVault = path.startsWith(`${this.app.loc.root}/`);
      const buf = this.app.buffer(inVault ? path.slice(this.app.loc.root.length + 1) : path);
      if (!buf || !edits.length) continue;
      const wasDirty = buf.dirty;
      // Offsets as the preview's (and LSP's): a character past its line's end is the line's end.
      const doc = TextDocument.create("", "", 0, buf.source);
      const at = (p: { line: number; character: number }) => doc.offsetAt(p);
      // Last first, so each edit's offsets still hold; of inserts at one place, the later one first,
      // so their text reads in the array's order (as LSP has it, and as the preview showed it).
      const sorted = edits
        .map((e, i) => ({ from: at(e.range.start), to: at(e.range.end), text: e.newText, i }))
        .sort((a, b) => b.from - a.from || b.i - a.i);
      buf.beginStep(sorted.at(-1)!.from);
      for (const e of sorted) buf.edit(e.from, e.to - e.from, e.text);
      buf.endStep(sorted.at(-1)!.from);
      for (const v of this.app.allViews()) if (v.buf === buf) v.layoutKey = "";
      if (!shown.has(buf) && !wasDirty) this.app.saving.save(buf, true);
      files++;
      count += edits.length;
    }
    return { files, edits: count };
  }

  /** A server's edit previewed: each line it changes, in each file, before and after; enter makes it. */
  previewWorkspaceEdit(title: string, edit: WorkspaceEdit, done: () => void = () => {}): void {
    const items: ListItem[] = [];
    let n = 0;
    for (const { path, edits } of this.editsOf(edit)) {
      const open = [...this.app.buffers.values()].find((b) => b.abs === path);
      let text: string;
      try {
        text = open?.source ?? readFileSync(path, "utf8");
      } catch {
        continue;
      }
      const doc = TextDocument.create("", "", 0, text);
      const next = TextDocument.applyEdits(doc, edits);
      const a = text.split("\n");
      const b = next.split("\n");
      const shown = path.startsWith(`${this.app.loc.root}/`) ? path.slice(this.app.loc.root.length + 1) : path;
      for (const h of diffLines(a, b)) {
        for (let k = 0; k < Math.max(h.aLen, h.bLen); k++) {
          items.push({
            label: `${shown}:${h.aStart + k + 1}`,
            detail: `${(a[h.aStart + k] ?? "").trim()}  →  ${(b[h.bStart + k] ?? "").trim()}`,
            data: null,
          });
          n++;
        }
      }
    }
    if (!items.length) return this.app.message("info", "the server changes nothing");
    const files = new Set(items.map((i) => i.label.slice(0, i.label.lastIndexOf(":")))).size;
    this.app.overlays.openList({
      title: `${title}: ${n} change${n === 1 ? "" : "s"} in ${files} file${files === 1 ? "" : "s"} — enter: do it, esc: cancel`,
      items,
      filterable: false,
      accept: () => {
        const r = this.applyWorkspaceEdit(edit);
        this.app.message(
          "info",
          `${title}: ${r.edits} change${r.edits === 1 ? "" : "s"} in ${r.files} file${r.files === 1 ? "" : "s"}`,
        );
        done();
      },
    });
  }

  /**
   * A file's servers told its text now, not after the pause: a request about it (a hover, a rename, a
   * code action) must be answered for the text as it is — a fix made a moment ago included. Sent
   * before the request on the same connection, so the server has it first.
   */
  sync(buf: NoteBuffer): void {
    const s = this.servers;
    if (!s?.isOpen(buf.abs) || buf.serverVersion === buf.version) return;
    const t = this.serverTimers.get(buf);
    if (t) clearTimeout(t);
    this.serverTimers.delete(buf);
    buf.serverVersion = buf.version;
    s.change(buf.abs, buf.version, buf.source);
  }

  /** A file's servers told about it: opened the first time it's shown, its text again 150 ms after
   *  typing pauses — never per key. */
  ensureServers(buf: NoteBuffer): void {
    const s = this.servers;
    if (!s || buf.virtual || buf.deleted || buf.serverVersion === buf.version || this.serverTimers.has(buf)) return;
    if (!s.isOpen(buf.abs)) {
      buf.serverVersion = buf.version;
      s.open(buf.abs, buf.version, buf.source);
      return void this.symbols(buf);
    }
    const t = setTimeout(() => {
      this.serverTimers.delete(buf);
      buf.serverVersion = buf.version;
      s.change(buf.abs, buf.version, buf.source);
      void this.symbols(buf);
    }, 150);
    (t as { unref?: () => void }).unref?.();
    this.serverTimers.set(buf, t);
  }

  // Linters without a server (19.19): a file's, by its language, each where its project asks for it —
  // one reading its input on the text as typed, once typing pauses; the others on the file as saved.

  private tablesMemo: { config: Config; servers: ServerTable; linters: Record<string, LinterDef> } | null = null;
  private userTableMemo: { config: Config; table: ServerTable } | null = null;
  /** The servers as your own config has them, no folder's: their settings in a root you don't trust (23.3). */
  userServerTable(): ServerTable {
    if (this.userTableMemo?.config !== this.app.config) {
      const yours = loadConfig({ configFile: this.app.configFile }).config;
      this.userTableMemo = { config: this.app.config, table: serverTable(yours["language-server"], yours.language) };
    }
    return this.userTableMemo.table;
  }
  /** The languages and linters in effect, as the config has them. */
  private tables(): { servers: ServerTable; linters: Record<string, LinterDef> } {
    if (this.tablesMemo?.config !== this.app.config)
      this.tablesMemo = {
        config: this.app.config,
        servers: serverTable(this.app.config["language-server"], this.app.config.language),
        linters: linterTable(this.app.config.linter),
      };
    return this.tablesMemo;
  }
  private readonly linterRuns = new Map<
    NoteBuffer,
    { timer: ReturnType<typeof setTimeout>; version: number } | "running"
  >();
  /** Linters that couldn't run: said once, and not tried again until the config changes. */
  private readonly linterFailed = new Set<string>();

  /** A file's linters, run when its text (or its saved text) hasn't been linted as it is: at once the first
   *  time, then 500 ms after typing pauses, or after a save. */
  ensureLinters(buf: NoteBuffer): void {
    if (this.app.config.lint.enabled === "off" || buf.virtual || buf.deleted) return;
    const typed = buf.linted.typed !== buf.version;
    const saved = !buf.dirty && buf.linted.saved !== buf.version;
    if (!typed && !saved) return;
    const pending = this.linterRuns.get(buf);
    if (pending === "running" || pending?.version === buf.version) return;
    const { servers, linters } = this.tables();
    const lang = languageOf(servers, buf.abs);
    const defs = (lang?.linters ?? [])
      .map((n) => linters[n])
      .filter((d): d is LinterDef => !!d?.command && !this.linterFailed.has(d.name));
    if (!lang || !defs.some((d) => (d.stdin ? typed : saved))) return;
    if (pending) clearTimeout(pending.timer);
    const project = rootFor(buf.abs, lang.roots);
    const t = setTimeout(
      () => {
        const version = buf.version;
        const text = buf.source;
        const due = defs.filter((d) =>
          d.stdin ? buf.linted.typed !== version : !buf.dirty && buf.linted.saved !== version,
        );
        buf.linted = { typed: version, saved: buf.dirty ? buf.linted.saved : version };
        this.linterRuns.set(buf, "running");
        // Each linter's answer drawn as it comes: a slow one beside it holds back no other's findings.
        const drawn = () => {
          for (const v of this.app.allViews()) if (v.buf === buf) v.layoutKey = "";
          this.app.host.requestRender();
        };
        // Settled whatever each did: one that threw leaves the next run free to start, never the file unlinted.
        void Promise.allSettled(
          due.map(async (d) => {
            try {
              const root = linterRoot(d, buf.abs, project);
              if (!root) return void buf.linterProblems.delete(d.name); // the project doesn't ask for it
              const signal = this.tools.signal;
              const r = await runLinter(d, buf.abs, text, root, undefined, signal);
              if (signal.aborted) return;
              if ("problems" in r) buf.linterProblems.set(d.name, { version, list: r.problems });
              else if ("skipped" in r) {
                buf.linterProblems.delete(d.name); // none shown for this text, and the linter kept
                this.saySkipped(`linter ${d.name}`, buf, r.skipped);
              } else this.linterCouldNot(d, r.failed, r.detail);
            } finally {
              drawn();
            }
          }),
        ).then(() => this.linterRuns.delete(buf));
      },
      buf.linted.typed >= 0 || buf.linted.saved >= 0 ? 500 : 0,
    );
    (t as { unref?: () => void }).unref?.();
    this.linterRuns.set(buf, { timer: t, version: buf.version });
  }

  /** Linters tried again, and every open file linted again: the config changed. */
  relint(): void {
    this.linterFailed.clear();
    this.skippedSaid.clear();
    for (const b of this.app.buffers.values()) {
      b.linted = { typed: -1, saved: -1 };
      b.linterProblems.clear();
    }
  }

  /** A linter that couldn't run: said once — not installed (and how to get it), too slow, or failing. */
  private linterCouldNot(def: LinterDef, why: "missing" | "timeout" | "error", detail: string): void {
    if (this.linterFailed.has(def.name)) return;
    this.linterFailed.add(def.name);
    const program = def.command.trim().split(/\s+/)[0];
    const text =
      why === "missing"
        ? `linter ${def.name}: ${program} not found${def.hint ? ` — ${def.hint}` : ""}`
        : `linter ${def.name} couldn't run: ${detail}`;
    this.app.message("warn", text);
  }

  /** Cancels the lint, linter and install runs under way when the screen quits: none is left running behind it. */
  private tools = new AbortController();
  /** Runs whose findings weren't shown, by linter and file: said once. */
  private readonly skippedSaid = new Set<string>();

  leaveVault(): void {
    this.stopSyntax();
    for (const timer of this.serverTimers.values()) clearTimeout(timer);
    this.serverTimers.clear();
    for (const pending of this.linterRuns.values()) if (pending !== "running") clearTimeout(pending.timer);
    this.linterRuns.clear();
    for (const pending of this.lintRuns.values()) if (pending !== "running") clearTimeout(pending);
    this.lintRuns.clear();
    this.tools.abort();
    this.tools = new AbortController();
    this.servers?.cancelInstalls();
    this.servers?.killAll();
    this.servers = null;
    this.triggerCache.clear();
    this.pendingTrust = null;
    this.vaultLint = { running: false, issues: null };
  }

  /** The screen quitting: every lint, linter and install run under way stopped. */
  stopTools(): void {
    this.tools.abort();
    this.servers?.cancelInstalls();
  }

  /**
   * A run whose findings aren't shown though its linter works — its output past slipbox's limit: said once for that
   * linter and file, the linter kept. Cancelled by quitting: nothing to say.
   */
  private saySkipped(who: string, buf: NoteBuffer | null, why: string): void {
    if (this.tools.signal.aborted) return;
    const where = buf ? this.app.displayName(buf) : "the vault";
    const key = `${who}\0${where}`;
    if (this.skippedSaid.has(key)) return;
    this.skippedSaid.add(key);
    this.app.message("warn", `${who}: ${where}: ${why} — this run's findings aren't shown`);
  }

  // The lint surface (3.21): your markdownlint-cli2 run on a note once it's saved — its findings
  // beside their lines, on the status line, in the Problems panel — and on the vault for that view.

  /** The linter (`[lint]`), or null: lint off, or it couldn't run. */
  lintCmd: LintCmd | null = null;
  private readonly lintRuns = new Map<NoteBuffer, ReturnType<typeof setTimeout> | "running">();
  /** The whole vault's findings, as last linted (the Problems panel's All tab): null until it's run, or when a run's
   *  findings weren't shown (`skipped` says why). */
  vaultLint: { running: boolean; issues: LintIssue[] | null; skipped?: string } = { running: false, issues: null };

  /** Lint a note when its text is the file's (saved) and hasn't been linted as it is: at once the
   *  first time, then 300 ms after it's saved again. */
  ensureLint(buf: NoteBuffer): void {
    const cmd = this.lintCmd;
    if (!cmd || buf.kind.group !== "note" || buf.kind.format !== "markdown" || buf.rel === null || buf.virtual) return;
    if (buf.dirty || buf.deleted || buf.lint?.version === buf.version || this.lintRuns.has(buf)) return;
    const version = buf.version;
    const t = setTimeout(
      () => {
        this.lintRuns.set(buf, "running");
        const signal = this.tools.signal;
        void runLint(cmd, [buf.abs], this.app.loc.root, undefined, this.sayInstalling, signal).then((issues) => {
          this.lintRuns.delete(buf);
          if (signal.aborted) return;
          if (issues === null) return this.lintFailed();
          if (!Array.isArray(issues)) {
            // None shown for this text, and not linted again until it's saved again: lint stays on.
            buf.lint = { version, issues: [], skipped: issues.skipped };
            this.saySkipped("lint", buf, issues.skipped);
            return this.app.host.requestRender();
          }
          buf.lint = { version, issues: issues.filter((i) => i.file === buf.abs) };
          // The vault's list follows this note's.
          if (this.vaultLint.issues)
            this.vaultLint.issues = [
              ...this.vaultLint.issues.filter((i) => i.file !== buf.abs),
              ...buf.lint.issues,
            ].sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));
          for (const v of this.app.allViews()) if (v.buf === buf) v.layoutKey = "";
          this.app.host.requestRender();
        });
      },
      buf.lint ? 300 : 0,
    );
    (t as { unref?: () => void }).unref?.();
    this.lintRuns.set(buf, t);
  }

  /** Lint every note (the Problems panel's Lint section), in runs of a few hundred files. */
  lintVault(): void {
    const cmd = this.lintCmd;
    if (!cmd || this.vaultLint.running) return;
    const files = [...this.app.graph.notes.keys()]
      .filter((rel) => /\.(md|markdown)$/i.test(rel))
      .sort()
      .map((rel) => join(this.app.loc.root, rel));
    this.vaultLint = { running: true, issues: this.vaultLint.issues };
    const signal = this.tools.signal;
    const root = this.app.loc.root;
    void (async () => {
      const all: LintIssue[] = [];
      for (let i = 0; i < files.length; i += 300) {
        const batch = files.slice(i, i + 300);
        const got = await runLint(cmd, batch, root, undefined, this.sayInstalling, signal);
        if (signal.aborted) return;
        if (got === null) {
          this.vaultLint = { running: false, issues: null };
          this.lintFailed();
          return this.app.host.requestRender();
        }
        if (!Array.isArray(got)) {
          // A list missing some notes' findings would pass for whole: none is shown, and lint stays on.
          this.vaultLint = { running: false, issues: null, skipped: got.skipped };
          this.saySkipped("lint", null, got.skipped);
          return this.app.host.requestRender();
        }
        all.push(...got);
      }
      this.vaultLint = { running: false, issues: all };
      this.app.host.requestRender();
    })();
  }

  /** markdownlint-cli2 installed first (19.21): said, as a server's install is. */
  private readonly sayInstalling = (text: string) => {
    this.app.message("info", text);
    this.app.host.requestRender();
  };

  /** The linter couldn't run: said once, and not tried again until the config says otherwise. */
  private lintFailed(): void {
    if (!this.lintCmd) return;
    this.lintCmd = null;
    this.app.message(
      "warn",
      `lint: ${lintFailure(this.app.config)} — [lint] command sets another; enabled = "off" stops trying`,
    );
  }

  /** A position in a source-mode view as the protocol counts it: line and UTF-16 character, from 0. */
  position(view: View): { line: number; character: number } {
    const at = offsetOf(this.app, view);
    const starts = view.buf.lineStarts();
    let line = starts.length - 1;
    while (line > 0 && starts[line]! > at) line--;
    return { line, character: at - starts[line]! };
  }

  /** Open a file (absolute) at a line and a UTF-16 character, from 0: a location a server gives. */
  openLocation(abs: string, line: number, character: number): void {
    const inVault = abs.startsWith(`${this.app.loc.root}/`);
    const target = inVault ? abs.slice(this.app.loc.root.length + 1) : abs;
    this.app.open(target, { heading: null, headingIndex: 0, offset: 0, line: line + 1 });
    const v = this.app.view;
    if (!v || v.buf.abs !== abs) return;
    const start = v.buf.lineStarts()[line] ?? 0;
    const text = v.buf.source.slice(start, start + character);
    this.app.placeAtLine(v, line + 1, [...text].length + 1);
    this.app.region = "content";
  }
}

/** A symbol's kind by its number, as the outline names it (`function`, `class`). */
export const KIND_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(SymbolKind).map(([name, n]) => [n, name.toLowerCase()]),
);

/** A server's symbols as an outline: nested ones (`DocumentSymbol`) by their depth, flat ones in line order. */
function outlineOf(symbols: DocumentSymbol[] | SymbolInformation[]): OutlineEntry[] {
  const out: OutlineEntry[] = [];
  const walk = (list: DocumentSymbol[], depth: number) => {
    for (const d of [...list].sort((a, b) => a.selectionRange.start.line - b.selectionRange.start.line)) {
      out.push({ name: d.name, kind: KIND_NAMES[d.kind] ?? "symbol", line: d.selectionRange.start.line + 1, depth });
      if (d.children?.length) walk(d.children, depth + 1);
    }
  };
  if (symbols.length && "selectionRange" in symbols[0]!) walk(symbols as DocumentSymbol[], 0);
  else
    for (const i of [...(symbols as SymbolInformation[])].sort(
      (a, b) => a.location.range.start.line - b.location.range.start.line,
    ))
      out.push({ name: i.name, kind: KIND_NAMES[i.kind] ?? "symbol", line: i.location.range.start.line + 1, depth: 0 });
  return out;
}
