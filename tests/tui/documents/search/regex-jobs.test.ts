import { afterAll, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { compilePattern, findAll, replaceMatches } from "../../../../src/core/documents/editing/replace.ts";
import { planReplaceLater } from "../../../../src/core/workspace/mutations/replace-files.ts";
import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import { layoutMatches, matchText, stopRegexJobs } from "../../../../src/core/workspace/search/regex-jobs.ts";
import { computeFind } from "../../../../src/tui/workspace/search/search.ts";
import { textMatches } from "../../../../src/tui/documents/search/replacing.ts";
import type { PromptOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { harness, makeSandbox, makeVault } from "../../../tui-harness.ts";
makeSandbox();
afterAll(stopRegexJobs);

test("a find shows its first 10,000 matches, marked; a replace takes every match, however many", async () => {
  const text = "x ".repeat(10001);
  const result = await matchText(text, /x/u, { regex: true, show: true });
  expect(result.limited).toBe(true);
  expect(result.matches).toHaveLength(10000);
  // A replace, and the command line, ask for every match: plain and regex alike.
  for (const regex of [false, true]) {
    const every = await matchText("x ".repeat(30_000), /x/gu, { regex });
    expect(every.limited).toBe(false);
    expect(every.matches).toHaveLength(30_000);
  }
  // An answer bigger than a mailbox's 16 MiB: taken whole, the worker having bounded it by its input.
  expect((await matchText("x ".repeat(400_000), /x/gu, { regex: true })).matches).toHaveLength(400_000);
  const root = makeVault();
  writeFileSync(join(root, "limit.md"), text);
  const h = await harness({ root, open: "limit.md" });
  await h.app.run("find.substitute %s/x/y/g");
  expect(h.app.view!.buf.source).toBe("y ".repeat(10001));
  expect(h.frame()).toContain("10001 substitutions");
});

test("a plain find, worked out at once as ever, counts and steps through every match", async () => {
  const root = makeVault();
  writeFileSync(join(root, "plain.md"), "x\n".repeat(10_005));
  const h = await harness({ root, open: "plain.md" });
  const v = h.app.view!;
  await h.keys("/", "x", "enter");
  expect(v.find!.matches).toHaveLength(10_005);
  expect(v.find!.limited).toBeUndefined();
  // Back from the first, round to the last: the note's last x, past the 10,000th.
  await h.keys("shift+n");
  const last = v.find!.matches.at(-1)!;
  expect(v.cur).toEqual({ row: last.row, col: last.col });
});

test("nothing about a find's size refuses it: a long pattern, a big note, a big replacement, a big plan", async () => {
  // A list of words as one pattern, longer than 8,192 characters.
  const words = Array.from({ length: 1200 }, (_, i) => `term${i}`).join("|");
  const long = compilePattern(`${words}|Aster`, { regex: true, whole: false });
  expect(long).toBeInstanceOf(RegExp);
  // A note over 4 MiB of text (8 MiB as UTF-16), named to find in.
  const big = `${"a line of ordinary text\n".repeat(180_000)}needle\n`;
  for (const regex of [false, true])
    expect((await matchText(big, /needle/gu, { regex })).matches.map((m) => m.from)).toEqual([big.length - 7]);
  // A replacement whose note is past 8 MiB of UTF-16.
  const replaced = replaceMatches(big, findAll(big, /needle/gu), "pin", false).text;
  expect(replaced.endsWith("pin\n")).toBe(true);
  // Replaced across files, a plan over 16 MiB of before and after.
  const root = makeVault();
  for (let i = 0; i < 3; i++) writeFileSync(join(root, `p${i}.md`), `${"x".repeat(1_500_000)}\nthe quick fox\n`);
  const g = openGraph(locateVault({ root }), DEFAULT_CONFIG, true);
  const plan = await planReplaceLater(g, "quick", "slow", ["p0.md", "p1.md", "p2.md"], { regex: false, whole: false });
  expect(plan.files).toHaveLength(3);
});

test("layout regex has an explicit pending state and superseded owners settle without stale results", async () => {
  const root = makeVault();
  writeFileSync(join(root, "find.md"), "cat dog cat\n");
  const h = await harness({ root, open: "find.md" });
  const view = h.app.view!;
  const layout = h.app.currentLayout(view);
  expect(computeFind(layout, "c.t", 0, false, true, false, view).pending).toBe(true);
  const owner = {};
  const old = layoutMatches(["cat dog"], /cat/u, owner);
  const current = layoutMatches(["cat dog"], /dog/u, owner);
  await Promise.all([old.pending, current.pending]);
  expect(current.value?.matches).toEqual([{ row: 0, from: 4, to: 7 }]);
  const cycled = {};
  const first = layoutMatches(["cat dog"], /cat/u, cycled);
  const middle = layoutMatches(["cat dog"], /dog/u, cycled);
  const last = layoutMatches(["cat dog"], /cat/u, cycled);
  await Promise.all([first.pending, middle.pending, last.pending]);
  expect(last.value?.matches).toEqual([{ row: 0, from: 0, to: 3 }]);
  expect(layoutMatches(["cat dog"], /cat/u, cycled)).toBe(last);

  const matching = textMatches(view, "c.t", undefined, { regex: true, whole: false });
  view.buf.edit(0, 0, "changed ");
  expect(await matching).toContain("document changed");
});

test("live regex typing and escape stay responsive while its controlled worker has no answer", async () => {
  const root = makeVault();
  writeFileSync(join(root, "busy.md"), "ordinary text\n");
  const h = await harness({ root, open: "busy.md" });
  stopRegexJobs();
  const original = globalThis.Worker;
  let terminated = 0;
  globalThis.Worker = class {
    postMessage() {}
    terminate() {
      terminated++;
    }
    ref() {}
    unref() {}
  } as unknown as typeof Worker;
  try {
    const entered = h.keys("/", "alt+r", "t", "e");
    expect(await Promise.race([entered.then(() => "typed"), Bun.sleep(500).then(() => "blocked")])).toBe("typed");
    expect(h.app.view!.find?.pending).toBe(true);
    expect(await Promise.race([h.keys("escape").then(() => "closed"), Bun.sleep(500).then(() => "blocked")])).toBe(
      "closed",
    );
    expect(h.app.overlay).toBeNull();
    expect(terminated).toBeGreaterThan(0);
  } finally {
    stopRegexJobs();
    globalThis.Worker = original;
  }
});

/** The regex worker's messages held until let go: a real worker behind them, answering when let. */
function gatedWorker() {
  const Real = globalThis.Worker;
  const held: (() => void)[] = [];
  class Gated {
    inner: Worker;
    onmessage: ((e: MessageEvent) => void) | null = null;
    onerror: ((e: ErrorEvent) => void) | null = null;
    constructor(url: string) {
      this.inner = new Real(url);
      this.inner.onmessage = (e) => this.onmessage?.(e);
      this.inner.onerror = (e) => this.onerror?.(e as ErrorEvent);
    }
    postMessage(message: unknown) {
      held.push(() => this.inner.postMessage(message));
    }
    terminate() {
      this.inner.terminate();
    }
    ref() {}
    unref() {
      (this.inner as unknown as { unref?: () => void }).unref?.();
    }
  }
  stopRegexJobs();
  globalThis.Worker = Gated as unknown as typeof Worker;
  return {
    /** Let the worker answer, again and again, until `done` (or a second). */
    async until(done: () => boolean) {
      for (let i = 0; i < 100 && !done(); i++) {
        for (const send of held.splice(0)) send();
        await Bun.sleep(10);
      }
    },
    restore() {
      stopRegexJobs();
      globalThis.Worker = Real;
    },
  };
}

test("the replace row's count settles when its replacement is typed while a toggle's recount is out", async () => {
  const root = makeVault();
  writeFileSync(join(root, "count.md"), "cat cut cot\n");
  const h = await harness({ root, open: "count.md" });
  await h.keys("/", "c", ".", "t", "tab");
  const o = h.app.overlay as PromptOverlay;
  expect(o.replace).toMatchObject({ focus: true, total: 0 }); // a literal dot: nothing
  const gate = gatedWorker();
  try {
    await h.keys("alt+r", "d"); // a regex now, recounted in the worker; "d" typed into the replacement meanwhile
    expect(o.replace!.pending).toBe(true);
    await gate.until(() => !o.replace!.pending && !h.app.view!.find?.pending);
    expect(o.replace).toMatchObject({ pending: false, total: 3, text: "d" });
    expect(h.frame()).not.toContain("searching");
  } finally {
    gate.restore();
  }
});

test("a recount that settles after its key was drawn asks for a frame: a paste, alt+h, a toggle's click", async () => {
  const root = makeVault();
  writeFileSync(join(root, "frames.md"), "cat cut cot\n");
  const h = await harness({ root, open: "frames.md", width: 100 });
  const o = () => h.app.overlay as PromptOverlay;
  // The replace row's count as it was at each frame asked for.
  const frames: (boolean | undefined)[] = [];
  h.app.host.requestRender = () => frames.push(o()?.replace?.pending);
  // Settled, and a frame asked for after it did: [what did it, the count pending at the last frame asked for].
  const settled = async (what: string) => {
    for (let i = 0; i < 100 && o().replace?.pending !== false; i++) await Bun.sleep(10);
    await Bun.sleep(20);
    expect(o().replace?.pending).toBe(false);
    expect([what, frames.at(-1)]).toEqual([what, false]);
  };
  await h.keys("/", "alt+r", "tab", "shift+tab");
  await settled("the keys");
  frames.length = 0;
  await h.app.input.paste("c.t");
  await settled("a paste");
  expect(o().replace!.total).toBe(3);
  frames.length = 0;
  await h.keys("alt+h", "alt+h");
  await settled("alt+h");
  h.frame();
  const regex = h.app.geometry!.hot.find((r) => r.id === "findopt:regex:0")!;
  frames.length = 0;
  h.app.mouse.handle({ type: "down", x: regex.x + 1, y: regex.y, button: 0 });
  h.app.mouse.handle({ type: "up", x: regex.x + 1, y: regex.y, button: 0 });
  await settled("a toggle's click");
  expect(o().replace!.total).toBe(0); // a literal dot again
});

test("a recount overtaken by the next one is no failure: the find never says it failed", async () => {
  const root = makeVault();
  writeFileSync(join(root, "step.md"), "cat cut cot\n");
  const h = await harness({ root, open: "step.md" });
  const v = h.app.view!;
  await h.keys("/", "alt+r", "tab", "shift+tab");
  const o = h.app.overlay as PromptOverlay;
  // Every failed find the window is given, as it's given.
  const failed: string[] = [];
  let find = v.find;
  Object.defineProperty(v, "find", {
    get: () => find,
    set: (f) => {
      find = f;
      if (f?.failed) failed.push(f.error);
    },
    configurable: true,
  });
  const gate = gatedWorker();
  try {
    await h.keys("c", ".", "t"); // recounted in the worker as it's typed
    const tabbed = h.app.input.handleKey("tab"); // into the replacement, recounting, before the count is in
    await gate.until(() => o.replace?.pending === false && !v.find?.pending);
    await tabbed;
    expect(failed).toEqual([]);
    expect(o.replace).toMatchObject({ pending: false, total: 3, focus: true });
  } finally {
    gate.restore();
  }
});

test("a find typed while the window is laid out again lands on its match, laid out as it is now", async () => {
  const root = makeVault();
  writeFileSync(join(root, "wrap.md"), `${"word ".repeat(40)}\n\nthe target is here\n`);
  const h = await harness({ root, open: "wrap.md" });
  const v = h.app.view!;
  const gate = gatedWorker();
  try {
    await h.keys("/", "alt+r", ..."target");
    expect(v.find?.pending).toBe(true);
    // Narrower before the worker answers (a resize, a picture arriving): the long line wraps on more rows.
    v.width = 30;
    h.app.relayoutAll();
    // Where the match is now, as a plain find (worked out at once) has it.
    const [now] = computeFind(h.app.currentLayout(v), "target", 0).matches;
    expect(now!.row).toBeGreaterThan(2);
    await gate.until(() => !v.find?.pending && v.cur.row > 0);
    expect(v.find).toMatchObject({ matches: [{ row: now!.row, col: now!.col }] });
    expect(v.cur).toEqual({ row: now!.row, col: now!.col });
    const entered = h.app.input.handleKey("enter");
    await gate.until(() => h.app.overlay === null);
    await entered;
    expect(v.cur).toEqual({ row: now!.row, col: now!.col });
  } finally {
    gate.restore();
  }
});

test("a search that failed is tried again when it's asked for again", async () => {
  const root = makeVault();
  writeFileSync(join(root, "again.md"), "cat cut cot\n");
  const h = await harness({ root, open: "again.md" });
  const v = h.app.view!;
  stopRegexJobs();
  const Real = globalThis.Worker;
  // The worker can't start, this once: a failure of the moment, as a deadline on a busy machine is.
  globalThis.Worker = class {
    constructor() {
      throw new Error("no threads now");
    }
  } as unknown as typeof Worker;
  try {
    await h.keys("/", "alt+r", ..."c.t");
    for (let i = 0; i < 100 && v.find?.pending; i++) await Bun.sleep(10);
    expect(v.find).toMatchObject({ failed: true });
    globalThis.Worker = Real;
    await h.keys("enter");
    for (let i = 0; i < 100 && (v.find?.pending || v.find?.failed); i++) await Bun.sleep(10);
    expect(v.find).toMatchObject({ query: "c.t", matches: [{ row: 0 }, { row: 0 }, { row: 0 }] });
    expect(v.find?.failed).toBeUndefined();
  } finally {
    stopRegexJobs();
    globalThis.Worker = Real;
  }
});
