// The servers of the files slipbox has open (plan 19.1): one client per server and project, started
// when a file first needs it — installed first when it's on npm and nowhere (19.5) — told about each
// file of its language in its project, and restarted after a crash, a few times. Its diagnostics
// become the file's problems (19.8), their positions the core's.

import { pathToFileURL, fileURLToPath } from "node:url";
import type { Diagnostic } from "vscode-languageserver-protocol";
import type { Problem, Severity } from "../diagnostics.ts";
import { LanguageClient } from "./client.ts";
import { chooseServers, type Found, findServer, rootFor } from "./find.ts";
import { installPackages } from "./install.ts";
import { languageOf, projectAsks, type ServerDef, type ServerTable } from "./languages.ts";

export interface ManagerOptions {
  /** The servers and languages in effect (the config's over the built-in). */
  table: () => ServerTable;
  /** Whether npm servers are installed when missing (`[lsp] auto_install`). */
  autoInstall: () => boolean;
  /** A file's problems from one server, for the text of `version` (null: the latest sent). */
  problems: (path: string, server: string, version: number | null, problems: Problem[]) => void;
  /** Something for the user: a server installed, missing, or crashing. */
  message: (level: "info" | "warn" | "error", text: string) => void;
  /** Servers' own log lines. */
  log?: (text: string) => void;
}

interface Doc {
  path: string;
  languageId: string;
  version: number;
  text: string;
  /** Its servers, by key, the main one first. */
  servers: string[];
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

export class ServerManager {
  private readonly running = new Map<string, Running>();
  private readonly docs = new Map<string, Doc>();
  /** Packages installed (or failing) this session: each tried once. */
  private readonly installs = new Map<string, Promise<boolean>>();
  /** Servers said to be missing: each said once. */
  private readonly said = new Set<string>();
  private closed = false;

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
    const doc: Doc = { path, languageId: lang.languageId, version, text, servers: [] };
    this.docs.set(path, doc);
    for (const { def, found } of choice.run) {
      const r = this.server(def, root, found, lang.name);
      if (!r) continue;
      doc.servers.push(r.key);
      void r.ready.then((client) => {
        // The file as it is when the server is ready: the latest text, if it changed meanwhile.
        const now = this.docs.get(path);
        if (client && now && !client.isOpen(uriOf(path))) void client.didOpen(uriOf(path), now.languageId, now.version, now.text);
      });
    }
  }

  /** Its text now: every server of it told. */
  change(path: string, version: number, text: string): void {
    const doc = this.docs.get(path);
    if (!doc) return;
    Object.assign(doc, { version, text });
    for (const key of doc.servers) void this.running.get(key)?.client?.didChange(uriOf(path), version, text);
  }

  save(path: string, text: string): void {
    const doc = this.docs.get(path);
    if (!doc) return;
    for (const key of doc.servers) void this.running.get(key)?.client?.didSave(uriOf(path), text);
  }

  close(path: string): void {
    const doc = this.docs.get(path);
    if (!doc) return;
    this.docs.delete(path);
    for (const key of doc.servers) void this.running.get(key)?.client?.didClose(uriOf(path));
  }

  isOpen(path: string): boolean {
    return this.docs.has(path);
  }

  /** A request about a file, to its first running server that offers it (`capability`): its answer, or null. */
  async request<R>(path: string, method: string, params: unknown, capability: string): Promise<{ server: string; result: R } | null> {
    const doc = this.docs.get(path);
    for (const key of doc?.servers ?? []) {
      const client = await this.running.get(key)?.ready;
      if (!client || !(client.capabilities as Record<string, unknown> | null)?.[capability]) continue;
      const result = await client.request<R>(method, params);
      if (result !== null) return { server: client.spec.name, result };
    }
    return null;
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
    let f = found;
    if (!f) {
      if (!(await this.install(r.def))) return null;
      f = findServer(r.def, r.root);
      if (!f) return null;
    }
    const client = new LanguageClient(
      { name: r.def.name, argv: f.argv, env: { ...f.env, ...r.def.environment }, settings: r.def.config, initOptions: r.def.initOptions, root: r.root },
      {
        diagnostics: (uri, diagnostics, version) => {
          if (!uri.startsWith("file:")) return;
          this.o.problems(fileURLToPath(uri), r.def.name, version, diagnostics.map((d) => problemOf(d, r.def.name)));
        },
        log: (text) => this.o.log?.(text),
        exited: (expected, why) => {
          if (!expected) this.crashed(r, why);
        },
      },
    );
    r.client = client;
    try {
      await client.start();
    } catch (err) {
      this.o.message("error", `${r.def.name}: ${(err as Error).message}`);
      return null;
    }
    return client;
  }

  /** An npm server installed into slipbox's folder, once a session; true when it's there. */
  private install(def: ServerDef): Promise<boolean> {
    const npm = def.npm!;
    const spec = `${npm.package}@${npm.version}`;
    let done = this.installs.get(spec);
    if (!done) {
      this.o.message("info", `installing ${def.name} (${spec}) into slipbox's own folder…`);
      done = installPackages([spec, ...(npm.with ?? [])]).then((r) => {
        if (r.ok) this.o.message("info", `installed ${def.name}`);
        else this.o.message("error", `couldn't install ${def.name}: ${r.output.split("\n").at(-1) ?? "bun add failed"}`);
        return r.ok;
      });
      this.installs.set(spec, done);
    }
    return done;
  }

  private crashed(r: Running, why: string): void {
    if (this.closed) return;
    const now = Date.now();
    r.crashes = [...r.crashes.filter((t) => now - t < CRASH_WINDOW_MS), now];
    if (r.crashes.length > CRASHES_ALLOWED) {
      this.o.message("error", `${r.def.name} keeps crashing (${why}); not started again`);
      return;
    }
    this.o.message("warn", `${r.def.name} crashed (${why}); starting it again`);
    // The same server again, its files told again once it's ready.
    r.ready = this.start(r, findServer(r.def, r.root));
    void r.ready.then((client) => {
      if (!client) return;
      for (const d of this.docs.values()) if (d.servers.includes(r.key)) void client.didOpen(uriOf(d.path), d.languageId, d.version, d.text);
    });
  }

  private missing(def: ServerDef, language: string): void {
    if (this.said.has(def.name)) return;
    this.said.add(def.name);
    this.o.message("warn", `${language}: ${def.name} isn't installed${def.npm ? "" : " (slipbox finds it on PATH; it doesn't install native servers)"} — slipbox doctor says more`);
  }
}

function uriOf(path: string): string {
  return pathToFileURL(path).href;
}
