// One language server, as slipbox's client (plan 19.1): started on stdio, told about the files open
// in it, asked for what it knows, stopped. Diagnostics come both ways — sent by older servers, asked
// for (`textDocument/diagnostic`, LSP 3.17) from newer ones — and a server's settings are answered
// from its config (`workspace/configuration`), since some do nothing without them (decisions, 11.1).

import { type ChildProcess, spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  CancellationTokenSource,
  type ClientCapabilities,
  createProtocolConnection,
  type Diagnostic,
  DidChangeConfigurationNotification,
  DidChangeTextDocumentNotification,
  DidCloseTextDocumentNotification,
  DidOpenTextDocumentNotification,
  DidSaveTextDocumentNotification,
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
import { VERSION } from "../../../version.ts";
import { FramingError, ServerTransport } from "./transport.ts";
import { serverPath } from "./find.ts";
import { MAX_REQUEST_BYTES, MAX_UNANSWERED, PULL_FANOUT, RequestGate, keptDiagnostics } from "./limits.ts";

/** How long a request waits for its answer, unless said otherwise: then it's cancelled, the server left running. */
export const REQUEST_DEADLINE_MS = 10_000;
/** A diagnostics pull's: asked for in the background, while a server may still be at its first analysis. */
export const PULL_DEADLINE_MS = 60_000;
/** Requests whose callers see to a stale answer themselves (what's asked last stands): one for an older text of the
 *  file still answers them — a signature typed into keeps its help. */
const OWN_STALENESS = new Set(["textDocument/completion", "textDocument/signatureHelp"]);

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
  /** How long every request waits for its answer (`slipbox diagnostics --timeout`); else REQUEST_DEADLINE_MS, and
   *  PULL_DEADLINE_MS for a pull. */
  timeoutMs?: number;
}

export type ClientState = "starting" | "running" | "stopping" | "stopped" | "failed";

