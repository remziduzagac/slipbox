// Big notes parsed on other threads (15.1), as the TUI asks: the background index, a note opened, edited, its
// vault left — what each failure of the threads leaves (the note's source, said once; parsed here for the index),
// and what's let go of when the text it was parsing is gone.

import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../src/core/config.ts";
import { Graph } from "../src/core/graph.ts";
import { noteChunks } from "../src/core/parse.ts";
import { stopParsePool } from "../src/core/parse-pool.ts";
import { locateVault } from "../src/core/vault.ts";
import { BACKGROUND_PARSE } from "../src/tui/buffer.ts";
import { harness, makeSandbox, makeVault } from "./tui-harness.ts";

makeSandbox();

/** A note twice the size that goes to the threads: a heading, then lines each linking alpha.md. */
const bigText = (title: string, own = randomBytes(6).toString("hex")) => {
  const line = (i: number) => `Line ${i} ${own} with [a link](alpha.md) and words enough.\n`;
  const count = Math.ceil((2 * BACKGROUND_PARSE) / line(0).length);
  return { text: `# ${title}\n\n${Array.from({ length: count }, (_, i) => line(i)).join("\n")}`, links: count };
};

const real = globalThis.Worker;
/** The threads replaced by `kind` (stand-ins made by the pool from now on), each made one kept in `made`. */
function threads(kind: "silent" | "crash" | "error" | "none") {
  const made: { terminated: boolean; sent: number }[] = [];
  class Stand {
    onmessage: ((e: MessageEvent) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    terminated = false;
    sent = 0;
    constructor() {
      if (kind === "none") throw new Error("no threads here");
      made.push(this);
    }
    postMessage(m: { id: number }) {
      this.sent++;
      if (kind === "silent") return; // working on it, for longer than anyone waits
      setTimeout(() => {
        if (this.terminated) return;
        if (kind === "crash") this.onerror?.({ message: "out of memory" });
        else this.onmessage?.(new MessageEvent("message", { data: { id: m.id, error: "RangeError: too deep" } }));
      }, 1);
    }
    terminate() {
      this.terminated = true;
    }
  }
  stopParsePool();
  (globalThis as { Worker: unknown }).Worker = Stand;
  return made;
}

afterEach(() => {
  (globalThis as { Worker: unknown }).Worker = real;
  stopParsePool();
});

const headings = (h: Awaited<ReturnType<typeof harness>>) => h.app.currentLayout(h.app.view!).headings.length;
const sourceSaid = (h: Awaited<ReturnType<typeof harness>>) =>
  h.app.messages.filter((m) => m.text.includes("is shown as its source"));

describe("the background index's big notes (15.1)", () => {
  test("nine big notes at once: every one parsed on the threads, its links and headings indexed", async () => {
    const root = makeVault();
    const h = await harness({ root });
    const bigs = Array.from({ length: 9 }, (_, i) => `notes/big-${i}.md`);
    const { text, links } = bigText("Big");
    for (const rel of bigs) writeFileSync(join(root, rel), text.replace("# Big", `# ${rel}`));
    h.app.graph.build(true, "lazy");
    h.app.watch.indexInBackground();
    await h.app.watch.whenIndexed();
    const g = h.app.graph;
    expect(bigs.map((rel) => g.backlinks("notes/alpha.md").filter((b) => b.from === rel).length)).toEqual(
      bigs.map(() => links),
    );
    expect(bigs.map((rel) => g.notes.get(rel)?.headings.length)).toEqual(bigs.map(() => 1));
  });

  test("the threads failing: the note parsed here instead — nothing indexed, or cached, from a parse that failed", async () => {
    const root = makeVault();
    const h = await harness({ root });
    const big = "notes/big.md";
    let links = 0;
    for (const kind of ["none", "crash", "error"] as const) {
      // A text of its own each time: no parse of it cached anywhere.
      const note = bigText("Big");
      links = note.links;
      writeFileSync(join(root, big), note.text);
      threads(kind);
      h.app.graph.build(false, "lazy"); // unparsed again, the vault's own cache unread
      h.app.watch.indexInBackground();
      await h.app.watch.whenIndexed();
      const e = h.app.graph.notes.get(big)!;
      expect([kind, e.links.length, e.headings.length, e.title]).toEqual([kind, links, 1, "Big"]);
    }
    // The machine's parse cache (keyed by the text) answers another graph of the vault: the whole entry.
    const again = new Graph(locateVault({ root }), DEFAULT_CONFIG).build(false, "lazy").entry(big)!;
    expect([again.links.length, again.headings.length, again.title]).toEqual([links, 1, "Big"]);
  });

  test("a note changed while its threads parsed it: its new text goes to the threads, not parsed here with old chunks", async () => {
    const root = makeVault();
    const h = await harness({ root });
    const big = "notes/big.md";
    const abs = join(root, big);
    writeFileSync(abs, bigText("Old").text);
    const g = h.app.graph;
    g.build(true, "lazy");
    // Each entry of it: how many of its chunks (as on disk then) weren't parsed on the threads.
    const here: (number | "whole")[] = [];
    const entry = g.entry.bind(g);
    g.entry = (rel, chunks) => {
      if (rel === big && g.unparsedOver(0).some((f) => f.rel === big)) {
        const now = noteChunks(readFileSync(abs, "utf8"));
        here.push(chunks ? now.filter((c) => !chunks.chunks.has(c.text)).length : "whole");
      }
      return entry(rel, chunks);
    };
    // Rewritten once its parse has gone to the threads (the first slice parsed here comes after).
    const parseSome = g.parseSome.bind(g);
    let rewritten = false;
    g.parseSome = (ms, skip) => {
      if (!rewritten && skip?.has(big)) {
        rewritten = true;
        writeFileSync(abs, bigText("New").text);
      }
      return parseSome(ms, skip);
    };
    h.app.watch.indexInBackground();
    await h.app.watch.whenIndexed();
    expect(rewritten).toBe(true);
    expect(here).toEqual([0]);
    expect(g.notes.get(big)!.title).toBe("New");
  });
});

describe("a big note opened (15.1)", () => {
  test("opened while the index parses nine others: drawn rendered, and the nine indexed", async () => {
    const root = makeVault();
    const h = await harness({ root, open: null });
    const bigs = Array.from({ length: 9 }, (_, i) => `notes/big-${i}.md`);
    const { text, links } = bigText("Big");
    for (const rel of bigs) writeFileSync(join(root, rel), text);
    writeFileSync(join(root, "opened.md"), bigText("Opened").text);
    h.app.graph.build(true, "lazy");
    h.app.watch.indexInBackground();
    await new Promise((r) => setTimeout(r, 5)); // the index's parses sent
    h.app.open("opened.md");
    expect(h.frame()).toContain("reading opened.md");
    await h.app.views.whenParsed();
    await h.app.watch.whenIndexed();
    expect(headings(h)).toBeGreaterThan(0);
    expect(sourceSaid(h)).toEqual([]);
    expect(bigs.map((rel) => h.app.graph.backlinks("notes/alpha.md").filter((b) => b.from === rel).length)).toEqual(
      bigs.map(() => links),
    );
  });

  test("the threads failing for their own reason: its source shown, why said once; opened again, parsed and rendered", async () => {
    const root = makeVault();
    writeFileSync(join(root, "big.md"), bigText("Big").text);
    const h = await harness({ root });
    threads("crash");
    h.app.open("big.md");
    h.frame();
    await h.app.views.whenParsed();
    h.frame();
    expect(headings(h)).toBe(0); // its source, one block of it
    expect(h.frame()).toContain("# Big");
    expect(sourceSaid(h).map((m) => m.text)).toEqual([
      "big.md is shown as its source: its parse on another thread failed (worker stopped unexpectedly: out of memory) — open it again to retry",
    ]);
    // Drawn again and again: not parsed again, not said again.
    h.frame();
    h.frame();
    expect([h.app.view!.buf.parsing, sourceSaid(h).length]).toEqual([null, 1]);
    // The threads back; the note opened again: parsed on them, rendered.
    (globalThis as { Worker: unknown }).Worker = real;
    h.app.open("index.md");
    h.app.open("big.md");
    h.frame();
    await h.app.views.whenParsed();
    expect(headings(h)).toBeGreaterThan(0);
    expect(sourceSaid(h).length).toBe(1);
  });

  test("the threads failing on the note itself: its source, why said; opened again, not parsed again", async () => {
    const root = makeVault();
    writeFileSync(join(root, "big.md"), bigText("Big").text);
    const h = await harness({ root });
    threads("error");
    h.app.open("big.md");
    h.frame();
    await h.app.views.whenParsed();
    expect(sourceSaid(h).map((m) => m.text)).toEqual([
      "big.md is shown as its source: its parse on another thread failed (RangeError: too deep)",
    ]);
    (globalThis as { Worker: unknown }).Worker = real;
    h.app.open("index.md");
    h.app.open("big.md");
    h.frame();
    expect(h.app.view!.buf.parsing).toBeNull();
    expect(headings(h)).toBe(0);
  });

  test("an edit lets go of the parse of the old text — its threads stopped at once — and the new text is parsed afresh", async () => {
    const root = makeVault();
    writeFileSync(join(root, "big.md"), bigText("Big").text);
    const h = await harness({ root });
    const made = threads("silent");
    h.app.open("big.md");
    h.frame();
    const buf = h.app.view!.buf;
    const old = buf.parsing;
    expect(old).not.toBeNull();
    const working = made.filter((w) => w.sent > 0);
    expect(working.length).toBeGreaterThan(0);
    buf.edit(0, 0, "x");
    expect(working.map((w) => w.terminated)).toEqual(working.map(() => true));
    await old;
    // Not taken for a failure of the new text: the next draw parses it on the threads.
    expect(buf.parseAhead()).toBe(true);
  });

  test("leaving the vault lets go of its notes' parses: their threads stopped at once", async () => {
    const root = makeVault();
    writeFileSync(join(root, "big.md"), bigText("Big").text);
    const h = await harness({ root });
    const made = threads("silent");
    h.app.open("big.md");
    h.frame();
    const parse = h.app.view!.buf.parsing;
    const working = made.filter((w) => w.sent > 0);
    expect(working.length).toBeGreaterThan(0);
    expect(h.app.vaults.switchVault(locateVault({ root: makeVault() }), null)).toBe(true);
    expect(working.map((w) => w.terminated)).toEqual(working.map(() => true));
    await parse;
  });
});
