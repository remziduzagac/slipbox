import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GraphMoves } from "../../../../../src/core/workspace/graph/moves/reconcile.ts";
import { stub } from "../../../../../src/core/workspace/graph/index/storage.ts";
import { contentHash, Redirects } from "../../../../../src/core/workspace/links/redirects.ts";
import { locateVault } from "../../../../../src/core/workspace/vaults/vault.ts";
import { makeCoreSandbox } from "../../../../support/core-sandbox.ts";

const sandbox = makeCoreSandbox();
const fixture = (name: string) => {
  const root = join(sandbox, name);
  mkdirSync(join(root, ".slipbox"), { recursive: true });
  const events: [string, string][][] = [];
  const context = {
    loc: locateVault({ root }),
    root,
    redirects: new Redirects(join(root, "redirects.json")),
    moved: (pairs: [string, string][]) => void events.push(pairs),
    forgetProblems: () => {},
  };
  return { root, context, events, moves: new GraphMoves(context) };
};

test("build move evidence requires one nonempty vanished note and one fresh file with that hash", () => {
  const { root, context, moves, events } = fixture("build-moves");
  const text = "same text";
  writeFileSync(join(root, "new.md"), text);
  const fresh = { rel: "new.md", abs: join(root, "new.md"), size: text.length, mtimeMs: 0 };
  const old = { ...stub({ ...fresh, rel: "old.md" }), hash: contentHash(text), flags: [] };
  moves.detectMoves([old, { ...old, rel: "another.md" }], [fresh]);
  expect(context.redirects.follow("old.md")).toBeNull();
  moves.detectMoves([old], [fresh]);
  expect(context.redirects.follow("old.md")).toBe("new.md");
  expect(events).toEqual([]); // Build evidence does not emit an incremental move.
});

test("pairing, cancellation by return, nested pause cleanup and the one-minute boundary retain their order", () => {
  const { moves, events } = fixture("paired-moves");
  const realNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  try {
    moves.pairMove("one", "old.md", "went");
    now += 60_000;
    moves.pairMove("one", "new.md", "came");
    expect(events).toEqual([[["old.md", "new.md"]]]);
    moves.pairMove("returned", "same.md", "went");
    moves.pairMove("returned", "same.md", "came");
    expect(events).toHaveLength(1);
    expect(() =>
      moves.pauseMoves(() =>
        moves.pauseMoves(() => {
          throw new Error("stopped");
        }),
      ),
    ).toThrow("stopped");
    moves.pairMove("later", "before.md", "went");
    now += 60_001;
    moves.pairMove("later", "after.md", "came");
    expect(events).toHaveLength(1);
    moves.pairMove("fresh", "before.md", "came");
    moves.pairMove("fresh", "after.md", "went");
    expect(events.at(-1)).toEqual([["after.md", "before.md"]]);
  } finally {
    Date.now = realNow;
  }
});
