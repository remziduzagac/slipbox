// The servers of the files slipbox has open (plan 19.1): one client per server and project, started
// when a file first needs it — installed first when it's on npm and nowhere (19.5) — told about each
// file of its language in its project, and restarted after a crash, a few times. Its diagnostics
// become the file's problems (19.8), their positions the core's.

import { pathToFileURL, fileURLToPath } from "node:url";
import type { Diagnostic, WorkspaceEdit } from "vscode-languageserver-protocol";
import type { Problem, Severity } from "../diagnostics.ts";
import { LanguageClient } from "./client.ts";
import { isTrusted, trustOf } from "../trust.ts";
import { type Choice, chooseServers, type Found, findServer, rootFor } from "./find.ts";
import { installTool, lockKey } from "./install.ts";
import {
  does,
  type Feature,
  languageOf,
  type LanguageDef,
  projectAsks,
  type ServerDef,
  type ServerTable,
} from "./languages.ts";
import { mergeSettings, vscodeSettings, vscodeSettingsFile } from "./vscode.ts";

export interface ManagerOptions {
  /** Track initialization; cancellation stops this server before it becomes ready. */
  starting?: (label: string, cancel: () => void) => () => void;
  /** The servers and languages in effect (the config's over the built-in). */
  table: () => ServerTable;
  /** Yours alone — the built-in under your own config, no folder's: a server's settings in a root you
   *  don't trust (23.3). The table in effect when not given. */
  userTable?: () => ServerTable;
  /** Whether npm servers are installed when missing (`[lsp] auto_install`). */
  autoInstall: () => boolean;
  /** A file's problems from one server, for the text of `version` (null: the latest sent); `raw`, as the server gave them (a code action asks with them). */
  problems: (path: string, server: string, version: number | null, problems: Problem[], raw: Diagnostic[]) => void;
  /** An edit a server asks slipbox to make: true when it was. */
  applyEdit?: (edit: WorkspaceEdit) => boolean;
  /** Something for the user: a server installed, missing, or crashing; a request it didn't answer in time, its
   *  diagnostics cut short. */
  message: (level: "info" | "warn" | "error", text: string) => void;
  /** Servers' own log lines. */
  log?: (text: string) => void;
  /** A root you haven't answered for, where its own code would otherwise run (what's left out): the TUI
   *  asks whether you trust it (23.x). Without it, the CLI's way: said, never asked. */
  ask?: (root: string, limits: string[]) => void;
  /** How long a request waits for its answer (`slipbox diagnostics --timeout`); else the client's own (client.ts). */
  requestTimeoutMs?: number;
}

interface Doc {
  path: string;
  languageId: string;
  version: number;
  text: string;
  /** Its servers, by key, the main one first. */
  servers: string[];
  /** Its language: what each server does for it. */
  lang: LanguageDef;
}

interface Running {
  key: string;
  def: ServerDef;
  root: string;
  client: LanguageClient | null;
  /** Settles when it's running (the client) or couldn't start (null). */
  ready: Promise<LanguageClient | null>;
  /** When it crashed lately: a server that keeps crashing isn't started again. */
  crashes: number[];
}

/** Crashes in this long that stop restarts. */
const CRASH_WINDOW_MS = 5 * 60_000;
const CRASHES_ALLOWED = 3;

const SEVERITY: Record<number, Severity> = { 1: "error", 2: "warning", 3: "info", 4: "hint" };

/** A server's diagnostic as the core's problem: lines and columns from 1. */
export function problemOf(d: Diagnostic, server: string): Problem {
  return {
    start: { line: d.range.start.line + 1, column: d.range.start.character + 1 },
    end: { line: d.range.end.line + 1, column: d.range.end.character + 1 },
    severity: SEVERITY[d.severity ?? 1] ?? "error",
    source: d.source ?? server,
    code: d.code === undefined ? null : String(d.code),
    // 3.18 lets a message be markdown: its text either way.
    message: typeof d.message === "string" ? d.message : d.message.value,
  };
}

