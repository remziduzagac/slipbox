import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCliProcessSandbox } from "../../support/cli-process.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { sandbox, vault, slipbox } = makeCliProcessSandbox();

describe("the vault and the tool", () => {
  test("cp, rm, trash, and mv of a folder (18.x)", () => {
    const dir = join(sandbox, "fileops");
    mkdirSync(join(dir, "projects", "deep"), { recursive: true });
    writeFileSync(join(dir, "projects", "plan.md"), "# Plan\n\n[deeper](deep/detail.md)\n");
    writeFileSync(join(dir, "projects", "deep", "detail.md"), "# Detail\n\n[up](../plan.md)\n");
    writeFileSync(join(dir, "index.md"), "[plan](projects/plan.md) and [d](projects/deep/detail.md)\n");
    expect(slipbox(["init", dir, "--name", "fileops"]).code).toBe(0);
    // A folder moves whole: links into it fixed, links inside it left as they are.
    const mv = slipbox(["mv", "projects", "work", "--json"], { cwd: dir }).json;
    expect(mv.data).toMatchObject({ kind: "folder", from: "projects", to: "work", dryRun: false });
    expect(readFileSync(join(dir, "index.md"), "utf8")).toBe("[plan](work/plan.md) and [d](work/deep/detail.md)\n");
    expect(readFileSync(join(dir, "work", "plan.md"), "utf8")).toBe("# Plan\n\n[deeper](deep/detail.md)\n");
    expect(existsSync(join(dir, "projects"))).toBe(false);
    // cp: beside it as name-copy, or where told.
    expect(slipbox(["cp", "work/plan.md", "--json"], { cwd: dir }).json.data).toMatchObject({
      from: "work/plan.md",
      to: "work/plan-copy.md",
    });
    expect(slipbox(["cp", "work/plan.md", "elsewhere", "--json"], { cwd: dir }).json.data.to).toBe("elsewhere.md");
    expect(slipbox(["cp", "work/plan.md", "elsewhere"], { cwd: dir }).code).toBe(5); // there now
    // rm: to the trash, the links it breaks said; trash lists it; restore puts it back.
    const rm = slipbox(["rm", "work/plan.md", "--json"], { cwd: dir }).json;
    expect(rm.data.breaking).toBe(2);
    expect(rm.warnings.join()).toContain("2 links from other notes to work/plan.md will break");
    expect(existsSync(join(dir, "work", "plan.md"))).toBe(false);
    const listed = slipbox(["trash", "--json"], { cwd: dir }).json.data;
    expect(listed[0]).toMatchObject({ shown: "work/plan.md", dir: false });
    expect(slipbox(["trash", "restore", "work/plan.md"], { cwd: dir }).code).toBe(0);
    expect(readFileSync(join(dir, "work", "plan.md"), "utf8")).toContain("# Plan");
    expect(slipbox(["trash", "--json"], { cwd: dir }).json.data).toEqual([]);
    // A folder to the trash and back; restoring over something is refused.
    slipbox(["rm", "work/deep"], { cwd: dir });
    expect(existsSync(join(dir, "work", "deep"))).toBe(false);
    mkdirSync(join(dir, "work", "deep"));
    expect(slipbox(["trash", "restore", "work/deep"], { cwd: dir }).code).toBe(5);
    rmSync(join(dir, "work", "deep"), { recursive: true });
    expect(slipbox(["trash", "restore", "work/deep"], { cwd: dir }).code).toBe(0);
    expect(existsSync(join(dir, "work", "deep", "detail.md"))).toBe(true);
    expect(slipbox(["rm", ".slipbox"], { cwd: dir }).code).not.toBe(0);
    // A vault nested in it: the links into it are what break (18.7).
    mkdirSync(join(dir, "inner"));
    writeFileSync(join(dir, "inner", "note.md"), "# Inner\n");
    expect(slipbox(["init", join(dir, "inner"), "--name", "fileops-inner"]).code).toBe(0);
    writeFileSync(join(dir, "to-inner.md"), "[i](inner/note.md)\n");
    const vrm = slipbox(["rm", "inner", "--dry-run", "--json"], { cwd: dir }).json;
    expect(vrm.data).toMatchObject({ path: "inner", dryRun: true, breaking: 1 });
    // …and moved as a folder of this vault: the path link fixed.
    expect(slipbox(["mv", "inner", "box", "--json"], { cwd: dir }).json.data).toMatchObject({
      kind: "folder",
      from: "inner",
      to: "box",
    });
    expect(readFileSync(join(dir, "to-inner.md"), "utf8")).toBe("[i](box/note.md)\n");
    // deinit: part of this vault again (18.11); the path link means the same.
    expect(slipbox(["deinit", "box", "--json"], { cwd: dir }).json.data).toMatchObject({
      kind: "unmake-root",
      from: "box",
      to: "fileops",
    });
    expect(existsSync(join(dir, "box", ".slipbox"))).toBe(false);
    expect(readFileSync(join(dir, "to-inner.md"), "utf8")).toBe("[i](box/note.md)\n");
  });
  test("mv into a folder: one that's there, or a path ending in /, keeps the name; --dry-run and --plan alike (DF-D4)", () => {
    const dir = join(sandbox, "mv-into");
    mkdirSync(join(dir, "ideas"), { recursive: true });
    mkdirSync(join(dir, "box"), { recursive: true });
    writeFileSync(join(dir, "note.md"), "# Note\n\n[home](index.md)\n");
    writeFileSync(join(dir, "index.md"), "[n](note.md)\n");
    writeFileSync(join(dir, "ideas", "x.md"), "# X\n");
    expect(slipbox(["init", dir, "--name", "mv-into"]).code).toBe(0);
    // Previewed and planned where it would go: nothing written.
    expect(slipbox(["mv", "note.md", "ideas/", "--dry-run", "--json"], { cwd: dir }).json.data).toMatchObject({
      kind: "note",
      from: "note.md",
      to: "ideas/note.md",
      dryRun: true,
    });
    expect(slipbox(["mv", "note.md", "ideas", "--plan", "--json"], { cwd: dir }).json.data).toMatchObject({
      to: "ideas/note.md",
      plan: { id: expect.any(String) },
    });
    expect(existsSync(join(dir, "note.md"))).toBe(true);
    // Moved into it, never renamed beside it; its links, and those to it, fixed.
    expect(slipbox(["mv", "note.md", "ideas/", "--json"], { cwd: dir }).json.data).toMatchObject({
      to: "ideas/note.md",
      dryRun: false,
    });
    expect(existsSync(join(dir, "ideas.md"))).toBe(false);
    expect(readFileSync(join(dir, "index.md"), "utf8")).toBe("[n](ideas/note.md)\n");
    expect(readFileSync(join(dir, "ideas", "note.md"), "utf8")).toBe("# Note\n\n[home](../index.md)\n");
    // A folder into a folder; a path ending in / made; `.` the folder you're in, the root a place too.
    expect(slipbox(["mv", "ideas", "box", "--json"], { cwd: dir }).json.data).toMatchObject({
      kind: "folder",
      from: "ideas",
      to: "box/ideas",
    });
    expect(slipbox(["mv", "box/ideas/x.md", "later/", "--json"], { cwd: dir }).json.data.to).toBe("later/x.md");
    expect(slipbox(["mv", "ideas/note.md", ".", "--json"], { cwd: join(dir, "box") }).json.data.to).toBe("box/note.md");
    expect(slipbox(["mv", "later/x.md", "..", "--json"], { cwd: join(dir, "box", "ideas") }).json.data.to).toBe(
      "box/x.md",
    );
    expect(slipbox(["mv", "box/note.md", "./", "--json"], { cwd: dir }).json.data.to).toBe("note.md");
    // A name with no folder there is still a rename.
    expect(slipbox(["mv", "note.md", "renamed", "--json"], { cwd: dir }).json.data.to).toBe("renamed.md");
  });
  test("cp into a folder, as mv: one that's there, or a path ending in /, made if missing, keeps the name (DF-D20, DF-D21)", () => {
    const dir = join(sandbox, "cp-into");
    mkdirSync(join(dir, "ideas"), { recursive: true });
    mkdirSync(join(dir, "drafts"), { recursive: true });
    writeFileSync(join(dir, "note.md"), "# Note\n");
    writeFileSync(join(dir, "drafts", "d.md"), "# D\n");
    expect(slipbox(["init", dir, "--name", "cp-into"]).code).toBe(0);
    const to = (args: string[], cwd = dir) => slipbox(["cp", ...args, "--json"], { cwd }).json.data?.to;
    expect(to(["note.md", "ideas/"])).toBe("ideas/note.md");
    expect(existsSync(join(dir, "ideas.md"))).toBe(false);
    rmSync(join(dir, "ideas", "note.md"));
    expect(to(["note.md", "ideas"])).toBe("ideas/note.md"); // there already
    expect(to(["note.md", "later/"])).toBe("later/note.md"); // made
    expect(to(["drafts", "archive/"])).toBe("archive/drafts"); // a folder too, never a copy named archive
    expect(readFileSync(join(dir, "archive", "drafts", "d.md"), "utf8")).toBe("# D\n");
    expect(to(["note.md", "."], join(dir, "drafts"))).toBe("drafts/note.md"); // the folder you're in
    // Into its own folder: beside it, as name-copy, as a paste there makes one.
    expect(to(["note.md", "./"])).toBe("note-copy.md");
    expect(to(["drafts/d.md", "drafts/"])).toBe("drafts/d-copy.md");
    // Any other path is the whole path; a file where a folder would be, refused.
    expect(to(["note.md", "tray"])).toBe("tray.md");
    const under = slipbox(["cp", "note.md", "tray.md/"], { cwd: dir });
    expect(under.code).toBe(5);
    expect(under.err).toContain("tray.md is a file: tray.md/note.md can't go under it");
  });
  test("trash empty: listed first, removed for good only with --yes (DF-D14)", () => {
    const dir = join(sandbox, "trash-empty");
    mkdirSync(join(dir, "box"), { recursive: true });
    writeFileSync(join(dir, "a.md"), "# A\n");
    writeFileSync(join(dir, "box", "b.md"), "# B\n");
    expect(slipbox(["init", dir, "--name", "trash-empty"]).code).toBe(0);
    expect(slipbox(["trash", "empty"], { cwd: dir }).out).toBe("the trash is empty\n");
    slipbox(["rm", "a.md"], { cwd: dir });
    slipbox(["rm", "box"], { cwd: dir });
    const preview = slipbox(["trash", "empty"], { cwd: dir });
    expect(preview.out).toMatch(
      /^removes for good, 2 items:\n {2}\S+ \S+ {2}box\/ {2}\(\S+\)\n {2}\S+ \S+ {2}a\.md {2}\(\S+\)\nnothing removed yet: again with --yes to remove these\n$/,
    );
    expect(slipbox(["trash", "empty", "--json"], { cwd: dir }).json.data).toMatchObject({
      removed: false,
      items: [{ shown: "box" }, { shown: "a.md" }],
    });
    expect(slipbox(["trash", "--json"], { cwd: dir }).json.data).toHaveLength(2); // nothing removed yet
    // --yes: gone for good, the trash's folder too; nothing left to restore.
    const state = slipbox(["info", "--json"], { cwd: dir }).json.data.state as string;
    expect(slipbox(["trash", "empty", "--yes", "--json"], { cwd: dir }).json.data).toMatchObject({
      removed: true,
      items: [{ shown: "box" }, { shown: "a.md" }],
    });
    expect(slipbox(["trash", "--json"], { cwd: dir }).json.data).toEqual([]);
    expect(readdirSync(join(state, "trash"))).toEqual(["trash.json"]);
    expect(slipbox(["trash", "restore", "a.md"], { cwd: dir }).code).toBe(3);
    expect(slipbox(["trash", "empty", "--yes"], { cwd: dir }).out).toBe("the trash is empty\n");
    // --yes is empty's alone; empty takes no item.
    expect(slipbox(["trash", "--yes"], { cwd: dir }).code).toBe(2);
    expect(slipbox(["trash", "empty", "a.md"], { cwd: dir }).code).toBe(2);
  });
  test("mkdir: a folder in the vault, parents too; never over one, never outside", () => {
    const r = slipbox(["mkdir", "made/deeper", "--json"]);
    expect(r.code).toBe(0);
    expect(r.json.data).toEqual({ path: "made/deeper", created: true });
    expect(existsSync(join(vault, "made", "deeper"))).toBe(true);
    expect(slipbox(["mkdir", "made"]).code).toBe(5);
    expect(slipbox(["mkdir", "../outside"]).code).toBe(5);
    rmSync(join(vault, "made"), { recursive: true });
  });
});

