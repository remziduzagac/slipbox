import { describe, expect, spyOn, test } from "bun:test";
import type { Graph } from "../../../../src/core/workspace/graph/graph.ts";
import type { HomeWalk } from "../../../../src/core/workspace/vaults/home.ts";
import { walkThread } from "../../../../src/core/workspace/walk/walk-thread.ts";
import type { App } from "../../../../src/tui/app/runtime/app.ts";
import { parseInSlices, Watch } from "../../../../src/tui/app/runtime/watch.ts";

/** Run the real slice callbacks in order without waiting on wall time. */
function timers() {
  const queued: { run: () => void; delay: number }[] = [];
  const timer = spyOn(globalThis, "setTimeout").mockImplementation(((run: () => void, delay: number) => {
    queued.push({ run, delay });
    return { unref() {} };
  }) as unknown as typeof setTimeout);
  return { queued, restore: () => timer.mockRestore() };
}

describe("background refresh and watcher delivery", () => {
  test("slices pause before graph access, read the live graph on resume, and stop before another slice", () => {
    const clock = timers();
    const events: string[] = [];
    let paused = true;
    let stopped = false;
    const graph = (name: string, left: number) =>
      ({
        unparsedOver: () => (events.push(`${name}:large`), []),
        parseSome: () => (events.push(`${name}:slice`), left),
      }) as unknown as Graph;
    let current = graph("old", 1);
    try {
      parseInSlices(() => current, {
        stopped: () => stopped,
        paused: () => paused,
        slice: (left) => events.push(`left:${left}`),
        done: () => events.push("done"),
      });
      expect(clock.queued[0]!.delay).toBe(1);
      clock.queued.shift()!.run();
      expect(events).toEqual([]);
      expect(clock.queued[0]!.delay).toBe(50);
      paused = false;
      current = graph("new", 1);
      clock.queued.shift()!.run();
      expect(events).toEqual(["new:large", "new:slice", "left:1"]);
      stopped = true;
      clock.queued.shift()!.run();
      expect(events).toEqual(["new:large", "new:slice", "left:1"]);
      expect(clock.queued).toEqual([]);
    } finally {
      clock.restore();
    }
  });

  test("index completion clears progress before invalidation and cancellation prevents delivery", () => {
    const clock = timers();
    const events: string[] = [];
    let cancel: (quiet?: boolean) => void = () => {};
    const finish = Object.assign(() => events.push("finished"), {
      update: (text: string) => events.push(text),
    });
    const app = {
      graph: { pendingCount: 1, unparsedOver: () => [], parseSome: () => 0 },
      indexing: 0,
      quitting: false,
      now: () => 100,
      background: {
        begin: (_label: string, stop: typeof cancel) => {
          cancel = stop;
          return finish;
        },
      },
      explorer: { invalidateTree: () => events.push(`tree:${app.indexing}`) },
      buffers: new Map([["one", { invalidateLayouts: () => events.push("buffer") }]]),
      relayoutAll: () => events.push("layout"),
      host: { requestRender: () => events.push("render") },
      message: (_level: string, text: string) => events.push(text),
    };
    const watch = new Watch(app as unknown as App);
    try {
      watch.indexInBackground();
      watch.indexInBackground(); // Already running: no second task or timer.
      expect(clock.queued).toHaveLength(1);
      clock.queued.shift()!.run();
      expect(events).toEqual([
        "Indexing 0/1 files",
        "Indexing 1/1 files",
        "finished",
        "tree:0",
        "buffer",
        "layout",
        "render",
      ]);
      events.length = 0;
      watch.indexInBackground();
      cancel(true);
      expect(app.indexing).toBe(0);
      clock.queued.shift()!.run();
      expect(events).toEqual(["Indexing 0/1 files", "finished"]);
      expect(clock.queued).toEqual([]);
    } finally {
      clock.restore();
    }
  });

  test("home refresh drops stale graph, location, build and quitting answers and always removes its listener", async () => {
    const walker = walkThread();
    const walk = spyOn(walker, "homeWalk");
    try {
      for (const stale of ["graph", "location", "build", "quitting", "superseded", "failure"]) {
        const requests: ReturnType<typeof Promise.withResolvers<HomeWalk>>[] = [];
        walk.mockImplementation(() => {
          const request = Promise.withResolvers<HomeWalk>();
          requests.push(request);
          return request.promise;
        });
        let listeners = 0;
        const graph = {
          askedFolders: [],
          builds: 1,
          filter: { settings: {} },
          onChange: () => {
            listeners++;
            return () => listeners--;
          },
        };
        const app = { loc: { mode: "home" }, graph, quitting: false };
        const watch = new Watch(app as unknown as App);
        const refresh = watch as unknown as { homeIndexed(cap: null): void };
        refresh.homeIndexed(null);
        const first = watch.homeRefreshed;
        expect(listeners).toBe(1);
        if (stale === "graph") app.graph = { ...graph };
        if (stale === "location") app.loc = { ...app.loc };
        if (stale === "build") graph.builds++;
        if (stale === "quitting") app.quitting = true;
        if (stale === "superseded" || stale === "failure") refresh.homeIndexed(null);
        if (stale === "failure") requests[0]!.reject(new Error("obsolete walk"));
        else requests[0]!.resolve({} as HomeWalk);
        await first; // No build, selection, warning or render capability: stale delivery would throw.
        expect(listeners).toBe(requests.length - 1);
        if (requests.length === 2) {
          app.quitting = true;
          requests[1]!.resolve({} as HomeWalk);
          await watch.homeRefreshed;
        }
        expect(listeners).toBe(0);
      }
    } finally {
      walk.mockRestore();
    }
  });

  test("a rebuild synchronizes the watcher before queued polling, parsing, search and layout", () => {
    const events: string[] = [];
    let applied = () => {};
    const app = {
      graph: { dirs: [""], notes: new Map() },
      watcher: { sync: () => events.push("sync") },
      feed: {
        whenApplied: (run: () => void) => {
          events.push("queue");
          applied = run;
        },
      },
      live: true,
      search: { start: () => events.push("search") },
      explorer: { invalidateTree: () => events.push("tree") },
      buffers: new Map([["one", { invalidateLayouts: () => events.push("buffer") }]]),
      relayoutAll: () => events.push("layout"),
    };
    const watch = new Watch(app as unknown as App);
    const index = spyOn(watch, "indexInBackground").mockImplementation(() => events.push("parse"));
    const poll = spyOn(watch, "poll").mockImplementation((all) => (events.push(`poll:${all}`), true));
    try {
      watch.rebuilt();
      expect(events).toEqual(["sync", "queue", "parse", "search", "tree", "buffer", "layout"]);
      applied();
      expect(events.at(-1)).toBe("poll:true");
    } finally {
      index.mockRestore();
      poll.mockRestore();
    }
  });
});
