import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { runCli } from "../../../../src/cli/cli.ts";

import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("the merge review (20.21)", () => {
  const out: string[] = [];
  const cli = async (args: string[], cwd: string) => {
    out.length = 0;
    const code = await runCli([...args, "--json"], {
      out: (x: string) => out.push(x),
      err: () => {},
      stdin: async () => "",
      isTTY: false,
      columns: 80,
      cwd,
      env: process.env,
    });
    return { code, json: code === 2 ? null : JSON.parse(out.join("")) };
  };
  const human = async (args: string[], cwd: string) => {
    const lines: string[] = [];
    await runCli(args, {
      out: (x: string) => lines.push(x),
      err: () => {},
      stdin: async () => "",
      isTTY: false,
      columns: 80,
      cwd,
      env: process.env,
    });
    return lines.join("");
  };
  const git = (cwd: string, ...args: string[]) =>
    Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]);
  const put = (root: string, rel: string, text: string) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  };
  /**
   * main and refactor parted at a base. refactor moves docs/plan.md, deletes docs/old.md, moves
   * docs/e.md without its link, adds docs/d.md linking nowhere; main adds docs/b.md linking to both.
   * Both change shared.md: a conflict.
   */
  const branches = () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-merge-"));
    if (git(root, "init", "-q", "-b", "main").exitCode !== 0) return null;
    put(root, "docs/plan.md", "# Plan\n\n## Goals\n\nThe plan, long enough to be known by its text when it moves.\n");
    put(root, "docs/old.md", "# Old\n");
    put(root, "docs/plan2.md", "# Plan two\n");
    put(root, "docs/my plan.md", "# Mine\n\nA plan of my own, long enough to be known by its text when it moves.\n");
    put(root, "docs/e.md", "# E\n\n[two](plan2.md)\n");
    put(root, "docs/f.md", "# F\n\n[gone](gone.md)\n");
    put(root, "docs/g.md", "# G\n\n[old](old.md)\n");
    put(root, "docs/h.md", "# H\n\n[two](plan2.md) [up](../shared.md) [case](Plan2.md)\n");
    put(root, "shared.md", "one\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "base");
    git(root, "checkout", "-q", "-b", "refactor");
    git(root, "mv", "docs/plan.md", "docs/new-plan.md");
    mkdirSync(join(root, "docs", "new"));
    git(root, "mv", "docs/new-plan.md", "docs/new/plan.md");
    git(root, "rm", "-q", "docs/old.md");
    git(root, "mv", "docs/my plan.md", "docs/new/my plan.md");
    mkdirSync(join(root, "notes"));
    git(root, "mv", "docs/e.md", "notes/e.md");
    put(root, "docs/d.md", "# D\n\n[nowhere](nowhere.md) [two](Plan2.md)\n"); // a note's path in any case reaches it
    put(root, ".hidden/x.md", "[nowhere](nowhere.md)\n"); // not the vault's: the walk leaves it out
    put(root, "shared.md", "theirs\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "refactor");
    git(root, "checkout", "-q", "main");
    put(
      root,
      "docs/b.md",
      `# B\n\n[the plan](plan.md#goals) and [old](old.md)\n\n[by its path](${root}/docs/plan.md) [mine](my%20plan.md)\n`,
    );
    put(root, "shared.md", "ours\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "main");
    return root;
  };
  const brief = (r: {
    json: {
      data: {
        breaks: { path: string; target: string; cause: string; by: string; to: string | null; fix: string | null }[];
      };
    };
  }) => r.json.data.breaks.map((b) => [b.path, b.target, b.cause, b.by, b.to, b.fix]);

  test("the merge review reads `/` from the root and paths without an extension; each fix in its link's form (21.2)", async () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-merge-forms-"));
    if (git(root, "init", "-q", "-b", "main").exitCode !== 0) return;
    put(root, "docs/plan.md", "# Plan\n\n## Aims\n\nThe plan, long enough to be known by its text when it moves.\n");
    put(root, "index.md", "# Index\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "base");
    git(root, "checkout", "-q", "-b", "refactor");
    mkdirSync(join(root, "docs", "new"));
    git(root, "mv", "docs/plan.md", "docs/new/plan.md");
    git(root, "commit", "-q", "-m", "moved");
    git(root, "checkout", "-q", "main");
    put(root, "docs/c.md", "# C\n\n[root](/docs/plan.md#Aims) [bare](plan) [fine](/index)\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "c");
    const r = await cli(["merge-review", "refactor"], root);
    expect(brief(r)).toEqual([
      ["docs/c.md", "/docs/plan.md#Aims", "moved", "refactor", "docs/new/plan.md", "/docs/new/plan.md#Aims"],
      ["docs/c.md", "plan", "moved", "refactor", "docs/new/plan.md", "new/plan"],
    ]);
  });

  test("the merge review leaves out a busy folder that looks generated, as the walk does; a notes build/ is read (D237)", async () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-merge-busy-"));
    if (git(root, "init", "-q", "-b", "main").exitCode !== 0) return;
    const long = "long enough to be known by its text when it moves.\n";
    put(root, "build/plan.md", `# Plan\n\nThe plan, ${long}`);
    put(root, "build/keep.md", "# Keep\n");
    put(root, "vendor/pkg/doc.md", `# Doc\n\nA vendored doc, ${long}`); // no note at vendor's top
    put(root, "index.md", "# Index\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "base");
    git(root, "checkout", "-q", "-b", "refactor");
    mkdirSync(join(root, "build", "new"));
    git(root, "mv", "build/plan.md", "build/new/plan.md");
    git(root, "mv", "vendor/pkg/doc.md", "vendor/pkg/doc2.md");
    git(root, "commit", "-q", "-m", "moved");
    git(root, "checkout", "-q", "main");
    put(root, "c.md", "# C\n\n[plan](build/plan.md) [doc](vendor/pkg/doc.md)\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "c");
    const r = await cli(["merge-review", "refactor"], root);
    expect(brief(r)).toEqual([
      ["c.md", "build/plan.md", "moved", "refactor", "build/new/plan.md", "build/new/plan.md"],
    ]);
  });

  test("the merge review reads links to this repository's hosting and pointers naming this folder: each fix in its form (D87, 21.7)", async () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-merge-hosted-"));
    if (git(root, "init", "-q", "-b", "main").exitCode !== 0) return;
    const name = `r${basename(root)
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase()}`;
    git(root, "remote", "add", "origin", `git@github.com:me/${name}.git`);
    put(root, "docs/plan.md", "# Plan\n\n## Goals\n\nThe plan, long enough to be known by its text when it moves.\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "base");
    git(root, "branch", "feature/x");
    git(root, "checkout", "-q", "-b", "refactor");
    mkdirSync(join(root, "docs", "new"));
    git(root, "mv", "docs/plan.md", "docs/new/plan.md");
    git(root, "commit", "-q", "-m", "moved");
    git(root, "checkout", "-q", "main");
    const base = `https://github.com/me/${name}`;
    // This repository's file at main, at a branch with a `/`; by its pointer; another repository's; its own page.
    put(
      root,
      "docs/b.md",
      `# B\n\n[p](${base}/blob/main/docs/plan.md#goals) [x](${base}/blob/feature/x/docs/plan.md) [ptr](slipbox://${name}/docs/plan#goals) [else](https://github.com/them/other/blob/main/docs/plan.md) [page](${base})\n`,
    );
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "b");
    const r = await cli(["merge-review", "refactor"], root);
    expect(brief(r)).toEqual([
      [
        "docs/b.md",
        `${base}/blob/main/docs/plan.md#goals`,
        "moved",
        "refactor",
        "docs/new/plan.md",
        `${base}/blob/main/docs/new/plan.md#goals`,
      ],
      [
        "docs/b.md",
        `${base}/blob/feature/x/docs/plan.md`,
        "moved",
        "refactor",
        "docs/new/plan.md",
        `${base}/blob/feature/x/docs/new/plan.md`,
      ],
      [
        "docs/b.md",
        `slipbox://${name}/docs/plan#goals`,
        "moved",
        "refactor",
        "docs/new/plan.md",
        `slipbox://${name}/docs/new/plan#goals`,
      ],
    ]);
  });

  test("merging a branch here: each link its result breaks, with the cause and the fix; nothing written", async () => {
    const root = branches();
    if (!root) return;
    const head = git(root, "rev-parse", "HEAD").stdout.toString().trim();
    const r = await cli(["merge-review", "refactor"], root);
    expect(r.code).toBe(0);
    expect(r.json.data).toMatchObject({ into: "main", from: "refactor", conflicts: ["shared.md"] });
    expect(brief(r)).toEqual([
      ["docs/b.md", "plan.md#goals", "moved", "refactor", "docs/new/plan.md", "new/plan.md#goals"],
      ["docs/b.md", "old.md", "deleted", "refactor", null, null],
      ["docs/b.md", `${root}/docs/plan.md`, "moved", "refactor", "docs/new/plan.md", `${root}/docs/new/plan.md`], // its form kept (21.2)
      ["docs/b.md", "my%20plan.md", "moved", "refactor", "docs/new/my plan.md", "new/my%20plan.md"],
      ["docs/d.md", "nowhere.md", "missing", "refactor", null, null],
      ["docs/g.md", "old.md", "deleted", "refactor", null, null], // unchanged here: what it names went
      ["notes/e.md", "plan2.md", "note-moved", "refactor", "docs/plan2.md", "../docs/plan2.md"],
    ]);
    expect(r.json.data.breaks[0]).toMatchObject({ line: 3, column: 1, names: "docs/plan.md" });
    // Broken already here (f.md), or reaching (h.md): not the merge's.
    // The working tree and HEAD as they were.
    expect(git(root, "rev-parse", "HEAD").stdout.toString().trim()).toBe(head);
    expect(git(root, "status", "--porcelain").stdout.toString()).toBe("");
    const text = await human(["merge-review", "refactor"], root);
    expect(text).toStartWith("merging refactor into main: 7 links would break; git can't merge 1 file (shared.md)\n");
    expect(text).toContain(
      "  docs/b.md:3:1  plan.md#goals — refactor moves docs/plan.md to docs/new/plan.md — the fix: new/plan.md#goals\n",
    );
    expect(text).toContain(
      "  notes/e.md:3:1  plan2.md — refactor moves this note; the link named docs/plan2.md — the fix: ../docs/plan2.md\n",
    );
  });

  test("--into: this branch into another, the same result; the other way round, only what breaks there", async () => {
    const root = branches();
    if (!root) return;
    const here = brief(await cli(["merge-review", "refactor"], root));
    git(root, "checkout", "-q", "refactor");
    expect(brief(await cli(["merge-review", "refactor", "--into", "main"], root))).toEqual(here);
    // main into refactor: refactor's own broken links aren't the merge's; main's new note's are.
    const back = await cli(["merge-review", "main"], root);
    expect(back.json.data).toMatchObject({ into: "refactor", from: "main" });
    expect(brief(back)).toEqual([
      ["docs/b.md", "plan.md#goals", "moved", "refactor", "docs/new/plan.md", "new/plan.md#goals"],
      ["docs/b.md", "old.md", "deleted", "refactor", null, null],
      ["docs/b.md", `${root}/docs/plan.md`, "moved", "refactor", "docs/new/plan.md", `${root}/docs/new/plan.md`], // its form kept (21.2)
      ["docs/b.md", "my%20plan.md", "moved", "refactor", "docs/new/my plan.md", "new/my%20plan.md"],
    ]);
    // A link refactor wrote to nothing, merged back into main: refactor's own (main's view: `missing`, by refactor).
    git(root, "checkout", "-q", "main");
    expect(brief(await cli(["merge-review", "refactor"], root)).find((b) => b[0] === "docs/d.md")).toEqual([
      "docs/d.md",
      "nowhere.md",
      "missing",
      "refactor",
      null,
      null,
    ]);
    git(root, "checkout", "-q", "refactor");
    expect((await cli(["merge-review", "nope"], root)).code).toBe(3);
    // Nothing to break: said so.
    git(root, "checkout", "-q", "-b", "same", "main");
    expect(await human(["merge-review", "main"], root)).toBe("merging main into same: no link would break\n");
  });

  test("a vault in a folder of its repository: its own paths; a file moved out of it is gone from it", async () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-mergesub-"));
    if (git(root, "init", "-q", "-b", "main").exitCode !== 0) return;
    const vault = join(root, "notes");
    put(
      root,
      "notes/.slipbox/config.toml",
      `[vault]\nid = "sub${basename(root).replace(/[^a-z0-9]/gi, "")}"\nname = "sub"\n`,
    );
    put(root, "notes/a.md", "# A\n\nLong enough to be the same file once it moves out.\n");
    put(root, "notes/b.md", "# B\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "base");
    git(root, "checkout", "-q", "-b", "out");
    git(root, "mv", "notes/a.md", "a.md");
    git(root, "commit", "-q", "-m", "a leaves the vault");
    git(root, "checkout", "-q", "main");
    put(root, "notes/b.md", "# B\n\n[a](a.md)\n");
    git(root, "commit", "-q", "-am", "b links a");
    const r = await cli(["merge-review", "out"], vault);
    expect(brief(r)).toEqual([["b.md", "a.md", "deleted", "out", null, null]]);
  });

  test("wikilinks to nothing: one the branch writes, by name or by path, is `missing`; one to a note it deleted, `deleted`", async () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-merge-missing-"));
    if (git(root, "init", "-q", "-b", "main").exitCode !== 0) return;
    put(root, "docs/old.md", "# Old\n");
    put(root, "docs/keep.md", "# Keep\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "base");
    git(root, "checkout", "-q", "-b", "refactor");
    git(root, "rm", "-q", "docs/old.md");
    put(root, "docs/c.md", "# C\n\n[[nowhere]] [[docs/gone]] [[keep]] [[docs/keep]]\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "refactor");
    git(root, "checkout", "-q", "main");
    put(root, "docs/b.md", "# B\n\n[[docs/old]] [[old]]\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "main");
    const r = await cli(["merge-review", "refactor"], root);
    expect(
      r.json.data.breaks.map(
        (b: {
          path: string;
          target: string;
          cause: string;
          by: string;
          names: string;
          to: string | null;
          fix: string | null;
        }) => [b.path, b.target, b.cause, b.by, b.names, b.to, b.fix],
      ),
    ).toEqual([
      ["docs/b.md", "docs/old", "deleted", "refactor", "docs/old.md", null, null],
      ["docs/b.md", "old", "deleted", "refactor", "docs/old.md", null, null],
      ["docs/c.md", "nowhere", "missing", "refactor", "nowhere", null, null],
      ["docs/c.md", "docs/gone", "missing", "refactor", "docs/gone.md", null, null],
    ]);
  });

  test("outside git: exit 3", async () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-nogit-"));
    mkdirSync(join(dir, ".slipbox"));
    expect((await cli(["merge-review", "main"], dir)).code).toBe(3);
  });

  test("after a merge or a pull: git's renames are evidence — a broken link says where its file went; relink fixes it", async () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-merged-"));
    if (git(root, "init", "-q", "-b", "main").exitCode !== 0) return;
    put(root, "a.md", "# A\n\nThe first note, long enough for git to know it again when it moves.\nA second line.\n");
    put(root, "b.md", "# B\n\n[a](a.md)\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "start");
    git(root, "checkout", "-q", "-b", "elsewhere");
    mkdirSync(join(root, "docs"));
    git(root, "mv", "a.md", "docs/a.md");
    writeFileSync(
      join(root, "docs", "a.md"),
      `${readFileSync(join(root, "docs", "a.md"), "utf8")}Changed as it moved: no longer the same text.\n`,
    );
    git(root, "commit", "-q", "-am", "moved");
    git(root, "checkout", "-q", "main");
    await cli(["ls"], root); // seen on main, as it was
    git(root, "checkout", "-q", "elsewhere");
    await cli(["ls"], root); // and on elsewhere: each branch's place kept apart
    git(root, "checkout", "-q", "main");
    git(root, "merge", "-q", "--ff-only", "elsewhere"); // a pull, as far as this copy can tell
    git(root, "pack-refs", "--all"); // the branch's commit in packed-refs only
    const p = (await cli(["problems"], root)).json.data;
    expect(p.broken).toContainEqual(
      expect.objectContaining({
        from: "b.md",
        target: "a.md",
        moved: "docs/a.md",
        reason: "moved to docs/a.md — relink fixes it",
      }),
    );
    const { openVault } = await import("../../../../src/core/workspace/links/reach.ts");
    expect(openVault(root).redirects?.all()["a.md"]).toMatchObject({
      to: "docs/a.md",
      by: expect.stringMatching(/^[0-9a-f]{7}\.\.[0-9a-f]{7}$/),
    });
    await cli(["relink"], root);
    expect(readFileSync(join(root, "b.md"), "utf8")).toBe("# B\n\n[a](docs/a.md)\n");
  });

  test("a repository appearing while it's watched: where its branch is, seen at once — its next merge has a before", async () => {
    const { VaultFeed } = await import("../../../../src/core/workspace/vaults/vault-feed.ts");
    const { checkoutOf } = await import("../../../../src/core/workspace/git/git.ts");
    const { openVault } = await import("../../../../src/core/workspace/links/reach.ts");
    const root = mkdtempSync(join(tmpdir(), "slipbox-appear-"));
    put(
      root,
      ".slipbox/config.toml",
      `[vault]\nid = "ap${basename(root).replace(/[^a-z0-9]/gi, "")}"\nname = "appear"\n`,
    );
    put(root, "a.md", "# A\n\nThe first note, long enough for git to know it again when it moves.\n");
    put(root, "b.md", "# B\n\n[a](a.md)\n");
    const g = openVault(root);
    let c: ReturnType<typeof checkoutOf> = null;
    const heard: [string, string][][] = [];
    const feed = new VaultFeed({
      checkout: () => c,
      graph: () => g,
      now: () => Date.now(),
      apply: () => {},
      headMoved: (_was, _now, moves) => heard.push(moves),
    });
    if (git(root, "init", "-q", "-b", "main").exitCode !== 0) return;
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "start");
    c = checkoutOf(root);
    expect(feed.checkHead()).toBe(true); // it appeared: nothing moved, but where main is, kept
    expect(heard).toEqual([]);
    git(root, "checkout", "-q", "-b", "elsewhere");
    mkdirSync(join(root, "docs"));
    git(root, "mv", "a.md", "docs/a.md");
    git(root, "commit", "-q", "-m", "moved");
    git(root, "checkout", "-q", "main");
    git(root, "merge", "-q", "--ff-only", "elsewhere");
    expect(feed.checkHead()).toBe(true);
    expect(heard).toEqual([[["a.md", "docs/a.md"]]]);
  });

  test("a rebase is one change: HEAD isn't seen moving mid-rebase; at its end the branch moved on, never switched", async () => {
    const { VaultFeed } = await import("../../../../src/core/workspace/vaults/vault-feed.ts");
    const { checkoutOf } = await import("../../../../src/core/workspace/git/git.ts");
    const { openVault } = await import("../../../../src/core/workspace/links/reach.ts");
    const root = mkdtempSync(join(tmpdir(), "slipbox-rebase-"));
    if (git(root, "init", "-q", "-b", "main").exitCode !== 0) return;
    put(root, "a.md", "# A\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "start");
    git(root, "checkout", "-q", "-b", "topic");
    put(root, "b.md", "# B\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "b");
    git(root, "checkout", "-q", "main");
    put(root, "c.md", "# C\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "c");
    git(root, "checkout", "-q", "topic");
    const g = openVault(root);
    const heard: [string | null, string | null][] = [];
    const feed = new VaultFeed({
      checkout: () => checkoutOf(root),
      graph: () => g,
      now: () => Date.now(),
      apply: () => {},
      headMoved: (was, now) => heard.push([was.branch, now.branch]),
    });
    feed.checkHead();
    // Stopped after its first step (an --exec that fails): HEAD detached, the rebase not done.
    git(root, "rebase", "-q", "--exec", "false", "main");
    expect(existsSync(join(root, ".git", "rebase-merge"))).toBe(true);
    expect(feed.checkHead()).toBe(false);
    git(root, "rebase", "--continue");
    expect(feed.checkHead()).toBe(true);
    expect(heard).toEqual([["topic", "topic"]]);
  });

  test("the feed closed (another vault opened) while git still writes: what it held is never applied after", async () => {
    const { VaultFeed } = await import("../../../../src/core/workspace/vaults/vault-feed.ts");
    let locked = true;
    const applied: string[][] = [];
    const make = () =>
      new VaultFeed({
        checkout: () => null,
        graph: () => {
          throw new Error("no graph wanted");
        },
        now: () => Date.now(),
        apply: (b) => applied.push(b.changes.map((c) => c.rel)),
        locked: () => locked,
      });
    const batch = (rel: string) => ({ changes: [{ rel, kind: "changed" as const, isNote: true }], rescan: false });
    // Open: held while git writes, applied once it's done.
    const open = make();
    open.receive(batch("a.md"));
    expect(applied).toEqual([]);
    locked = false;
    await Bun.sleep(250);
    expect(applied).toEqual([["a.md"]]);
    // Closed while it waits: nothing lands.
    locked = true;
    const closed = make();
    closed.receive(batch("b.md"));
    closed.close();
    locked = false;
    await Bun.sleep(250);
    expect(applied).toEqual([["a.md"]]);
  });

  test("a branch switch isn't a merge: what only the other branch moved is no move here", async () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-switched-"));
    if (git(root, "init", "-q", "-b", "main").exitCode !== 0) return;
    put(root, "a.md", "# A\n\nThe first note, long enough for git to know it again when it moves.\n");
    put(root, "b.md", "# B\n\n[a](a.md)\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "start");
    git(root, "checkout", "-q", "-b", "elsewhere");
    git(root, "mv", "a.md", "c.md");
    git(root, "commit", "-q", "-m", "moved");
    git(root, "checkout", "-q", "main");
    await cli(["ls"], root);
    git(root, "checkout", "-q", "elsewhere");
    const p = (await cli(["problems"], root)).json.data;
    expect(p.broken).toContainEqual(
      expect.objectContaining({ from: "b.md", target: "a.md", moved: null, reason: null }),
    );
    const { openVault } = await import("../../../../src/core/workspace/links/reach.ts");
    expect(openVault(root).redirects?.all()["a.md"]).toBeUndefined();
  });
});

describe("review cycle 3 (core)", () => {
  test("the merge review checks wikilinks: a path a branch moved, a name it renamed or deleted; each fix a wikilink's", async () => {
    const git = (cwd: string, ...args: string[]) =>
      Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]);
    const put = (rel: string, text: string) => {
      mkdirSync(dirname(join(top, rel)), { recursive: true });
      writeFileSync(join(top, rel), text);
    };
    const top = mkdtempSync(join(tmpdir(), "slipbox-c3-mergewiki-"));
    if (git(top, "init", "-q", "-b", "main").exitCode !== 0) return; // no git here
    put("docs/plan.md", "# Plan\n\nThe plan, long enough to be known by its text when it moves.\n");
    put("docs/old.md", "# Old\n");
    put("docs/idea.md", "# Idea\n\nAn idea, long enough to be known by its text when it is renamed.\n");
    put("index.md", "# Index\n");
    git(top, "add", "-A");
    git(top, "commit", "-q", "-m", "base");
    git(top, "checkout", "-q", "-b", "refactor");
    mkdirSync(join(top, "notes"));
    git(top, "mv", "docs/plan.md", "notes/plan.md");
    git(top, "mv", "docs/idea.md", "docs/thought.md");
    git(top, "rm", "-q", "docs/old.md");
    git(top, "commit", "-q", "-m", "refactor");
    git(top, "checkout", "-q", "main");
    put("docs/b.md", "# B\n\n[[docs/plan]] [[./plan#Plan|p]] [[idea]] [[old]] [[index]] [[nowhere]]\n");
    git(top, "add", "-A");
    git(top, "commit", "-q", "-m", "main");
    const out: string[] = [];
    await runCli(["merge-review", "refactor", "--json"], {
      out: (x: string) => out.push(x),
      err: () => {},
      stdin: async () => "",
      isTTY: false,
      columns: 80,
      cwd: top,
      env: process.env,
    });
    const breaks = JSON.parse(out.join("")).data.breaks.map(
      (b: { target: string; cause: string; to: string | null; fix: string | null }) => [b.target, b.cause, b.to, b.fix],
    );
    expect(breaks).toEqual([
      ["docs/plan", "moved", "notes/plan.md", "notes/plan"],
      ["./plan", "moved", "notes/plan.md", "../notes/plan"],
      ["idea", "moved", "docs/thought.md", "thought"],
      ["old", "deleted", null, null],
      // `[[nowhere]]` reached nothing in main either: not the merge's.
    ]);
  });
});
