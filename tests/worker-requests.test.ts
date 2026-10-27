import { TEST_BUDGETS } from "./support/timeouts.ts";
import { afterEach, expect, jest, test } from "bun:test";
import { sizeOf, type WorkerRequestError, WorkerRequests } from "../src/core/foundation/workers/worker-requests.ts";
import { newParseCache, parseChunk, parseMarkdown } from "../src/core/documents/markdown/parse.ts";
import {
  batchDeadline,
  parseInBackground,
  setParseWorkers,
  stopParsePool,
} from "../src/core/documents/markdown/parse-pool.ts";
import { DEFAULT_CONFIG } from "../src/core/application/config/config.ts";

const factory = () => new Worker(new URL("./fixtures/diagram/worker.ts", import.meta.url).href);

/** A stand-in worker the test answers by hand: what it was sent, and whether it was terminated. */
type Hand = {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: unknown) => void) | null;
  sent: { id: number; [k: string]: unknown }[];
  terminated: boolean;
  answer: (data: object) => void;
  postMessage: (message: { id: number }) => void;
  terminate: () => void;
};
function hands(): { made: Hand[]; factory: () => Worker } {
  const made: Hand[] = [];
  return {
    made,
    factory: () => {
      const w: Hand = {
        onmessage: null,
        onerror: null,
        sent: [],
        terminated: false,
        answer: (data) => w.onmessage?.(new MessageEvent("message", { data: { id: w.sent.at(-1)!.id, ...data } })),
        postMessage: (message) => void w.sent.push(message),
        terminate: () => void (w.terminated = true),
      };
      made.push(w);
      return w as unknown as Worker;
    },
  };
}

afterEach(() => setParseWorkers(null));

/** Promises' turns, without a timer's: what fake timers leave to run. */
const settled = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

// The mailbox's deadlines on fake timers: time moves only when the test says, however busy the machine (a loaded
// runner's 100 ms timer once fired after a 200 ms deadline).
test("mailbox: a deadline counts from the hand-off, fails that request alone, and the rest go to a fresh worker", async () => {
  jest.useFakeTimers();
  try {
    const h = hands();
    const jobs = new WorkerRequests(h.factory, { deadline: 200 });
    let slowState: unknown = "pending";
    const slow = jobs.request({ n: "slow" }).catch((e: WorkerRequestError) => [e.kind, e.message]);
    void slow.then((v) => (slowState = v));
    const queued = jobs.request({ n: "queued" });
    jest.advanceTimersByTime(199);
    await settled();
    expect(slowState).toBe("pending");
    jest.advanceTimersByTime(1);
    expect(await slow).toEqual(["deadline", "worker request deadline exceeded"]);
    expect(h.made[0]!.terminated).toBe(true);
    // The queued request is on a fresh worker: it waited as long as its deadline, and its deadline starts now.
    expect(h.made.length).toBe(2);
    expect(h.made[1]!.sent.map((m) => m.n)).toEqual(["queued"]);
    jest.advanceTimersByTime(199);
    await settled();
    h.made[1]!.answer({ value: "done" });
    expect(await queued).toMatchObject({ value: "done" });
    jobs.dispose();
  } finally {
    jest.useRealTimers();
  }
});

test("mailbox: a request's own deadline, past the mailbox's, is the one it has", async () => {
  jest.useFakeTimers();
  try {
    const h = hands();
    const jobs = new WorkerRequests(h.factory, { deadline: 50 });
    let longState = "pending";
    const long = jobs.request({ n: "long" }, { deadline: 400 });
    void long.then(
      () => (longState = "answered"),
      () => (longState = "failed"),
    );
    jest.advanceTimersByTime(399);
    await settled();
    expect(longState).toBe("pending");
    h.made[0]!.answer({ value: "done" });
    expect(await long).toMatchObject({ value: "done" });
    // The next without its own: the mailbox's.
    const short = jobs.request({ n: "short" }).catch((e: WorkerRequestError) => e.kind);
    jest.advanceTimersByTime(50);
    expect(await short).toBe("deadline");
    jobs.dispose();
  } finally {
    jest.useRealTimers();
  }
});

