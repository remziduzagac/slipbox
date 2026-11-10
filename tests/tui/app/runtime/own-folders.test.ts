// slipbox's own state, cache and config folders read off the screen's thread (SD-T9): a vault gone into, its session
// read on a disk thread; the Vaults window drawn from the list it last read; a link's completion offering other vaults'
// notes once they're read; the answers kept for links followed, statted by the look; your config carried into a vault
// gone into as the look last read it. Each held (`Hold`): a read put back on the screen's thread waits there, given up
// on (`gaveUpHere`), and the test fails. What waits is told by the hold, or by what's drawn, never by a clock (#75).

import { afterEach, describe, expect, test } from "bun:test";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { cacheDir, stateDir } from "../../../../src/core/foundation/platform/paths.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { saveSession, type SessionTab, TOP } from "../../../../src/core/workspace/session/position.ts";
import { answersKept, linksFile, lookAfterLinks } from "../../../../src/core/workspace/vaults/symlinks.ts";
import { initVault, locateVault, recordLocation, rootAt } from "../../../../src/core/workspace/vaults/vault.ts";
import type { ListOverlay } from "../../../../src/tui/shell/overlays/list-types.ts";
import { HELD_MS, type Hold } from "../../../fixtures/walk/slow.ts";
import { makeHeldKeys } from "../../../support/tui/held-keys.ts";
import { type Harness, harness, makeSandbox, makeVault } from "../../../tui-harness.ts";

const sandbox = makeSandbox();
// slipbox's state folder under `held` for the whole file: read at once while no hold holds it.
process.env.XDG_STATE_HOME = join(sandbox, "held", "state");
const { holding, untilHeld } = makeHeldKeys();

/** The cache folder as the test found it, when it moved it (`cacheHeld`). */
let cacheWas: string | undefined;

afterEach(() => {
  lookAfterLinks(false);
  if (cacheWas !== undefined) process.env.XDG_CACHE_HOME = cacheWas;
  cacheWas = undefined;
});

/** slipbox's cache folder under `held`, until the test ends. */
function cacheHeld(): void {
  cacheWas = process.env.XDG_CACHE_HOME;
  process.env.XDG_CACHE_HOME = join(mkdtempSync(join(sandbox, "cache-")), "held");
}

/** slipbox in a vault of its own, reading off the screen's thread as the TUI does: a key's reads, the look. */
async function offThread(root = makeVault(), opts: Parameters<typeof harness>[0] = {}): Promise<Harness> {
  const h = await harness({ root, open: "index.md", config: (c) => void (c.ui.restore_session = true), ...opts });
  h.app.reads.offThread = true;
  h.app.watch.look.offThread = true;
  return h;
}

/** Awaited till `cond` holds — drawn, or kept — by HELD_MS at most: said and thrown then. */
async function until(cond: () => boolean, what: string): Promise<void> {
  const end = performance.now() + HELD_MS;
  while (!cond()) {
    if (performance.now() > end) throw new Error(`never: ${what}`);
    await Bun.sleep(5);
  }
}

/** A key handled and its frame drawn: the leader's keys shown, and closed. */
async function keyMeanwhile(h: Harness): Promise<void> {
  expect(await h.keys("space")).toContain("+find");
  await h.keys("escape");
}

/** No read given up on, on any thread: none left on this one, where it would have held the keys. */
function noneGaveUp(hold: Hold): void {
  expect({ gaveUp: hold.gaveUp, here: hold.gaveUpHere }).toEqual({ gaveUp: 0, here: [] });
}

/** Rewritten, its mtime `s` seconds on: a change no stat could miss. */
function rewrite(path: string, text: string, s = 10): void {
  writeFileSync(path, text);
  const t = new Date(Date.now() + s * 1000);
  utimesSync(path, t, t);
}

