import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { newParseCache, parseMarkdown } from "../../../../src/core/documents/markdown/parse.ts";
import { graphemes } from "../../../../src/core/foundation/text/width.ts";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("big notes: parsed on other threads, rendered faster (15.1)", () => {
  const strip = (t: unknown) => JSON.stringify(t, (k, v) => (k === "offset" ? undefined : v));
  /** Every demo note, one after another (the first's frontmatter kept): references, footnotes,
   *  tables, fences, lists across the chunks. */
  const demo = async () => {
    const { readdirSync, statSync } = await import("node:fs");
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((f) =>
        statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f.endsWith(".md") ? [join(d, f)] : [],
      );
    return walk(join(import.meta.dir, "../../../..", "examples", "vault"))
      .sort()
      .map((f, i) => {
        const t = readFileSync(f, "utf8");
        return i ? t.replace(/^---\n[\s\S]*?\n---\n/, "") : t;
      })
      .join("\n\n");
  };

  test("chunks parsed apart (through JSON, as from a thread) and taken in: the tree a parse here gives", async () => {
    const { adoptChunks, noteChunks, parseChunk } = await import("../../../../src/core/documents/markdown/parse.ts");
    const text = await demo();
    const chunks = noteChunks(text);
    expect(chunks.length).toBeGreaterThan(50);
    expect(chunks[0]!.first).toBe(true);
    const cache = newParseCache();
    adoptChunks(
      cache,
      chunks.map((c) => ({ text: c.text, children: JSON.parse(JSON.stringify(parseChunk(c.text, c.first))) })),
    );
    const adopted = parseMarkdown(text, cache);
    expect(strip(adopted.tree.children)).toBe(strip(parseMarkdown(text).tree.children));
    expect(strip(adopted.frontmatter)).toBe(strip(parseMarkdown(text).frontmatter));
    // Each block carries its token for the render's cache, as a block parsed here does (a list
    // joined across a seam is a new node: none, either way).
    const { ORIGIN } = await import("../../../../src/core/documents/markdown/parse.ts");
    const tokens = (t: typeof adopted) =>
      t.tree.children.map((n) => (n as unknown as Record<symbol, unknown>)[ORIGIN] !== undefined);
    expect(tokens(adopted)).toEqual(tokens(parseMarkdown(text, newParseCache())));
    expect(tokens(adopted).filter(Boolean).length).toBeGreaterThan(100);
    // A chunk the cache has already stays as it is (its blocks' rows stay cached).
    const before = new Map(cache.chunks);
    adoptChunks(
      cache,
      chunks.map((c) => ({ text: c.text, children: parseChunk(c.text, c.first) })),
    );
    for (const [k, v] of before) expect(cache.chunks.get(k)).toBe(v);
  });

  test("chunks parsed apart keep heading ids and literal quotes (15.1): a {#id} anchor, an escaped [!note]", async () => {
    const { adoptChunks, headingsOf, noteChunks, parseChunk } = await import(
      "../../../../src/core/documents/markdown/parse.ts"
    );
    const text = "## Setup {#setup}\n\n> \\[!note] literal\n";
    const quote = (t: ReturnType<typeof parseMarkdown>) => t.tree.children.find((n) => n.type === "blockquote")?.data;
    const cache = newParseCache();
    adoptChunks(
      cache,
      noteChunks(text).map((c) => ({
        text: c.text,
        children: JSON.parse(JSON.stringify(parseChunk(c.text, c.first))),
      })),
    );
    const adopted = parseMarkdown(text, cache);
    const plain = parseMarkdown(text);
    expect(headingsOf(plain.tree)).toMatchObject([{ text: "Setup", slug: "setup", id: "setup" }]);
    expect(headingsOf(adopted.tree)).toEqual(headingsOf(plain.tree));
    expect(quote(plain)).toEqual({ literal: true });
    expect(quote(adopted)).toEqual(quote(plain));
  });

  test("on the workers: every chunk in the cache, the same tree; nothing left the second time", async () => {
    const { noteChunks } = await import("../../../../src/core/documents/markdown/parse.ts");
    const { parseInBackground, stopParsePool } = await import("../../../../src/core/documents/markdown/parse-pool.ts");
    const text = await demo();
    const cache = newParseCache();
    expect(await parseInBackground(text, cache)).toBe(true);
    for (const c of noteChunks(text)) expect(cache.chunks.has(c.text)).toBe(true);
    expect(strip(parseMarkdown(text, cache).tree.children)).toBe(strip(parseMarkdown(text).tree.children));
    const had = new Map(cache.chunks);
    expect(await parseInBackground(text, cache)).toBe(true);
    for (const [k, v] of had) expect(cache.chunks.get(k)).toBe(v); // none parsed again
    stopParsePool();
  });

  test("threads that can't start, or a worker that fails: false with source fallback, and a failed worker starts afresh", async () => {
    const { parseInBackground, stopParsePool } = await import("../../../../src/core/documents/markdown/parse-pool.ts");
    const text = await demo();
    const real = globalThis.Worker;
    let made = 0;
    class NoThreads {
      constructor() {
        throw new Error("no threads here");
      }
    }
    // A worker that fails on its first message, as one that crashed would.
    class Failing {
      onmessage: unknown = null;
      onerror: ((e: unknown) => void) | null = null;
      constructor() {
        made++;
      }
      ended = false;
      postMessage() {
        setTimeout(() => this.ended || this.onerror?.(new Error("worker crashed")), 1);
      }
      terminate() {
        this.ended = true; // as a real one: terminated, it says nothing more
      }
    }
    stopParsePool();
    try {
      (globalThis as { Worker: unknown }).Worker = NoThreads;
      const cache = newParseCache();
      expect(await parseInBackground(text, cache)).toBe(false);
      expect(cache.chunks.size).toBe(0);
      (globalThis as { Worker: unknown }).Worker = Failing;
      expect(await parseInBackground(text, cache)).toBe(false); // what was waiting ended, with nothing
      expect(cache.chunks.size).toBe(0);
      const first = made;
      expect(first).toBeGreaterThan(0);
      expect(await parseInBackground(text, cache)).toBe(false);
      expect(made).toBe(first * 2); // each worker that failed was let go of: started again
    } finally {
      (globalThis as { Worker: unknown }).Worker = real;
      stopParsePool();
    }
    const cache = newParseCache();
    expect(await parseInBackground(text, cache)).toBe(true); // real threads again
    expect(cache.chunks.size).toBeGreaterThan(0);
    stopParsePool();
  });

  test("graphemes by islands: what the segmenter gives, for text mostly ASCII", () => {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    let seed = 5;
    const rand = (n: number) => {
      seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
      return (seed >>> 8) % n;
    };
    const pieces = [
      "a",
      "b",
      " ",
      "e\u0301",
      "\u0301",
      "\u0600",
      "1",
      "•",
      "│",
      "漢",
      "👨‍👩‍👧",
      "🇯🇵",
      "\r\n",
      "\n",
      "\t",
      "x",
      "é",
      "\u200d",
      "️",
      "-",
    ];
    for (let k = 0; k < 5000; k++) {
      const text = Array.from({ length: rand(12) }, () => pieces[rand(pieces.length)]!).join("");
      expect(graphemes(text)).toEqual([...seg.segment(text)].map((x) => x.segment));
    }
  });

  test("a code block is highlighted once: a re-wrap reuses its colours", async () => {
    const { highlight } = await import("../../../../src/core/rendering/layout/markdown/highlight.ts");
    const a = highlight("const x = 1;\nfunction f() { return x; }", "ts");
    expect(a).not.toBeNull();
    expect(highlight("const x = 1;\nfunction f() { return x; }", "TS")).toBe(a); // the same lists
    expect(highlight("const x = 2;", "ts")).not.toBe(a);
    expect(highlight("text", "no-such-language")).toBeNull();
  });
});
