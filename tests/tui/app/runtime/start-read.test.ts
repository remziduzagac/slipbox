// The start takes the screen first, then reads the vault (SD-T10; SD-D9, SD-D4): slipbox started as `runTui` starts it
// — `prepare`, then the App, its reads on the disk threads — draws its screen before the vault is read, its note
// waiting for the graph (`reading the vault…`), the keys waiting with it but `q` and `ctrl+c`, which quit at once; let
// go, the note is drawn with its links checked and the keys typed meanwhile act on the graph built. What waits is told
// by the hold (`Hold`), never by a clock (#75): its folder `held`, held on the disk threads and on this thread too — a
// walk made here lists it through the same reader (`slowFolders`) — so a walk put back before the screen, or on the
// screen's thread, holds the test past the hold's deadline, and it fails.

import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadConfig } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { catchUp, SearchIndex } from "../../../../src/core/workspace/search/search.ts";
import { loadSession, saveSession, type SessionTab } from "../../../../src/core/workspace/session/position.ts";
import { configFilesFor, locateVault, rootAt } from "../../../../src/core/workspace/vaults/vault.ts";
import { setFolderReader } from "../../../../src/core/workspace/walk/walk.ts";
import { cameBack, type CameBack } from "../../../../src/tui/app/distribution/updates.ts";
import { App } from "../../../../src/tui/app/runtime/app.ts";
import { GraphRefresh } from "../../../../src/tui/app/runtime/graph-refresh.ts";
import type { Start } from "../../../../src/tui/shell/terminal/run.ts";
import { TextCanvas } from "../../../../src/tui/shell/terminal/canvas.ts";
import { HELD_MS, type Hold, slowFolders } from "../../../fixtures/walk/slow.ts";
import { makeHeldKeys } from "../../../support/tui/held-keys.ts";
import { box } from "../../../support/tui/sandbox.ts";
import { makeSandbox, makeVault, statusRow } from "../../../tui-harness.ts";

makeSandbox();
const { holding, untilHeld } = makeHeldKeys();

/** The test's slipbox and its hold: each quit as the test ends, the hold let go first. */
const live: { apps: App[]; held: Hold | null } = { apps: [], held: null };

afterEach(() => {
  live.held?.release();
  for (const app of live.apps.splice(0)) app.quit();
  live.held = null;
  setFolderReader(null);
});

/** `files` (path → text) written in `root`. */
function write(root: string, files: Record<string, string>): string {
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}

/** Your config for a test (`--config`): no search index unless asked, no background index, no linter; the session's
 *  tabs brought back or not. */
function yours(o: { restore?: boolean; search?: "index" | "scan" } = {}): string {
  const file = join(mkdtempSync(join(box(), "config-")), "config.toml");
  const restore = o.restore ?? false;
  writeFileSync(
    file,
    `[search]\nengine = "${o.search ?? "scan"}"\n\n[index]\nbackground = false\n\n[lint]\nenabled = "off"\n\n` +
      `[ui]\nrestore_session = ${restore}\n`,
  );
  return file;
}

interface Started {
  app: App;
  start: Start;
  quit: { called: boolean };
  frame: () => string;
}

/** slipbox started on `args` as `runTui` starts it: `prepare` — your config `config` — then the screen's App, its
 *  reads, its builds and its explorer's listings on the disk threads (`listOffThread`). Not live, unless asked: no
 *  watcher, no look each second. */
async function started(args: string[], o: { config?: string; back?: CameBack; live?: boolean } = {}): Promise<Started> {
  const { prepare } = await import("../../../../src/tui/shell/terminal/run.ts");
  const start = prepare([...args, "--config", o.config ?? yours()], o.back ?? null);
  if (typeof start === "number") throw new Error(`exit ${start}`);
  const quit = { called: false };
  const host = { requestRender() {}, osc52: () => true, quit: () => void (quit.called = true) };
  const app = new App({ ...start, listOffThread: true, watch: o.live ?? false, host });
  live.apps.push(app);
  const frame = () => {
    const c = new TextCanvas(120, 30);
    app.draw(c);
    return c.toString();
  };
  return { app, start, quit, frame };
}

