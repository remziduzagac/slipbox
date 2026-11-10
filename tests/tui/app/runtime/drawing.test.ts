// What drawing reads off the screen's thread (SD-T11, SD-D13): a note's picture, a `/…` link's file, the scratch's
// places, the Problems panel's notes — each answered from what's kept and asked of a disk thread, drawn meanwhile, and
// drawn again once it answers, from its anchors (D98). Each held (`Hold`): a read put back on the screen's thread waits
// there, given up on (`gaveUpHere`), and the test fails. What waits is told by the hold, or by what's drawn, never by a
// clock (#75).

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { Host } from "../../../../src/tui/app/runtime/app.ts";
import { HELD_MS, type Hold } from "../../../fixtures/walk/slow.ts";
import { makeHeldKeys } from "../../../support/tui/held-keys.ts";
import { type Harness, harness, makeSandbox, makeVault } from "../../../tui-harness.ts";

const sandbox = makeSandbox();
const { holding, untilHeld } = makeHeldKeys();

/** A terminal that draws pictures, its cells 8 × 16: a file's size as it would read it, by its name. */
const terminal = (): Host["images"] => ({
  supported: () => true,
  size: (path) => (basename(path) === "shot.png" ? { width: 400, height: 160 } : null),
  cell: () => ({ width: 8, height: 16 }),
});

