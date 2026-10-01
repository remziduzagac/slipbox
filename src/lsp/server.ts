// slipbox's third face (plan 11.x): the vault served to editors over LSP — `slipbox lsp`, on stdio.
// The same core as the TUI and the CLI answers: one graph per vault, kept current by the watcher as
// the TUI's is. Vaults only (a folder with `.slipbox/`): a markdown file elsewhere is left to
// whatever else the editor runs there (marksman). Nothing but the protocol reaches stdout.

import { join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  type Connection,
  createConnection,
  type Diagnostic,
  type InitializeParams,
  type InitializeResult,
  CodeActionKind,
  LSPErrorCodes,
  MessageType,
  ResponseError,
  ShowMessageNotification,
  TextDocuments,
  TextDocumentSyncKind,
  type WatchDog,
  type WorkspaceEdit,
} from "vscode-languageserver";
import { createProtocolConnection, StreamMessageReader, StreamMessageWriter } from "vscode-languageserver-protocol/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { type Config, loadConfig } from "../core/config.ts";
import { type Graph, openGraph } from "../core/graph.ts";
import { Reach } from "../core/reach.ts";
import { planMoves, RenameError } from "../core/rename.ts";
import { checkoutOf } from "../core/git.ts";
import { lintProblems } from "../core/diagnostics.ts";
import { type LintIssue, lintCommand, runLint } from "../core/lint.ts";
import { copyText } from "../core/clipboard.ts";
import { buildContext } from "../core/context.ts";
import { atomicWrite, ensureDir } from "../core/fsutil.ts";
import { stateDir } from "../core/paths.ts";
import { findVaultRoot, isInside, recordLocation, rootAt, type VaultLocation, vaultConfigPath } from "../core/vault.ts";
import { applyToGraph, VaultFeed } from "../core/vault-feed.ts";
import { VaultWatcher } from "../core/watch.ts";
import { VERSION } from "../version.ts";
import { CONTEXT_COMMAND, codeActions, toDiagnostic, completion, definition, diagnostics, documentSymbols, hover, prepareRename, references, renamePlan, workspaceEdit, workspaceSymbols } from "./features.ts";

export interface LspOptions {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
  /** The user's config file (`--config`), else the default. */
  configFile?: string;
  /** Watch the vaults' files (off in tests that drive changes themselves). */
  watch?: boolean;
}

/** A vault being served: its graph, kept current. */
export interface Served {
  loc: VaultLocation;
  config: Config;
  graph: Graph;
  feed: VaultFeed;
  watcher: VaultWatcher | null;
}