/** The hold on the `held` folders (`deadline`, each asker's on the disk threads), a walk made here held on them too. */
function holdWalks(deadline?: number): Hold {
  const held = holding(undefined, deadline);
  live.held = held;
  setFolderReader(slowFolders);
  return held;
}

/** Awaited till `done` holds: said and thrown by HELD_MS. */
async function until(done: () => boolean, what: string): Promise<void> {
  const end = performance.now() + HELD_MS;
  while (!done()) {
    if (performance.now() > end) throw new Error(`${what} never came`);
    await Bun.sleep(5);
  }
}

const said = (s: Started) => s.app.messages.map((m) => m.text);
/** The status of the first link drawn to `target` in the window open. */
const linkTo = (s: Started, target: string) =>
  s.app.currentLayout(s.app.view!).links.find((l) => l.target === target)?.status;
/** A tab kept with `paths`, one window each. */
const tab = (...paths: string[]): SessionTab => ({ panes: paths.map((path) => ({ path })), active: 0 }) as SessionTab;
const GAVE_UP = "reading the vault gave up: a folder didn't answer in time; it's read again in a minute";

describe("the start takes the screen first, then reads the vault (SD-T10)", () => {
  test("held: started on a vault, a folder in it slow — the screen drawn, its note waiting for the graph and the keys with it; let go, the note drawn with its links checked, the keys acting on the graph built", async () => {
    const root = write(makeVault(), { "held/a.md": "# A\n\nBack to [the index](../index.md).\n" });
    const held = holdWalks();
    const s = await started([join(root, "index.md")]);
    // Nothing of the vault read before the screen (SD-D9): its graph built by the screen, on a disk thread.
    expect(s.start.graph.builds).toBe(0);
    await untilHeld(held, "the start's walk");
    // The note read meanwhile, a key's own read, its window waiting for the graph.
    await until(() => s.app.view?.buf.key === "index.md", "the note's window");
    const frame = s.frame();
    expect(frame).toContain("reading the vault…");
    expect(frame).not.toContain("Links: alpha");
    expect(statusRow(frame)).toContain("reading the vault…");
    expect(s.app.graph.builds).toBe(0);
    // Keys typed meanwhile wait for it: the note's backlinks, which only the graph built knows.
    expect(s.app.reads.busy).toBe(true);
    const typed = Promise.all(["space", "l", "b"].map((k) => s.app.input.handleKey(k)));
    expect(s.app.overlay).toBeNull();
    held.release();
    await typed;
    await s.app.watch.builds.idle();
    expect(s.app.graph.builds).toBe(1);
    // Its links checked as it's drawn: one to a note that isn't there, unresolved.
    expect(linkTo(s, "notes/alpha.md")).toBe("resolved");
    expect(linkTo(s, "missing-note.md")).toBe("unresolved");
    const o = s.app.overlay;
    expect(o?.kind === "list" ? o.items.map((i) => i.label) : []).toContain("held/a.md");
    expect(said(s).join("\n")).not.toContain("backlinks are kept for the notes of a vault");
    await s.app.input.handleKey("escape");
    expect(s.frame()).toContain("Links: alpha");
    expect(held.gaveUp).toBe(0);
  });

  test("held: `q` while the vault is first read quits at once, out of turn, and `ctrl+c` the same — the session's tabs, not back yet, kept for the next start", async () => {
    const root = write(makeVault(), { "held/a.md": "# A\n", "held/b.md": "# B\n" });
    saveSession(rootAt(root), { version: 1, tabs: [tab("held/a.md"), tab("held/b.md")], activeTab: 1, sidebar: false });
    for (const key of ["q", "ctrl+c"]) {
      const held = holdWalks();
      const s = await started([root], { config: yours({ restore: true }) });
      await untilHeld(held, "the start's walk");
      expect(s.app.reads.busy).toBe(true);
      await s.app.input.handleKey(key);
      expect(s.quit.called).toBe(true);
      // Its tabs not saved over by the quit: none of them had come.
      expect(s.app.tabs).toHaveLength(0);
      const kept = loadSession(rootAt(root));
      expect(kept?.tabs.map((t) => t.panes[0]!.path)).toEqual(["held/a.md", "held/b.md"]);
      expect(kept?.activeTab).toBe(1);
      held.release();
      expect(held.gaveUp).toBe(0);
    }
  });

  test("held: `esc` while its note is read gives the read up, the window left empty; the keys wait for the vault all the same, and nothing more is said", async () => {
    const root = write(makeVault(), { "held/a.md": "# A\n" });
    const held = holdWalks();
    const s = await started([join(root, "held", "a.md")]);
    await untilHeld(held, "the start's reads");
    await s.app.input.handleKey("escape");
    expect(s.app.tabs).toHaveLength(0);
    expect(s.quit.called).toBe(false);
    expect(s.app.reads.busy).toBe(true);
    expect(statusRow(s.frame())).toContain("reading the vault…");
    held.release();
    await s.app.watch.builds.idle();
    await s.app.reads.settled();
    expect(s.app.graph.notes.has("held/a.md")).toBe(true);
    expect(s.app.tabs).toHaveLength(0);
    expect(said(s).join("\n")).not.toMatch(/no notes in|didn't answer|couldn't be/);
    expect(held.gaveUp).toBe(0);
  });

  test("held past a shortened deadline: said, the note shown as its text, its links drawn as resolved; read again, the note drawn again once the vault is in", async () => {
    const root = write(makeVault(), { "held/a.md": "# A\n" });
    const held = holdWalks(300);
    const s = await started([join(root, "index.md")]);
    s.app.watch.builds.againMs = 0;
    await s.app.watch.builds.built;
    expect(said(s)).toContain(GAVE_UP);
    // Its own read answered: shown as its text, no longer waiting, its links not checked yet drawn as resolved.
    await until(() => s.app.view?.buf.key === "index.md", "the note's window");
    expect(s.app.watch.builds.awaited).toBe(false);
    expect(s.frame()).toContain("Links: alpha");
    expect(linkTo(s, "missing-note.md")).toBe("unknown");
    expect(s.app.graph.builds).toBe(0);
    // Read again (here at once, a minute in the TUI), let go: the note drawn again, its links checked.
    held.release();
    await until(() => s.app.graph.builds === 1, "the vault read again");
    await s.app.watch.builds.idle();
    expect(linkTo(s, "missing-note.md")).toBe("unresolved");
    expect(linkTo(s, "notes/alpha.md")).toBe("resolved");
    expect(s.app.view?.buf.rel).toBe("index.md");
  });

  test("held past a shortened deadline, its note's read too: both said, nothing opened", async () => {
    const root = write(makeVault(), { "held/a.md": "# A\n" });
    const held = holdWalks(300);
    const s = await started([join(root, "held", "a.md")]);
    s.app.watch.builds.againMs = HELD_MS * 10;
    await s.app.watch.builds.built;
    await s.app.reads.settled();
    expect(said(s)).toContain(GAVE_UP);
    expect(said(s)).toContain("held/a.md didn't answer: not opened");
    expect(s.app.tabs).toHaveLength(0);
    expect(s.app.reads.busy).toBe(false);
    expect(held.gaveUp).toBe(0);
  });

  test("held: a restart waiting for its vault — its tabs brought back as a start's, each window waiting for the graph; let go, where they were", async () => {
    const lines = Array.from({ length: 80 }, (_, i) => `Line ${i + 1}.`).join("\n\n");
    const root = write(makeVault(), { "long.md": `# Long\n\n${lines}\n`, "held/a.md": "# A\n" });
    // "Line 30." is the file's line 61.
    const at = { heading: null, headingIndex: 0, offset: 0, line: 61 };
    const session = {
      version: 1,
      tabs: [
        { panes: [{ path: "long.md", anchor: at, cursor: { anchor: at, sub: 0, col: 0 } }], active: 0 },
        { panes: [{ path: "index.md" }], active: 0 },
      ],
      activeTab: 0,
      sidebar: false,
    };
    const place = { mode: "vault", root, homeFolder: null };
    const back = cameBack(
      { pid: 1, at: Date.now(), from: "0.5.0", upgrade: null, outcome: null, place, session },
      "0.6.0",
    );
    const held = holdWalks();
    const s = await started([makeVault()], { back });
    expect(s.app.loc.root).toBe(root);
    await untilHeld(held, "the start's walk");
    // The tab shown read first, its window waiting for the graph; the other behind it.
    await until(() => s.app.view?.buf.key === "long.md", "the tab shown");
    const frame = s.frame();
    expect(frame).toContain("reading the vault…");
    expect(frame).not.toContain("Line 30.");
    held.release();
    await s.app.watch.builds.idle();
    await s.app.reads.settled();
    await until(() => s.app.tabs.length === 2, "the tab behind it");
    // Where it was: the cursor at the line kept, the window near it, not at the note's top.
    const v = s.app.view!;
    expect(s.app.currentLayout(v).lines[v.cur.row]?.src).toBe(61);
    const shown = s.frame();
    expect(shown).toContain("Line 30.");
    expect(shown).not.toContain("Line 1.");
    expect(s.app.tabs.map((t) => t.views[0]!.buf.rel)).toEqual(["long.md", "index.md"]);
    expect(held.gaveUp).toBe(0);
  });

  test("held: the search index kept while the vault is first read — not let go of for a graph of no notes, nothing to index again once it's in", async () => {
    const root = write(makeVault(), { "held/a.md": "# A\n" });
    const config = yours({ search: "index" });
    // The index caught up with the vault, as a slipbox before this one left it.
    const loc = locateVault({ root });
    const graph = openGraph(loc, loadConfig({ ...configFilesFor(loc), configFile: config }).config);
    const idx = SearchIndex.open(loc)!;
    catchUp(graph, idx);
    const indexed = idx.indexed().size;
    expect(indexed).toBeGreaterThan(0);
    idx.close();
    const held = holdWalks();
    const s = await started([join(root, "index.md")], { config });
    await untilHeld(held, "the start's walk");
    const meanwhile = SearchIndex.open(loc)!;
    expect(meanwhile.indexed().size).toBe(indexed);
    meanwhile.close();
    held.release();
    await s.app.watch.builds.idle();
    expect(s.app.search.index).not.toBeNull();
    expect(s.app.search.job).toBeNull();
    expect(held.gaveUp).toBe(0);
  });

  test("held: home started in a folder of it — its first build, with the folder asked for, on a disk thread; home's walk asked once it's built, not before", async () => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-home-")));
    write(home, { "held/a.md": "# A\n\n[b](b.md)\n", "held/b.md": "# B\n", "top.md": "# Top\n" });
    const before = process.env.HOME;
    process.env.HOME = home;
    const again = spyOn(GraphRefresh.prototype, "walkHomeAgain").mockImplementation(() => {});
    try {
      const held = holdWalks();
      const s = await started([join(home, "held", "a.md")], { live: true });
      expect(s.app.loc.mode).toBe("home");
      await untilHeld(held, "home's first walk");
      expect(s.app.graph.builds).toBe(0);
      expect(again).not.toHaveBeenCalled();
      held.release();
      await s.app.watch.builds.idle();
      await s.app.reads.settled();
      expect(s.app.graph.notes.has("held/b.md")).toBe(true);
      expect(s.app.view?.buf.rel).toBe("held/a.md");
      expect(linkTo(s, "b.md")).toBe("resolved");
      expect(again).toHaveBeenCalledTimes(1);
      expect(held.gaveUp).toBe(0);
    } finally {
      again.mockRestore();
      process.env.HOME = before;
    }
  });
});
