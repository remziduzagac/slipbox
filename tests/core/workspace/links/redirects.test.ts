import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { runCli } from "../../../../src/cli/cli.ts";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { applyPlan, planRelink } from "../../../../src/core/workspace/mutations/rename/rename.ts";
import { elsewhereAt, locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import { cli } from "../../../support/vault-cli.ts";
import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("moves: detected by content, kept as redirects (17.12)", () => {
  const io = (cwd: string) => {
    const out: string[] = [];
    return {
      io: {
        out: (s: string) => out.push(s),
        err: () => {},
        stdin: async () => "",
        isTTY: false,
        columns: 80,
        cwd,
        env: process.env,
      },
      out,
    };
  };
  const cli = async (args: string[], cwd: string) => {
    const r = io(cwd);
    const code = await runCli([...args, "--json"], r.io);
    return { code, json: JSON.parse(r.out.join("")) };
  };
  const vault = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-moves-"));
    mkdirSync(join(dir, ".slipbox"));
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(join(dir, rel, ".."), { recursive: true });
      writeFileSync(join(dir, rel), text);
    }
    return dir;
  };

  test("a note moved outside slipbox (mv) is found again: its path links are broken, and the relink knows where it went", async () => {
    const { renameSync } = await import("node:fs");
    const dir = vault({
      "notes/plan.md": "# The plan\n\nSteps.\n",
      "index.md": "[p](notes/plan.md) [s](notes/plan.md#the-plan)\n",
    });
    await cli(["ls"], dir); // indexed: plan.md's text is known
    mkdirSync(join(dir, "archive"));
    renameSync(join(dir, "notes", "plan.md"), join(dir, "archive", "old-plan.md"));
    // A move is evidence for a fix, never a way to resolve (20.2).
    const links = (await cli(["links", "index"], dir)).json.data;
    expect(links.map((l: { status: string; path: string }) => [l.status, l.path])).toEqual([
      ["unresolved", null],
      ["unresolved", null],
    ]);
    expect((await cli(["resolve", "[p](notes/plan.md)", "--from", "index.md"], dir)).code).toBe(3);
    expect((await cli(["backlinks", "archive/old-plan.md"], dir)).json.data.backlinks).toHaveLength(0);
    const relink = await cli(["relink", "--dry-run"], dir);
    expect(relink.json.data.files[0].edits[0].after).toBe("[p](archive/old-plan.md) [s](archive/old-plan.md#the-plan)");
    // Its problem says where it went, and the fix; a note seen to move is no note still to write.
    const problems = (await cli(["diagnostics", "index.md"], dir)).json.data.problems.map(
      (p: { severity: string; message: string }) => [p.severity, p.message],
    );
    expect(problems[0]).toEqual([
      "warning",
      "broken link: notes/plan.md — moved to archive/old-plan.md (relink fixes it)",
    ]);
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    expect(g.movedTarget({ kind: "markdown", target: "notes/plan.md" }, "index.md")).toBe("archive/old-plan.md");
    expect(g.missingNote({ kind: "markdown", target: "notes/plan.md" }, "index.md")).toBeNull();
    expect(g.missingNote({ kind: "markdown", target: "notes/never.md" }, "index.md")).toBe("notes/never.md");
    // Moved again: the chain is followed.
    renameSync(join(dir, "archive", "old-plan.md"), join(dir, "plan-final.md"));
    expect((await cli(["relink", "--dry-run"], dir)).json.data.files[0].edits[0].after).toBe(
      "[p](plan-final.md) [s](plan-final.md#the-plan)",
    );
  });

  test("a leading / is the nearest root's, then the filesystem's, in every file; with no root, the filesystem's (21.2)", () => {
    const dir = vault({ "notes/a.md": "# A\n", "run.py": "# see /notes/a.md\n" });
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    const at = (target: string, from: string) => g.resolveLink({ kind: "markdown", target }, from);
    expect(at("/notes/a.md", "index.md")).toMatchObject({ resolvedKind: "note", path: "notes/a.md" });
    expect(at("/notes/a.md#Top", "notes/a.md")).toMatchObject({ resolvedKind: "note", path: "notes/a.md" });
    expect(at("/notes/a.md", "run.py")).toMatchObject({ resolvedKind: "note", path: "notes/a.md" });
    // Nothing there in the root: the filesystem's path, inside the root or out of it.
    expect(at(join(dir, "notes", "a.md"), "index.md")).toMatchObject({ resolvedKind: "note", path: "notes/a.md" });
    const outside = join(mkdtempSync(join(tmpdir(), "slipbox-slash-")), "far.md");
    writeFileSync(outside, "# Far\n");
    expect(at(outside, "index.md")).toMatchObject({ resolvedKind: "note", path: outside });
    expect(at(outside.replace(/\.md$/, ""), "index.md")).toMatchObject({ resolvedKind: "note", path: outside }); // without its extension too
    expect(at("/nowhere/x.md", "index.md").resolvedKind).toBe("unresolved");
    // Elsewhere has no root (VV-D3): `/` is the filesystem's alone, and a note in a folder of it, never walked, is
    // reached by its whole path.
    const loose = mkdtempSync(join(tmpdir(), "slipbox-loose-slash-"));
    mkdirSync(join(loose, "notes"));
    writeFileSync(join(loose, "notes", "a.md"), "# A\n");
    const lg = openGraph(elsewhereAt(loose), DEFAULT_CONFIG, true);
    expect(lg.resolveLink({ kind: "markdown", target: "/notes/a.md" }, "x.md").resolvedKind).toBe("unresolved");
    expect(lg.resolveLink({ kind: "markdown", target: join(loose, "notes", "a.md") }, "x.md")).toMatchObject({
      resolvedKind: "note",
      path: join(loose, "notes", "a.md"),
    });
  });

  test("a path without an extension is the file as written, else its note, else a folder; a trailing / a folder (21.2)", () => {
    const dir = vault({
      "notes/plan.md": "# Plan\n",
      "notes/Makefile": "all:\n",
      "notes/v1.2.md": "# v\n",
      "docs/guide.md": "# G\n",
      "docs.md": "# Docs\n",
      "zk/202608151900-index.md": "# I\n",
    });
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    const at = (target: string, from = "index.md") => g.resolveLink({ kind: "markdown", target }, from);
    expect(at("notes/plan")).toMatchObject({ resolvedKind: "note", path: "notes/plan.md" });
    expect(at("plan#Plan", "notes/x.md")).toMatchObject({ resolvedKind: "note", path: "notes/plan.md" });
    expect(at("/notes/plan")).toMatchObject({ resolvedKind: "note", path: "notes/plan.md" });
    expect(at("202608151900-index", "zk/a.md")).toMatchObject({
      resolvedKind: "note",
      path: "zk/202608151900-index.md",
    }); // zk's
    expect(at("notes/Makefile")).toMatchObject({ resolvedKind: "file", path: "notes/Makefile" }); // the file as written first
    expect(at("notes/v1.2")).toMatchObject({ resolvedKind: "note", path: "notes/v1.2.md" });
    // A folder: `docs` is the note docs.md (a note before a folder), `docs/` the folder; the root itself.
    expect(at("docs")).toMatchObject({ resolvedKind: "note", path: "docs.md" });
    expect(at("docs/")).toMatchObject({ resolvedKind: "folder", path: "docs" });
    expect(at("notes")).toMatchObject({ resolvedKind: "folder", path: "notes" });
    expect(at("/")).toMatchObject({ resolvedKind: "folder", path: "." });
    expect(at("missing/")).toMatchObject({ resolvedKind: "unresolved" });
    // Broken, written without an extension: the note it reads as is what following offers to make;
    // a `/…` from the root too — but not one naming no folder of the root (a filesystem path).
    expect(g.missingNote({ kind: "markdown", target: "notes/idea" }, "index.md")).toBe("notes/idea.md");
    expect(g.missingNote({ kind: "markdown", target: "/notes/idea.md" }, "docs/guide.md")).toBe("notes/idea.md");
    expect(g.missingNote({ kind: "markdown", target: "/media/drive/idea.md" }, "index.md")).toBeNull();
    // A folder is no broken link: no problem for it.
    writeFileSync(join(dir, "index.md"), "[the docs](docs/) [notes](notes)\n");
    const g2 = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    expect(g2.linksOf("index.md").map((l) => [l.target, l.resolvedKind])).toEqual([
      ["docs/", "folder"],
      ["notes", "folder"],
    ]);
    expect(g2.backlinks("docs").map((b) => b.target)).toEqual(["docs/"]);
  });

  test("two notes with the same text gone at once: no move is guessed", async () => {
    const { renameSync } = await import("node:fs");
    const dir = vault({ "a.md": "# same\n", "b.md": "# same\n", "index.md": "[a](a.md)\n" });
    await cli(["ls"], dir);
    // One moved, one deleted: which went where can't be told.
    renameSync(join(dir, "a.md"), join(dir, "c.md"));
    rmSync(join(dir, "b.md"));
    expect((await cli(["resolve", "[a](a.md)", "--from", "index.md"], dir)).code).toBe(3);
  });

  test("the watcher pairs a move only when one gone note had that text, as the index does (D63)", () => {
    const dir = vault({ "a.md": "# same\n", "b.md": "# same\n", "e.md": "# same\n", "c.md": "# other\n" });
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    const file = (rel: string) => ({
      rel,
      abs: join(dir, rel),
      size: statSync(join(dir, rel)).size,
      mtimeMs: statSync(join(dir, rel)).mtimeMs,
    });
    // Two gone with one text, one back elsewhere: which one moved can't be told — no move.
    rmSync(join(dir, "a.md"));
    rmSync(join(dir, "b.md"));
    g.removeFile("a.md");
    g.removeFile("b.md");
    writeFileSync(join(dir, "x.md"), "# same\n");
    g.updateFile("x.md", file("x.md"));
    expect(g.redirects!.follow("a.md")).toBeNull();
    expect(g.redirects!.follow("b.md")).toBeNull();
    // The other order: two arrived with one text, one gone — no move either.
    writeFileSync(join(dir, "y.md"), "# other\n");
    writeFileSync(join(dir, "z.md"), "# other\n");
    g.updateFile("y.md", file("y.md"));
    g.updateFile("z.md", file("z.md"));
    rmSync(join(dir, "c.md"));
    g.removeFile("c.md");
    expect(g.redirects!.follow("c.md")).toBeNull();
    // A third gone after the arrival doesn't make the one arrival its own.
    rmSync(join(dir, "e.md"));
    g.removeFile("e.md");
    expect(g.redirects!.follow("e.md")).toBeNull();
    // One candidate: the move is recorded as before.
    const h = vault({ "p.md": "# alone\n" });
    const hg = openGraph(locateVault({ root: h }), DEFAULT_CONFIG, true);
    rmSync(join(h, "p.md"));
    hg.removeFile("p.md");
    writeFileSync(join(h, "q.md"), "# alone\n");
    hg.updateFile("q.md", {
      rel: "q.md",
      abs: join(h, "q.md"),
      size: statSync(join(h, "q.md")).size,
      mtimeMs: statSync(join(h, "q.md")).mtimeMs,
    });
    expect(hg.redirects!.follow("p.md")).toBe("q.md");
  });

  test("a rename keeps each link's form: from the root, without the extension; a folder's links follow it, its / kept (21.2)", async () => {
    const dir = vault({
      "notes/plan.md": "# Plan\n",
      "notes/deep/x.md": "# X\n",
      "index.md":
        "[root](/notes/plan.md#Plan) [bare](notes/plan) [rootbare](/notes/plan) [folder](notes/) [folder2](notes) [deep](notes/deep/)\n",
    });
    expect((await cli(["mv", "notes/plan.md", "notes/roadmap.md"], dir)).code).toBe(0);
    expect(readFileSync(join(dir, "index.md"), "utf8")).toBe(
      "[root](/notes/roadmap.md#Plan) [bare](notes/roadmap) [rootbare](/notes/roadmap) [folder](notes/) [folder2](notes) [deep](notes/deep/)\n",
    );
    // The folder moved: links to it and to the folder in it, each its own way; links into it too.
    expect((await cli(["mv", "notes", "archive"], dir)).code).toBe(0);
    expect(readFileSync(join(dir, "index.md"), "utf8")).toBe(
      "[root](/archive/roadmap.md#Plan) [bare](archive/roadmap) [rootbare](/archive/roadmap) [folder](archive/) [folder2](archive) [deep](archive/deep/)\n",
    );
  });

  test("relinked, a link written without its extension stays so (21.2)", () => {
    const dir = vault({
      "docs/guide.md": "# The guide, long enough to be known again when it moves.\n",
      "index.md": "[g](docs/guide)\n",
    });
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    const file = (rel: string) => ({
      rel,
      abs: join(dir, rel),
      size: statSync(join(dir, rel)).size,
      mtimeMs: statSync(join(dir, rel)).mtimeMs,
    });
    writeFileSync(join(dir, "docs", "manual.md"), readFileSync(join(dir, "docs", "guide.md")));
    rmSync(join(dir, "docs", "guide.md"));
    g.removeFile("docs/guide.md");
    g.updateFile("docs/manual.md", file("docs/manual.md"));
    expect(g.movedTarget({ kind: "markdown", target: "docs/guide" }, "index.md")).toBe("docs/manual.md");
    const plan = planRelink(g);
    expect(plan.files.flatMap((f) => f.edits.map((e) => e.after.trim()))).toEqual(["[g](docs/manual)"]);
  });

  test("the watcher's removal and arrival pair into a move, in either order", () => {
    const dir = vault({ "a.md": "# A text\n", "b.md": "# B text\n" });
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    const file = (rel: string) => ({
      rel,
      abs: join(dir, rel),
      size: statSync(join(dir, rel)).size,
      mtimeMs: statSync(join(dir, rel)).mtimeMs,
    });
    writeFileSync(join(dir, "a2.md"), "# A text\n");
    rmSync(join(dir, "a.md"));
    g.removeFile("a.md");
    g.updateFile("a2.md", file("a2.md"));
    expect(g.redirects!.follow("a.md")).toBe("a2.md");
    writeFileSync(join(dir, "b2.md"), "# B text\n");
    g.updateFile("b2.md", file("b2.md")); // arrived first
    rmSync(join(dir, "b.md"));
    g.removeFile("b.md");
    expect(g.redirects!.follow("b.md")).toBe("b2.md");
    // Evidence for a fix, not a way to resolve (20.2).
    expect(g.resolveLink({ kind: "markdown", target: "b.md" }, "a2.md").resolvedKind).toBe("unresolved");
    expect(g.movedTarget({ kind: "markdown", target: "b.md" }, "a2.md")).toBe("b2.md");
  });
});