test("a parse batch's deadline grows with it: one block no batch splits, parsed slowly, isn't cut short", () => {
  // CI's macOS runner took over five seconds for a 200 KiB list of links, which is one block.
  expect(batchDeadline(200 * 1024)).toBeGreaterThanOrEqual(30_000);
  // A list as big as walk.max_file_size, at 25 ms a KiB, with room.
  expect(batchDeadline(4 * 1024 * 1024)).toBeGreaterThan(4 * 1024 * 25 * 1.5);
});

test("mailbox: past eight requests or its bytes a caller waits its turn — none refused — and the room comes back", async () => {
  const h = hands();
  const jobs = new WorkerRequests(h.factory, { bytes: 1000 });
  const asked = Array.from({ length: 12 }, (_, i) => jobs.request<{ n: number }>({ n: i }, { bytes: 10 }));
  expect(jobs.pending).toEqual({ requests: 8, bytes: 80, waiting: 4 });
  for (let i = 0; i < 12; i++) h.made[0]!.answer({ n: i });
  expect((await Promise.all(asked)).map((a) => a.n)).toEqual([...Array(12).keys()]);
  expect(jobs.pending).toEqual({ requests: 0, bytes: 0, waiting: 0 });
  // A request's size, counted rather than serialized.
  const counted = jobs.request({ text: "x".repeat(10) });
  expect(jobs.pending.bytes).toBe(sizeOf({ text: "x".repeat(10) }));
  h.made[0]!.answer({});
  await counted;
  // Bytes: the second waits for the first; one bigger than the budget alone is still taken.
  const big = jobs.request({ n: "big" }, { bytes: 5000 });
  const next = jobs.request({ n: "next" }, { bytes: 600 });
  expect(jobs.pending).toEqual({ requests: 1, bytes: 5000, waiting: 1 });
  h.made[0]!.answer({ n: "big" });
  await big;
  expect(jobs.pending).toEqual({ requests: 1, bytes: 600, waiting: 0 });
  h.made[0]!.answer({ n: "next" });
  await next;
  expect(h.made.length).toBe(1);
  jobs.dispose();
});

test("mailbox: cancelled while it waits, a request settles at once and gives its room back; the others go on", async () => {
  const h = hands();
  const jobs = new WorkerRequests(h.factory, { requests: 1 });
  const first = jobs.request({ n: 1 });
  const controller = new AbortController();
  const waiting = jobs.request({ n: 2 }, { signal: controller.signal }).catch((e: WorkerRequestError) => e.kind);
  const after = jobs.request({ n: 3 });
  expect(jobs.pending.waiting).toBe(2);
  controller.abort();
  expect(await waiting).toBe("cancelled");
  expect(jobs.pending.waiting).toBe(1);
  h.made[0]!.answer({ n: 1 });
  await first;
  h.made[0]!.answer({ n: 3 });
  expect(await after).toMatchObject({ n: 3 });
  expect(h.made[0]!.sent.map((m) => m.n)).toEqual([1, 3]);
  jobs.dispose();
});

test("mailbox: a crash fails the request the worker had; those behind it go to a fresh worker", async () => {
  const h = hands();
  const jobs = new WorkerRequests(h.factory);
  const crashed = jobs.request({ n: 1 }).catch((e: WorkerRequestError) => [e.kind, e.message]);
  const behind = jobs.request({ n: 2 });
  h.made[0]!.onerror!({ message: "boom", preventDefault() {} });
  expect(await crashed).toEqual(["crashed", "worker stopped unexpectedly: boom"]);
  h.made[1]!.answer({ n: 2 });
  expect(await behind).toMatchObject({ n: 2 });
  jobs.dispose();
});

test("mailbox: an answer over the result limit fails alone, the worker kept; sizes are counted, not serialized", async () => {
  expect(sizeOf({ ab: "xyz", n: [1, true] })).toBe(4 + 6 + 2 + 8 + 8 + 8);
  const h = hands();
  const jobs = new WorkerRequests(h.factory, { result: 100 });
  const big = jobs.request({}).catch((e: WorkerRequestError) => e.kind);
  const small = jobs.request({});
  h.made[0]!.answer({ json: "x".repeat(100) });
  expect(await big).toBe("result");
  h.made[0]!.answer({ json: "ok" });
  expect(await small).toMatchObject({ json: "ok" });
  expect(h.made.length).toBe(1);
  jobs.dispose();
});

