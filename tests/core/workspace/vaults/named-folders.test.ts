import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { applyPlan, planRelink } from "../../../../src/core/workspace/mutations/rename/rename.ts";
import { locateVault, recordLocation } from "../../../../src/core/workspace/vaults/vault.ts";
import { cli } from "../../../support/vault-cli.ts";
import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("named folders (21.6)", () => {
  const uniq = () =>
    basename(mkdtempSync(join(tmpdir(), "n")))
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
  /** A folder: a `.slipbox/` with this name and id, and/or a repository with this origin. */
  const folder = (opts: { name?: string; id?: string; old?: string[]; remote?: string; obsidian?: boolean } = {}) => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-named-"));
    if (opts.name || opts.id) {
      mkdirSync(join(dir, ".slipbox"));
      const fields = [
        opts.id ? `id = "${opts.id}"` : "",
        opts.name ? `name = "${opts.name}"` : "",
        opts.old ? `previous_names = ${JSON.stringify(opts.old)}` : "",
      ].filter(Boolean);
      writeFileSync(join(dir, ".slipbox", "config.toml"), `[vault]\n${fields.join("\n")}\n`);
    }
    if (opts.remote !== undefined) {
      mkdirSync(join(dir, ".git", "info"), { recursive: true });
      writeFileSync(
        join(dir, ".git", "config"),
        `[core]\n\tbare = false\n${opts.remote ? `[remote "origin"]\n\turl = ${opts.remote}\n` : ""}`,
      );
    }
    if (opts.obsidian) mkdirSync(join(dir, ".obsidian"));
    return dir;
  };

  test("a name travels with what it names: .slipbox/'s, else the remote's; never a folder's own", async () => {
    const { folderIdentity } = await import("../../../../src/core/workspace/vaults/folders.ts");
    const id = uniq();
    expect(folderIdentity(folder({ name: "notes", id, old: ["kb"] }))).toMatchObject({
      key: `slipbox:${id}`,
      name: "notes",
      remote: null,
      id,
      old: ["kb"],
      private: false,
    });
    expect(folderIdentity(folder({ remote: "git@github.com:me/Research.git" }))).toMatchObject({
      key: "remote:github.com/me/Research",
      name: "Research",
      remote: "github.com/me/Research",
    });
    // Two remotes: origin's names it, wherever it's listed.
    const two = folder({ remote: "" });
    writeFileSync(
      join(two, ".git", "config"),
      '[remote "mirror"]\n\turl = https://github.com/them/mirror-name\n[remote "origin"]\n\turl = git@github.com:me/fork-name.git\n[remote "upstream"]\n\turl = https://github.com/them/upstream-name\n',
    );
    expect(folderIdentity(two)).toMatchObject({ name: "fork-name", remote: "github.com/me/fork-name" });
    // Both: the name someone chose; the remote kept, its qualified name.
    expect(folderIdentity(folder({ name: "papers", id, remote: "https://gitlab.com/lab/research.git" }))).toMatchObject(
      { key: `slipbox:${id}`, name: "papers", remote: "gitlab.com/lab/research" },
    );
    // Unnamed: a tool's marker alone, a repository with no remote, a .slipbox/ without a name.
    expect(folderIdentity(folder({ obsidian: true }))).toBeNull();
    expect(folderIdentity(folder({ remote: "" }))).toBeNull();
    expect(folderIdentity(folder({ id: uniq() }))).toBeNull();
    // Private (`init --private`): git's exclude keeps its .slipbox/ out.
    const priv = folder({ name: "review", id: uniq(), remote: "git@github.com:me/review.git" });
    writeFileSync(join(priv, ".git", "info", "exclude"), "/.slipbox/\n");
    expect(folderIdentity(priv)?.private).toBe(true);
    // A worktree: its main checkout is the copy.
    const main = folder({ remote: "git@github.com:me/wt.git" });
    mkdirSync(join(main, ".git", "worktrees", "feature"), { recursive: true });
    writeFileSync(join(main, ".git", "worktrees", "feature", "commondir"), "../..\n");
    const wt = mkdtempSync(join(tmpdir(), "slipbox-named-wt-"));
    writeFileSync(join(wt, ".git"), `gitdir: ${join(main, ".git", "worktrees", "feature")}\n`);
    expect(folderIdentity(wt)).toMatchObject({ key: "remote:github.com/me/wt", name: "wt", copy: main });
  });

  test("the lookup: the first copy found is the default; a second asks once; gone copies stay listed", async () => {
    const { lookupFolder, readFolders, recordFolder, setDefaultCopy } = await import(
      "../../../../src/core/workspace/vaults/folders.ts"
    );
    const name = `n${uniq()}`;
    const id = uniq();
    const a = folder({ name, id });
    const b = folder({ name, id });
    expect(recordFolder(a)).toMatchObject({ name, copies: [{ path: a }], default: a });
    expect(recordFolder(a)?.ask).toBeUndefined(); // seen again: not a second copy
    expect(recordFolder(b, { found: true })).toMatchObject({
      default: a,
      ask: true,
      copies: [{ path: a }, { path: b, found: true }],
    });
    expect(lookupFolder(name)).toMatchObject({ status: "found", path: a });
    // Found by the index, then opened: no longer only found.
    expect(recordFolder(b)?.copies[1]).toEqual({ path: b, seen: expect.any(String) });
    setDefaultCopy(`slipbox:${id}`, "/not/a/copy");
    expect(readFolders().find((f) => f.name === name)?.default).toBe(a); // not a copy: not the default
    setDefaultCopy(`slipbox:${id}`, b);
    expect(readFolders().find((f) => f.name === name)).toMatchObject({ default: b, asked: true });
    expect(readFolders().find((f) => f.name === name)?.ask).toBeUndefined();
    // A copy gone (moved, unplugged) and another come: nothing to choose between — not asked.
    const lone = `l${uniq()}`;
    const lid = uniq();
    const gone = folder({ name: lone, id: lid });
    recordFolder(gone);
    rmSync(gone, { recursive: true });
    expect(recordFolder(folder({ name: lone, id: lid }))?.ask).toBeUndefined();
    // A third copy: asked already, never again.
    const c = folder({ name, id });
    expect(recordFolder(c)?.ask).toBeUndefined();
    expect(lookupFolder(name.toUpperCase())).toMatchObject({ status: "found", path: b });
    // The default gone: another copy, said so; all gone: unavailable, still listed.
    rmSync(b, { recursive: true });
    expect(lookupFolder(name)).toMatchObject({ status: "found", path: a, via: "another-copy" });
    rmSync(a, { recursive: true });
    rmSync(c, { recursive: true });
    expect(lookupFolder(name)).toMatchObject({ status: "unavailable", path: b });
    expect(lookupFolder(`gone${uniq()}`)).toMatchObject({
      status: "unknown",
      reason: expect.stringContaining("isn't on this machine yet: open it, or let the index find it"),
    });
  });

  test("different folders of one name: repositories by their qualified names, .slipbox/ folders until one is renamed; old names still find", async () => {
    const { lookupFolder, pointerName, readFolders, recordFolder } = await import(
      "../../../../src/core/workspace/vaults/folders.ts"
    );
    const short = `r${uniq()}`;
    const mine = folder({ remote: `git@github.com:me/${short}.git` });
    const theirs = folder({ remote: `https://gitlab.com/lab/${short}` });
    recordFolder(mine);
    recordFolder(theirs);
    // Each named by its path (the remotes in the reason).
    expect(lookupFolder(short)).toMatchObject({
      status: "ambiguous",
      candidates: [mine, theirs].sort(),
      reason: `2 repositories are called ${short}: name one by its remote (github.com/me/${short}, gitlab.com/lab/${short})`,
    });
    expect(lookupFolder(`gitlab.com/lab/${short}`)).toMatchObject({ status: "found", path: theirs });
    const entry = readFolders().find((f) => f.remote === `github.com/me/${short}`)!;
    expect(pointerName(entry)).toBe(`github.com/me/${short}`);
    // Two .slipbox/ folders, one name, different ids.
    const same = `s${uniq()}`;
    const x = folder({ name: same, id: uniq() });
    recordFolder(x);
    expect(pointerName(readFolders().find((f) => f.name === same)!)).toBe(same); // alone: its short name
    recordFolder(folder({ name: same, id: uniq() }));
    const amb = lookupFolder(same);
    expect(amb).toMatchObject({
      status: "ambiguous",
      reason: `2 different folders are called ${same}: rename one (slipbox name <new>, in it)`,
    });
    // Renamed in its config, its old name kept: the old name still finds it, said so.
    const was = `w${uniq()}`;
    const now = `v${uniq()}`;
    const id = uniq();
    const p = folder({ name: was, id });
    recordFolder(p);
    writeFileSync(
      join(p, ".slipbox", "config.toml"),
      `[vault]\nid = "${id}"\nname = "${now}"\nprevious_names = ["${was}"]\n`,
    );
    recordFolder(p);
    expect(lookupFolder(now)).toMatchObject({ status: "found", path: p });
    expect(lookupFolder(was)).toMatchObject({ status: "found", path: p, via: "old-name" });
    // No longer named (its .slipbox/ gone, no remote): out of the lookup.
    rmSync(join(p, ".slipbox"), { recursive: true });
    expect(recordFolder(p)).toBeNull();
    expect(lookupFolder(now)).toMatchObject({ status: "unknown" });
  });

  test("a repository and a clone of it with a .slipbox/ name of its own are copies of one: by the remote, a pointer and a hosting URL open the default copy", async () => {
    const { lookupFolder, pointerNaming, readFolders, recordFolder } = await import(
      "../../../../src/core/workspace/vaults/folders.ts"
    );
    const { parsePointer, resolvePointer } = await import("../../../../src/core/workspace/links/pointer.ts");
    // As the reference set has them: the repository named in its .slipbox/ as its remote names it, the clone
    // (found first) given a name of its own.
    const short = `k${uniq()}`;
    const remote = `git@github.com:labs/${short}.git`;
    const qualified = `github.com/labs/${short}`;
    const clone = folder({ name: `${short}-spike`, id: uniq(), remote });
    const repo = folder({ name: short, id: uniq(), remote });
    writeFileSync(join(repo, "README.md"), "# Repo\n");
    writeFileSync(join(clone, "README.md"), "# Spike\n");
    recordFolder(clone);
    recordFolder(repo);
    expect(lookupFolder(qualified)).toMatchObject({ status: "found", path: repo });
    expect(resolvePointer(parsePointer(`slipbox://${qualified}/README.md`)!)).toMatchObject({
      status: "found",
      abs: join(repo, "README.md"),
    });
    expect(lookupFolder(`${short}-spike`)).toMatchObject({ status: "found", path: clone }); // its own name, itself
    const a = mkdtempSync(join(tmpdir(), "slipbox-named-a-"));
    mkdirSync(join(a, ".slipbox"));
    writeFileSync(
      join(a, "a.md"),
      `[r](https://github.com/labs/${short}/blob/main/README.md) [p](https://github.com/labs/${short})\n`,
    );
    const g = openGraph(locateVault({ root: a }), DEFAULT_CONFIG, false);
    expect(g.linksOf("a.md").map((l) => [l.resolvedKind, l.path, l.via])).toEqual([
      ["note", join(repo, "README.md"), "hosting"],
      ["note", join(repo, "README.md"), "hosting"],
    ]);
    // The repository named by its remote alone: the same. Its copy gone, the clone answers, said so.
    const bare = `b${uniq()}`;
    const bareClone = folder({ name: `${bare}-spike`, id: uniq(), remote: `https://gitlab.com/lab/${bare}` });
    const bareRepo = folder({ remote: `https://gitlab.com/lab/${bare}` });
    recordFolder(bareClone);
    recordFolder(bareRepo);
    expect(lookupFolder(`gitlab.com/lab/${bare}`)).toMatchObject({ status: "found", path: bareRepo });
    rmSync(bareRepo, { recursive: true });
    expect(lookupFolder(`gitlab.com/lab/${bare}`)).toMatchObject({
      status: "found",
      path: bareClone,
      via: "another-copy",
    });
    // A clone named as the repository is no different folder: its short name is written, and followed it opens the
    // repository's default copy. With a different repository of the name too, an error names each once, by its path.
    const twin = folder({ name: short, id: uniq(), remote });
    recordFolder(twin);
    expect(lookupFolder(short)).toMatchObject({ status: "found", path: repo });
    expect(pointerNaming(readFolders().find((f) => f.copies.some((c) => c.path === twin))!)).toMatchObject({
      name: short,
      clash: [],
    });
    const other = folder({ remote: `https://gitlab.com/else/${short}` });
    recordFolder(other);
    expect(lookupFolder(short)).toMatchObject({
      status: "ambiguous",
      candidates: [repo, other].sort(),
      reason: `2 repositories are called ${short}: name one by its remote (${qualified}, gitlab.com/else/${short})`,
    });
    expect(pointerNaming(readFolders().find((f) => f.copies.some((c) => c.path === twin))!)).toMatchObject({
      name: qualified,
      clash: [expect.objectContaining({ remote: `gitlab.com/else/${short}` })],
    });
  });

  test("a clone with a .slipbox/ name of its own is still a copy: made its repository's default copy, and named as its repository is (DF-D30)", async () => {
    const { lookupFolder, readFolders, recordFolder } = await import(
      "../../../../src/core/workspace/vaults/folders.ts"
    );
    const { tildePath } = await import("../../../../src/core/workspace/vaults/names.ts");
    const short = `c${uniq()}`;
    const remote = `git@github.com:labs/${short}.git`;
    const qualified = `github.com/labs/${short}`;
    const repo = folder({ name: short, id: uniq(), remote });
    const clone = folder({ name: `${short}-spike`, id: uniq(), remote });
    recordFolder(repo);
    recordFolder(clone);
    expect(lookupFolder(qualified)).toMatchObject({ status: "found", path: repo });
    // `folders default`, by the repository's full name or its short one: the clone is one of its copies.
    const set = await cli(["folders", "default", qualified, clone, "--json"]);
    expect([set.code, JSON.parse(set.out).data]).toEqual([0, { name: short, default: clone }]);
    for (const name of [qualified, short, `${short}-spike`])
      expect([name, lookupFolder(name)]).toEqual([name, expect.objectContaining({ status: "found", path: clone })]);
    expect((await cli(["folders"])).out).toContain(
      `${short}  ${qualified}\n    ${tildePath(repo)}\n  * ${tildePath(clone)}  (named ${short}-spike)\n`,
    );
    expect((await cli(["folders", "default", short, repo])).code).toBe(0);
    expect(lookupFolder(qualified)).toMatchObject({ status: "found", path: repo });
    // A folder of another repository is no copy of it: refused, its copies listed.
    const stranger = folder({ name: `${short}-x`, id: uniq(), remote: `https://gitlab.com/else/${short}` });
    recordFolder(stranger);
    const refused = await cli(["folders", "default", short, stranger]);
    expect([refused.code, refused.err]).toEqual([
      5,
      expect.stringContaining(`isn't a copy of ${short}: ${repo}, ${clone}`),
    ]);
    // The clone made the default, then no copy of the repository (its remote changed): the repository's own again.
    await cli(["folders", "default", short, clone]);
    writeFileSync(
      join(clone, ".git", "config"),
      `[core]\n\tbare = false\n[remote "origin"]\n\turl = https://gitlab.com/else/${short}-spike\n`,
    );
    recordFolder(clone);
    expect(lookupFolder(short)).toMatchObject({ status: "found", path: repo });
    // `name`: a clone named as its repository is (no different folder), a different folder's name still refused.
    const twin = folder({ name: `${short}-twin`, id: uniq(), remote });
    recordFolder(twin);
    const named = await cli(["--root", twin, "name", short, "--json"]);
    expect(named.code).toBe(0);
    expect(readFileSync(join(twin, ".slipbox", "config.toml"), "utf8")).toContain(`name = "${short}"`);
    expect(readFolders().find((f) => f.copies.some((c) => c.path === twin))?.name).toBe(short);
    expect(lookupFolder(short)).toMatchObject({ status: "found", path: repo }); // one repository still, not two folders
    const taken = await cli(["--root", twin, "name", `${short}-x`]);
    expect([taken.code, taken.err]).toEqual([5, expect.stringContaining(`a different folder is called ${short}-x`)]);
    // `init --name`: a clone given its .slipbox/ by the repository's name.
    const plain = folder({ remote });
    const init = await cli(["init", plain, "--name", short, "--json"]);
    expect([init.code, JSON.parse(init.out).data.name]).toEqual([0, short]);
  });

  test("opened, a folder is in the lookup; info says its name, copies and the one links open", async () => {
    const name = `i${uniq()}`;
    const id = uniq();
    const a = folder({ name, id });
    const b = folder({ name, id });
    writeFileSync(join(a, "x.md"), "# X\n");
    writeFileSync(join(b, "x.md"), "# X\n");
    await cli(["--root", a, "ls"]);
    const r = JSON.parse((await cli(["--root", b, "info", "--json"])).out).data.folder;
    expect(r).toMatchObject({ name, pointer: name, remote: null, id, private: false, default: a });
    expect(r.copies).toEqual([
      expect.objectContaining({ path: a, here: false, available: true }),
      expect.objectContaining({ path: b, here: true, available: true }),
    ]);
    expect((await cli(["--root", b, "info"])).out).toContain(`name      ${name} — 2 copies, links open ${a}`);
    const unnamed = folder({ obsidian: true });
    writeFileSync(join(unnamed, "y.md"), "# Y\n");
    expect((await cli(["--root", unnamed, "info"])).out).toContain(
      "name      none — no remote and no .slipbox/ name: linked to by relative path",
    );
  });
});

