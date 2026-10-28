import { expect, test } from "bun:test";
import { mkdtempSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { WalkFilter } from "../../../../src/core/workspace/walk/filtering/filter.ts";
import { WatchState } from "../../../../src/core/workspace/graph/watch/state.ts";
import { WatchDirectories } from "../../../../src/core/workspace/graph/watch/directories.ts";
import { WatchReconciliation } from "../../../../src/core/workspace/graph/watch/reconciliation.ts";
import type { Settling, WatcherOptions } from "../../../../src/core/workspace/graph/watch/contracts.ts";

const sandbox = makeCoreSandbox();
function fixture() {
  const root = realpathSync(mkdtempSync(join(sandbox, "watch-")));
  const state = new WatchState();
  let degraded: string | null = null;
  let timers = 0;
  const warnings: string[] = [];
  const opts: WatcherOptions = {
    root,
    filter: new WalkFilter(root, DEFAULT_CONFIG.walk),
    dirs: [],
    known: new Map(),
    debounceMs: 1,
    maxDirs: 2,
    leftToWalk: (path) => path !== "",
    onBatch() {},
    onDegraded() {},
    onWarn: (text) => warnings.push(text),
    now: () => 100,
  };
  const directories = new WatchDirectories(opts, state, root, {
    get degraded() {
      return degraded;
    },
    degrade: (reason) => {
      degraded = reason;
    },
    ensurePollTimer: () => {
      timers++;
    },
    schedule() {},
  });
  return {
    opts,
    state,
    directories,
    warnings,
    timerCount: () => timers,
    setDegraded: (reason: string) => {
      degraded = reason;
    },
    reconciliation: new WatchReconciliation(opts, state, directories),
  };
}
function batch(): Settling {
  return {
    paths: ["gone.md"],
    seen: new Set(),
    changes: [],
    rescan: false,
    found: [],
    candidates: [],
    following: true,
  };
}

test("directory admission reads live reservations, options and degraded state", () => {
  const { opts, state, directories, setDegraded } = fixture();
  expect(directories.found("a")).toBe("ask");
  directories.leave("a", "ask");
  expect(state.toWalk.has("a")).toBe(true);
  expect(directories.found("a")).toBe("leave");
  expect(directories.room()).toBe(1);
  state.polled.add("b");
  expect(directories.room()).toBe(0);
  opts.maxDirs = 4;
  expect(directories.room()).toBe(2);
  setDegraded("limit");
  expect(directories.found("c")).toBe("leave");
});

test("a polling fallback warns and schedules once, then refuses new work after closure", () => {
  const { state, directories, warnings, timerCount } = fixture();
  directories.pollDir("sub", "EACCES: test\nextra");
  directories.pollDir("sub", "EACCES: test");
  expect(state.polled.has("sub")).toBe(true);
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).not.toContain("extra");
  expect(timerCount()).toBe(1);
  state.closed = true;
  directories.pollDir("other", "EACCES: test");
  expect(state.polled.has("other")).toBe(false);
});

test("move history keeps shared sizes and tick values and reads the current clock callback", () => {
  const { opts, state, reconciliation } = fixture();
  state.sizes.set("gone.md", 12);
  state.ticks = 7;
  const current = batch();
  reconciliation.went(current, "gone.md", 5);
  expect(state.recentlyWent[0]).toEqual({ rel: "gone.md", mtimeMs: 5, size: 12, tick: 7, at: 100 });
  opts.now = () => 200;
  state.ticks = 8;
  reconciliation.went(current, "other.md", 6);
  expect(state.recentlyWent[1]).toMatchObject({ rel: "other.md", tick: 8, at: 200 });
  current.following = false;
  reconciliation.went(current, "ignored.md", 7);
  expect(state.recentlyWent).toHaveLength(2);
});

test("reconciliation sees a replacement known map and reports the missing note into the original batch", () => {
  const { opts, state, reconciliation } = fixture();
  const original = opts.known;
  opts.known = new Map([["gone.md", 5]]);
  state.sizes.set("gone.md", 12);
  const current = batch();
  reconciliation.vanished(current);
  expect(original.size).toBe(0);
  expect(opts.known.has("gone.md")).toBe(false);
  expect(current.changes).toEqual([{ rel: "gone.md", kind: "deleted", isNote: true }]);
  expect(state.recentlyWent[0]).toMatchObject({ rel: "gone.md", size: 12 });
});