/**
 * A server's settings in a project: its own (the defaults, the config's over them), then the project's
 * `.vscode/settings.json` over those, as VS Code puts a workspace's over the user's (19.20). In a root
 * you don't trust (23.3), yours alone (`yours`: the server as your own config has it) and its settings
 * for running nothing of the project's over them — none of the folder's: they may name a program.
 */
export function settingsFor(def: ServerDef, root: string, yours: ServerDef = def): Record<string, unknown> | undefined {
  if (!isTrusted(root)) {
    const safe = def.untrusted?.settings?.(root);
    return safe ? mergeSettings(yours.config ?? {}, safe) : yours.config;
  }
  const project = vscodeSettings(root);
  return project ? mergeSettings(def.config ?? {}, project) : def.config;
}

/** How a server starts in a project: its environment and `initialize` options, its no-execution ones
 *  in a root you don't trust (23.4). */
export function startOf(def: ServerDef, root: string): { environment: Record<string, string>; initOptions: unknown } {
  if (isTrusted(root) || !def.untrusted) return { environment: def.environment ?? {}, initOptions: def.initOptions };
  return {
    environment: { ...def.environment, ...def.untrusted.environment },
    initOptions: def.untrusted.initOptions ?? def.initOptions,
  };
}

/** What a root you don't trust leaves out of a file's servers (23.x), said once: none when nothing is. */
export function limitsOf(choice: Choice, root: string): string[] {
  if (isTrusted(root)) return [];
  const out = choice.skipped.map((s) => `${s.def.name} not run (${s.why})`);
  for (const { def } of choice.run)
    if (def.untrusted && !def.untrusted.skip) out.push(`${def.name} without the project's code`);
  if (vscodeSettingsFile(root)) out.push(".vscode/settings.json not read");
  return out;
}

export class ServerManager {
  private readonly running = new Map<string, Running>();
  private readonly docs = new Map<string, Doc>();
  /** Packages installed (or failing) this session: each tried once. */
  private readonly installs = new Map<string, Promise<boolean>>();
  /** Servers said to be missing: each said once. */
  private readonly said = new Set<string>();
  /** Roots said not to be trusted (23.8): each said once. */
  private readonly untrustedSaid = new Set<string>();
  private closed = false;
  /** Aborted by `cancelInstalls`: an install under way is stopped. */
  private readonly ending = new AbortController();

  constructor(private readonly o: ManagerOptions) {}

  /** A file opened: its servers started, or installed then started, and told about it. */
  open(path: string, version: number, text: string): void {
    if (this.closed || this.docs.has(path)) return;
    const table = this.o.table();
    const lang = languageOf(table, path);
    if (!lang) return;
    const root = rootFor(path, lang.roots);
    const choice = chooseServers(lang, table.servers, root, (r) => projectAsks(root, r));
    for (const d of choice.missing) this.missing(d, lang.name);
    const limits = limitsOf(choice, root);
    if (limits.length && !this.untrustedSaid.has(root)) {
      this.untrustedSaid.add(root);
      // Asked once in the TUI; kept restricted, nothing more said (you chose it); the CLI says it.
      if (!this.o.ask)
        this.o.message(
          "info",
          `${root} isn't a vault you trust: ${limits.join("; ")} — trust it in slipbox (it asks), or [trust] roots in your config; slipbox doctor says more`,
        );
      else if (trustOf(root) === null) this.o.ask(root, limits);
    }
    const doc: Doc = { path, languageId: lang.languageId, version, text, servers: [], lang };
    this.docs.set(path, doc);
    for (const { def, found } of choice.run) {
      const r = this.server(def, root, found, lang.name);
      if (!r) continue;
      doc.servers.push(r.key);
      void r.ready.then((client) => {
        // The file as it is when the server is ready: the latest text, if it changed meanwhile.
        const now = this.docs.get(path);
        if (client && now && !client.isOpen(uriOf(path)))
          quietly(client.didOpen(uriOf(path), now.languageId, now.version, now.text));
      });
    }
  }

