// A controlled renderer stand-in: the deadline test never depends on a particular diagram shape.
declare const self: Worker;
self.onmessage = (event: MessageEvent) => {
  if (event.data.request.source.startsWith("slow")) {
    while (true) { /* deliberately non-yielding work */ }
  }
  if (event.data.request.source === "finite") {
    const until = performance.now() + 70;
    while (performance.now() < until) { /* finite work longer than the screen test budget */ }
  }
  if (event.data.request.source === "crash") throw new Error("test worker failure");
  if (event.data.request.source === "large") {
    self.postMessage({ id: event.data.id, value: { rows: ["x".repeat(600000)] } });
    return;
  }
  self.postMessage({ id: event.data.id, value: { rows: [event.data.request.source] } });
};
self.postMessage({ ready: true });