test("mailbox: threads that can't start or take a message settle every request; disposal settles the held and the waiting", async () => {
  const startup = new WorkerRequests(() => {
    throw new Error("not available");
  });
  const both = await Promise.all(
    [startup.request({}), startup.request({})].map((p) => p.catch((e: WorkerRequestError) => [e.kind, e.message])),
  );
  expect(both).toEqual([
    ["unavailable", "worker could not run: Error: not available"],
    ["unavailable", "worker could not run: Error: not available"],
  ]);
  const post = new WorkerRequests(
    () =>
      ({
        postMessage() {
          throw new Error("not available");
        },
        terminate() {},
      }) as unknown as Worker,
  );
  expect(await post.request({}).catch((e: WorkerRequestError) => e.kind)).toBe("unavailable");
  const jobs = new WorkerRequests(factory, { requests: 2 });
  const accepted = Array.from({ length: 4 }, () =>
    jobs.request({ request: { source: "slow" } }).catch((e: WorkerRequestError) => e.kind),
  );
  expect(jobs.pending).toMatchObject({ requests: 2, waiting: 2 });
  jobs.dispose();
  expect(await Promise.all(accepted)).toEqual(["stopped", "stopped", "stopped", "stopped"]);
  expect(jobs.pending).toEqual({ requests: 0, bytes: 0, waiting: 0 });
  expect(await jobs.request({}).catch((e: WorkerRequestError) => e.kind)).toBe("stopped");
});

test("late responses from a stopped worker cannot complete its replacement request", async () => {
  const h = hands();
  const jobs = new WorkerRequests(h.factory);
  const first = jobs.request({}).catch(() => null);
  const previous = h.made[0]!;
  const late = previous.onmessage!;
  jobs.stop();
  expect(await first).toBeNull();
  const next = jobs.request({});
  const current = h.made[1]!;
  // The old worker answering with the new request's number: still not the worker that has it.
  late(new MessageEvent("message", { data: { id: current.sent[0]!.id, answer: "obsolete" } }));
  current.answer({ answer: "current" });
  expect(await next).toMatchObject({ answer: "current" });
  jobs.dispose();
});

test("a throwing worker shutdown still settles every accepted request", async () => {
  const jobs = new WorkerRequests(
    () =>
      ({
        postMessage() {},
        terminate() {
          throw new Error("already stopped");
        },
      }) as unknown as Worker,
  );
  const accepted = jobs.request({}).catch((error) => error.message);
  jobs.dispose();
  expect(await accepted).toContain("stopped");
});

test("cancelling active work preserves unrelated queued requests on a fresh worker", async () => {
  const h = hands();
  const jobs = new WorkerRequests(h.factory);
  const controller = new AbortController();
  const old = jobs.request({ name: "cancelled" }, { signal: controller.signal }).catch((error) => error.message);
  const queued = jobs.request({ name: "kept" });
  controller.abort();
  expect(await old).toContain("cancelled");
  expect(h.made[0]!.terminated).toBe(true);
  h.made[1]!.answer({ name: "kept" });
  expect(await queued).toMatchObject({ name: "kept" });
  expect(h.made.length).toBe(2);
  jobs.dispose();
});

// --- the parse pool --------------------------------------------------------------------------------------------------

/** A big note: headings, wikilinks and lists — the shape whose tree is largest for its text. */
const bigNote = (title: string, size: number) => {
  let s = `# ${title}\n\n`;
  for (let k = 0; s.length < size; k++) s += `## Part ${k}\n\nSee [[Meeting ${k}]] and #tag${k}.\n\n- [[a]]\n- b\n\n`;
  return s;
};

test("stopping the parser settles accepted work rather than hanging its caller", async () => {
  const cache = newParseCache();
  const pending = parseInBackground("# Heading\n\ntext\n".repeat(1000), cache);
  stopParsePool();
  expect(await pending).toBe(false);
  expect(cache.backgroundFailure).toMatchObject({ transient: true });
  const parsed = parseMarkdown(cache.backgroundFailure!.source, cache);
  expect(parsed.error).toBeDefined();
  expect(parsed.tree.children[0]?.type).toBe("code");
});