  /** A file's servers once each has started or given up (a failed install, a crash): those running that
   *  do `feature` for its language (`slipbox diagnostics` waits for their word). */
  async started(path: string, feature: Feature): Promise<string[]> {
    const doc = this.docs.get(path);
    if (!doc) return [];
    const out: string[] = [];
    for (const key of doc.servers) {
      const r = this.running.get(key);
      const client = r ? await r.ready : null;
      if (r && client?.state === "running" && does(r.def, doc.lang, feature)) out.push(r.def.name);
    }
    return out;
  }

  /** Whether any of a file's servers says it's still at some work (loading, indexing): its word may not be all yet. */
  busy(path: string): boolean {
    return (this.docs.get(path)?.servers ?? []).some((key) => this.running.get(key)?.client?.busy ?? false);
  }

  /**
   * The servers of projects under `root` stopped and started again, their files told again: a root just
   * trusted runs them as it would anywhere — its own copies, its settings, the add-ons left out before.
   */
  restartUnder(root: string): void {
    const inside = (p: string) => p === root || p.startsWith(`${root}/`);
    const keys = new Set([...this.running.values()].filter((r) => inside(r.root)).map((r) => r.key));
    const docs = [...this.docs.values()].filter((d) => inside(d.path) || d.servers.some((k) => keys.has(k)));
    for (const k of keys) {
      const r = this.running.get(k)!;
      this.running.delete(k);
      void r.ready.then((c) => c?.stop());
    }
    for (const r of [...this.untrustedSaid]) if (inside(r)) this.untrustedSaid.delete(r);
    for (const d of docs) {
      this.docs.delete(d.path);
      this.open(d.path, d.version, d.text);
    }
  }

  /** Its text now: every server of it told. */
  change(path: string, version: number, text: string): void {
    const doc = this.docs.get(path);
    if (!doc) return;
    Object.assign(doc, { version, text });
    for (const key of doc.servers) quietly(this.running.get(key)?.client?.didChange(uriOf(path), version, text));
  }

  save(path: string, text: string): void {
    const doc = this.docs.get(path);
    if (!doc) return;
    for (const key of doc.servers) quietly(this.running.get(key)?.client?.didSave(uriOf(path), text));
  }

  close(path: string): void {
    const doc = this.docs.get(path);
    if (!doc) return;
    this.docs.delete(path);
    for (const key of doc.servers) quietly(this.running.get(key)?.client?.didClose(uriOf(path)));
  }

  isOpen(path: string): boolean {
    return this.docs.has(path);
  }

  /** A file's running servers that do a feature for it and offer it (`capability`), the main one first. */
  private async serving(path: string, feature: Feature, capability: string): Promise<LanguageClient[]> {
    const doc = this.docs.get(path);
    const out: LanguageClient[] = [];
    for (const key of doc?.servers ?? []) {
      const r = this.running.get(key);
      const client = await r?.ready;
      if (
        !client ||
        !does(r!.def, doc!.lang, feature) ||
        !(client.capabilities as Record<string, unknown> | null)?.[capability]
      )
        continue;
      out.push(client);
    }
    return out;
  }

  /** A request about a file, to its first server that does the feature and answers: its answer, or null. */
  async request<R>(
    path: string,
    method: string,
    params: unknown,
    capability: string,
    feature: Feature,
  ): Promise<{ server: string; result: R } | null> {
    for (const client of await this.serving(path, feature, capability)) {
      const result = await client.request<R>(method, params);
      if (result !== null) return { server: client.spec.name, result };
    }
    return null;
  }

  /** Whether any of a file's servers does a feature for it (the switcher's workspace symbols). */
  async offers(path: string, feature: Feature, capability: string): Promise<boolean> {
    return (await this.serving(path, feature, capability)).length > 0;
  }

  /** The characters that ask a file's servers for completion, and for signature help, by their capabilities. */
  async triggers(path: string): Promise<{ completion: string[]; signature: string[] }> {
    const caps = (await this.serving(path, "completion", "completionProvider")).map(
      (c) => c.capabilities?.completionProvider?.triggerCharacters ?? [],
    );
    const sig = (await this.serving(path, "signature-help", "signatureHelpProvider")).map(
      (c) => c.capabilities?.signatureHelpProvider?.triggerCharacters ?? [],
    );
    return { completion: [...new Set(caps.flat())], signature: [...new Set(sig.flat())] };
  }