describe("named folders' words (21.10)", () => {
  const uniq = () =>
    basename(mkdtempSync(join(tmpdir(), "w")))
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
  test("a pointer as a command's note; slipbox name — a .slipbox/ folder's renamed, the old one kept and its pointers relinked; a repository's given one", async () => {
    const tag = uniq();
    const b = join(mkdtempSync(join(tmpdir(), "slipbox-words-")), "b");
    mkdirSync(join(b, ".slipbox"), { recursive: true });
    writeFileSync(join(b, ".slipbox", "config.toml"), `[vault]\nid = "b${tag}"\nname = "beta${tag}"\n`);
    writeFileSync(join(b, "x.md"), "# X\n\nbody\n");
    const a = mkdtempSync(join(tmpdir(), "slipbox-words-a-"));
    mkdirSync(join(a, ".slipbox"));
    writeFileSync(join(a, "a.md"), `[x](slipbox://beta${tag}/x.md)\n`);
    await cli(["--root", b, "ls"]);
    // A pointer names the note a command works on.
    const read = JSON.parse((await cli(["read", `slipbox://beta${tag}/x`, "--json"])).out).data;
    expect(read.content).toBe("# X\n\nbody\n");
    expect((await cli(["read", `slipbox://nope${tag}/x.md`])).code).toBe(3);
    // Renamed: the old name kept; a pointer by it still finds it, and the relink writes the new one.
    expect((await cli(["--root", b, "name", `gamma${tag}`])).code).toBe(0);
    expect(readFileSync(join(b, ".slipbox", "config.toml"), "utf8")).toContain(`previous_names = ["beta${tag}"]`);
    const ga = openGraph(locateVault({ root: a }), DEFAULT_CONFIG, false);
    expect(ga.linksOf("a.md")[0]).toMatchObject({ resolvedKind: "note", via: "old-name" });
    expect((await cli(["--root", a, "relink"])).code).toBe(0);
    expect(readFileSync(join(a, "a.md"), "utf8")).toBe(`[x](slipbox://gamma${tag}/x.md)\n`);
    // A different folder's name: refused.
    const c = join(mkdtempSync(join(tmpdir(), "slipbox-words-c-")), "c");
    mkdirSync(join(c, ".slipbox"), { recursive: true });
    writeFileSync(join(c, ".slipbox", "config.toml"), `[vault]\nid = "c${tag}"\nname = "c${tag}"\n`);
    writeFileSync(join(c, "c.md"), "# C\n");
    const clash = await cli(["--root", c, "name", `gamma${tag}`]);
    expect(clash.code).toBe(5);
    expect(clash.err).toContain(`a different folder is called gamma${tag}`);
    // A repository without .slipbox/: one made to hold the name.
    const repo = mkdtempSync(join(tmpdir(), "slipbox-words-r-"));
    mkdirSync(join(repo, ".git"));
    writeFileSync(join(repo, "r.md"), "# R\n");
    expect((await cli(["--root", repo, "name", `repo${tag}`])).code).toBe(0);
    expect(readFileSync(join(repo, ".slipbox", "config.toml"), "utf8")).toContain(`name = "repo${tag}"`);
  });

  test("slipbox folders: each name, its copies, the one links open; default <name> <path> makes another the one", async () => {
    const tag = uniq();
    const mk = () => {
      const d = join(mkdtempSync(join(tmpdir(), "slipbox-words-f-")), `f${tag}`);
      mkdirSync(join(d, ".slipbox"), { recursive: true });
      writeFileSync(join(d, ".slipbox", "config.toml"), `[vault]\nid = "f${tag}"\nname = "f${tag}"\n`);
      writeFileSync(join(d, "n.md"), "# N\n");
      return d;
    };
    const one = mk();
    const two = mk();
    await cli(["--root", one, "ls"]);
    await cli(["--root", two, "ls"]);
    const f = JSON.parse((await cli(["folders", "--json"])).out).data.find(
      (x: { name: string }) => x.name === `f${tag}`,
    );
    expect(f).toMatchObject({
      pointer: `f${tag}`,
      default: one,
      copies: [
        { path: one, available: true },
        { path: two, available: true },
      ],
    });
    expect((await cli(["folders"])).out).toContain(`f${tag}\n  * ${one}\n    ${two}`);
    expect((await cli(["folders", "default", `f${tag}`, two])).code).toBe(0);
    expect(
      JSON.parse((await cli(["folders", "--json"])).out).data.find((x: { name: string }) => x.name === `f${tag}`)
        .default,
    ).toBe(two);
    expect((await cli(["folders", "default", `f${tag}`, "/not/a/copy"])).code).toBe(5);
    expect((await cli(["folders", "default", `nope${tag}`, two])).code).toBe(3);
  });
});

