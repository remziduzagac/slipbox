// A test's stand-in for one kind of worker. The global `Worker` is swapped for a constructor that makes the stand-in
// only for that worker's script; any other worker made meanwhile is a real one. Bun runs every test file in one
// process, so another file's pool may start a worker while a stand-in is in place: a disk thread started again after
// its deadline, say. Swapped whole, the global made that thread a parser's stand-in, which took its request as a
// parse (dev on macOS, after the disk threads came).

const Real = globalThis.Worker;

type Stand = new (...args: never[]) => unknown;

/**
 * Until the returned function is called: a worker made for a script whose URL ends in `script`
 * (`documents/markdown/parse-worker.ts`) is a `stand`; any other, a real `Worker`. Called again, the newer stand-in
 * takes its script's workers; the returned function (`realWorker`) puts back the real `Worker`.
 */
export function fakeWorker(script: string, stand: Stand): () => void {
  const before = globalThis.Worker;
  function Chosen(url: string | URL, opts?: WorkerOptions): unknown {
    if (String(url).endsWith(script))
      return new (stand as new (u: string | URL, o?: WorkerOptions) => unknown)(url, opts);
    return new (before as new (u: string | URL, o?: WorkerOptions) => unknown)(url, opts);
  }
  (globalThis as { Worker: unknown }).Worker = Chosen;
  return realWorker;
}

/** The real `Worker` back, whatever stand-in was in place. */
export function realWorker(): void {
  (globalThis as { Worker: unknown }).Worker = Real;
}