  /** A request to one named server of a file (a code action resolved, or its command run, by the server that gave it). */
  async requestOf<R>(path: string, server: string, method: string, params: unknown): Promise<R | null> {
    const key = this.docs.get(path)?.servers.find((k) => this.running.get(k)?.def.name === server);
    const client = key ? await this.running.get(key)?.ready : null;
    return client ? client.request<R>(method, params) : null;
  }

  /** A request to every server of a file that does the feature (references, code actions): their answers, together. */
  async requestAll<R>(
    path: string,
    method: string,
    params: unknown,
    capability: string,
    feature: Feature,
  ): Promise<{ server: string; result: R }[]> {
    const clients = await this.serving(path, feature, capability);
    const out: { server: string; result: R }[] = [];
    for (const c of clients) {
      const result = await c.request<R>(method, params);
      if (result !== null) out.push({ server: c.spec.name, result });
    }
    return out;
  }

  /** What's running, for `slipbox doctor` and the UI: each server, its project, its state. */
  list(): { name: string; root: string; state: string; files: number }[] {
    return [...this.running.values()].map((r) => ({
      name: r.def.name,
      root: r.root,
      state: r.client?.state ?? "installing",
      files: [...this.docs.values()].filter((d) => d.servers.includes(r.key)).length,
    }));
  }

  /** Every server asked to stop. */
  async stopAll(): Promise<void> {
    this.closed = true;
    await Promise.all([...this.running.values()].map(async (r) => (await r.ready)?.stop()));
  }

  /** Every server killed now: slipbox is exiting and can't wait. */
  killAll(): void {
    this.closed = true;
    for (const r of this.running.values()) r.client?.kill();
    this.docs.clear();
    this.running.clear();
  }

  /**
   * Installs under way stopped: the screen is quitting, and none is left running behind it. The command line doesn't,
   * so an install it began finishes for the next run.
   */
  cancelInstalls(): void {
    this.ending.abort();
  }

  /** A server for a project: the running one, or one started (after installing it when it must be). */
  private server(def: ServerDef, root: string, found: Found | null, language: string): Running | null {
    const key = `${def.name}\0${root}`;
    const known = this.running.get(key);
    if (known) return known;
    if (!found && !(def.npm && this.o.autoInstall())) {
      this.missing(def, language);
      return null;
    }
    const r: Running = { key, def, root, client: null, ready: Promise.resolve(null), crashes: [] };
    r.ready = this.start(r, found);
    this.running.set(key, r);
    return r;
  }

  private async start(r: Running, found: Found | null): Promise<LanguageClient | null> {
    let cancelled = false;
    const finished = this.o.starting?.(`Starting ${r.def.name}`, () => {
      cancelled = true;
      void r.client?.stop();
    });
    try {
      let f = found;
      // slipbox's own install under an older lock (14.11): installed again first, when installing is on.
      if (f?.behind && r.def.npm && this.o.autoInstall()) f = null;
      if (!f) {
        if (!(await this.install(r.def, found?.behind))) return null;
        f = findServer(r.def, r.root);
        if (!f) return null;
      }
      if (cancelled || this.ending.signal.aborted) return null;
      const yours = this.o.userTable?.().servers[r.def.name] ?? r.def;
      const { environment, initOptions } = startOf(r.def, r.root);
      const client = new LanguageClient(
        {
          name: r.def.name,
          argv: f.argv,
          env: { ...f.env, ...environment },
          settings: settingsFor(r.def, r.root, yours),
          initOptions,
          root: r.root,
          timeoutMs: this.o.requestTimeoutMs,
        },
        {
          diagnostics: (uri, diagnostics, version) => {
            if (!uri.startsWith("file:")) return;
            const path = fileURLToPath(uri);
            // A server limited away from diagnostics for this file's language says nothing here.
            const doc = this.docs.get(path);
            if (doc && !does(r.def, doc.lang, "diagnostics")) return;
            this.o.problems(
              path,
              r.def.name,
              version,
              diagnostics.map((d) => problemOf(d, r.def.name)),
              diagnostics,
            );
          },
          log: (text) => this.o.log?.(text),
          notice: (text) => this.o.message("warn", text),
          exited: (expected, why, stoppedByClient) => {
            if (!expected && !cancelled) this.crashed(r, why, stoppedByClient);
          },
          applyEdit: (edit) => this.o.applyEdit?.(edit) ?? false,
        },
      );
      r.client = client;
      try {
        await client.start();
        if (cancelled || this.ending.signal.aborted) {
          void client.stop();
          return null;
        }
      } catch (err) {
        this.o.message("error", `${r.def.name}: ${(err as Error).message}`);
        return null;
      }
      return client;
    } finally {
      finished?.();
    }
  }

