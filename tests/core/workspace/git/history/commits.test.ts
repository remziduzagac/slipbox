import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeCoreSandbox } from "../../../../support/core-sandbox.ts";
import {
  branchLogLater,
  commitFilesLater,
  linesInHead,
  parseCommits,
} from "../../../../../src/core/workspace/git/history/gitlog.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

// A branch's commits since its base, a commit's files (EG-D4); a selection's lines in the last commit (EG-D18).

/** Each commit a minute after the one before: newest first is an order, not a tie within a second. */
let minute = 0;
const run = (cwd: string, ...args: string[]) => {
  const date = `${1_750_000_000 + 60 * minute++} +0000`;
  return new TextDecoder().decode(
    Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=Ann", "-C", cwd, ...args], {
      env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    }).stdout,
  );
};

describe("a range of lines in the last commit", () => {
  test("each end mapped through the changes since; an end changed since moves in to the nearest committed line", () => {
    const head = "a\nb\nc\nd\ne\n";
    // A line added at the top, c changed: the text now is new, a, b, C, d, e.
    const now = "new\na\nb\nC\nd\ne\n";
    expect(linesInHead(head, now, 2)).toEqual({ from: 1, to: 1 });
    expect(linesInHead(head, now, 2, 6)).toEqual({ from: 1, to: 5 });
    expect(linesInHead(head, now, 6, 2)).toEqual({ from: 1, to: 5 });
    // From the added line to the changed one: a and b, the committed lines between.
    expect(linesInHead(head, now, 1, 4)).toEqual({ from: 1, to: 2 });
    // Not committed: the added line, the changed one, past the end.
    expect(linesInHead(head, now, 1)).toBeNull();
    expect(linesInHead(head, now, 4)).toBeNull();
    expect(linesInHead(head, now, 40)).toBeNull();
  });

  test("a byte order mark and line endings change no line", () => {
    expect(linesInHead("﻿a\r\nb\r\n", "a\nb\n", 1)).toEqual({ from: 1, to: 1 });
    expect(linesInHead("a\nb\n", "﻿a\r\nb\r\n", 1, 2)).toEqual({ from: 1, to: 2 });
  });
});

describe("a branch's commits", () => {
  test("git log's records: hash, first parent, author, time, subject; a root commit has no parent", () => {
    const a = "a".repeat(40);
    const b = "b".repeat(40);
    const c = "c".repeat(40);
    expect(
      parseCommits(
        `\x01${a}\0${b} ${c}\0Ann Park\x001700000000\0Merge it\n\x01${b}\0\0Bo\x001600000000\0First: a\0b\n`,
      ),
    ).toEqual([
      { hash: a, parent: b, author: "Ann Park", time: 1_700_000_000, subject: "Merge it" },
      { hash: b, parent: null, author: "Bo", time: 1_600_000_000, subject: "First: a" },
    ]);
    expect(parseCommits("")).toEqual([]);
  });

  test("since the base, newest first; each commit's files against its first parent — a merge's too, a root's all added", async () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-commits-"));
    run(root, "init", "-q", "-b", "main");
    writeFileSync(join(root, "guide.md"), "# Guide\n");
    run(root, "add", "-A");
    run(root, "commit", "-q", "-m", "The guide");
    run(root, "switch", "-q", "-c", "dev");
    writeFileSync(join(root, "huts.md"), "# Huts\n");
    run(root, "add", "-A");
    run(root, "commit", "-q", "-m", "Huts");
    run(root, "switch", "-q", "-c", "agent/trail");
    writeFileSync(join(root, "gear.md"), "# Gear\n");
    run(root, "add", "-A");
    run(root, "commit", "-q", "-m", "Gear");
    run(root, "mv", "huts.md", "shelters.md");
    writeFileSync(join(root, "guide.md"), "# Guide\n\nUpdated.\n");
    run(root, "commit", "-q", "-am", "Shelters, not huts");
    // A side branch merged in: the merge's files are what it brought against the first parent.
    run(root, "switch", "-q", "-c", "side");
    writeFileSync(join(root, "map.md"), "# Map\n");
    run(root, "add", "-A");
    run(root, "commit", "-q", "-m", "Map");
    run(root, "switch", "-q", "agent/trail");
    run(root, "merge", "-q", "--no-ff", "-m", "Merge side", "side");
    const c = { root };
    const log = (await branchLogLater(c, "dev", "agent/trail"))!;
    expect(log.map((k) => k.subject)).toEqual(["Merge side", "Map", "Shelters, not huts", "Gear"]);
    expect(log.every((k) => k.author === "Ann" && k.time > 1_700_000_000)).toBe(true);
    const [merge, , renamed, gear] = log;
    expect(await commitFilesLater(c, merge!)).toEqual([{ path: "map.md", state: "new" }]);
    expect(await commitFilesLater(c, renamed!)).toEqual([
      { path: "guide.md", state: "modified" },
      { path: "shelters.md", state: "renamed", from: "huts.md" },
    ]);
    expect(await commitFilesLater(c, gear!)).toEqual([{ path: "gear.md", state: "new" }]);
    // The first commit: no parent, its files all added.
    const first = { hash: run(root, "rev-parse", "main").trim(), parent: null };
    expect(await commitFilesLater(c, first)).toEqual([{ path: "guide.md", state: "new" }]);
    // The base itself, none; a base git doesn't know, null.
    expect(await branchLogLater(c, "agent/trail", "agent/trail")).toEqual([]);
    expect(await branchLogLater(c, "no-such-base", "agent/trail")).toBeNull();
  });
});