describe("review cycle 6 (cli)", () => {
  /** A folder of its own and a state only it knows: what one test names, no other sees. */
  function own(prefix: string): { dir: string; env: Record<string, string> } {
    const dir = mkdtempSync(join(sandbox, prefix));
    return {
      dir,
      env: { XDG_STATE_HOME: join(dir, "state"), XDG_CACHE_HOME: join(dir, "cache"), XDG_DATA_HOME: join(dir, "data") },
    };
  }
  test("review cycle 3: mv and cp take the new path from the root, the current folder (./, ../), or absolute", () => {
    const { dir, env } = own("dest-");
    const root = join(dir, "root");
    mkdirSync(join(root, ".slipbox"), { recursive: true });
    mkdirSync(join(root, "sub"));
    writeFileSync(join(root, "ok.md"), "# OK\n");
    writeFileSync(join(root, "sub", "x.md"), "# X\n");
    writeFileSync(join(root, "sub", "z.md"), "# Z\n");
    // Absolute, inside the root: where it says, not a tree of its folders under the root.
    expect(slipbox(["cp", "ok.md", join(root, "copy.md"), "--json"], { cwd: root, env }).json.data.to).toBe("copy.md");
    expect(existsSync(join(root, "copy.md"))).toBe(true);
    // Absolute, outside: refused, nothing written.
    expect(slipbox(["mv", "ok.md", "/etc/x.md"], { cwd: root, env }).code).toBe(5);
    expect(slipbox(["cp", "ok.md", "/etc/x.md"], { cwd: root, env }).code).toBe(5);
    expect(existsSync(join(root, "etc"))).toBe(false);
    expect(existsSync(join(root, "ok.md"))).toBe(true);
    // From the current folder when it says so.
    const sub = join(root, "sub");
    expect(slipbox(["mv", "x.md", "./y.md"], { cwd: sub, env }).code).toBe(0);
    expect(existsSync(join(sub, "y.md"))).toBe(true);
    expect(slipbox(["mv", "z.md", "../z.md"], { cwd: sub, env }).code).toBe(0);
    expect(existsSync(join(root, "z.md"))).toBe(true);
  });
});

