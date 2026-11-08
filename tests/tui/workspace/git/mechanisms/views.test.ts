// Branch answers, rows and panel presentation consume data capabilities, without the TUI model.
import { expect, spyOn, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import * as branchIO from "../../../../../src/core/workspace/git/branches/gitbranches.ts";
import * as gitlog from "../../../../../src/core/workspace/git/history/gitlog.ts";
import { glyphsFor } from "../../../../../src/core/rendering/theme/glyphs.ts";
import {
  branchesLater,
  type Branch,
  type BranchStats,
} from "../../../../../src/core/workspace/git/branches/gitbranches.ts";
import type { BranchList, BranchReadHost, SectionId } from "../../../../../src/tui/workspace/git/views/contracts.ts";
import { BranchReads, shownOn } from "../../../../../src/tui/workspace/git/views/branches/reads.ts";
import { BranchRows } from "../../../../../src/tui/workspace/git/views/branches/rows.ts";
import { CommitReads } from "../../../../../src/tui/workspace/git/views/log/reads.ts";
import { PanelPresentation } from "../../../../../src/tui/workspace/git/views/panel/presentation.ts";
import { makeGitFixtures } from "./fixture.ts";

const fixtures = makeGitFixtures();
const list = (root: string, generation: number, answered = -1): BranchList => ({
  root,
  generation,
  answered,
  branches: [],
  merged: new Set(),
  asking: null,
});

test("branch answer admission rejects failures and foreign roots while allowing the newest pending list to advance", () => {
  const asked = list("one", 2);
  expect(shownOn(asked, asked, [])).toBe(asked);
  expect(shownOn(asked, asked, null)).toBeNull();
  expect(shownOn(null, asked, [])).toBeNull();
  expect(shownOn(list("other", 3), asked, [])).toBeNull();
  const newer = list("one", 3, 1);
  expect(shownOn(newer, asked, [])).toBe(newer);
  newer.answered = 2;
  expect(shownOn(newer, asked, [])).toBeNull();
});

test("branch reads keep the previous answer while a new generation is listed and honor the waiting caller's visit", async () => {
  const { root, checkout, config } = fixtures.repo();
  const git = { checkout, generation: 1, entries: [], fallbackBase: () => "main" };
  let current = true;
  let renders = 0;
  const host: BranchReadHost = {
    app: {
      loc: { root },
      git,
      config,
      vaults: { visits: 1 },
      host: {
        requestRender: () => {
          renders++;
        },
      },
    },
    still: () => current,
  };
  const reads = new BranchReads(host);
  expect(await reads.listed()).toBe(true);
  const before = reads.currentList!;
  expect(reads.here()?.name).toBe("feature");
  git.generation++;
  const pending = reads.branches();
  expect(pending?.branches).toBe(before.branches!);
  expect(reads.currentList).not.toBe(before);
  expect(reads.currentList?.answered).toBe(1);
  expect(await reads.listed()).toBe(true);
  expect(reads.currentList?.answered).toBe(2);
  expect(renders).toBe(2);
  git.generation++;
  current = false;
  expect(await reads.listed()).toBe(false);
});

test("branch row buttons stay in place before stats arrive, and live filtering can hide the section", async () => {
  const { checkout } = fixtures.repo();
  const branches = (await branchesLater(checkout))!;
  let query = "feature";
  let stats: BranchStats | null = null;
  const host = {
    opened: new Set(["feature"]),
    app: {
      now: () => 1_000_000,
      gitPanel: { filter: () => query, folded: new Set<SectionId>() },
      gitLog: { branchRows: () => [] },
    },
    branches: () => ({ branches, merged: new Set<string>() }),
    statsOf: () => stats,
    filesOf: () => null,
  };
  const rows = new BranchRows(host);
  const pending = rows.rows().find((row) => row.kind === "bbuttons");
  expect(pending).toMatchObject({ kind: "bbuttons", buttons: [{ action: "merge", label: "Merge…" }] });
  stats = { base: "main", ahead: 0, behind: 0, merged: true, dirty: 0 };
  expect(rows.rows().find((row) => row.kind === "bbuttons")).toEqual(pending);
  query = "no-matching-branch";
  expect(rows.rows()).toEqual([]);
});

test("panel presentation reads live entries and keeps the operation cache keyed by the same caller", () => {
  const { checkout } = fixtures.repo();
  const git = { checkout, generation: 1, entries: [{ path: "a.md", x: "M", y: " " }], track: null };
  const app = { git, glyphs: glyphsFor("unicode"), now: () => 1_000_000 };
  const presentation = new PanelPresentation({
    app,
    folded: new Set(),
    branches: { here: () => null, statsOf: () => null },
    keyFor: () => null,
  });
  expect(presentation.buttons().find((button) => button.action === "commit")?.label).toEndWith("Commit 1");
  expect(presentation.buttons().some((button) => button.action === "continue")).toBe(false);
  git.entries = [];
  writeFileSync(join(checkout.gitDir, "MERGE_HEAD"), "pending\n");
  expect(presentation.buttons().some((button) => button.action === "continue")).toBe(false);
  git.generation++;
  const buttons = presentation.buttons();
  expect(buttons.find((button) => button.action === "commit")?.label).toEndWith("Commit");
  expect(buttons.some((button) => button.action === "continue")).toBe(true);
  expect(buttons.some((button) => button.action === "abort")).toBe(true);
  expect(buttons.some((button) => button.action === "skip")).toBe(false);
});

test("panel footer keys and folded hints follow their current owner without copying its state", () => {
  const folded = new Set<SectionId>();
  const keys = new Map([
    ["open", "enter"],
    ["new_branch", "n"],
  ]);
  const branch: Branch | null = null;
  const presentation = new PanelPresentation({
    app: {
      git: { checkout: null, generation: 0, entries: [], track: null },
      glyphs: glyphsFor("unicode"),
      now: () => 0,
    },
    folded,
    branches: { here: () => branch, statsOf: () => null },
    keyFor: (action) => keys.get(action) ?? null,
  });
  const heading = { kind: "heading" as const, section: "branches" as const, label: "Branches" };
  expect(presentation.footer(heading)).toEqual([
    ["enter", "fold"],
    ["n", "new branch"],
  ]);
  folded.add("branches");
  keys.set("open", "l");
  expect(presentation.footer(heading)).toEqual([
    ["l", "unfold"],
    ["n", "new branch"],
  ]);
  expect(presentation.standing()).toBeNull();
});

test("comparison invalidation drops only the named branch's cached stat and file answers", async () => {
  const { root, checkout, config } = fixtures.repo();
  const branch = (await branchesLater(checkout))!.find((row) => row.here)!;
  const realAhead = branchIO.aheadBehindLater;
  const realFiles = branchIO.branchChangedLater;
  const ahead = spyOn(branchIO, "aheadBehindLater").mockImplementation((...args) =>
    args[0] === root ? Promise.resolve({ ahead: 0, behind: 0 }) : realAhead(...args),
  );
  const files = spyOn(branchIO, "branchChangedLater").mockImplementation((...args) =>
    args[0] === root ? Promise.resolve([]) : realFiles(...args),
  );
  try {
    const reads = new BranchReads({
      app: {
        loc: { root },
        config,
        vaults: { visits: 1 },
        host: { requestRender() {} },
        git: { checkout, generation: 1, entries: [], fallbackBase: () => "main" },
      },
      still: () => true,
    });
    expect(reads.statsOf(branch)).toBeNull();
    const firstFiles = reads.filesOf(branch, "main");
    await Bun.sleep(0);
    const firstStats = reads.statsOf(branch);
    expect(firstStats).not.toBeNull();
    reads.forgetBranch("another-branch");
    expect(reads.statsOf(branch)).toBe(firstStats);
    expect(reads.filesOf(branch, "main")).toBe(firstFiles);
    reads.forgetBranch(branch.name);
    expect(reads.statsOf(branch)).toBeNull();
    expect(reads.filesOf(branch, "main")).not.toBe(firstFiles);
    await Bun.sleep(0);
  } finally {
    ahead.mockRestore();
    files.mockRestore();
  }
});

test("a branch's commits read in another checkout leave this one's: back in it, its last answer shows at once", async () => {
  const commit = (hash: string): gitlog.BranchCommit => ({ hash, parent: null, author: "a", time: 1, subject: hash });
  const read = spyOn(gitlog, "branchLogLater").mockImplementation((c) => Promise.resolve([commit(c.root)]));
  try {
    const app = { git: { checkout: { root: "/main" }, generation: 1 }, host: { requestRender() {} } };
    const reads = new CommitReads(app as unknown as ConstructorParameters<typeof CommitReads>[0]);
    expect(reads.commitsOf("agent/ahead", "main")).toBeNull();
    await Bun.sleep(0);
    expect(reads.commitsOf("agent/ahead", "main")).toEqual([commit("/main")]);
    // Into the branch's own worktree, where the panel lists it too.
    app.git.checkout = { root: "/worktree" };
    app.git.generation++;
    expect(reads.commitsOf("agent/ahead", "main")).toBeNull();
    await Bun.sleep(0);
    expect(reads.commitsOf("agent/ahead", "main")).toEqual([commit("/worktree")]);
    // Back: the main checkout's answer while git is asked again, no row waiting on it to move the rest.
    app.git.checkout = { root: "/main" };
    app.git.generation++;
    expect(reads.commitsOf("agent/ahead", "main")).toEqual([commit("/main")]);
  } finally {
    read.mockRestore();
  }
});
