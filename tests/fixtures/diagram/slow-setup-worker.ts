// The real diagram worker on a machine where the layout library is slow to set itself up. beautiful-mermaid sets its
// layout engine (ELK) up once per worker, swapping `setTimeout` for its own while it does (its elk-instance.ts); that
// swap is held up here by 600 ms, more than a screen request's 500 ms, and told to whoever listens.
declare const self: Worker;
const tell = self.postMessage.bind(self); // the library takes `self` away while it sets up
const real = globalThis.setTimeout;
let current = real;
Object.defineProperty(globalThis, "setTimeout", {
  configurable: true,
  get: () => current,
  set: (fn: typeof setTimeout) => {
    if (fn !== real) {
      Bun.sleepSync(600);
      tell({ setUp: true });
    }
    current = fn;
  },
});
await import("../../../src/core/rendering/media/diagrams/diagram-worker.ts");
