// One language server, as slipbox's client (plan 19.1): started on stdio, told about the files open
// in it, asked for what it knows, stopped. Diagnostics come both ways — sent by older servers, asked
// for (`textDocument/diagnostic`, LSP 3.17) from newer ones — and a server's settings are answered
// from its config (`workspace/configuration`), since some do nothing without them (decisions, 11.1).

import { type ChildProcess, spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  type ClientCapabilities,
  createProtocolConnection,
  type Diagnostic,
  DidChangeConfigurationNotification,
  DidChangeTextDocumentNotification,
  DidCloseTextDocumentNotification,
  DidOpenTextDocumentNotification,
  DidSaveTextDocumentNotification,
  DocumentDiagnosticRequest,
  ExitNotification,
  InitializedNotification,
  InitializeRequest,
  LogMessageNotification,
  type ProtocolConnection,
  PublishDiagnosticsNotification,
  type ServerCapabilities,
  type WorkspaceEdit,
  ShowMessageNotification,
  ShutdownRequest,
  StreamMessageReader,
  StreamMessageWriter,
} from "vscode-languageserver-protocol/node";
import { VERSION } from "../../version.ts";

/** How to start a server, and what to tell it. */
export interface ServerSpec {
  /** Its name, as the config and the messages say it. */
  name: string;
  /** The program and its arguments. */
  argv: string[];
  /** Added to the environment it runs in. */
  env?: Record<string, string>;
  /** Its settings: what `workspace/configuration` asks for, and `didChangeConfiguration` sends. */
  settings?: Record<string, unknown>;
  /** Sent with `initialize`, for servers that read their options there. */
  initOptions?: unknown;
  /** The project's top folder (absolute): its workspace. */
  root: string;
}

export type ClientState = "starting" | "running" | "stopping" | "stopped" | "failed";

export interface ClientHooks {
  /** A document's diagnostics, as the server has them now (sent or asked for). */
  diagnostics?: (uri: string, diagnostics: Diagnostic[], version: number | null) => void;
  /** What the server says for the user's log. */
  log?: (message: string) => void;
  /** It ended after it was running: asked to (`expected`), or it crashed; a start that fails rejects start() instead. */
  exited?: (expected: boolean, why: string) => void;
  /** An edit it asks slipbox to make (after a command it was told to run): true when it was. */
  applyEdit?: (edit: WorkspaceEdit) => boolean;
}

/** The parts of a client's capabilities slipbox uses: what a server may count on. */
export const CLIENT_CAPABILITIES: ClientCapabilities = {
  general: { positionEncodings: ["utf-16"] },
  textDocument: {
    synchronization: { didSave: true, dynamicRegistration: false },
    publishDiagnostics: { relatedInformation: false, versionSupport: true, codeDescriptionSupport: true },
    diagnostic: { dynamicRegistration: true, relatedDocumentSupport: false },
    hover: { contentFormat: ["markdown", "plaintext"] },
    definition: { linkSupport: false },
    references: {},
    documentSymbol: { hierarchicalDocumentSymbolSupport: true },
    rename: { prepareSupport: true },
    codeAction: {
      codeActionLiteralSupport: { codeActionKind: { valueSet: ["", "quickfix", "refactor", "refactor.extract", "refactor.inline", "refactor.rewrite", "source", "source.organizeImports", "source.fixAll"] } },
      isPreferredSupport: true,
      disabledSupport: true,
      resolveSupport: { properties: ["edit"] },
    },
    formatting: {},
    completion: { completionItem: { snippetSupport: false, documentationFormat: ["markdown", "plaintext"], labelDetailsSupport: true }, contextSupport: true },
    signatureHelp: { signatureInformation: { documentationFormat: ["markdown", "plaintext"], parameterInformation: { labelOffsetSupport: true }, activeParameterSupport: true } },
  },
  workspace: { configuration: true, workspaceFolders: true, didChangeConfiguration: { dynamicRegistration: false }, applyEdit: true, workspaceEdit: { documentChanges: true }, symbol: { resolveSupport: { properties: ["location.range"] } } },
  window: { workDoneProgress: true },
};

