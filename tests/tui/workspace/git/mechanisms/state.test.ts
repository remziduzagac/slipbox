// Status, base and staged caches exercised through capabilities, without App or global clock changes.
import { expect, spyOn, test } from "bun:test";
import { join } from "node:path";
import * as staging from "../../../../../src/core/workspace/git/staging/gitstage.ts";
import * as operations from "../../../../../src/core/workspace/git/branches/gitops.ts";
import { vaultAt } from "../../../../../src/core/workspace/vaults/vault.ts";
import { NoteBuffer } from "../../../../../src/tui/documents/buffers/buffer.ts";
import { GitReads } from "../../../../../src/tui/workspace/git/state/reads.ts";
import { GitBases } from "../../../../../src/tui/workspace/git/state/bases.ts";
import { GitStaged } from "../../../../../src/tui/workspace/git/state/staged.ts";
import type { GitReadHost } from "../../../../../src/tui/workspace/git/state/contracts.ts";
import { makeGitFixtures } from "./fixture.ts";

const fixtures = makeGitFixtures();
function readHost(root: string) {
  const events: string[] = [];
  let clock = 0;
  const host: GitReadHost = {
    app: {
      loc: vaultAt(root),
      live: false,
      now: () => clock,
      host: { requestRender: () => void events.push("render") },
      explorer: { invalidateTree: () => void events.push("invalidate") },
    },
    states: new Map([["old.md", "modified"]]),
    folders: new Map([["old", "modified"]]),
    generation: 3,
    entries: [],
    track: null,
  };
  return {
    host,
    events,
    clock: (value: number) => {
      clock = value;
    },
  };
}

test("no checkout clears the same folder map and advances generation without replacing unrelated entries", async () => {
  const f = readHost(fixtures.tree());
  const folders = f.host.folders;
  const entries = f.host.entries;
  await new GitReads(f.host).refreshNow();
  expect(f.host.states).toBeNull();
  expect(f.host.folders).toBe(folders);
  expect(folders.size).toBe(0);
  expect(f.host.entries).toBe(entries);
  expect(f.host.generation).toBe(4);
  expect(f.events).toEqual([]);
});

test("a missing checkout is memoized until the existing one-second retry or a root change", () => {
  const root = fixtures.tree();
  const f = readHost(root);
  const reads = new GitReads(f.host);
  expect(reads.checkout).toBeNull();
  fixtures.git(root, "init", "-q", "-b", "main");
  f.clock(1000);
  expect(reads.checkout).toBeNull();
  f.clock(1001);
  expect(reads.checkout?.root).toBe(root);
  Object.assign(f.host.app, { loc: vaultAt(fixtures.tree()) });
  expect(reads.checkout).toBeNull();
});

test("status requests coalesce one follow-up and ignore its answer after the root changes", async () => {
  const { root } = fixtures.repo();
  const f = readHost(root);
  const reads = new GitReads(f.host);
  type Answer = Awaited<ReturnType<typeof staging.statusLater>>;
  const pending: ((answer: Answer) => void)[] = [];
  const original = staging.statusLater;
  const spy = spyOn(staging, "statusLater").mockImplementation((checkout) =>
    checkout.root === root ? new Promise((done) => pending.push(done)) : original(checkout),
  );
  const requests: Promise<void>[] = [];
  try {
    const first = reads.refreshNow();
    const next = reads.refreshNow();
    requests.push(first, next);
    expect(reads.refreshNow()).toBe(next);
    expect(pending.length).toBe(1);
    const entries = [{ path: "sub/a.md", x: "?", y: "?" }];
    pending[0]!({ entries, track: null });
    await first;
    await Bun.sleep(0);
    expect(pending.length).toBe(2);
    expect(f.host.entries).toBe(entries);
    expect(f.host.states?.get("sub/a.md")).toBe("new");
    expect(f.host.folders.get("sub")).toBe("new");
    Object.assign(f.host.app, { loc: vaultAt(fixtures.tree()) });
    pending[1]!({ entries: [{ path: "stale.md", x: "M", y: " " }], track: null });
    await next;
    expect(f.host.entries).toBe(entries);
    expect(f.host.generation).toBe(4);
    expect(f.events).toEqual(["invalidate"]);
  } finally {
    spy.mockRestore();
    for (const resolve of pending) resolve(null);
    await Promise.allSettled(requests);
  }
});

test("base memoization keeps its original generation key and explicit invalidation boundary", () => {
  const { checkout, config } = fixtures.repo();
  const host = { generation: 1, app: { config, message: () => {} } };
  const bases = new GitBases(host);
  expect(bases.baseOf(checkout, "feature")).toBe("main");
  config.git.base = "feature";
  expect(bases.baseOf(checkout, "feature")).toBe("main");
  expect(bases.fallbackBase(checkout)).toBe("feature");
  bases.forgetBase();
  expect(bases.baseOf(checkout, "feature")).toBeNull();
});

test("staged answers share each buffer identity, retain old signs while refreshing and cache the new version", async () => {
  const { root, checkout, config, loc } = fixtures.repo();
  const buf = new NoteBuffer("a.md", join(root, "a.md"));
  buf.loadText("# A\nnew line\n");
  const host = {
    checkout,
    generation: 1,
    states: new Map<string, operations.GitState>([["a.md", "new"]]),
    app: { loc, config, host: { requestRender() {} } },
  };
  const staged = new GitStaged(host);
  const pending: ((text: string | null) => void)[] = [];
  const original = operations.showLater;
  const spy = spyOn(operations, "showLater").mockImplementation((...args) =>
    args[0].root === root ? new Promise((done) => pending.push(done)) : original(...args),
  );
  try {
    expect(staged.changesOf({ buf })).toBeNull();
    expect(staged.changesOf({ buf })).toBeNull();
    expect(pending.length).toBe(1);
    expect(staged.stagedText(buf)).toBeUndefined();
    pending[0]!(null);
    await Bun.sleep(0);
    const added = staged.changesOf({ buf });
    expect(added?.length).toBeGreaterThan(0);
    expect(staged.changesOf({ buf })).toBe(added);
    expect(staged.stagedText(buf)).toBeNull();
    host.generation++;
    expect(staged.changesOf({ buf })).toBe(added);
    expect(pending.length).toBe(2);
    pending[1]!(buf.source);
    await Bun.sleep(0);
    expect(staged.changesOf({ buf })).toEqual([]);
    expect(staged.stagedText(buf)).toBe(buf.source);
  } finally {
    spy.mockRestore();
    for (const resolve of pending) resolve(null);
    await Bun.sleep(0);
  }
});