  /** An npm server installed into slipbox's folder from its lock (14.11), once a session — over an older install of
   *  it, `behind` — true when it's there. */
  private install(def: ServerDef, behind?: { installed: string | null }): Promise<boolean> {
    const npm = def.npm;
    if (!npm) return Promise.resolve(false); // a native server is never installed
    const key = lockKey(npm);
    let done = this.installs.get(key);
    if (!done) {
      const spec = `${npm.package}@${npm.version}`;
      // Behind at the same version (one installed before 14.11): installed again, from the lock, all the same.
      const said = !behind
        ? `installing ${def.name} (${spec}) into slipbox's own folder…`
        : behind.installed !== null && behind.installed !== npm.version
          ? `updating ${def.name} (${behind.installed} → ${npm.version}) in slipbox's own folder…`
          : `installing ${def.name} again from slipbox's lockfile (${spec})…`;
      this.o.message("info", said);
      done = installTool(npm, { signal: this.ending.signal }).then((r) => {
        if (r.ok) this.o.message("info", `${behind ? "updated" : "installed"} ${def.name}`);
        else if (!this.ending.signal.aborted)
          this.o.message(
            "error",
            `couldn't install ${def.name}: ${r.output.split("\n").at(-1) || "bun install failed"}`,
          );
        return r.ok;
      });
      this.installs.set(key, done);
    }
    return done;
  }

  /** It ended unasked: it crashed, or slipbox stopped it (`byClient`: what it sent couldn't be read). Started again,
   *  a few times. */
  private crashed(r: Running, why: string, byClient = false): void {
    if (this.closed) return;
    const now = Date.now();
    r.crashes = [...r.crashes.filter((t) => now - t < CRASH_WINDOW_MS), now];
    const what = byClient ? `was stopped: ${why}` : `crashed (${why})`;
    if (r.crashes.length > CRASHES_ALLOWED) {
      this.o.message(
        "error",
        byClient
          ? `${r.def.name} ${what}, again; not started again`
          : `${r.def.name} keeps crashing (${why}); not started again`,
      );
      return;
    }
    // Its program gone (a venv recreated, an upgrade moving it): left stopped, unless it's npm's to install.
    const found = findServer(r.def, r.root);
    if (!found && !(r.def.npm && this.o.autoInstall())) {
      this.o.message("error", `${r.def.name} ${what} and its program is gone; not started again`);
      return;
    }
    this.o.message("warn", `${r.def.name} ${what}; starting it again`);
    // The same server again, its files told again once it's ready.
    r.ready = this.start(r, found);
    void r.ready.then((client) => {
      if (!client) return;
      for (const d of this.docs.values())
        if (d.servers.includes(r.key)) quietly(client.didOpen(uriOf(d.path), d.languageId, d.version, d.text));
    });
  }

  private missing(def: ServerDef, language: string): void {
    if (this.said.has(def.name)) return;
    this.said.add(def.name);
    this.o.message(
      "warn",
      `${language}: ${def.name} isn't installed${def.npm ? "" : " (slipbox finds it on PATH; it doesn't install native servers)"} — slipbox doctor says more`,
    );
  }
}

function uriOf(path: string): string {
  return pathToFileURL(path).href;
}

/** A file's news for a server, not waited on: one that can't be written means the server is going, and its exit (a
 *  crash, started again) says so — never an error of slipbox's own. */
function quietly(told: Promise<void> | undefined): void {
  told?.catch(() => {});
}