describe("slipbox's own folders read off the screen's thread (SD-T9)", () => {
  test("held: going into another vault, its session read on a disk thread — a key handled and drawn meanwhile; let go, its notes open where they were left", async () => {
    const other = makeVault();
    appendFileSync(join(other, ".slipbox", "config.toml"), "\n[ui]\nrestore_session = true\n");
    const lines = Array.from({ length: 80 }, (_, i) => `Line ${i + 1}.`).join("\n\n");
    writeFileSync(join(other, "long.md"), `# Long\n\n${lines}\n`);
    const place = rootAt(other);
    const at = { heading: null, headingIndex: 0, offset: 60, line: 61 };
    const tab = { panes: [{ path: "long.md", anchor: at, cursor: { anchor: at, sub: 0, col: 0 } }], active: 0 };
    mkdirSync(stateDir(place), { recursive: true });
    saveSession(place, {
      version: 1,
      tabs: [tab as SessionTab],
      activeTab: 0,
      sidebar: false,
      recent_notes: ["long.md"],
    });
    // The positions it kept itself before they were the machine's (21.8): taken in once read.
    const before = join(stateDir(place), "positions.json");
    writeFileSync(before, JSON.stringify({ "index.md": { ...TOP, line: 3, at: "2026-01-01T00:00:00.000Z" } }));
    const h = await offThread();
    // Its state folder held, here too: a read of it here would wait, and be named.
    const held = stateDir(place);
    const hold = holding((p) => p.startsWith(held));
    h.app.vaults.switchVault(place, null, undefined, { asked: true });
    await untilHeld(hold, "the session's read");
    expect(h.app.tabs).toEqual([]);
    await keyMeanwhile(h);
    hold.release();
    await h.app.session.entering;
    await h.app.reads.settled();
    expect(h.app.view?.buf.abs).toBe(join(other, "long.md"));
    expect(h.app.view?.topAnchor.line).toBe(61);
    expect(h.app.history.recentNotes).toContain("long.md");
    expect(h.app.positions.get("index.md")?.line).toBe(3);
    expect(existsSync(before)).toBe(false);
    noneGaveUp(hold);
  });

  test("held: the Vaults window drawn from the list it last read, a key handled meanwhile; let go, the list on disk", async () => {
    const one = makeVault();
    recordLocation(rootAt(one));
    const h = await offThread();
    const roots = () =>
      h.app.overlay?.kind === "list"
        ? (h.app.overlay as ListOverlay).items.map((i) => (i.data as { root?: string } | null)?.root)
        : [];
    await h.app.run("vault.open");
    await until(() => roots().includes(one), "the vault in the window");
    await h.keys("escape");
    // Another vault known since: the list on disk has it, the one kept doesn't.
    const two = makeVault();
    recordLocation(rootAt(two));
    // The machine's lists alone: the session's save a second after the start (`publishState`) reads here (SD-D7).
    const hold = holding((p) => /\/(roots|folders)\.json$/.test(p));
    await h.app.run("vault.open");
    expect(roots()).toContain(one);
    expect(roots()).not.toContain(two);
    await untilHeld(hold, "the vaults' list");
    expect(await h.keys("down")).toContain("Vaults —");
    hold.release();
    await until(() => roots().includes(two), "the vault known since, once read");
    expect(h.app.overlay?.kind).toBe("list");
    noneGaveUp(hold);
  });

  test("held: another vault's cache folder under `held` — a link's completion opens at once with this vault's notes, a key handled meanwhile; let go, the other vault's notes are offered too, and at once the next time", async () => {
    cacheHeld();
    const far = join(mkdtempSync(join(sandbox, "far-")), "far");
    mkdirSync(far, { recursive: true });
    writeFileSync(join(far, "faraway.md"), "# Far away\n");
    initVault(far);
    openGraph(locateVault({ root: far }), DEFAULT_CONFIG, true); // its index, as of now
    const h = await offThread();
    await h.app.run("view.source");
    const offered = () => h.app.completion?.items.map((i) => i.detail ?? i.label) ?? [];
    const farNote = join(far, "faraway.md");
    // Worked out before it's held: `rootAt` reads through the seam too.
    const held = cacheDir(rootAt(far));
    const hold = holding((p) => p.startsWith(held));
    await h.keys("shift+g", "o");
    for (const k of "[x](") await h.keys(k);
    expect(h.app.completion?.links).toBe("markdown");
    expect(offered().length).toBeGreaterThan(0);
    expect(offered().some((d) => d.endsWith("faraway.md"))).toBe(false);
    await untilHeld(hold, "the other vaults' notes");
    await h.keys("f");
    expect(h.app.completion).not.toBeNull();
    hold.release();
    await until(() => offered().some((d) => farNote.endsWith(d.replace(/^~/, ""))), "the other vault's note offered");
    // The next completion offers what was read at once, held again.
    await h.keys("escape", "o");
    hold.again();
    for (const k of "[y](") await h.keys(k);
    expect(offered().some((d) => d.endsWith("faraway.md"))).toBe(true);
    await untilHeld(hold, "the other vaults' notes, read again");
    hold.release();
    await h.keys("escape");
    noneGaveUp(hold);
  });

  test("held: the answers kept for links followed, statted by the look each second, never as they're asked; read again on a disk thread once another slipbox answered", async () => {
    const h = await offThread();
    const look = h.app.watch.look;
    const answer = (link: string) => ({ version: 1, links: [{ link, target: "/t", answer: "follow", at: "2026-01" }] });
    mkdirSync(join(sandbox, "held", "state", "slipbox"), { recursive: true });
    rewrite(linksFile(), JSON.stringify(answer("/a")), 0);
    look.request();
    await look.settled();
    const links = () => answersKept().map((a) => a.link);
    // The answers' file alone: the session's save a second after the start (`publishState`) reads here (SD-D7).
    const file = linksFile();
    const hold = holding((p) => p === file);
    expect(links()).toEqual(["/a"]);
    // Another slipbox answered: the look finds the file changed, and reads it there.
    rewrite(linksFile(), JSON.stringify(answer("/b")));
    const asked = look.request();
    await untilHeld(hold, "the look");
    expect(links()).toEqual(["/a"]);
    hold.release();
    await asked;
    await look.settled();
    expect(links()).toEqual(["/b"]);
    noneGaveUp(hold);
  });

  test("held: your config, as the look last read it, carried into a vault gone into — never read as it's gone into", async () => {
    const file = join(sandbox, "held", "config", "yours.toml");
    mkdirSync(join(sandbox, "held", "config"), { recursive: true });
    writeFileSync(file, "[ui]\nline_numbers = false\n");
    const h = await offThread(makeVault(), { configFile: file });
    expect(h.app.config.ui.line_numbers).toBe(false);
    const hold = holding((p) => p === file);
    h.app.vaults.switchVault(rootAt(makeVault()), null, undefined, { asked: true });
    expect(h.app.config.ui.line_numbers).toBe(false);
    expect(h.app.settings.stamped.get(file)).toBe(statSync(file).mtimeMs);
    hold.release();
    await h.app.session.entering;
    noneGaveUp(hold);
  });
});