export class LspServer {
  readonly connection: Connection;
  readonly documents = new TextDocuments(TextDocument);
  /** Served vaults, by root. */
  readonly vaults = new Map<string, Served>();
  /** Resolved with the exit code when the editor ends the session (or goes away). */
  readonly exited: Promise<number>;
  private shutdown = false;
  private done = false;
  private finish!: (code: number) => void;
  private parentWatch: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly opts: LspOptions) {
    this.exited = new Promise((resolve) => (this.finish = resolve));
    // The library's own watchdog would exit the process; this one ends the session.
    const self = this;
    const watchDog: WatchDog = {
      initialize: (params) => this.watchParent(params.processId),
      get shutdownReceived() {
        return self.shutdown;
      },
      set shutdownReceived(v: boolean) {
        self.shutdown = v;
      },
      exit: (code) => this.exit(code),
    };
    this.connection = createConnection((logger) => createProtocolConnection(new StreamMessageReader(opts.input), new StreamMessageWriter(opts.output), logger), watchDog);
    // The editor gone without a word (its pipe closed): the session is over.
    opts.input.on("end", () => this.exit(this.shutdown ? 0 : 1));
    opts.input.on("close", () => this.exit(this.shutdown ? 0 : 1));
    this.connection.onInitialize((params) => this.initialize(params));
    this.connection.onInitialized(() => {
      // The workspace's vaults, opened once the editor is ready rather than on its first request.
      setTimeout(() => {
        for (const root of this.folders) this.vaultAt(root);
      }, 0);
    });
    // An open note's text stands for it as the editor has it (11.8): at once when it opens, then
    // once typing pauses — a parse per pause, not per key; a request that needs it now asks first.
    this.documents.onDidChangeContent((e) => {
      const n = this.noteOf(e.document.uri);
      if (!n) return;
      if (!n.served.graph.overlaid(n.rel)) this.fresh(e.document.uri);
      else this.settle(e.document.uri);
    });
    this.documents.onDidClose((e) => {
      const uri = e.document.uri;
      this.unsettle(uri);
      this.applied.delete(uri);
      this.linted.delete(uri);
      const n = this.noteOf(uri);
      if (!n) return;
      n.served.graph.overlay(n.rel, null);
      void this.connection.sendDiagnostics({ uri, diagnostics: [] });
      this.republish(n.served);
    });
    this.documents.onDidOpen((e) => this.lint(e.document.uri));
    this.documents.onDidSave((e) => this.lint(e.document.uri));
    this.documents.listen(this.connection);
    this.connection.onDefinition((p) => this.asked(p.textDocument.uri, (g, rel) => definition(g, rel, p.position), []));
    this.connection.onCompletion((p) =>
      this.asked(p.textDocument.uri, (g, rel) => completion(g, rel, this.lineOf(p.textDocument.uri, g, rel, p.position.line), p.position), null),
    );
    this.connection.onDocumentSymbol((p) => this.asked(p.textDocument.uri, (g, rel) => documentSymbols(g, rel), []));
    this.connection.onWorkspaceSymbol((p) => this.everywhere((g) => workspaceSymbols(g, p.query)));
    this.connection.onPrepareRename((p) => this.asked(p.textDocument.uri, (g, rel) => prepareRename(g, rel, p.position), null));
    this.connection.workspace.onWillRenameFiles((p) => this.willRename(p.files));
    this.connection.onCodeAction((p) =>
      this.asked(p.textDocument.uri, (g, rel) => codeActions(g, rel, p.range, (n) => this.lineOf(p.textDocument.uri, g, rel, n), this.createsFiles), []),
    );
    this.connection.onExecuteCommand(async (p) => {
      if (p.command === CONTEXT_COMMAND && typeof p.arguments?.[0] === "string") await this.copyContext(p.arguments[0]);
    });
    this.connection.onRenameRequest((p) => this.rename(p.textDocument.uri, p.position, p.newName));
    this.connection.onHover((p) => this.asked(p.textDocument.uri, (g, rel) => hover(g, rel, p.position), null));
    this.connection.onReferences((p) => this.asked(p.textDocument.uri, (g, rel) => references(g, rel, p.position, p.context.includeDeclaration), []));
    this.connection.listen();
  }

  /** The workspace folders the editor named (absolute paths). */
  private folders: string[] = [];

  /** Whether the editor applies a file's rename sent in an edit (a note's rename moves its file). */
  private renamesFiles = false;
  /** Whether it makes a file an edit names (a missing note made). */
  private createsFiles = false;
  /** Whether it opens a document when asked (`window/showDocument`). */
  private showsDocuments = false;

  private initialize(params: InitializeParams): InitializeResult {
    const edits = params.capabilities.workspace?.workspaceEdit;
    this.renamesFiles = !!edits?.documentChanges && !!edits.resourceOperations?.includes("rename");
    this.createsFiles = !!edits?.documentChanges && !!edits.resourceOperations?.includes("create");
    this.showsDocuments = !!params.capabilities.window?.showDocument?.support;
    const uris = params.workspaceFolders?.map((f) => f.uri) ?? (params.rootUri ? [params.rootUri] : []);
    this.folders = uris.map(pathOf).filter((p): p is string => p !== null);
    return {
      capabilities: {
        textDocumentSync: { openClose: true, change: TextDocumentSyncKind.Incremental, save: { includeText: false } },
        workspace: {
          workspaceFolders: { supported: true },
          // A note or folder moved in the editor's file tree: its links fixed first (11.10).
          fileOperations: { willRename: { filters: [{ scheme: "file", pattern: { glob: "**/*" } }] } },
        },
        definitionProvider: true,
        referencesProvider: true,
        hoverProvider: true,
        documentSymbolProvider: true,
        renameProvider: { prepareProvider: true },
        codeActionProvider: { codeActionKinds: [CodeActionKind.QuickFix, CodeActionKind.Source] },
        executeCommandProvider: { commands: [CONTEXT_COMMAND] },
        workspaceSymbolProvider: true,
        completionProvider: { triggerCharacters: ["[", "#", "^"] },
      },
      serverInfo: { name: "slipbox", version: VERSION },
    };
  }

  /** The vault holding a file or folder, opened and watched on first use; null outside any vault. */
  vaultAt(path: string): Served | null {
    const root = findVaultRoot(path);
    if (!root) return null;
    const open = this.vaults.get(root);
    if (open) return open;
    const loc = rootAt(root);
    const loaded = loadConfig({ vaultFile: vaultConfigPath(loc), configFile: this.opts.configFile });
    for (const w of loaded.warnings) this.log(w);
    // This machine sees the vault (17.6), as the TUI and the CLI record it.
    recordLocation(loc);
    const config = loaded.config;
    const graph = openGraph(loc, config, true, "lazy");
    // One answer whichever note was parsed first: an alias in a note not parsed yet counts (17.7).
    graph.thorough = true;
    graph.reach = new Reach(loc);
    for (const e of graph.errors) this.log(e);
    let memo: { c: ReturnType<typeof checkoutOf>; at: number } | null = null;
    const served: Served = {
      loc,
      config,
      graph,
      watcher: null,
      feed: new VaultFeed({
        // Looked up again each second while there's none: a repository can appear.
        checkout: () => {
          if (!memo || (!memo.c && Date.now() - memo.at > 1000)) memo = { c: checkoutOf(root), at: Date.now() };
          return memo.c;
        },
        graph: () => graph,
        now: Date.now,
        apply: (batch) => {
          const { warnings } = applyToGraph(graph, batch, config.walk.max_file_size);
          for (const w of warnings) this.log(w);
          if (batch.rescan) served.watcher?.sync(graph.dirs, known(graph), sizes(graph));
          this.republish(served);
        },
      }),
    };
    if (this.opts.watch !== false && config.watch.enabled) {
      served.watcher = new VaultWatcher({
        root,
        filter: graph.filter,
        dirs: graph.dirs,
        debounceMs: config.watch.debounce_ms,
        pollMs: config.watch.poll_ms,
        known: known(graph),
        sizes: sizes(graph),
        onBatch: (b) => served.feed.receive(b),
        onDegraded: (reason) => this.log(`watching degraded: ${reason}`),
        onWarn: (text) => this.log(text),
      });
    }
    this.vaults.set(root, served);
    this.parseInBackground(graph);
    return served;
  }

  /** A document's note: its vault and its path there; null outside a vault, or for a file that isn't a note. */
  noteOf(uri: string): { served: Served; rel: string } | null {
    const path = pathOf(uri);
    const served = path ? this.vaultAt(path) : null;
    if (!path || !served) return null;
    const rel = relative(served.loc.root, path).split(sep).join("/");
    return served.graph.notes.has(rel) ? { served, rel } : null;
  }

  /** Documents typed in, waiting for a pause to stand for their notes. */
  private readonly settling = new Map<string, ReturnType<typeof setTimeout>>();

  private settle(uri: string): void {
    this.unsettle(uri);
    const t = setTimeout(() => this.fresh(uri), SETTLE_MS);
    (t as { unref?: () => void }).unref?.();
    this.settling.set(uri, t);
  }

  private unsettle(uri: string): void {
    const t = this.settling.get(uri);
    if (t) clearTimeout(t);
    this.settling.delete(uri);
  }

  /** Each open document's version its note has (11.8). */
  private readonly applied = new Map<string, number>();

  /** An open document's text, standing for its note now: what a request about it needs. Its vault's
   *  open notes' diagnostics are sent again when it changed. */
  fresh(uri: string): void {
    this.unsettle(uri);
    const doc = this.documents.get(uri);
    const n = this.noteOf(uri);
    if (!doc || !n || this.applied.get(uri) === doc.version) return;
    n.served.graph.overlay(n.rel, doc.getText());
    this.applied.set(uri, doc.version);
    this.republish(n.served);
  }

  /** Vaults whose open notes' diagnostics are about to be sent again. */
  private readonly republishing = new Map<Served, ReturnType<typeof setTimeout>>();

  /** A vault changed — a note typed in, written, made or gone: its open notes' diagnostics again,
   *  a moment later (one send for a burst). */
  republish(served: Served): void {
    if (this.republishing.has(served) || this.done) return;
    const t = setTimeout(() => {
      this.republishing.delete(served);
      for (const doc of this.documents.all()) if (this.noteOf(doc.uri)?.served === served) this.publish(doc.uri);
    }, 50);
    (t as { unref?: () => void }).unref?.();
    this.republishing.set(served, t);
  }

  /** A document's diagnostics, sent: the note's problems, and the linter's (`[lsp] lint`) for the
   *  text it was run on. */
  publish(uri: string): void {
    const doc = this.documents.get(uri);
    const n = this.noteOf(uri);
    if (!doc || !n) return;
    let list: Diagnostic[];
    try {
      list = diagnostics(n.served.graph, n.rel);
    } catch (err) {
      this.log(`${n.rel}: ${(err as Error).stack ?? err}`);
      return;
    }
    const lint = this.linted.get(uri);
    if (lint?.version === doc.version) list.push(...lintProblems(lint.issues).map(toDiagnostic));
    void this.connection.sendDiagnostics({ uri, version: doc.version, diagnostics: list });
  }

  /** The linter's findings for each open document, with the version they were found in. */
  private readonly linted = new Map<string, { version: number; issues: LintIssue[] }>();

  /** The note linted as saved (on open and on save), when `[lsp] lint` asks for it (3.21). */
  private lint(uri: string): void {
    const doc = this.documents.get(uri);
    const n = this.noteOf(uri);
    if (!doc || !n || !n.served.config.lsp.lint) return;
    const cmd = lintCommand(n.served.config.lint, n.served.loc.root);
    if (!cmd) return;
    const version = doc.version;
    void runLint(cmd, [n.served.graph.abs(n.rel)], n.served.loc.root).then((issues) => {
      if (issues === null) return this.log(`the linter couldn't run: ${cmd.argv.join(" ")}`);
      if (this.documents.get(uri)?.version !== version) return;
      this.linted.set(uri, { version, issues });
      this.publish(uri);
    });
  }

  /** A request about a note, answered from its text as the editor has it; `none` outside a vault.
   *  A failure is logged and answered with `none`: one bad note never ends the session. */
  private asked<T>(uri: string, answer: (g: Graph, rel: string) => T, none: T): T {
    this.fresh(uri);
    const n = this.noteOf(uri);
    if (!n) return none;
    try {
      return answer(n.served.graph, n.rel);
    } catch (err) {
      this.log(`${n.rel}: ${(err as Error).stack ?? err}`);
      return none;
    }
  }

  /**
   * A note renamed from a link to it (11.4): the plan as an edit for the editor to apply — it shows
   * the preview — never written here. Refused, with why, when a file it changes has unsaved changes
   * in the editor (the plan is made from the files), or the editor can't move files.
   */
  private rename(uri: string, pos: { line: number; character: number }, newName: string): WorkspaceEdit | ResponseError | null {
    this.fresh(uri);
    const n = this.noteOf(uri);
    if (!n) return null;
    const refuse = (message: string) => new ResponseError(LSPErrorCodes.RequestFailed, message);
    let plan: ReturnType<typeof renamePlan>;
    try {
      plan = renamePlan(n.served.graph, n.rel, pos, newName);
    } catch (err) {
      if (err instanceof RenameError) return refuse(err.message);
      throw err;
    }
    for (const f of plan.files) {
      const doc = this.documents.get(pathToFileURL(f.abs).href);
      if (doc && doc.getText() !== f.text) return refuse(`${f.shown} has unsaved changes: save it, then rename`);
    }
    if (plan.move && !this.renamesFiles) return refuse("this editor can't move a file in an edit: rename it in slipbox (space n m) or with slipbox mv");
    return workspaceEdit(plan, (u) => this.documents.get(u)?.version ?? null);
  }

  /**
   * Files and folders the editor is about to move itself (11.10): every link to them fixed, as an edit it
   * applies before moving — never the move. A file with unsaved changes in the editor is left out, and
   * said so: the edit is made from the files, and `slipbox relink` fixes it once it's saved.
   */
  private willRename(files: { oldUri: string; newUri: string }[]): WorkspaceEdit | null {
    const byVault = new Map<Served, [string, string][]>();
    for (const f of files) {
      const from = pathOf(f.oldUri);
      const to = pathOf(f.newUri);
      const served = from ? this.vaultAt(from) : null;
      if (!from || !to || !served) continue;
      const root = served.loc.root;
      const rel = (p: string) => relative(root, p).split(sep).join("/");
      if (!isInside(root, to)) {
        this.log(`${rel(from)} leaves the vault: links to it aren't fixed`);
        continue;
      }
      byVault.set(served, [...(byVault.get(served) ?? []), [rel(from), rel(to)]]);
    }
    const changes: NonNullable<WorkspaceEdit["documentChanges"]> = [];
    for (const [served, pairs] of byVault) {
      let plan: ReturnType<typeof planMoves>;
      try {
        plan = planMoves(served.graph, pairs);
      } catch (err) {
        if (!(err instanceof RenameError)) throw err;
        this.log(err.message);
        continue;
      }
      const unsaved = plan.files.filter((f) => {
        const doc = this.documents.get(pathToFileURL(f.abs).href);
        return doc !== undefined && doc.getText() !== f.text;
      });
      if (unsaved.length) {
        void this.connection.sendNotification(ShowMessageNotification.type, {
          type: MessageType.Warning,
          message: `slipbox: ${unsaved.map((f) => f.shown).join(", ")} ${unsaved.length === 1 ? "has" : "have"} unsaved changes: links there weren't fixed — slipbox relink fixes them once saved`,
        });
      }
      const kept = { ...plan, move: null, files: plan.files.filter((f) => !unsaved.includes(f)) };
      changes.push(...workspaceEdit(kept, (u) => this.documents.get(u)?.version ?? null).documentChanges!);
    }
    return changes.length ? { documentChanges: changes } : null;
  }

  /**
   * A note's context bundle (9.7), for an agent: written to the vault's state (`context.md`), copied by the
   * system's clipboard tools when there are any — never OSC 52, whose sequence would land in the
   * editor's own terminal — and opened in the editor when it can, else where it is said.
   */
  private async copyContext(uri: string): Promise<void> {
    const n = this.noteOf(uri);
    if (!n) return;
    const { graph, config, loc } = n.served;
    await graph.loadGrammars(); // code files link from their comments (16.10)
    const b = buildContext(graph, [n.rel], config.context);
    const file = join(stateDir(loc), "context.md");
    ensureDir(stateDir(loc));
    atomicWrite(file, b.text);
    const copied = copyText(b.text, { osc52: () => false, fallbackDir: stateDir(loc) });
    const how = copied.confirmed ? `copied (${copied.methods.join(", ")})` : `in ${file}`;
    void this.connection.sendNotification(ShowMessageNotification.type, { type: MessageType.Info, message: `slipbox: ${n.rel}'s context, ${b.items.length} file${b.items.length === 1 ? "" : "s"}: ${how}` });
    if (this.showsDocuments) void this.connection.window.showDocument({ uri: pathToFileURL(file).href, takeFocus: true });
  }

  /** A question for every served vault, the answers together; a vault that fails is logged and skipped. */
  private everywhere<T>(answer: (g: Graph) => T[]): T[] {
    for (const d of this.documents.all()) this.fresh(d.uri);
    const out: T[] = [];
    for (const s of this.vaults.values()) {
      try {
        out.push(...answer(s.graph));
      } catch (err) {
        this.log(`${s.loc.root}: ${(err as Error).stack ?? err}`);
      }
    }
    return out;
  }

  /** A line of a note: the editor's document's, else the file's. */
  private lineOf(uri: string, g: Graph, rel: string, line: number): string {
    const doc = this.documents.get(uri);
    const text = doc ? doc.getText({ start: { line, character: 0 }, end: { line: line + 1, character: 0 } }) : (g.textOf(rel) ?? "").split("\n")[line] ?? "";
    return text.replace(/\r?\n$/, "");
  }

  /** A message for the editor's log (never a pop-up: these are slipbox's, not the user's doing). */
  log(text: string): void {
    void this.connection.console.log(`slipbox: ${text}`);
  }

  /** The vault's notes parsed a little at a time, between requests: titles, aliases and headings
   *  for completion, without a first request waiting on the whole vault. */
  private parseInBackground(graph: Graph): void {
    const later = () => (setTimeout(step, 0) as { unref?: () => void }).unref?.();
    const step = () => {
      if (!this.done && graph.parseSome(20) > 0) later();
    };
    later();
  }

  /** The editor that started this gone (its process id no longer there): end, as it would have. */
  private watchParent(pid: number | null): void {
    if (typeof pid !== "number" || this.parentWatch) return;
    this.parentWatch = setInterval(() => {
      try {
        process.kill(pid, 0);
      } catch {
        this.exit(this.shutdown ? 0 : 1);
      }
    }, 3000);
    (this.parentWatch as { unref?: () => void }).unref?.();
  }

  /** The session over: watchers closed, the connection ended, the exit code given. */
  exit(code: number): void {
    if (this.done) return;
    this.done = true;
    if (this.parentWatch) clearInterval(this.parentWatch);
    for (const t of this.settling.values()) clearTimeout(t);
    for (const t of this.republishing.values()) clearTimeout(t);
    for (const s of this.vaults.values()) {
      s.watcher?.close();
      s.feed.close();
    }
    try {
      this.connection.dispose();
    } catch {}
    this.finish(code);
  }
}

/** How long typing pauses before an open note's text is parsed again. */
const SETTLE_MS = 150;

function known(g: Graph): Map<string, number> {
  return new Map([...g.notes.values()].map((n) => [n.rel, n.mtimeMs] as [string, number]));
}

function sizes(g: Graph): Map<string, number> {
  return new Map([...g.notes.values()].map((n) => [n.rel, n.size] as [string, number]));
}

/** A `file:` URI's path; null for any other scheme. */
export function pathOf(uri: string): string | null {
  if (!uri.startsWith("file:")) return null;
  try {
    return fileURLToPath(uri);
  } catch {
    return null;
  }
}

/** Serve on these streams until the editor ends the session; the exit code. */
export function runLsp(opts: LspOptions): Promise<number> {
  return new LspServer(opts).exited;
}