export interface ClientHooks {
  /** A document's diagnostics, as the server has them now (sent or asked for). */
  diagnostics?: (uri: string, diagnostics: Diagnostic[], version: number | null) => void;
  /** What the server says for the user's log. */
  log?: (message: string) => void;
  /** What the user should know of the client's limits: a request not answered in time, the requests waiting their
   *  turn, an answer's diagnostics left out — each said once while the server runs. */
  notice?: (message: string) => void;
  /** It ended after it was running: asked to (`expected`), it crashed, or slipbox stopped it (`stoppedByClient`: what
   *  it sent couldn't be read); a start that fails rejects start() instead. */
  exited?: (expected: boolean, why: string, stoppedByClient?: boolean) => void;
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
      codeActionLiteralSupport: {
        codeActionKind: {
          valueSet: [
            "",
            "quickfix",
            "refactor",
            "refactor.extract",
            "refactor.inline",
            "refactor.rewrite",
            "source",
            "source.organizeImports",
            "source.fixAll",
          ],
        },
      },
      isPreferredSupport: true,
      disabledSupport: true,
      resolveSupport: { properties: ["edit"] },
    },
    formatting: {},
    completion: {
      completionItem: {
        snippetSupport: true,
        documentationFormat: ["markdown", "plaintext"],
        labelDetailsSupport: true,
      },
      contextSupport: true,
    },
    signatureHelp: {
      signatureInformation: {
        documentationFormat: ["markdown", "plaintext"],
        parameterInformation: { labelOffsetSupport: true },
        activeParameterSupport: true,
      },
    },
  },
  workspace: {
    configuration: true,
    workspaceFolders: true,
    didChangeConfiguration: { dynamicRegistration: false },
    applyEdit: true,
    workspaceEdit: { documentChanges: true },
    symbol: { resolveSupport: { properties: ["location.range"] } },
  },
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
  private readonly closedDocuments = new Set<string>();
  /** Methods the server registered itself for later (`client/registerCapability`). */
  private readonly registered = new Set<string>();
  private stderr = "";
  /** Each request not yet settled, by its key: what settles it, unanswered (the server stopping, or gone). */
  private readonly requests = new Map<symbol, () => void>();
  /** The requests on the wire, and those waiting their turn (limits.ts). */
  private readonly gate = new RequestGate();
  /** The latest of a kind of request about a file (a hover, a completion): what cancels it when a newer one comes. */
  private readonly latestRequests = new Map<string, () => void>();
  /** Each file's pull on its way: the text it asks about, what aborts it, its settling. */
  private readonly pulls = new Map<
    string,
    { version: number | null; abort: AbortController; promise: Promise<void> }
  >();
  /** Pulls on the wire, and those waiting for one of them to settle: PULL_FANOUT at a time. */
  private pullsGoing = 0;
  private readonly pullQueue: (() => void)[] = [];
  /** The notices said while it runs: each once. */
  private readonly noticed = new Set<string>();
  /** Why slipbox stopped it, when slipbox did: what it sent couldn't be read. */
  private stoppedFor: string | null = null;
  /** Its connection closed (its output ended, or slipbox let go of it): nothing more can be sent, a cancel neither. */
  private disconnected = false;

  /** Something for the user, once while it runs (`key`). */
  private notice(key: string, text: string): void {
    if (this.noticed.has(key)) return;
    this.noticed.add(key);
    this.hooks.notice?.(`${this.spec.name}: ${text}`);
  }

  /**
   * What it sent can't be read (its framing broken, a message over the limits): nothing after it can be either, so it
   * is stopped, and its manager decides about starting it again. The only thing that stops a server here.
   */
  private protocolFailure(why: string): void {
    if (this.state === "stopped" || this.state === "failed") return;
    this.stoppedFor = why;
    this.disconnected = true;
    try {
      this.conn?.dispose();
    } catch {}
    this.child?.kill("SIGKILL");
    // Its pipes closed now: a helper it started may hold them open, and its exit must not wait for that.
    this.child?.stdin?.destroy();
    this.child?.stdout?.destroy();
    this.child?.stderr?.destroy();
    this.ended(null, "SIGKILL");
  }

  /** A file's diagnostics, sent or asked for: for its current text, well formed, within the limits (limits.ts). */
  private diagnostics(uri: string, list: unknown, version: number | null): void {
    const current = this.open.get(uri);
    if (this.closedDocuments.has(uri) || (version !== null && current !== undefined && current !== version)) return;
    const { kept, invalid, limited } = keptDiagnostics(list);
    if (invalid) this.notice("invalid", `left out diagnostics it sent malformed (${uri})`);
    if (!Array.isArray(list)) return;
    if (limited)
      this.notice(
        `limited ${uri}`,
        `kept the first ${kept.length} of ${list.length} diagnostics for ${uri} (the ${limited === "count" ? "count" : "size"} slipbox keeps)`,
      );
    this.hooks.diagnostics?.(uri, kept, version);
  }

  constructor(
    readonly spec: ServerSpec,
    private readonly hooks: ClientHooks = {},
  ) {}

  /** The server started and initialized; rejects when it can't start or answer. */
  async start(timeoutMs = 20_000): Promise<void> {
    const [cmd, ...args] = this.spec.argv;
    if (!cmd) throw new Error(`${this.spec.name}: no command`);
    const env = { ...process.env, ...this.spec.env };
    // Mason's `bin` after yours: a server finds the helpers Mason installed beside it (D222).
    env.PATH = serverPath(env.PATH);
    const child = spawn(cmd, args, { cwd: this.spec.root, env, stdio: ["pipe", "pipe", "pipe"] });
    this.child = child;
    const failed = new Promise<never>((_, reject) => {
      child.once("error", (err) => reject(new Error(`${this.spec.name} can't start: ${err.message}`)));
      // On close, not exit: its last words on stderr have arrived by then.
      child.once("close", (code, signal) =>
        reject(
          new Error(`${this.spec.name} exited before it was ready (${signal ?? `code ${code}`})${this.stderrTail()}`),
        ),
      );
    });
    // Its stderr, kept short: said when it fails, never on the screen.
    child.stderr!.on("data", (d) => (this.stderr = (this.stderr + d).slice(-4000)));
    child.on("close", (code, signal) => this.ended(code, signal));
    const transport = new ServerTransport();
    // Its output ending mid-message is its exit, said by `close` with its own reason; anything else, a protocol error.
    transport.on("error", (error) => {
      if (!(error instanceof FramingError && error.atEnd)) this.protocolFailure(error.message);
    });
    child.stdout!.pipe(transport);
    const conn = createProtocolConnection(new StreamMessageReader(transport), new StreamMessageWriter(child.stdin!));
    this.conn = conn;
    conn.onClose(() => (this.disconnected = true));
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
      timer = setTimeout(
        () => reject(new Error(`${this.spec.name} didn't answer initialize in ${timeoutMs / 1000} s`)),
        timeoutMs,
      );
    });
    try {
      const result = await Promise.race([init, failed, late]);
      this.capabilities = result.capabilities;
      this.serverInfo = result.serverInfo ?? null;
    } catch (err) {
      this.state = "failed";
      // A failed start has no manager-owned running client to stop it later. Close it now, even if it ignores TERM
      // or a helper keeps its output pipes open; ended() clears requests and disposes the protocol connection.
      child.kill("SIGKILL");
      child.stdin?.destroy();
      child.stdout?.destroy();
      child.stderr?.destroy();
      this.ended(null, "SIGKILL");
      if (this.stoppedFor)
        throw new Error(`${this.spec.name} stopped before it was ready: protocol error (${this.stoppedFor})`);
      throw err;
    } finally {
      clearTimeout(timer);
    }
    failed.catch(() => {}); // from here on, an exit is `ended`'s to report
    await conn.sendNotification(InitializedNotification.type, {});
    if (this.spec.settings)
      await conn.sendNotification(DidChangeConfigurationNotification.type, { settings: this.spec.settings });
    // It may have gone in the moment after it answered: still a start that failed, not a crash.
    if (this.state === "failed") throw new Error(`${this.spec.name} exited before it was ready${this.stderrTail()}`);
    if (this.state === "starting") this.state = "running";
  }

  private listen(conn: ProtocolConnection): void {
    conn.onNotification(PublishDiagnosticsNotification.type, (p) => {
      this.diagnostics(p.uri, p.diagnostics, p.version ?? null);
    });
    conn.onNotification(LogMessageNotification.type, (p) => {
      this.hooks.log?.(`${this.spec.name}: ${p.message}`);
    });
    conn.onNotification(ShowMessageNotification.type, (p) => {
      this.hooks.log?.(`${this.spec.name}: ${p.message}`);
    });
    conn.onRequest("workspace/configuration", (p: { items: { section?: string }[] }) =>
      p.items.map((i) => settingAt(this.spec.settings, i.section)),
    );
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
    conn.onRequest(
      "workspace/applyEdit",
      (p: { edit: WorkspaceEdit }): { applied: boolean; failureReason?: string } => {
        const applied = this.hooks.applyEdit?.(p.edit) ?? false;
        return applied ? { applied } : { applied, failureReason: "slipbox couldn't apply it" };
      },
    );
    // Asked to ask again (a pull server's settings or files changed): every open file's diagnostics, afresh.
    conn.onRequest("workspace/diagnostic/refresh", () => {
      this.pullAll();
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
      this.pullAll();
    }, 100);
    (this.pullTimer as { unref?: () => void }).unref?.();
  }

  /** Every open file's diagnostics asked for afresh: the server's state changed, not their texts. */
  private pullAll(): void {
    for (const uri of this.open.keys()) void this.pull(uri, true);
  }

  /** A pull's turn: PULL_FANOUT at a time — many files asked about at once (a refresh, a restart telling them all
   *  again) are no burst of requests. */
  private async pullTurn(): Promise<void> {
    if (this.pullsGoing < PULL_FANOUT) {
      this.pullsGoing++;
      return;
    }
    await new Promise<void>((go) => this.pullQueue.push(go));
  }

  /** A pull settled: its turn handed to the next waiting. */
  private pullDone(): void {
    const next = this.pullQueue.shift();
    if (next) next();
    else this.pullsGoing--;
  }

  /** A notification sent. One that can't be written once the server has gone (stopped, failed) is dropped, not
   *  thrown: its exit says what happened, and the callers don't wait on it. */
  private async notify(send: (conn: ProtocolConnection) => Promise<void>): Promise<void> {
    try {
      await send(this.conn!);
    } catch (err) {
      if (this.state === "running") throw err;
    }
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
    this.closedDocuments.delete(uri);
    this.open.set(uri, version);
    await this.notify((c) =>
      c.sendNotification(DidOpenTextDocumentNotification.type, { textDocument: { uri, languageId, version, text } }),
    );
    void this.pull(uri);
  }

  /** Its text now, whole: every server takes a full change, whatever it asked for. */
  async didChange(uri: string, version: number, text: string): Promise<void> {
    if (this.state !== "running" || !this.open.has(uri)) return;
    this.open.set(uri, version);
    await this.notify((c) =>
      c.sendNotification(DidChangeTextDocumentNotification.type, {
        textDocument: { uri, version },
        contentChanges: [{ text }],
      }),
    );
    void this.pull(uri);
  }

  async didSave(uri: string, text?: string): Promise<void> {
    if (this.state !== "running" || !this.open.has(uri)) return;
    const sync = this.capabilities?.textDocumentSync;
    const withText = typeof sync === "object" && typeof sync.save === "object" && sync.save.includeText;
    await this.notify((c) =>
      c.sendNotification(DidSaveTextDocumentNotification.type, {
        textDocument: { uri },
        ...(withText && text !== undefined ? { text } : {}),
      }),
    );
    // Saved, a server may find more (a check it runs on save): asked afresh, even for the same text.
    void this.pull(uri, true);
  }

  async didClose(uri: string): Promise<void> {
    this.pulls.get(uri)?.abort.abort();
    this.pulls.delete(uri);
    if (!this.open.delete(uri) || this.state !== "running") return;
    this.closedDocuments.add(uri);
    if (this.closedDocuments.size > 2048) this.closedDocuments.delete(this.closedDocuments.values().next().value!);
    await this.notify((c) => c.sendNotification(DidCloseTextDocumentNotification.type, { textDocument: { uri } }));
  }

  /**
   * A document's diagnostics asked for, when the server wants that, and handed on. Asked again for the same text,
   * the answer on its way serves; asked `fresh` — the server's state changed, not the text (a save, its work done, its
   * refresh) — the pull on its way is given up and a new one asked: the newest state's answer is the one that stands.
   */
  async pull(uri: string, fresh = false): Promise<void> {
    if (!this.pullsDiagnostics || this.state !== "running" || !this.open.has(uri)) return;
    const version = this.open.get(uri) ?? null;
    const prior = this.pulls.get(uri);
    if (prior?.version === version && !fresh) return prior.promise;
    prior?.abort.abort();
    const abort = new AbortController();
    const promise = (async () => {
      await this.pullTurn();
      try {
        if (abort.signal.aborted) return;
        const result = await this.request<{ kind: string; items: Diagnostic[] }>(
          "textDocument/diagnostic",
          { textDocument: { uri } },
          { signal: abort.signal, timeoutMs: this.spec.timeoutMs ?? PULL_DEADLINE_MS },
        );
        if (!abort.signal.aborted && result?.kind === "full" && this.open.get(uri) === version)
          this.diagnostics(uri, result.items, version);
      } finally {
        this.pullDone();
      }
    })().finally(() => {
      if (this.pulls.get(uri)?.abort === abort) this.pulls.delete(uri);
    });
    this.pulls.set(uri, { version, abort, promise });
    return promise;
  }

  /**
   * Any request: its answer, or null — the server not running, a failure, given up on (the caller's `signal`, a newer
   * request of its kind about the file, the deadline), or about an older text of the file than now. Given up on, it's
   * cancelled (`$/cancelRequest`) and the server left running; past MAX_UNANSWERED, it waits its turn (limits.ts).
   */
  async request<R>(
    method: string,
    params: unknown,
    options: { signal?: AbortSignal; timeoutMs?: number } = {},
  ): Promise<R | null> {
    if (this.state !== "running" || options.signal?.aborted) return null;
    let bytes: number;
    try {
      bytes = JSON.stringify(params ?? null).length * 2;
    } catch {
      return null;
    }
    if (bytes > MAX_REQUEST_BYTES) {
      this.notice(`too big ${method}`, `${method} not sent: its parameters are over the 8 MiB slipbox sends`);
      return null;
    }
    const uri = (params as { textDocument?: { uri?: string } } | null)?.textDocument?.uri;
    const version = uri ? this.open.get(uri) : undefined;
    const key = Symbol(method);
    const token = new CancellationTokenSource();
    // Settled with no answer: given up on (`cancel`: the server told, `$/cancelRequest`), or the server stopping or
    // gone (`settle`: nothing to tell it, or no way to).
    let settle!: () => void;
    const stopped = new Promise<null>((resolve) => (settle = () => resolve(null)));
    const cancel = () => {
      if (!this.disconnected) token.cancel();
      settle();
    };
    const latest =
      uri && ["textDocument/completion", "textDocument/hover", "textDocument/signatureHelp"].includes(method)
        ? `${method}:${uri}`
        : null;
    if (latest) {
      this.latestRequests.get(latest)?.();
      this.latestRequests.set(latest, cancel);
    }
    this.requests.set(key, settle);
    options.signal?.addEventListener("abort", cancel, { once: true });
    const ms = options.timeoutMs ?? this.spec.timeoutMs ?? REQUEST_DEADLINE_MS;
    const timer = setTimeout(() => {
      this.notice(`deadline ${method}`, `no answer to ${method} in ${ms / 1000} s: it was cancelled`);
      cancel();
    }, ms);
    (timer as { unref?: () => void }).unref?.();
    let sent = false;
    try {
      const turn = this.gate.enter(key, bytes);
      if (turn !== true) {
        this.notice("waiting", `${MAX_UNANSWERED} requests unanswered: the next ones wait their turn`);
        if ((await Promise.race([turn.then(() => true), stopped])) !== true || this.state !== "running") return null;
      }
      const response = this.conn!.sendRequest(method, params, token.token);
      sent = true;
      const answered = () => this.gate.release(key);
      response.then(answered, answered);
      const result = await Promise.race([response, stopped]);
      if (uri && !OWN_STALENESS.has(method) && this.open.get(uri) !== version) return null;
      return result as R | null;
    } catch (error) {
      if (this.state === "running") this.hooks.log?.(`${this.spec.name}: ${method}: ${(error as Error).message}`);
      return null;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", cancel);
      this.requests.delete(key);
      // Sent: on the wire until answered, or the grace period after it was given up on. Not: its place given back.
      if (sent) this.gate.cancel(key);
      else this.gate.release(key);
      if (latest && this.latestRequests.get(latest) === cancel) this.latestRequests.delete(latest);
      token.dispose();
    }
  }

  /** Asked to end: shutdown, then exit; killed if it hasn't gone in a moment. */
  async stop(timeoutMs = 2000): Promise<void> {
    if (this.state === "stopped" || this.state === "failed" || !this.child) return;
    this.state = "stopping";
    for (const settle of this.requests.values()) settle();
    const child = this.child;
    let shutdownTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.conn!.sendRequest(ShutdownRequest.type),
        new Promise((resolve) => {
          shutdownTimer = setTimeout(resolve, timeoutMs);
        }),
      ]);
      void this.conn!.sendNotification(ExitNotification.type).catch(() => {});
    } catch {
    } finally {
      clearTimeout(shutdownTimer);
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        child.stdin?.destroy();
        child.stdout?.destroy();
        child.stderr?.destroy();
        this.ended(null, "SIGKILL");
        resolve();
      }, timeoutMs);
      child.once("close", () => {
        clearTimeout(timer);
        resolve();
      });
      if (this.state === "stopped") {
        clearTimeout(timer);
        resolve();
      }
    });
  }

  /** Killed now, not asked: slipbox is exiting and can't wait for it. */
  kill(): void {
    if (!this.child || this.state === "stopped" || this.state === "failed") return;
    this.state = "stopping";
    this.child.kill();
  }

  private ended(code: number | null, signal: string | null): void {
    if (this.state === "stopped") return;
    this.disconnected = true;
    this.open.clear();
    this.closedDocuments.clear();
    if (this.pullTimer) clearTimeout(this.pullTimer);
    this.pullTimer = null;
    for (const entry of this.pulls.values()) entry.abort.abort();
    this.pulls.clear();
    // Those waiting their turn go now, each to find itself aborted.
    for (const go of this.pullQueue.splice(0)) {
      this.pullsGoing++;
      go();
    }
    for (const settle of this.requests.values()) settle();
    this.requests.clear();
    this.latestRequests.clear();
    this.gate.clear();
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
    if (expected) return this.hooks.exited?.(true, "stopped");
    if (this.stoppedFor) return this.hooks.exited?.(false, `protocol error (${this.stoppedFor})`, true);
    this.hooks.exited?.(false, `it exited (${signal ?? `code ${code}`})${this.stderrTail()}`);
  }

  /** Why it ended, from its stderr: its last error line, else its last line. */
  private stderrTail(): string {
    const lines = this.stderr
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const last = lines.findLast((l) => /\b(error|panic|exception|fatal)\b/i.test(l)) ?? lines.at(-1);
    return last ? `: ${last.slice(0, 300)}` : "";
  }
}

/** A path's `file:` URI. */
function uriOf(path: string): string {
  return pathToFileURL(path).href;
}