test("a newer parse revision owns the shared cache", async () => {
  const cache = newParseCache();
  const old = parseInBackground("# Old\n\ntext\n".repeat(1000), cache);
  const current = "# Current\n\nnew text\n".repeat(1000);
  const next = parseInBackground(current, cache);
  expect(await old).toBe(false);
  expect(await next).toBe(true);
  expect(cache.backgroundFailure).toBeUndefined();
  expect(parseMarkdown(current, cache).tree.children[0]).toMatchObject({ type: "heading" });
  stopParsePool();
});

for (const workers of [null, 1]) {
  test(
    `a burst of twelve big notes parses — none refused, none failed for another (${workers ?? "the machine's"} worker${workers === 1 ? "" : "s"})`,
    async () => {
      setParseWorkers(workers);
      const notes = Array.from({ length: 12 }, (_, i) => bigNote(`Note ${i}`, 100 * 1024));
      const caches = notes.map(() => newParseCache());
      const ok = await Promise.all(notes.map((n, i) => parseInBackground(n, caches[i]!)));
      expect(caches.map((c) => c.backgroundFailure?.why ?? null)).toEqual(notes.map(() => null));
      expect(ok.every(Boolean)).toBe(true);
      for (const [i, n] of notes.entries())
        expect(parseMarkdown(n, caches[i]!).tree.children[0]).toMatchObject({ type: "heading" });
    },
    TEST_BUDGETS.parseBurst,
  );
}

test(
  "a note as big as walk.max_file_size parses on one worker: never refused for its size or its tree's",
  async () => {
    setParseWorkers(1);
    const text = bigNote("Index", DEFAULT_CONFIG.walk.max_file_size);
    const cache = newParseCache();
    expect(await parseInBackground(text, cache)).toBe(true);
    expect(cache.backgroundFailure).toBeUndefined();
    expect(parseMarkdown(text, cache).tree.children[0]).toMatchObject({ type: "heading" });
  },
  TEST_BUDGETS.maximumNoteParse,
);

test("a note whose tree is many times its text — a long list of links — parses on one worker, its answer uncapped", async () => {
  setParseWorkers(1);
  let text = "# Links\n\n";
  while (text.length < 200 * 1024) text += "- [[a]]\n";
  const cache = newParseCache();
  expect(await parseInBackground(text, cache)).toBe(true);
  expect(cache.backgroundFailure).toBeUndefined();
  expect(parseMarkdown(text, cache).tree.children[1]).toMatchObject({ type: "list" });
});

test("one note's failure is its own: a crash fails the note the worker had, the notes behind it parse on a fresh worker", async () => {
  const real = globalThis.Worker;
  let made = 0;
  /** Parses as the real worker does, here; the first one made crashes on its first message. */
  class Local {
    onmessage: ((e: MessageEvent) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    readonly n = made++;
    postMessage(m: { id: number; chunks: { text: string; first: boolean }[] }) {
      setTimeout(() => {
        if (this.n === 0) return this.onerror?.({ message: "out of memory" });
        if (m.chunks.some((c) => c.text.includes("unparsable")))
          return this.onmessage?.(new MessageEvent("message", { data: { id: m.id, error: "RangeError: too deep" } }));
        const json = JSON.stringify(m.chunks.map((c) => parseChunk(c.text, c.first)));
        this.onmessage?.(new MessageEvent("message", { data: { id: m.id, json } }));
      }, 1);
    }
    terminate() {}
  }
  setParseWorkers(1);
  try {
    (globalThis as { Worker: unknown }).Worker = Local;
    const notes = ["First", "Second", "Third"].map((t) => bigNote(t, 64 * 1024));
    notes.push(`${bigNote("Fourth", 64 * 1024)}\n\nunparsable\n`);
    const caches = notes.map(() => newParseCache());
    const ok = await Promise.all(notes.map((n, i) => parseInBackground(n, caches[i]!)));
    expect(ok).toEqual([false, true, true, false]);
    // The crash is about the worker: tried again later. The worker's own answer is about the note: not.
    expect(caches[0]!.backgroundFailure).toMatchObject({
      why: "worker stopped unexpectedly: out of memory",
      transient: true,
    });
    expect(caches[3]!.backgroundFailure).toMatchObject({ why: "RangeError: too deep", transient: false });
    expect(made).toBe(2); // one restart, for the crash alone
  } finally {
    (globalThis as { Worker: unknown }).Worker = real;
  }
});
