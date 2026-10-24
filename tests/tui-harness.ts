// The harness the TUI's tests share (tests/tui.test.ts, tests/tui-git.test.ts): a sandbox of each file's own, a vault
// copied into it, the TUI model driven headlessly (keys in, TextCanvas out), and the helpers that read its rows.
//
// `bun test` evaluates this module once in a run, however many files import it: its top-level code runs for the first
// of them alone, and an `afterAll` there would be that file's, removing the sandbox before the next file's tests. So
// each file calls `makeSandbox()` at its top: a folder of its own, the environment pointed into it, removed when that
// file ends. The files run one after another, so a vault goes in the sandbox of the file running.

import { afterAll, setDefaultTimeout } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { canonKey } from "../src/core/commands.ts";
import { type Config, DEFAULT_CONFIG } from "../src/core/config.ts";
import { openGraph } from "../src/core/graph.ts";
import { locateVault } from "../src/core/vault.ts";
import { App, type Host } from "../src/tui/app.ts";
import { TextCanvas } from "../src/tui/canvas.ts";
import { whereOf, whereText } from "../src/tui/where.ts";
import type { Line } from "../src/core/layout/ir.ts";

/** The sandbox of the file running, which `makeSandbox` sets. */
let sandbox = "";

/** The sandbox of the file running; a file that never made one is told so, rather than writing where it runs. */
function box(): string {
  if (!sandbox) throw new Error("tui-harness: call makeSandbox() at the test file's top");
  return sandbox;
}

/**
 * A sandbox for the test file that calls it, at its top (its `afterAll` is that file's): the state, cache, config and
 * data folders (the home vault, 17.2) in it, removed when the file ends; never the developer's own config or clipboard.
 */
export function makeSandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), "slipbox-tui-"));
  sandbox = dir;
  process.env.XDG_STATE_HOME = join(sandbox, "state");
  process.env.XDG_CACHE_HOME = join(sandbox, "cache");
  process.env.XDG_CONFIG_HOME = join(sandbox, "config");
  process.env.XDG_DATA_HOME = join(sandbox, "data"); // the home vault (17.2)
  // Harnesses copy and index a vault, CLI tests start processes: slow on a loaded machine, not stuck.
  setDefaultTimeout(30_000);
  delete process.env.SLIPBOX_CONFIG; // it would win over XDG_CONFIG_HOME: never the developer's own config
  process.env.SLIPBOX_CLIPBOARD = "file"; // copies never reach the developer's clipboard
  delete process.env.NO_COLOR;
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const DEMO = join(import.meta.dir, "..", "examples", "vault");

export function makeVault(): string {
  const dir = mkdtempSync(join(box(), "vault-"));
  cpSync(join(import.meta.dir, "fixtures", "vault"), dir, { recursive: true, verbatimSymlinks: true });
  // The demo vault's notes, as a folder of this one (without its marker, which would make it a
  // nested vault: a boundary, not walked).
  cpSync(DEMO, join(dir, "samples"), { recursive: true, filter: (src) => !src.endsWith(".slipbox") });
  // Each copy a vault of its own (20.4): a shared id would make every copy the same collection, and
  // one moved by an earlier test a question for every later one (20.5).
  for (const cfg of [join(dir, ".slipbox", "config.toml"), join(dir, "nested-vault", ".slipbox", "config.toml")]) {
    writeFileSync(
      cfg,
      readFileSync(cfg, "utf8").replace(/^id = "[0-9a-f]+"$/m, `id = "${randomBytes(8).toString("hex")}"`),
    );
  }
  return dir;
}

export interface Harness {
  app: App;
  copied: string[];
  quit: { called: boolean };
  keys: (...ks: string[]) => Promise<string>;
  frame: () => string;
  canvas: () => TextCanvas;
  root: string;
}

export interface Opts {
  width?: number;
  height?: number;
  open?: string | null;
  root?: string;
  config?: (c: Config) => void;
  watch?: boolean;
  configFile?: string;
  themeName?: string;
  /** Start here instead of at `root` as a vault (a loose folder: the home vault). */
  loc?: import("../src/core/vault.ts").VaultLocation;
  /** The folder slipbox was opened on, inside the root: the explorer's view starts there. */
  folder?: string;
  /** The terminal's pictures (12.x), as a stand-in: none unless given. */
  images?: Host["images"];
  /** The network (12.12), as a stand-in: none unless given — a test never reaches the real one. */
  fetch?: Host["fetch"];
  /** The app's clock: `Date.now` unless given. */
  now?: () => number;
  /** Started by a restart (UPG): the session its note kept, and what's said. */
  restarted?: import("../src/tui/app.ts").AppOptions["restarted"];
}