/** A setting looked up by a dotted section (`css`, `python.analysis`); everything for none. */
export function settingAt(settings: Record<string, unknown> | undefined, section: string | undefined): unknown {
  if (!section) return settings ?? null;
  let at: unknown = settings;
  for (const key of section.split(".")) {
    if (!at || typeof at !== "object") return null;
    at = (at as Record<string, unknown>)[key];
  }
  return at ?? null;
}

export class LanguageClient {
  state: ClientState = "starting";
  capabilities: ServerCapabilities | null = null;
  /** What the server calls itself. */
  serverInfo: { name: string; version?: string } | null = null;
  private child: ChildProcess | null = null;
  private conn: ProtocolConnection | null = null;
  /** Each open document's version, by URI. */
  private readonly open = new Map<string, number>();
  /** Methods the server registered itself for later (`client/registerCapability`). */
  private readonly registered = new Set<string>();
  private stderr = "";

  constructor(
    readonly spec: ServerSpec,
    private readonly hooks: ClientHooks = {},
  ) {}

  /** The server started and initialized; rejects when it can't start or answer. */
  async start(timeoutMs = 20_000): Promise<void> {
    const [cmd, ...args] = this.spec.argv;
    if (!cmd) throw new Error(`${this.spec.name}: no command`);
    const child = spawn(cmd, args, { cwd: this.spec.root, env: { ...process.env, ...this.spec.env }, stdio: ["pipe", "pipe", "pipe"] });
    this.child = child;
    const failed = new Promise<never>((_, reject) => {
      child.once("error", (err) => reject(new Error(`${this.spec.name} can't start: ${err.message}`)));
      // On close, not exit: its last words on stderr have arrived by then.
      child.once("close", (code, signal) => reject(new Error(`${this.spec.name} exited before it was ready (${signal ?? `code ${code}`})${this.stderrTail()}`)));
    });
    // Its stderr, kept short: said when it fails, never on the screen.
    child.stderr!.on("data", (d) => (this.stderr = (this.stderr + d).slice(-4000)));
    child.on("close", (code, signal) => this.ended(code, signal));
    const conn = createProtocolConnection(new StreamMessageReader(child.stdout!), new StreamMessageWriter(child.stdin!));
    this.conn = conn;
    this.listen(conn);
    conn.listen();
    const init = conn.sendRequest(InitializeRequest.type, {
      processId: process.pid,
      clientInfo: { name: "slipbox", version: VERSION },
      rootUri: uriOf(this.spec.root),
      rootPath: this.spec.root,
      workspaceFolders: [{ uri: uriOf(this.spec.root), name: this.spec.root.split("/").pop() ?? this.spec.root }],
      capabilities: CLIENT_CAPABILITIES,
      initializationOptions: this.spec.initOptions ?? null,
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${this.spec.name} didn't answer initialize in ${timeoutMs / 1000} s`)), timeoutMs);
    });
    try {
      const result = await Promise.race([init, failed, late]);
      this.capabilities = result.capabilities;
      this.serverInfo = result.serverInfo ?? null;
    } catch (err) {
      this.state = "failed";
      child.kill();
      throw err;
    } finally {
      clearTimeout(timer);
    }
    failed.catch(() => {}); // from here on, an exit is `ended`'s to report
    await conn.sendNotification(InitializedNotification.type, {});
    if (this.spec.settings) await conn.sendNotification(DidChangeConfigurationNotification.type, { settings: this.spec.settings });
    // It may have gone in the moment after it answered: still a start that failed, not a crash.
    if (this.state === "failed") throw new Error(`${this.spec.name} exited before it was ready${this.stderrTail()}`);
    if (this.state === "starting") this.state = "running";
  }