describe("repairs from what the state knows (20.17)", () => {
  test("a named folder moved by hand: relink fixes its links out by a path, and the other roots' links into it, each in its form", async () => {
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
      return { code, json: JSON.parse(out.join("")) };
    };
    const base = mkdtempSync(join(tmpdir(), "slipbox-repair-"));
    const tag = basename(base).replace(/[^a-z0-9]/gi, "");
    const [a, b, c] = ["a", "b", "c"].map((v) => join(base, "x", v)) as [string, string, string];
    for (const [v, dir] of [
      ["a", a],
      ["b", b],
      ["c", c],
    ] as const) {
      mkdirSync(dir, { recursive: true });
      await cli(["init", dir, "--name", `${v}${tag}`], dir);
    }
    writeFileSync(join(a, "t.md"), "# T\n");
    writeFileSync(join(a, "out.md"), "[n](../b/n.md#top) and [in](t.md)\n\n[near](../near.md)\n");
    writeFileSync(join(base, "x", "near.md"), "# Near, by the old place\n");
    writeFileSync(join(b, "n.md"), "# Top\n");
    writeFileSync(join(c, "in.md"), `[t](../a/t.md) [abs](${a}/t.md)\n`);
    for (const dir of [a, b, c]) await cli(["ls"], dir);
    // Moved by hand, deeper; opened there, its state came along (21.8): its move broke links on two lines (three links).
    const moved = join(base, "y", "deeper", "a");
    mkdirSync(dirname(moved), { recursive: true });
    // A link out that reaches something where it's gone too: not broken, so not touched.
    writeFileSync(join(base, "y", "deeper", "near.md"), "# Near, by the new place\n");
    renameSync(a, moved);
    const said = (await cli(["ls"], moved)).json.warnings.join();
    expect(said).toContain(`moved here from ${a}`);
    expect(said).toContain("its move broke links on 2 lines: slipbox relink fixes them");
    const dry = await cli(["relink", "--dry-run"], moved);
    const edits = dry.json.data.files.flatMap((f: { abs: string; edits: { before: string; after: string }[] }) =>
      f.edits.map((e) => [relative(base, f.abs), e.before, e.after]),
    );
    expect(edits.sort()).toEqual(
      [
        ["x/c/in.md", `[t](../a/t.md) [abs](${a}/t.md)`, `[t](../../y/deeper/a/t.md) [abs](${moved}/t.md)`],
        ["y/deeper/a/out.md", "[n](../b/n.md#top) and [in](t.md)", "[n](../../../x/b/n.md#top) and [in](t.md)"],
      ].sort(),
    );
    expect(readFileSync(join(c, "in.md"), "utf8")).toBe(`[t](../a/t.md) [abs](${a}/t.md)\n`); // only shown so far
    expect((await cli(["relink"], moved)).code).toBe(0);
    expect(readFileSync(join(moved, "out.md"), "utf8")).toBe(
      "[n](../../../x/b/n.md#top) and [in](t.md)\n\n[near](../near.md)\n",
    );
    expect(readFileSync(join(c, "in.md"), "utf8")).toBe(`[t](../../y/deeper/a/t.md) [abs](${moved}/t.md)\n`);
    // Fixed. b is a named folder that doesn't travel with a: the relink offers its pointer now (21.7).
    const offer = (await cli(["relink", "--dry-run"], moved)).json.data.files;
    expect(offer.flatMap((f: { edits: { after: string }[] }) => f.edits.map((e) => e.after))).toEqual([
      `[n](slipbox://b${tag}/n.md#top) and [in](t.md)`,
    ]);
    expect((await cli(["relink"], moved)).code).toBe(0);
    expect((await cli(["relink", "--dry-run"], moved)).json.data.files).toEqual([]);
    // Moved again: the last move is the one to read from — and the pointer needs nothing.
    const again = join(base, "z", "a");
    mkdirSync(dirname(again), { recursive: true });
    renameSync(moved, again);
    await cli(["ls"], again);
    expect((await cli(["relink"], again)).code).toBe(0);
    expect(readFileSync(join(again, "out.md"), "utf8").split("\n")[0]).toBe(
      `[n](slipbox://b${tag}/n.md#top) and [in](t.md)`,
    );
    expect(readFileSync(join(c, "in.md"), "utf8")).toBe(`[t](../../z/a/t.md) [abs](${again}/t.md)\n`);
  });

  test("a moved folder's warning counts the links its move broke — never relink's pointer offers for links still whole", async () => {
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
      return { code, json: JSON.parse(out.join("")) };
    };
    const base = mkdtempSync(join(tmpdir(), "slipbox-whole-"));
    const tag = basename(base)
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
    const [a, b] = ["a", "b"].map((v) => join(base, "x", v)) as [string, string];
    for (const [v, dir] of [
      ["a", a],
      ["b", b],
    ] as const) {
      mkdirSync(dir, { recursive: true });
      await cli(["init", dir, "--name", `w${v}${tag}`], dir);
    }
    writeFileSync(join(b, "n.md"), "# N\n");
    // A link by b's absolute path: whole wherever a goes, though relink would offer b's pointer for it.
    writeFileSync(join(a, "out.md"), `[n](${b}/n.md)\n`);
    for (const dir of [a, b]) await cli(["ls"], dir);
    const moved = join(base, "y", "a");
    mkdirSync(dirname(moved), { recursive: true });
    renameSync(a, moved);
    const said = (await cli(["ls"], moved)).json.warnings.join();
    expect(said).toContain(`moved here from ${a}`);
    expect(said).not.toContain("broke links");
    expect((await cli(["relink", "--dry-run"], moved)).json.data.files).toHaveLength(1); // the offer is still made
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

  test("a wikilink path broken by a move made outside slipbox is relinked, in its own form; its problem says where it went", async () => {
    const { noteProblems } = await import("../../../../src/core/documents/diagnostics/diagnostics.ts");
    const { dir } = root({
      "docs/plan.md": "# The plan\n",
      "docs/my plan.md": "# Mine\n",
      "index.md": "[[docs/plan]] [[docs/plan#The plan|p]] ![[docs/plan.md]]\n[[docs/my plan]]\n",
      "docs/near.md": "[[./plan]] [[plan]]\n",
    });
    expect((await cli(["--root", dir, "ls"])).code).toBe(0); // indexed: plan.md's text is known
    mkdirSync(join(dir, "notes"));
    renameSync(join(dir, "docs", "plan.md"), join(dir, "notes", "plan.md"));
    renameSync(join(dir, "docs", "my plan.md"), join(dir, "notes", "my plan.md"));
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    expect(g.movedTarget({ kind: "wiki", target: "docs/plan" }, "index.md")).toBe("notes/plan.md");
    expect(g.movedTarget({ kind: "wiki", target: "plan" }, "docs/near.md")).toBeNull(); // a name: no path to follow
    expect(
      g
        .problems()
        .broken.filter((p) => p.from === "index.md")
        .map((p) => p.moved),
    ).toEqual(["notes/plan.md", "notes/plan.md", "notes/plan.md", "notes/my plan.md"]);
    expect(noteProblems(g, "index.md")[0]!.message).toBe(
      "broken link: docs/plan — moved to notes/plan.md (relink fixes it)",
    );
    applyPlan(g, planRelink(g));
    expect(read(dir, "index.md")).toBe(
      "[[notes/plan]] [[notes/plan#The plan|p]] ![[notes/plan.md]]\n[[notes/my plan]]\n",
    );
    expect(read(dir, "docs/near.md")).toBe("[[../notes/plan]] [[plan]]\n");
  });
});