describe("review cycle 3 (core)", () => {
  /** A root (`.slipbox/` unless said) holding `files`, indexed. */
  const root = (files: Record<string, string>, marker = ".slipbox") => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-c3-"));
    mkdirSync(join(dir, marker));
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), text);
    }
    return { dir, g: openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true) };
  };
  const read = (dir: string, rel: string) => readFileSync(join(dir, rel), "utf8");

  test("a folder's alias finds it as its name does — exact, never relinked away; a previous name is said and relinked", async () => {
    const { lookupFolder, recordFolder } = await import("../../../../src/core/workspace/vaults/folders.ts");
    const { certainty } = await import("../../../../src/core/workspace/graph/graph.ts");
    const tag = basename(mkdtempSync(join(tmpdir(), "a")))
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
    const { dir } = root({
      ".slipbox/config.toml": `[vault]\nid = "al${tag}"\nname = "notes${tag}"\naliases = ["n${tag}"]\nprevious_names = ["was${tag}"]\n`,
      "x.md": "# X\n",
    });
    recordFolder(dir);
    expect(lookupFolder(`n${tag}`)).toMatchObject({ status: "found", path: dir });
    expect(lookupFolder(`n${tag}`)).not.toHaveProperty("via");
    expect(lookupFolder(`was${tag}`)).toMatchObject({ status: "found", path: dir, via: "old-name" });
    const { dir: other, g } = root({ "a.md": `[x](slipbox://n${tag}/x.md) [y](slipbox://was${tag}/x.md)\n` });
    expect(g.linksOf("a.md").map((l) => [l.resolvedKind, l.via ?? null, certainty(l)])).toEqual([
      ["note", null, "exact"],
      ["note", "old-name", "inferred"],
    ]);
    applyPlan(g, planRelink(g));
    expect(read(other, "a.md")).toBe(`[x](slipbox://n${tag}/x.md) [y](slipbox://notes${tag}/x.md)\n`);
  });

  test("one named folder reached by its real path and by a symlink is one copy: nothing asked", async () => {
    const { readFolders } = await import("../../../../src/core/workspace/vaults/folders.ts");
    const top = mkdtempSync(join(tmpdir(), "slipbox-c3-link-"));
    const tag = basename(top)
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
    const real = join(top, "real", "notes");
    mkdirSync(join(real, ".slipbox"), { recursive: true });
    writeFileSync(join(real, ".slipbox", "config.toml"), `[vault]\nid = "ln${tag}"\nname = "ln${tag}"\n`);
    writeFileSync(join(real, "x.md"), "# X\n");
    symlinkSync(join(top, "real"), join(top, "link"));
    recordLocation(locateVault({ path: real }));
    recordLocation(locateVault({ path: join(top, "link", "notes", "x.md") }));
    const f = readFolders().find((x) => x.key === `slipbox:ln${tag}`)!;
    expect(f.copies.map((c) => c.path)).toEqual([realpathSync(real)]);
    expect(f.default).toBe(realpathSync(real));
    expect(f.ask).toBeUndefined();
  });
});
