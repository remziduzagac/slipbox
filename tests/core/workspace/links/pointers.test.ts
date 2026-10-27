import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import { cli, type Captured } from "../../../support/vault-cli.ts";
import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("slipbox:// pointers (21.7)", () => {
  const uniq = () =>
    basename(mkdtempSync(join(tmpdir(), "p")))
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
  const git = (cwd: string, ...args: string[]) =>
    Bun.spawnSync(["git", "-c", "user.email=t@t", "-c", "user.name=t", "-c", "init.defaultBranch=main", ...args], {
      cwd,
    }).exitCode;
  /** A named folder (`.slipbox/` with this name), its files, opened once so the lookup has it. */
  const named = async (
    name: string,
    files: Record<string, string>,
    parent = mkdtempSync(join(tmpdir(), "slipbox-ptr-")),
  ) => {
    const dir = join(parent, name);
    mkdirSync(join(dir, ".slipbox"), { recursive: true });
    writeFileSync(join(dir, ".slipbox", "config.toml"), `[vault]\nid = "${uniq()}"\nname = "${name}"\n`);
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), text);
    }
    await cli(["--root", dir, "problems"]); // in the lookup, and indexed: its links read from elsewhere
    return dir;
  };

  test("parsed: a name, @branch, the path and fragment; a qualified name as the longest known remote", async () => {
    const { formatPointer, parsePointer } = await import("../../../../src/core/workspace/links/pointer.ts");
    const known = [
      {
        key: "remote:github.com/me/research",
        name: "research",
        remote: "github.com/me/research",
        id: null,
        aliases: [],
        old: [],
        private: false,
        copies: [],
        default: null,
      },
    ];
    expect(parsePointer("slipbox://notes/inbox.md", known)).toEqual({
      name: "notes",
      branch: null,
      path: "inbox.md",
      fragment: null,
    });
    expect(parsePointer("slipbox://research@refactor/a%20b/x.md#Proof%20one", known)).toEqual({
      name: "research",
      branch: "refactor",
      path: "a b/x.md",
      fragment: "Proof one",
    });
    expect(parsePointer("slipbox://github.com/me/research@feat%2Fx/algo/d.md", known)).toEqual({
      name: "github.com/me/research",
      branch: "feat/x",
      path: "algo/d.md",
      fragment: null,
    });
    expect(parsePointer("slipbox://gitlab.com/them/other/x.md", known)).toMatchObject({
      name: "gitlab.com/them/other",
      path: "x.md",
    }); // unknown, by its look
    // A remote of four parts: only the lookup knows where its name ends.
    const deep = [
      ...known,
      { ...known[0]!, key: "remote:gitlab.com/group/sub/proj", name: "proj", remote: "gitlab.com/group/sub/proj" },
    ];
    expect(parsePointer("slipbox://gitlab.com/group/sub/proj/notes/x.md", deep)).toMatchObject({
      name: "gitlab.com/group/sub/proj",
      path: "notes/x.md",
    });
    expect(parsePointer("slipbox://notes", known)).toMatchObject({ name: "notes", path: "" });
    expect(parsePointer("https://notes/x.md", known)).toBeNull();
    // A known short name with dots (a GitHub Pages repository): the name, however deep the path.
    const pages = [
      {
        ...known[0]!,
        key: "remote:github.com/me/me.github.io",
        name: "me.github.io",
        remote: "github.com/me/me.github.io",
        old: ["old.site.io"],
      },
    ];
    expect(parsePointer("slipbox://me.github.io/a.md", pages)).toMatchObject({ name: "me.github.io", path: "a.md" });
    expect(parsePointer("slipbox://me.github.io/_posts/2026/x.md", pages)).toMatchObject({
      name: "me.github.io",
      branch: null,
      path: "_posts/2026/x.md",
    });
    expect(parsePointer("slipbox://ME.github.io@draft/_posts/2026/x.md", pages)).toMatchObject({
      name: "ME.github.io",
      branch: "draft",
      path: "_posts/2026/x.md",
    });
    expect(parsePointer("slipbox://old.site.io/_posts/2026/x.md", pages)).toMatchObject({
      name: "old.site.io",
      path: "_posts/2026/x.md",
    });
    expect(formatPointer({ name: "research", branch: "feat/x", path: "a b.md", fragment: "Top" }, encodeURI)).toBe(
      "slipbox://research@feat/x/a%20b.md#Top",
    ); // as a branch is written
  });

  test("followed into another folder: its note, file or folder, extensionless; in its own root, a link like any; or why not", async () => {
    const tag = uniq();
    const b = await named(`beta${tag}`, { "sub/x.md": "# X\n\n## Top\n", "img/p.png": "png" });
    const a = await named(`alpha${tag}`, { "a.md": "# A\n", "own.md": `[me](slipbox://alpha${tag}/a.md)\n` });
    const g = openGraph(locateVault({ root: a }), DEFAULT_CONFIG, false);
    const at = (target: string) => g.resolveLink({ kind: "markdown", target }, "own.md");
    expect(at(`slipbox://beta${tag}/sub/x.md#Top`)).toMatchObject({
      resolvedKind: "note",
      path: join(b, "sub", "x.md"),
      vault: `beta${tag}`,
    });
    expect(at(`slipbox://beta${tag}/sub/x`)).toMatchObject({ resolvedKind: "note", path: join(b, "sub", "x.md") });
    expect(at(`slipbox://beta${tag}/img/p.png`)).toMatchObject({ resolvedKind: "file", path: join(b, "img", "p.png") });
    expect(at(`slipbox://beta${tag}/sub/`)).toMatchObject({ resolvedKind: "folder", path: join(b, "sub") });
    // Its own root: the note by its path here, a backlink like any.
    expect(at(`slipbox://alpha${tag}/a.md`)).toMatchObject({ resolvedKind: "note", path: "a.md" });
    expect(g.backlinks("a.md").map((x) => x.from)).toEqual(["own.md"]);
    expect(at(`slipbox://beta${tag}/nope.md`)).toMatchObject({
      resolvedKind: "unresolved",
      reason: `no nope.md in beta${tag}`,
    });
    expect(at(`slipbox://beta${tag}/../escape.md`)).toMatchObject({
      resolvedKind: "unresolved",
      reason: "../escape.md: a pointer's path stays in its folder",
    });
    expect(at(`slipbox://gone${tag}/x.md`)).toMatchObject({
      resolvedKind: "unresolved",
      reason: `gone${tag} isn't on this machine yet: open it, or let the index find it`,
    });
    // Two folders of one name: ambiguous, each by where it is.
    await named(`twin${tag}`, { "t.md": "# T\n" });
    await named(`twin${tag}`, { "t.md": "# T\n" });
    expect(at(`slipbox://twin${tag}/t.md`)).toMatchObject({
      resolvedKind: "ambiguous",
      reason: expect.stringContaining(`2 different folders are called twin${tag}`),
    });
  });

  test("@branch: the checkout with it, a worktree's; else the file as git has it there, read-only; else why not", async () => {
    const tag = uniq();
    const repo = mkdtempSync(join(tmpdir(), "slipbox-ptr-git-"));
    if (git(repo, "init", "-q") !== 0) return; // no git here
    git(repo, "remote", "add", "origin", `git@github.com:me/repo${tag}.git`);
    writeFileSync(join(repo, "x.md"), "# X on main\n");
    git(repo, "add", ".");
    git(repo, "commit", "-qm", "main");
    git(repo, "branch", "draft");
    git(repo, "branch", "agent/sync-retry");
    git(repo, "checkout", "-qb", "feature");
    writeFileSync(join(repo, "x.md"), "# X on feature\n");
    git(repo, "commit", "-qam", "feature");
    git(repo, "checkout", "-q", "main");
    const wt = join(mkdtempSync(join(tmpdir(), "slipbox-ptr-wt-")), "wt");
    git(repo, "worktree", "add", "-q", wt, "feature");
    await cli(["--root", repo, "ls"]);
    const { parsePointer, resolvePointer } = await import("../../../../src/core/workspace/links/pointer.ts");
    const r = (u: string) => resolvePointer(parsePointer(u)!);
    expect(r(`slipbox://repo${tag}/x.md`)).toMatchObject({ status: "found", abs: join(repo, "x.md") });
    expect(r(`slipbox://repo${tag}@main/x.md`)).toMatchObject({ status: "found", abs: join(repo, "x.md") });
    expect(r(`slipbox://repo${tag}@feature/x.md`)).toMatchObject({ status: "found", root: wt, abs: join(wt, "x.md") });
    expect(r(`slipbox://github.com/me/repo${tag}@draft/x.md`)).toMatchObject({
      status: "branch",
      root: repo,
      rel: "x.md",
      branch: "draft",
    });
    expect(r(`slipbox://repo${tag}@nowhere/x.md`)).toMatchObject({
      status: "unresolved",
      reason: `repo${tag} has no branch nowhere`,
    });
    // A branch with a `/`: the longest the repository has, the rest the path.
    expect(r(`slipbox://repo${tag}@agent/sync-retry/x.md`)).toMatchObject({
      status: "branch",
      rel: "x.md",
      branch: "agent/sync-retry",
    });
    expect(r(`slipbox://repo${tag}@agent%2Fsync-retry/x.md`)).toMatchObject({
      status: "branch",
      rel: "x.md",
      branch: "agent/sync-retry",
    });
    // The path is checked again once the branch has taken its leading parts: it can't climb out then.
    expect(r(`slipbox://repo${tag}@agent/sync-retry/../x.md`)).toMatchObject({
      status: "unresolved",
      reason: "sync-retry/../x.md: a pointer's path stays in its folder",
    });
    // The CLI: the branch read from git.
    const j = JSON.parse(
      (await cli(["--root", repo, "resolve", `slipbox://repo${tag}@draft/x.md`, "--json"])).out,
    ).data;
    expect(j).toMatchObject({ status: "resolved", git: { root: repo, rel: "x.md", branch: "draft" } });
  });

  test("@branch not checked out: its #heading isn't checked against the file on disk (21.7)", async () => {
    const tag = uniq();
    const repo = mkdtempSync(join(tmpdir(), "slipbox-ptr-gitref-"));
    if (git(repo, "init", "-q") !== 0) return; // no git here
    git(repo, "remote", "add", "origin", `git@github.com:me/ref${tag}.git`);
    writeFileSync(join(repo, "a.md"), "# A\n");
    git(repo, "add", ".");
    git(repo, "commit", "-qm", "main");
    git(repo, "checkout", "-qb", "other");
    writeFileSync(join(repo, "x.md"), "# X\n\n## Setup\n");
    git(repo, "add", ".");
    git(repo, "commit", "-qm", "other");
    git(repo, "checkout", "-q", "main");
    writeFileSync(join(repo, "a.md"), `# A\n\n[s](slipbox://ref${tag}@other/x.md#Setup)\n`);
    await cli(["--root", repo, "ls"]);
    const { noteProblems } = await import("../../../../src/core/documents/diagnostics/diagnostics.ts");
    const g = openGraph(locateVault({ root: repo }), DEFAULT_CONFIG, false);
    expect(g.resolveLink({ kind: "markdown", target: `slipbox://ref${tag}@other/x.md#Setup` }, "a.md")).toMatchObject({
      resolvedKind: "note",
      gitRef: { branch: "other" },
    });
    expect(noteProblems(g, "a.md")).toEqual([]);
  });

  test("the CLI resolves one; another folder's pointer is a backlink; a rename keeps it a pointer, in its form", async () => {
    const tag = uniq();
    const parent = await named(`p${tag}`, { "p.md": "# P\n" });
    const b = await named(`b${tag}`, { "sub/x.md": "# X\n\n## Top\n" }, parent);
    const a = await named(`a${tag}`, {
      "a.md": `[x](slipbox://b${tag}/sub/x.md#Top) [bare](slipbox://b${tag}/sub/x)\n`,
    });
    const r = JSON.parse(
      (await cli(["--root", a, "resolve", `slipbox://b${tag}/sub/x.md#Top`, "--from", "a.md", "--json"])).out,
    ).data;
    expect(r).toMatchObject({ status: "resolved", path: join(b, "sub", "x.md"), line: 3 });
    const unknown = await cli(["--root", a, "resolve", `slipbox://zz${tag}/x.md`]);
    expect(unknown.code).toBe(3);
    expect(unknown.err).toContain(`zz${tag} isn't on this machine yet`);
    const back = JSON.parse((await cli(["--root", b, "backlinks", "sub/x.md", "--json"])).out).data.backlinks;
    expect(back.map((x: { from: string; target: string }) => x.target)).toEqual([
      `slipbox://b${tag}/sub/x.md#Top`,
      `slipbox://b${tag}/sub/x`,
    ]);
    expect((await cli(["--root", b, "mv", "sub/x.md", "moved/y.md"])).code).toBe(0);
    expect(readFileSync(join(a, "a.md"), "utf8")).toBe(
      `[x](slipbox://b${tag}/moved/y.md#Top) [bare](slipbox://b${tag}/moved/y)\n`,
    );
    // The folder itself moved by slipbox: a pointer names it, wherever it is — nothing rewritten.
    expect((await cli(["--root", parent, "mv", `b${tag}`, `deeper/b${tag}`])).code).toBe(0);
    expect(existsSync(join(parent, "deeper", `b${tag}`, "moved", "y.md"))).toBe(true);
    expect(readFileSync(join(a, "a.md"), "utf8")).toBe(
      `[x](slipbox://b${tag}/moved/y.md#Top) [bare](slipbox://b${tag}/moved/y)\n`,
    );
  });

  test("written across folders that don't travel together: a pointer; together (one repository, nested outside git), a relative path", async () => {
    const { linkEnds, writeLink } = await import("../../../../src/core/workspace/links/write-link.ts");
    const { travelTogether } = await import("../../../../src/core/workspace/vaults/folders.ts");
    const tag = uniq();
    const parent = mkdtempSync(join(tmpdir(), "slipbox-ptr-w-"));
    const b = await named(`wb${tag}`, { "far note.md": "---\ntitle: Far\n---\n# Far\n" }, parent);
    const a = await named(`wa${tag}`, { "a.md": "# A\n" }, parent);
    const inner = await named(`wi${tag}`, { "i.md": "# I\n" }, a);
    expect([travelTogether(a, b), travelTogether(a, inner), travelTogether(inner, a)]).toEqual([false, true, true]);
    const g = openGraph(locateVault({ root: a }), DEFAULT_CONFIG, false);
    const conv = {
      path: { value: "name", source: "tool", why: "" },
      extension: { value: "dropped", source: "tool", why: "" },
    } as never;
    expect(writeLink(conv, "markdown", linkEnds(g, join(a, "a.md"), join(b, "far note.md")), "Far")).toBe(
      `[Far](slipbox://wb${tag}/far%20note.md)`,
    );
    // A wikilink root: a pointer is a URL, so a markdown link.
    expect(writeLink(conv, "wiki", linkEnds(g, join(a, "a.md"), join(b, "far note.md")), "")).toBe(
      `[far note](slipbox://wb${tag}/far%20note.md)`,
    );
    expect(writeLink(conv, "markdown", linkEnds(g, join(a, "a.md"), join(inner, "i.md")), "I")).toBe(
      `[I](wi${tag}/i.md)`,
    );
    // One repository: its named folders travel together, wherever each is in it.
    const repo = mkdtempSync(join(tmpdir(), "slipbox-ptr-repo-"));
    mkdirSync(join(repo, ".git"));
    const r1 = await named(`r1${tag}`, { "one.md": "# One\n" }, join(repo, "docs"));
    const r2 = await named(`r2${tag}`, { "two.md": "# Two\n" }, join(repo, "notes"));
    expect(travelTogether(r1, r2)).toBe(true);
    const gr = openGraph(locateVault({ root: r1 }), DEFAULT_CONFIG, false);
    expect(writeLink(conv, "markdown", linkEnds(gr, join(r1, "one.md"), join(r2, "two.md")), "Two")).toBe(
      `[Two](../../notes/r2${tag}/two.md)`,
    );
    const j = JSON.parse(
      (await cli(["--root", a, "link", join(b, "far note.md"), "--from", "a.md", "--json"])).out,
    ).data;
    expect(j.link).toBe(`[Far](slipbox://wb${tag}/far%20note.md)`);
  });

  test("pointers to many files from one root, with a memo: the same as one by one, each folder's name worked out once, the named folders read once", async () => {
    const { linkEnds, linkWarnings, pointerAt } = await import("../../../../src/core/workspace/links/write-link.ts");
    const { foldersFile, recordFolder } = await import("../../../../src/core/workspace/vaults/folders.ts");
    const tag = uniq();
    const parent = mkdtempSync(join(tmpdir(), "slipbox-ptr-memo-"));
    const b = await named(`mb${tag}`, { "x.md": "# X\n", "sub/y.md": "# Y\n", "z.md": "# Z\n" }, parent);
    const c = await named(`mc${tag}`, { "w.md": "# W\n" }, parent);
    const a = await named(`ma${tag}`, { "a.md": "# A\n" }, parent);
    const inner = await named(`mi${tag}`, { "i.md": "# I\n" }, a);
    // Two folders of one name (ambiguous), a private name, and two repositories of one short name (qualified).
    const twin1 = await named(`mt${tag}`, { "t.md": "# T\n" }, join(parent, "one"));
    await named(`mt${tag}`, { "t.md": "# T\n" }, join(parent, "two"));
    const priv = join(parent, `mp${tag}`);
    mkdirSync(priv);
    expect(git(priv, "init", "-q")).toBe(0);
    writeFileSync(join(priv, "p.md"), "# P\n");
    expect((await cli(["init", priv, "--name", `mp${tag}`, "--private"])).code).toBe(0);
    const repo = (remote: string) => {
      const d = mkdtempSync(join(parent, "repo-"));
      mkdirSync(join(d, ".git", "info"), { recursive: true });
      writeFileSync(join(d, ".git", "config"), `[core]\n\tbare = false\n[remote "origin"]\n\turl = ${remote}\n`);
      writeFileSync(join(d, "r.md"), "# R\n");
      recordFolder(d);
      return d;
    };
    const mine = repo(`git@github.com:me/mr${tag}.git`);
    repo(`https://gitlab.com/lab/mr${tag}`);
    const g = openGraph(locateVault({ root: a }), DEFAULT_CONFIG, false);
    const from = join(a, "a.md");
    const targets = [
      join(b, "x.md"),
      join(b, "sub", "y.md"),
      join(c, "w.md"),
      join(b, "z.md"),
      join(inner, "i.md"),
      join(parent, "loose.md"),
      join(twin1, "t.md"),
      join(priv, "p.md"),
      join(mine, "r.md"),
    ];
    const ends = (memo?: import("../../../../src/core/workspace/links/write-link.ts").PointerMemo) =>
      targets.map((t) => linkEnds(g, from, t, memo));
    const shape = (e: ReturnType<typeof linkEnds>) => ({ pointer: e.pointer, naming: e.naming, say: linkWarnings(e) });
    const read = fs.readFileSync;
    let reads = 0;
    const spy = spyOn(fs, "readFileSync").mockImplementation(((path: fs.PathOrFileDescriptor, ...rest: never[]) => {
      if (path === foldersFile()) reads++;
      return read(path, ...rest);
    }) as typeof fs.readFileSync);
    try {
      const alone = ends();
      expect(reads).toBeGreaterThan(1); // without a memo, read again per file
      reads = 0;
      const memo = { root: a, naming: new Map() };
      const memoed = ends(memo);
      expect(reads).toBe(1);
      expect(memoed.map(shape)).toEqual(alone.map(shape));
      expect(alone.map((e) => e.pointer)).toEqual([
        `slipbox://mb${tag}/x.md`,
        `slipbox://mb${tag}/sub/y.md`,
        `slipbox://mc${tag}/w.md`,
        `slipbox://mb${tag}/z.md`,
        null, // travels with it: a relative path
        null, // in no named folder
        `slipbox://mt${tag}/t.md`,
        `slipbox://mp${tag}/p.md`,
        `slipbox://github.com/me/mr${tag}/r.md`,
      ]);
      expect(alone.slice(6).map((e) => linkWarnings(e).length)).toEqual([1, 1, 1]);
      // One folder's files share its name, worked out once; another folder has its own.
      expect(memoed[1]!.naming).toBe(memoed[0]!.naming!);
      expect(memoed[3]!.naming).toBe(memoed[0]!.naming!);
      expect(memoed[2]!.naming).not.toBe(memoed[0]!.naming!);
      expect(alone[1]!.naming).not.toBe(alone[0]!.naming!);
      // From another root, the memo is left alone: the folder nested in this one travels with it, not with that one.
      expect(pointerAt(b, join(inner, "i.md"), memo)?.pointer).toBe(`slipbox://mi${tag}/i.md`);
    } finally {
      spy.mockRestore();
    }
  });

  test("a pointer written says when its name is private; on a name different folders share, the qualified one, said — else ambiguous, said (D74, D83)", async () => {
    const { linkEnds, linkWarnings, writeLink } = await import("../../../../src/core/workspace/links/write-link.ts");
    const { recordFolder } = await import("../../../../src/core/workspace/vaults/folders.ts");
    const tag = uniq();
    const parent = mkdtempSync(join(tmpdir(), "slipbox-ptr-say-"));
    const a = await named(`sa${tag}`, { "a.md": "# A\n" }, parent);
    const g = openGraph(locateVault({ root: a }), DEFAULT_CONFIG, false);
    const conv = {
      path: { value: "relative", source: "ours", why: "" },
      extension: { value: "kept", source: "ours", why: "" },
    } as never;
    const write = (abs: string) => {
      const ends = linkEnds(g, join(a, "a.md"), abs);
      return { link: writeLink(conv, "markdown", ends, "T"), warnings: linkWarnings(ends) };
    };
    // A private name (`init --private`: its .slipbox/ kept out of git): the pointer works here only.
    const priv = join(parent, `priv${tag}`);
    mkdirSync(priv);
    expect(git(priv, "init", "-q")).toBe(0);
    writeFileSync(join(priv, "p.md"), "# P\n");
    expect((await cli(["init", priv, "--name", `pv${tag}`, "--private"])).code).toBe(0);
    const privately = `pv${tag} is a private name (its .slipbox/ is kept out of git): the pointer works on this machine only`;
    expect(write(join(priv, "p.md"))).toEqual({ link: `[T](slipbox://pv${tag}/p.md)`, warnings: [privately] });
    const j = JSON.parse((await cli(["--root", a, "link", join(priv, "p.md"), "--from", "a.md", "--json"])).out);
    expect([j.data.link, j.warnings]).toEqual([`[P](slipbox://pv${tag}/p.md)`, [privately]]);
    // The relink writing one, in its plan.
    writeFileSync(join(a, "rel.md"), `[p](../priv${tag}/p.md)\n`);
    const relink = JSON.parse((await cli(["--root", a, "relink", "rel.md", "--dry-run", "--json"])).out);
    expect([relink.data.files[0].edits[0].after, relink.warnings]).toEqual([
      `[p](slipbox://pv${tag}/p.md)`,
      [privately],
    ]);
    // Repositories of one short name: alone, the short one, nothing said; with another, the qualified one, said.
    const repo = (remote: string) => {
      const d = mkdtempSync(join(parent, "repo-"));
      mkdirSync(join(d, ".git", "info"), { recursive: true });
      writeFileSync(join(d, ".git", "config"), `[core]\n\tbare = false\n[remote "origin"]\n\turl = ${remote}\n`);
      writeFileSync(join(d, "r.md"), "# R\n");
      recordFolder(d);
      return d;
    };
    const mine = repo(`git@github.com:me/rr${tag}.git`);
    expect(write(join(mine, "r.md"))).toEqual({ link: `[T](slipbox://rr${tag}/r.md)`, warnings: [] });
    repo(`https://gitlab.com/lab/rr${tag}`);
    const qualified = `2 different folders are called rr${tag}: written by its qualified name, github.com/me/rr${tag}`;
    expect(write(join(mine, "r.md"))).toEqual({
      link: `[T](slipbox://github.com/me/rr${tag}/r.md)`,
      warnings: [qualified],
    });
    const cliSays = await cli(["--root", a, "link", join(mine, "r.md"), "--from", "a.md"]);
    expect([cliSays.out, cliSays.err]).toEqual([
      `[R](slipbox://github.com/me/rr${tag}/r.md)\n`,
      `slipbox: warning: ${qualified}\n`,
    ]);
    // Two .slipbox/ folders of one name, no qualified name: the short one, said to be ambiguous.
    const s1 = await named(`ss${tag}`, { "s.md": "# S\n" }, mkdtempSync(join(parent, "s1-")));
    await named(`ss${tag}`, { "s.md": "# S\n" }, mkdtempSync(join(parent, "s2-")));
    const ambiguous = (name: string) =>
      `2 different folders are called ${name}: followed, the pointer asks which — rename one (slipbox name <new>, in it)`;
    expect(write(join(s1, "s.md"))).toEqual({
      link: `[T](slipbox://ss${tag}/s.md)`,
      warnings: [ambiguous(`ss${tag}`)],
    });
    // A different folder answering to the name by an alias shares it too, as following reads it.
    const al = await named(`al${tag}`, { "l.md": "# L\n" }, parent);
    expect(write(join(al, "l.md")).warnings).toEqual([]);
    const other = await named(`ot${tag}`, {}, parent); // typos: ignore-line
    writeFileSync(
      join(other, ".slipbox", "config.toml"),
      `[vault]\nid = "${uniq()}"\nname = "ot${tag}"\naliases = ["al${tag}"]\n`, // typos: ignore-line
    );
    recordFolder(other);
    expect(write(join(al, "l.md")).warnings).toEqual([ambiguous(`al${tag}`)]);
  });

  test("the relink offers a pointer for a relative link into a named folder — reached, or broken where that folder was", async () => {
    const tag = uniq();
    const parent = mkdtempSync(join(tmpdir(), "slipbox-ptr-r-"));
    const b = await named(`rb${tag}`, { "n.md": "# N\n" }, parent);
    const a = await named(`ra${tag}`, { "a.md": `[n](../rb${tag}/n.md#top) [n2](../rb${tag}/n.md)\n` }, parent);
    const files = (r: Captured) =>
      JSON.parse(r.out).data.files.flatMap((f: { edits: { after: string }[] }) => f.edits.map((e) => e.after));
    expect(files(await cli(["--root", a, "relink", "--dry-run", "--json"]))).toEqual([
      `[n](slipbox://rb${tag}/n.md#top) [n2](slipbox://rb${tag}/n.md)`,
    ]);
    // Moved by hand, opened where it went: the links broke; the relink offers the pointer to where it is.
    const moved = join(mkdtempSync(join(tmpdir(), "slipbox-ptr-r2-")), `rb${tag}`);
    renameSync(b, moved);
    await cli(["--root", moved, "ls"]);
    expect(files(await cli(["--root", a, "relink", "--dry-run", "--json"]))).toEqual([
      `[n](slipbox://rb${tag}/n.md#top) [n2](slipbox://rb${tag}/n.md)`,
    ]);
  });
});