describe("the CLI's edges: help flags, error paths, empty states", () => {
  /** A root of its own, with a state, cache and config only it knows. */
  function fresh(prefix: string): { root: string; dir: string; env: Record<string, string> } {
    const dir = mkdtempSync(join(sandbox, prefix));
    const root = join(dir, "root");
    mkdirSync(join(root, ".slipbox"), { recursive: true });
    const env = {
      XDG_STATE_HOME: join(dir, "state"),
      XDG_CACHE_HOME: join(dir, "cache"),
      XDG_DATA_HOME: join(dir, "data"),
      XDG_CONFIG_HOME: join(dir, "config"),
      SLIPBOX_CONFIG: join(dir, "config", "slipbox", "config.toml"),
    };
    return { root, dir, env };
  }
  test("mkdir: no path is a usage error; an absolute path in the root is made, one outside refused", () => {
    const { root, dir, env } = fresh("mkdir-");
    expect(slipbox(["mkdir"], { cwd: root, env })).toMatchObject({ code: 2, err: "slipbox: missing path\n" });
    expect(slipbox(["mkdir", join(root, "abs", "deep"), "--json"], { cwd: root, env }).json.data).toEqual({
      path: "abs/deep",
      created: true,
    });
    expect(existsSync(join(root, "abs", "deep"))).toBe(true);
    const out = slipbox(["mkdir", join(dir, "beside"), "--json"], { cwd: root, env });
    expect(out.code).toBe(5);
    expect(out.json.error!.message).toBe(`${join(dir, "beside")} is outside the vault (${root})`);
    expect(existsSync(join(dir, "beside"))).toBe(false);
  });
  test("cp, rm and trash restore of a namesake: each link by name it sends elsewhere is warned (21.3)", () => {
    const { root, env } = fresh("namesake-");
    mkdirSync(join(root, "Recipes", "Baking"), { recursive: true });
    mkdirSync(join(root, "Archive", "Old", "Older"), { recursive: true });
    writeFileSync(join(root, "Home.md"), "# Home\n\nSee [[Pie]] now.\n");
    writeFileSync(join(root, "Recipes", "Baking", "Pie.md"), "# P\n");
    writeFileSync(join(root, "Archive", "Old", "Older", "Pie.md"), "# P2\n");
    // A nearer Pie made: [[Pie]] reaches it now, the shortest path.
    const cp = slipbox(["cp", "Recipes/Baking/Pie.md", "Pie.md", "--json"], { cwd: root, env }).json;
    expect(cp.ok).toBe(true);
    expect(cp.warnings).toContain("Home.md:3: [[Pie]] reached Recipes/Baking/Pie.md; it reaches Pie.md now");
    const rm = slipbox(["rm", "Pie.md"], { cwd: root, env });
    expect(rm.code).toBe(0);
    expect(rm.err).toContain(
      "slipbox: warning: Home.md:3: [[Pie]] reached Pie.md; it reaches Recipes/Baking/Pie.md now\n",
    );
    const back = slipbox(["trash", "restore", "Pie.md", "--json"], { cwd: root, env }).json;
    expect(back.warnings).toContain("Home.md:3: [[Pie]] reached Recipes/Baking/Pie.md; it reaches Pie.md now");
    // A name no other note has sends nothing elsewhere: nothing said.
    expect(slipbox(["cp", "Home.md", "Other.md", "--json"], { cwd: root, env }).json.warnings).toEqual([]);
  });
});