  private listen(conn: ProtocolConnection): void {
    conn.onNotification(PublishDiagnosticsNotification.type, (p) => {
      this.hooks.diagnostics?.(p.uri, p.diagnostics, p.version ?? null);
    });
    conn.onNotification(LogMessageNotification.type, (p) => {
      this.hooks.log?.(`${this.spec.name}: ${p.message}`);
    });
    conn.onNotification(ShowMessageNotification.type, (p) => {
      this.hooks.log?.(`${this.spec.name}: ${p.message}`);
    });
    conn.onRequest("workspace/configuration", (p: { items: { section?: string }[] }) => p.items.map((i) => settingAt(this.spec.settings, i.section)));
    conn.onRequest("workspace/workspaceFolders", () => [{ uri: uriOf(this.spec.root), name: this.spec.root }]);
    conn.onRequest("client/registerCapability", (p: { registrations: { method: string }[] }) => {
      for (const r of p.registrations) this.registered.add(r.method);
      return null;
    });
    conn.onRequest("client/unregisterCapability", (p: { unregisterations: { method: string }[] }) => {
      for (const r of p.unregisterations) this.registered.delete(r.method);
      return null;
    });
    conn.onRequest("window/workDoneProgress/create", () => null);
    conn.onRequest("window/showMessageRequest", () => null);
    // An edit it asks to make (a code action's command did): slipbox makes it, through its own writes.
    conn.onRequest("workspace/applyEdit", (p: { edit: WorkspaceEdit }): { applied: boolean; failureReason?: string } => {
      const applied = this.hooks.applyEdit?.(p.edit) ?? false;
      return applied ? { applied } : { applied, failureReason: "slipbox couldn't apply it" };
    });
    // Asked to ask again (a pull server's settings or files changed): every open file's diagnostics.
    conn.onRequest("workspace/diagnostic/refresh", () => {
      for (const uri of this.open.keys()) void this.pull(uri);
      return null;
    });
    // Some work of the server's done (its workspace loaded, its index built): a server that waits to be
    // asked is asked again — rust-analyzer's first answer, before its workspace loads, is empty, and
    // without `cargo check` (a root you don't trust, 23.4) nothing else would ask it after.
    conn.onNotification("$/progress", (p: { token?: string | number; value?: { kind?: string } }) => {
      if (p?.value?.kind === "begin") this.working.add(String(p.token));
      if (p?.value?.kind !== "end") return;
      this.working.delete(String(p.token));
      if (this.pullsDiagnostics) this.pullSoon();
    });
    conn.onNotification("telemetry/event", () => {});
    // Anything else asked of slipbox — another refresh, a feature it doesn't have — gets an empty
    // answer, never an error: some servers crash on an error they don't expect (pyright did).
    // (The connection takes a handler for any method; the protocol's types leave that out.)
    (conn as unknown as { onRequest(h: (method: string) => null): void }).onRequest((method) => {
      this.hooks.log?.(`${this.spec.name}: asked ${method}, which slipbox doesn't answer`);
      return null;
    });
  }

  /** Its work in progress, by token (`$/progress` begun, not ended): loading a workspace, indexing. */
  private readonly working = new Set<string>();
  /** Whether it says it's still at some work: what it has said of a file may not be all yet. */
  get busy(): boolean {
    return this.working.size > 0;
  }

  private pullTimer: ReturnType<typeof setTimeout> | null = null;
  /** Every open file's diagnostics asked for again in a moment: work ending in a burst asks once. */
  private pullSoon(): void {
    if (this.pullTimer) clearTimeout(this.pullTimer);
    this.pullTimer = setTimeout(() => {
      this.pullTimer = null;
      for (const uri of this.open.keys()) void this.pull(uri);
    }, 100);
    (this.pullTimer as { unref?: () => void }).unref?.();
  }

  /** Whether the server wants to be asked for a document's diagnostics (pull, 3.17). */
  get pullsDiagnostics(): boolean {
    return !!this.capabilities?.diagnosticProvider || this.registered.has("textDocument/diagnostic");
  }

  isOpen(uri: string): boolean {
    return this.open.has(uri);
  }

  /** A document opened in it, with its text. */
  async didOpen(uri: string, languageId: string, version: number, text: string): Promise<void> {
    if (this.state !== "running") return;
    this.open.set(uri, version);
    await this.conn!.sendNotification(DidOpenTextDocumentNotification.type, { textDocument: { uri, languageId, version, text } });
    void this.pull(uri);
  }

