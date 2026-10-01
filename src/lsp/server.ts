// slipbox's third face (plan 11.x): the vault served to editors over LSP — `slipbox lsp`, on stdio.
// The same core as the TUI and the CLI answers: one graph per vault, kept current by the watcher as
// the TUI's is. Vaults only (a folder with `.slipbox/`): a markdown file elsewhere is left to
// whatever else the editor runs there (marksman). Nothing but the protocol reaches stdout.

import { relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createConnection, type Connection, type InitializeParams, type InitializeResult, TextDocuments, TextDocumentSyncKind, type WatchDog } from "vscode-languageserver";
import { createProtocolConnection, StreamMessageReader, StreamMessageWriter } from "vscode-languageserver-protocol/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { type Config, loadConfig } from "../core/config.ts";
import { type Graph, openGraph } from "../core/graph.ts";
import { Reach } from "../core/reach.ts";
import { checkoutOf } from "../core/git.ts";
import { findVaultRoot, recordLocation, rootAt, type VaultLocation, vaultConfigPath } from "../core/vault.ts";
import { applyToGraph, VaultFeed } from "../core/vault-feed.ts";
import { VaultWatcher } from "../core/watch.ts";
import { VERSION } from "../version.ts";
import { definition, references } from "./features.ts";

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
      this.unsettle(e.document.uri);
      const n = this.noteOf(e.document.uri);
      n?.served.graph.overlay(n.rel, null);
    });
    this.documents.listen(this.connection);
    this.connection.onDefinition((p) => this.asked(p.textDocument.uri, (g, rel) => definition(g, rel, p.position), []));
    this.connection.onReferences((p) => this.asked(p.textDocument.uri, (g, rel) => references(g, rel, p.position, p.context.includeDeclaration), []));
    this.connection.listen();
  }

  /** The workspace folders the editor named (absolute paths). */
  private folders: string[] = [];

  private initialize(params: InitializeParams): InitializeResult {
    const uris = params.workspaceFolders?.map((f) => f.uri) ?? (params.rootUri ? [params.rootUri] : []);
    this.folders = uris.map(pathOf).filter((p): p is string => p !== null);
    return {
      capabilities: {
        textDocumentSync: { openClose: true, change: TextDocumentSyncKind.Incremental, save: { includeText: false } },
        workspace: { workspaceFolders: { supported: true } },
        definitionProvider: true,
        referencesProvider: true,
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

  /** An open document's text, standing for its note now: what a request about it needs. */
  fresh(uri: string): void {
    this.unsettle(uri);
    const doc = this.documents.get(uri);
    const n = this.noteOf(uri);
    if (doc && n) n.served.graph.overlay(n.rel, doc.getText());
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

  /** A message for the editor's log (never a pop-up: these are slipbox's, not the user's doing). */
  log(text: string): void {
    void this.connection.console.log(`slipbox: ${text}`);
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
