import { TEST_BUDGETS } from "./support/timeouts.ts";
import { expect, test } from "bun:test";
import { WorkerRequests } from "../src/core/foundation/workers/worker-requests.ts";
import { workerUrl } from "../src/core/foundation/workers/url.ts";
import { grammar, parseSyntax, commentLinks } from "../src/core/syntax.ts";
import { SYNTAX_SOURCE_LIMIT, stopSyntaxThread, syntaxOnThread } from "../src/core/syntax-thread.ts";
import type { SyntaxSnapshot } from "../src/core/syntax-worker.ts";

const source =
  "/** See https://example.org/docs */\nexport function greet(name: string) {\n  return `Hello ${name}`;\n}\n";
test("the code worker preserves the complete extracted structure", async () => {
  const g = (await grammar("typescript"))!;
  const tree = parseSyntax(g, source)!;
  const expected = {
    spans: tree.spans(),
    outline: tree.outline(),
    errors: tree.errors(),
    links: commentLinks(tree.comments()),
    languages: [...tree.languages()],
    code: tree.codeModel(),
  };
  tree.delete();
  // Worker entry paths stay core-relative when the URL helper moves into a nested folder.
  const jobs = new WorkerRequests(
    () => new Worker(workerUrl("syntax-worker.ts", new URL("../src/core/", import.meta.url).href)),
  );
  try {
    const reply = await jobs.request<{ value: unknown }>({ grammar: "typescript", source });
    expect(reply.value).toEqual(expected);
    const abort = new AbortController();
    abort.abort();
    await expect(jobs.request({ grammar: "typescript", source }, { signal: abort.signal })).rejects.toThrow(
      "cancelled",
    );
  } finally {
    jobs.dispose();
  }
});

/** A Python module of about 3.4 MB holding a CSV fixture: under the source's limit, its structure (a span a line of
 *  the string) bigger than its text. */
const fixture = `"""Fixtures."""\n\nDATA = """\n${Array.from({ length: 180_000 }, (_, i) => `2024-01-${(i % 28) + 1},${i},ok`).join("\n")}\n"""\n\n\ndef rows():\n    return DATA.splitlines()\n`;

test("a source under its limit whose structure is bigger than its text: all of it answered", async () => {
  expect(Buffer.byteLength(fixture)).toBeLessThan(SYNTAX_SOURCE_LIMIT);
  const jobs = new WorkerRequests(() => new Worker(workerUrl("syntax-worker.ts")), { result: Infinity });
  try {
    const reply = await jobs.request<{ value: SyntaxSnapshot }>({ grammar: "python", source: fixture });
    expect(reply.value.spans.length).toBeGreaterThan(180_000);
    expect(reply.value.outline.map((e) => e.name)).toEqual(["rows"]);
  } finally {
    jobs.dispose();
  }
});

test("the syntax thread takes an answer of any size: its source's limit bounds it", async () => {
  const real = globalThis.Worker;
  // A thread answering with an outline entry whose name alone is 18 MiB of UTF-16.
  class Stand {
    onmessage: ((e: MessageEvent) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    postMessage(m: { id: number }) {
      const value = {
        spans: [],
        outline: [{ name: "x".repeat(9 * 1024 * 1024), kind: "function", line: 1, depth: 0 }],
      };
      setTimeout(() => this.onmessage?.(new MessageEvent("message", { data: { id: m.id, value } })), 1);
    }
    terminate() {}
  }
  stopSyntaxThread();
  (globalThis as { Worker: unknown }).Worker = Stand;
  try {
    const value = await syntaxOnThread("typescript", "export function f() {}\n");
    expect(value.outline[0]!.name.length).toBe(9 * 1024 * 1024);
  } finally {
    (globalThis as { Worker: unknown }).Worker = real;
    stopSyntaxThread();
  }
});

test(
  "a pass the thread takes more than five seconds over still lands, as a big minified file's does under load",
  async () => {
    const real = globalThis.Worker;
    // A thread answering after 5.5 s: a 3.7 MB minified bundle's pass takes 4.3 s on a fast machine, more on a busy one.
    class Slow {
      onmessage: ((e: MessageEvent) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      private timer: ReturnType<typeof setTimeout> | null = null;
      postMessage(m: { id: number }) {
        const value = { spans: [], outline: [{ name: "slow", kind: "function", line: 1, depth: 0 }] };
        this.timer = setTimeout(
          () => this.onmessage?.(new MessageEvent("message", { data: { id: m.id, value } })),
          5_500,
        );
      }
      terminate() {
        if (this.timer) clearTimeout(this.timer);
      }
    }
    stopSyntaxThread();
    (globalThis as { Worker: unknown }).Worker = Slow;
    try {
      const value = await syntaxOnThread("javascript", "function f() {}\n");
      expect(value.outline.map((e) => e.name)).toEqual(["slow"]);
    } finally {
      (globalThis as { Worker: unknown }).Worker = real;
      stopSyntaxThread();
    }
  },
  TEST_BUDGETS.syntaxWorkerReply,
);