  /** Its text now, whole: every server takes a full change, whatever it asked for. */
  async didChange(uri: string, version: number, text: string): Promise<void> {
    if (this.state !== "running" || !this.open.has(uri)) return;
    this.open.set(uri, version);
    await this.conn!.sendNotification(DidChangeTextDocumentNotification.type, { textDocument: { uri, version }, contentChanges: [{ text }] });
    void this.pull(uri);
  }

  async didSave(uri: string, text?: string): Promise<void> {
    if (this.state !== "running" || !this.open.has(uri)) return;
    const sync = this.capabilities?.textDocumentSync;
    const withText = typeof sync === "object" && typeof sync.save === "object" && sync.save.includeText;
    await this.conn!.sendNotification(DidSaveTextDocumentNotification.type, { textDocument: { uri }, ...(withText && text !== undefined ? { text } : {}) });
    void this.pull(uri);
  }

  async didClose(uri: string): Promise<void> {
    if (!this.open.delete(uri) || this.state !== "running") return;
    await this.conn!.sendNotification(DidCloseTextDocumentNotification.type, { textDocument: { uri } });
  }

  /** A document's diagnostics asked for, when the server wants that, and handed on. */
  async pull(uri: string): Promise<void> {
    if (!this.pullsDiagnostics || this.state !== "running") return;
    const version = this.open.get(uri) ?? null;
    try {
      const r = await this.conn!.sendRequest(DocumentDiagnosticRequest.type, { textDocument: { uri } });
      // A newer text was sent meanwhile: its own pull answers for it.
      if (this.open.get(uri) !== version) return;
      if (r.kind === "full") this.hooks.diagnostics?.(uri, r.items, version);
    } catch (err) {
      this.hooks.log?.(`${this.spec.name}: diagnostics for ${uri}: ${(err as Error).message}`);
    }
  }

  /** Any request; null when the server isn't running or fails it. */
  async request<R>(method: string, params: unknown): Promise<R | null> {
    if (this.state !== "running") return null;
    try {
      return (await this.conn!.sendRequest(method, params)) as R;
    } catch (err) {
      this.hooks.log?.(`${this.spec.name}: ${method}: ${(err as Error).message}`);
      return null;
    }
  }

  /** Asked to end: shutdown, then exit; killed if it hasn't gone in a moment. */
  async stop(timeoutMs = 2000): Promise<void> {
    if (this.state === "stopped" || this.state === "failed" || !this.child) return;
    this.state = "stopping";
    const child = this.child;
    const gone = new Promise<void>((done) => (this.state === "stopped" ? done() : child.once("close", () => done())));
    try {
      await Promise.race([this.conn!.sendRequest(ShutdownRequest.type), new Promise((r) => setTimeout(r, timeoutMs))]);
      await this.conn!.sendNotification(ExitNotification.type);
    } catch {}
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    await gone;
    clearTimeout(timer);
  }

  /** Killed now, not asked: slipbox is exiting and can't wait for it. */
  kill(): void {
    if (!this.child || this.state === "stopped" || this.state === "failed") return;
    this.state = "stopping";
    this.child.kill();
  }

  private ended(code: number | null, signal: string | null): void {
    this.open.clear();
    // It never got running: start() rejects and says why, once. Not a crash, so not started again.
    if (this.state === "starting" || this.state === "failed") {
      this.state = "failed";
      try {
        this.conn?.dispose();
      } catch {}
      return;
    }
    const expected = this.state === "stopping";
    this.state = "stopped";
    try {
      this.conn?.dispose();
    } catch {}
    this.hooks.exited?.(expected, expected ? "stopped" : `it exited (${signal ?? `code ${code}`})${this.stderrTail()}`);
  }

  /** Why it ended, from its stderr: its last error line, else its last line. */
  private stderrTail(): string {
    const lines = this.stderr.trim().split("\n").map((l) => l.trim()).filter(Boolean);
    const last = lines.findLast((l) => /\b(error|panic|exception|fatal)\b/i.test(l)) ?? lines.at(-1);
    return last ? `: ${last.slice(0, 300)}` : "";
  }
}

/** A path's `file:` URI. */
function uriOf(path: string): string {
  return pathToFileURL(path).href;
}