export async function harness(opts: Opts = {}): Promise<Harness> {
  const root = opts.loc?.root ?? opts.root ?? makeVault();
  const config: Config = structuredClone(DEFAULT_CONFIG);
  config.ui.restore_session = false;
  config.lint.enabled = "off"; // the machine's own linter never runs in a test (the lint tests bring theirs)
  config.search.engine = "scan"; // no index built behind every test (the search tests ask for one)
  // Never the background auto-index (20.9): a live test app, idle long enough, would walk your home folder.
  config.index.background = false;
  config.render.glyphs = "unicode";
  // The frame tests read heavy lines; the light set has its own test.
  config.ui.lines = "heavy";
  // Laid out without the gutter (on by default): the tests of line numbers, and what's drawn in it, turn it on.
  config.ui.line_numbers = false;
  // The editing keys type in source mode at once (the lens by default): the editing tests are about what's typed, and
  // the lens's tests, the default's own among them, turn it back on.
  config.editor.edit_in = "source";
  config.walk.exclude = ["drafts/"];
  opts.config?.(config);
  const loc = opts.loc ?? locateVault({ root });
  const graph = openGraph(loc, config, false);
  const copied: string[] = [];
  const quit = { called: false };
  const host: Host = {
    requestRender() {},
    osc52: (t) => (copied.push(t), true),
    quit: () => (quit.called = true),
    ...(opts.images ? { images: opts.images } : {}),
    fetch: opts.fetch ?? (async (url) => Promise.reject(new Error(`no network in a test (${url})`))),
  };
  const app = new App({
    loc,
    config,
    graph,
    host,
    open: opts.open === undefined ? "index.md" : opts.open,
    watch: opts.watch ?? false,
    configFile: opts.configFile,
    themeName: opts.themeName,
    folder: opts.folder,
    now: opts.now,
    restarted: opts.restarted,
  });
  // Never the machine's own nvims.
  app.handoff.nvimDiscovery = () => [];
  app.handoff.nvimProbe = () => null;
  // Nor its home: an export's places (Downloads…) are a test's own, where one makes them.
  app.home = join(box(), "no-home");
  const W = opts.width ?? 120;
  const H = opts.height ?? 30;
  const canvas = () => {
    const c = new TextCanvas(W, H);
    app.draw(c);
    // The app survives a drawing bug in use; tests must not.
    const failed = app.messages.find((m) => m.text.startsWith("drawing failed"));
    if (failed) throw new Error(failed.text);
    return c;
  };
  const frame = () => canvas().toString();
  frame();
  const keys = async (...ks: string[]) => {
    for (const k of ks) {
      await app.input.handleKey(canonKey(k));
      frame();
    }
    return frame();
  };
  return { app, copied, quit, keys, frame, canvas, root };
}

/** An idle job stepped to its end as the TUI steps it, the answers of its walks awaited (made on their own thread). */
export async function stepToEnd(job: { step(budgetMs: number): boolean }, budgetMs = 50): Promise<void> {
  while (job.step(budgetMs)) await Bun.sleep(1);
}

/**
 * The machine's list of roots narrowed to those under `base` while `run` runs, then the others put back:
 * a search of every root and a moved folder's relink read them all, and a test file leaves hundreds,
 * so such a test would be as slow as the tests before it are many.
 */
export async function onlyRootsUnder<T>(base: string, run: () => Promise<T>): Promise<T> {
  const { readRoots, writeRoots } = await import("../src/core/registry.ts");
  const was = readRoots();
  const ours = (v: { path: string }) => v.path.startsWith(`${base}/`);
  writeRoots(was.filter(ours));
  try {
    return await run();
  } finally {
    const now = readRoots();
    writeRoots([...was.filter((v) => !ours(v) && !now.some((x) => x.key === v.key)), ...now]);
  }
}

export const rowText = (h: Harness, row = h.app.view!.cur.row) =>
  h.app
    .currentLayout(h.app.view!)
    .lines[row]!.spans.map((s) => s.text)
    .join("");
/** A layout row's own text: from where it starts (a lens row's counters, a code cell's border and padding before it). */
export const lineText = (l: Line) => {
  const all = l.spans.map((s) => s.text).join("");
  return l.text ? [...all].slice(l.text[0]).join("") : all;
};
export const statusRow = (frame: string) => frame.split("\n").at(-1)!;
export const topRow = (frame: string) => frame.split("\n")[0]!;
/** Where you are (WSP-D4), uncut and without the glyph, as the status line says it: `research · main`, `Elsewhere`. */
export const whereNow = (h: Harness) => {
  const t = whereText({ ...whereOf(h.app), glyph: "" });
  return t.vault + t.branch;
};
export const rowStarting = (h: Harness, prefix: string) =>
  h.app.currentLayout(h.app.view!).lines.findIndex((l) =>
    l.spans
      .map((s) => s.text)
      .join("")
      .startsWith(prefix),
  );
