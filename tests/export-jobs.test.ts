import { expect, jest, test } from "bun:test";
import { ExportJob, type ExportRequest } from "../src/core/rendering/export/jobs.ts";

const request = {} as ExportRequest;
function fake() {
  const worker = {
    onmessage: null as ((event: unknown) => void) | null,
    onerror: null as (() => void) | null,
    terminated: false,
    sent: 0,
    postMessage() {
      this.sent++;
    },
    terminate() {
      this.terminated = true;
    },
  };
  return worker;
}
const done = (worker: ReturnType<typeof fake>, data = new Uint8Array([1]), files: unknown[] = []) =>
  worker.onmessage?.({ data: { output: { data, files } } });

test("an export waits for readiness, reports progress and completes exactly once", async () => {
  const worker = fake();
  const progress: string[] = [];
  const pending = new ExportJob(() => worker as unknown as Worker).run(request, {
    progress: (stage) => progress.push(stage),
  });
  expect(worker.sent).toBe(0);
  worker.onmessage?.({ data: { ready: true } });
  worker.onmessage?.({ data: { ready: true } });
  expect(worker.sent).toBe(1);
  worker.onmessage?.({ data: { stage: "assembling" } });
  done(worker);
  expect((await pending).data).toEqual(new Uint8Array([1]));
  expect(progress).toEqual(["assembling"]);
  expect(worker.terminated).toBe(true);
});

test("a cancelled export settles and terminates its worker", async () => {
  const worker = fake();
  const abort = new AbortController();
  const pending = new ExportJob(() => worker as unknown as Worker).run(request, { signal: abort.signal });
  abort.abort();
  await expect(pending).rejects.toThrow("cancelled");
  expect(worker.terminated).toBe(true);
});

test("an export takes as long as it needs: many pictures, a slow converter, no deadline cuts it short", async () => {
  jest.useFakeTimers();
  try {
    const worker = fake();
    const pending = new ExportJob(() => worker as unknown as Worker).run(request);
    worker.onmessage?.({ data: { ready: true } });
    jest.advanceTimersByTime(10 * 60_000);
    expect(worker.terminated).toBe(false);
    done(worker);
    expect((await pending).data).toEqual(new Uint8Array([1]));
  } finally {
    jest.useRealTimers();
  }
});

test("more exports than run at once wait their turn, in order, none refused; one cancelled while waiting is given up", async () => {
  const workers = [fake(), fake(), fake(), fake()];
  let made = 0;
  const job = new ExportJob(() => workers[made++] as unknown as Worker);
  const first = job.run(request);
  const second = job.run(request);
  const abort = new AbortController();
  const third = job.run(request, { signal: abort.signal });
  const fourth = job.run(request);
  // Two at once; the others wait, nothing refused.
  expect(made).toBe(2);
  abort.abort();
  await expect(third).rejects.toThrow("cancelled");
  done(workers[0]!, new Uint8Array([1]));
  expect((await first).data).toEqual(new Uint8Array([1]));
  // The first's turn to the fourth: the third gave its place up.
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(made).toBe(3);
  done(workers[2]!, new Uint8Array([4]));
  expect((await fourth).data).toEqual(new Uint8Array([4]));
  done(workers[1]!, new Uint8Array([2]));
  expect((await second).data).toEqual(new Uint8Array([2]));
  // Every turn given back: two start at once again.
  const again = [fake(), fake()];
  let more = 0;
  const later = new ExportJob(() => again[more++] as unknown as Worker);
  const both = [later.run(request), later.run(request)];
  expect(more).toBe(2);
  for (const w of again) done(w);
  await Promise.all(both);
});

test("a big vault's names, a big output and many files beside it: sent and taken whole, none refused for its size", async () => {
  // A vault of 30,000 notes, each with an alias: what the export resolves links by.
  const names = Array.from({ length: 30_000 }, (_, i) => ({
    rel: `notes/batch-${i % 60}/note-${i}.md`,
    aliases: [`Topic number ${i}`],
    previous: [],
  }));
  const worker = fake();
  const pending = new ExportJob(() => worker as unknown as Worker).run({ ...request, names });
  worker.onmessage?.({ data: { ready: true } });
  expect(worker.sent).toBe(1);
  // A document of photos past 128 MiB, and a Markdown export's 10,001 pictures beside it.
  const files = Array.from({ length: 10_001 }, (_, i) => ({ path: `book.assets/p-${i}.png`, data: new Uint8Array() }));
  done(worker, new Uint8Array(129 * 1024 * 1024), files);
  const out = await pending;
  expect([out.data.byteLength, out.files.length]).toEqual([129 * 1024 * 1024, 10_001]);
});

test("invalid worker output and a failing progress observer settle the export", async () => {
  const worker = fake();
  const pending = new ExportJob(() => worker as unknown as Worker).run(request);
  worker.onmessage?.({
    data: { output: { data: new Uint8Array(), files: [{ path: "../other", data: new Uint8Array() }] } },
  });
  await expect(pending).rejects.toThrow("attachment");
  const observer = fake();
  const observed = new ExportJob(() => observer as unknown as Worker).run(request, {
    progress: () => {
      throw Error("observer failed");
    },
  });
  observer.onmessage?.({ data: { stage: "reading" } });
  await expect(observed).rejects.toThrow("observer failed");
});