/** slipbox in a vault of its own, drawing as the TUI does: what it asks of the disk, asked of a disk thread. */
async function drawing(root: string, opts: Parameters<typeof harness>[0] = {}): Promise<Harness> {
  const h = await harness({ root, open: "index.md", width: 100, height: 30, images: terminal(), ...opts });
  h.app.drawn.offThread = true;
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

const layoutOf = (h: Harness) => h.app.currentLayout(h.app.view!);
const pictured = (h: Harness) => layoutOf(h).lines.some((l) => !!l.image);

/** A vault with a note `p.md` written as given, and a picture under its `held` folder. */
function withPicture(md: string): string {
  const root = makeVault();
  mkdirSync(join(root, "held"), { recursive: true });
  writeFileSync(join(root, "held", "shot.png"), "a stand-in: its size is the terminal's to say");
  writeFileSync(join(root, "p.md"), md);
  return root;
}

describe("what drawing reads, off the screen's thread (SD-T11)", () => {
  test("held: a note with a picture under `held` opened — drawn with the picture's place said, a key handled meanwhile; let go, the picture drawn", async () => {
    const root = withPicture("# P\n\nBefore.\n\n![a shot](held/shot.png)\n\nAfter.\n");
    const h = await drawing(root);
    // The picture held here too; the folder's listings aren't drawing's (the explorer's, a rebuild's: SD-T7, SD-T8).
    const hold = holding((p) => p.endsWith("shot.png"));
    await h.app.open(join(root, "p.md"));
    expect(h.frame()).toContain("Before.");
    await untilHeld(hold, "the picture's stat");
    expect(pictured(h)).toBe(false);
    expect(h.frame()).toContain("▣");
    await keyMeanwhile(h);
    hold.release();
    await until(() => pictured(h), "the picture drawn");
    noneGaveUp(hold);
    h.app.quit();
  });

  test("held: `/…` links into `held` — drawn as resolved at once; the missing one drawn broken once its answer comes", async () => {
    // Outside the vault, its paths the filesystem's: none of them the walk's to answer.
    const far = join(mkdtempSync(join(sandbox, "far-")), "held");
    mkdirSync(far, { recursive: true });
    writeFileSync(join(far, "there.md"), "# There\n");
    const root = makeVault();
    writeFileSync(join(root, "p.md"), `# P\n\n[there](${far}/there.md) and [gone](${far}/gone.md)\n`);
    const h = await drawing(root);
    const hold = holding();
    await h.app.open(join(root, "p.md"));
    const status = () => Object.fromEntries(layoutOf(h).links.map((l) => [l.text, l.status]));
    expect(status()).toEqual({ there: "resolved", gone: "resolved" });
    await untilHeld(hold, "the links' stats");
    await keyMeanwhile(h);
    hold.release();
    await until(() => status().gone === "unresolved", "the missing link drawn broken");
    expect(status().there).toBe("resolved");
    noneGaveUp(hold);
    h.app.quit();
  });

  test("held: the scratch with an `At:` place in a file under `held` — drawn at once, a key handled meanwhile; let go, the place whose lines moved said", async () => {
    const root = makeVault();
    mkdirSync(join(root, "held"), { recursive: true });
    writeFileSync(join(root, "held", "m.md"), "- new first\n- one\n- two\n");
    const h = await drawing(root);
    const path = h.app.scratch.location().path;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "**At:** `held/m.md:1-2`\n\n```\n- one\n- two\n```\n\n**Note:** n\n");
    const hold = holding();
    await h.keys("space", "s", "s");
    expect(h.app.view?.buf.abs).toBe(path);
    expect(h.frame()).toContain("held/m.md:1-2");
    await untilHeld(hold, "the place's file");
    const said = () => h.app.problems.ofView(h.app.view!).map((p) => [p.code, p.message]);
    expect(said()).toEqual([]);
    await keyMeanwhile(h);
    hold.release();
    await until(() => said().length > 0, "the place said");
    expect(said()).toEqual([["place-moved", "lines 1–2 moved: now lines 2–3"]]);
    noneGaveUp(hold);
    h.app.quit();
  });

  test("a layout drawn again for an answer, and again for none new, keeps the cursor's line and the reading position (D98)", async () => {
    const paras = Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1}.`).join("\n\n");
    const root = withPicture(`# P\n\n![a shot](held/shot.png)\n\n${paras}\n`);
    const h = await drawing(root);
    const hold = holding((p) => p.endsWith("shot.png"));
    await h.app.open(join(root, "p.md"));
    expect(h.frame()).toContain("Paragraph 1.");
    await untilHeld(hold, "the picture's stat");
    const v = h.app.view!;
    // Scrolled past the picture's place, the cursor on a paragraph further down.
    const row = layoutOf(h).lines.findIndex((l) => l.spans.some((s) => s.text.includes("Paragraph 20.")));
    h.app.moveCursor(v, { row, col: 0 });
    await h.keys("ctrl+e", "ctrl+e", "ctrl+e");
    const where = () => ({ cursor: layoutOf(h).lines[v.cur.row]?.src, top: v.topAnchor.line });
    const before = where();
    expect(before.top).toBeGreaterThan(1);
    hold.release();
    await until(() => pictured(h), "the picture drawn");
    await h.keys("escape");
    expect(where()).toEqual(before);
    // The same answer once more: nothing changed, nothing moved.
    h.app.relayoutAll();
    await h.keys("escape");
    expect(where()).toEqual(before);
    noneGaveUp(hold);
    h.app.quit();
  });

  test("held: the vault's lint naming a file under `held` — its findings shown unfiltered at once, a key handled meanwhile; let go, the one the view wraps hidden", async () => {
    const root = makeVault();
    mkdirSync(join(root, "held"), { recursive: true });
    const file = join(root, "held", "n.md");
    writeFileSync(file, "# N\n\nA paragraph, wrapped by the view.\n");
    const h = await drawing(root);
    const hold = holding();
    h.app.languages.vaultLint.issues = [
      { file, line: 3, column: 1, rule: "MD013", name: "line-length", description: "Line length" },
    ];
    h.app.problems.panel.tab = "all";
    expect(h.app.problems.hiddenCaption()).toBe("");
    await untilHeld(hold, "the note's text");
    await keyMeanwhile(h);
    hold.release();
    await until(() => h.app.problems.hiddenCaption() !== "", "its findings filtered");
    expect(h.app.problems.hiddenCaption()).toContain("1 hidden: lines the view wraps");
    noneGaveUp(hold);
    h.app.quit();
  });

  test("an embedded note changed on disk just after it was read: drawn anew once read again, not two seconds on", async () => {
    const root = makeVault();
    writeFileSync(join(root, "host.md"), "# Host\n\n![inner](inner.md)\n\nAfter.\n");
    writeFileSync(join(root, "inner.md"), "# Inner\n\nas it was\n");
    // The clock stands still: nothing kept is ever two seconds old.
    const h = await drawing(root, { now: () => 1_000_000 });
    await h.app.open(join(root, "host.md"));
    await until(() => h.frame().includes("▎ as it was"), "the embed drawn once read");
    writeFileSync(join(root, "inner.md"), "# Inner\n\nrewritten by an agent\n");
    const st = statSync(join(root, "inner.md"));
    h.app.graph.updateFile("inner.md", {
      rel: "inner.md",
      abs: join(root, "inner.md"),
      size: st.size,
      mtimeMs: st.mtimeMs,
    });
    await until(() => h.frame().includes("▎ rewritten by an agent"), "the embed drawn anew");
    h.app.quit();
  });

  test("held: a link to a note not written yet, in a folder the walk listed — drawn broken at once, as the walk says, its disk's answer still asked", async () => {
    const root = makeVault();
    mkdirSync(join(root, "held"), { recursive: true });
    writeFileSync(join(root, "held", "there.md"), "# There\n");
    writeFileSync(join(root, "p.md"), "# P\n\n[there](held/there.md) and [yet](held/yet.md)\n");
    const h = await drawing(root);
    // The missing note held here too; the folder's listings aren't drawing's.
    const hold = holding((p) => p.endsWith("yet.md"));
    await h.app.open(join(root, "p.md"));
    const status = () => Object.fromEntries(layoutOf(h).links.map((l) => [l.text, l.status]));
    expect(status()).toEqual({ there: "resolved", yet: "unresolved" });
    await untilHeld(hold, "the missing note's stat");
    await keyMeanwhile(h);
    hold.release();
    noneGaveUp(hold);
    h.app.quit();
  });
});
