import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { runCli } from "../../../../src/cli/cli.ts";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { applyPlan } from "../../../../src/core/workspace/mutations/rename/rename.ts";
import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";

import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("renames across vaults (17.15, 7.1–7.3)", () => {
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
  let made = 0;
  const vault = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), `slipbox-rename-${++made}-`));
    mkdirSync(join(dir, ".slipbox"));
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(join(dir, rel, ".."), { recursive: true });
      writeFileSync(join(dir, rel), text);
    }
    return dir;
  };
  const read = (dir: string, rel: string) => readFileSync(join(dir, rel), "utf8");

  test("a nested root's file rewritten by a rename stays that root's: never one of this root's notes (17.17)", async () => {
    const { openVault } = await import("../../../../src/core/workspace/links/reach.ts");
    const { planNoteRename } = await import("../../../../src/core/workspace/mutations/rename/rename.ts");
    const dir = vault({ "a.md": "# A\n", "sub/.slipbox/config.toml": "", "sub/b.md": "[a](../a.md)\n" });
    openVault(join(dir, "sub")).ensureAll();
    const g = openVault(dir);
    expect([...g.notes.keys()]).toEqual(["a.md"]);
    applyPlan(g, planNoteRename(g, "a.md", "c"));
    expect(read(dir, "sub/b.md")).toBe("[a](../c.md)\n");
    expect([...g.notes.keys()]).toEqual(["c.md"]);
    expect(g.backlinks("c.md").map((b) => b.from)).toEqual([join(dir, "sub", "b.md")]);
  });

  test("a note's rename rewrites every link form, keeps how each was written, and writes nothing into it but its links (21.12)", async () => {
    const dir = vault({
      "notes/plan.md":
        "---\ntitle: Plan\n---\n# Plan\n\n## Steps\n\nUp: [home](../index.md) and [index](../index.md).\n",
      "index.md":
        "# Index\n\n[plan](notes/plan.md) and [the steps](notes/plan.md#steps) and ![plan](notes/plan.md)\n\n" +
        "[p](notes/plan.md#steps) and [r][ref] and [nickname](notes/other.md)\n\n| a | b |\n| - | - |\n| [x](notes/plan.md) | y |\n\n[ref]: notes/plan.md\n",
      "notes/other.md": "---\naliases: [nickname]\n---\nSee [x](plan.md), [plan](plan.md) 🔭 [plan](plan.md).\n",
      "code.md":
        "`[plan](notes/plan.md)` and `[p](notes/plan.md)` are code; [plan](notes/plan.md) and [p](notes/plan.md) aren't.\n",
    });
    const dry = await cli(["mv", "plan", "archive/2026/roadmap", "--dry-run"], dir);
    expect(dry.code).toBe(0);
    expect(dry.json.data.dryRun).toBe(true);
    expect(existsSync(join(dir, "notes", "plan.md"))).toBe(true); // nothing written by a preview
    expect(dry.json.data.files.map((f: { path: string }) => f.path).sort()).toEqual([
      "code.md",
      "index.md",
      "notes/other.md",
      "notes/plan.md",
    ]);
    const done = await cli(["mv", "plan", "archive/2026/roadmap"], dir);
    expect(done.code).toBe(0);
    expect(read(dir, "index.md")).toBe(
      "# Index\n\n[plan](archive/2026/roadmap.md) and [the steps](archive/2026/roadmap.md#steps) and ![plan](archive/2026/roadmap.md)\n\n" +
        "[p](archive/2026/roadmap.md#steps) and [r][ref] and [nickname](notes/other.md)\n\n| a | b |\n| - | - |\n| [x](archive/2026/roadmap.md) | y |\n\n[ref]: archive/2026/roadmap.md\n",
    );
    expect(read(dir, "notes/other.md")).toBe(
      "---\naliases: [nickname]\n---\nSee [x](../archive/2026/roadmap.md), [plan](../archive/2026/roadmap.md) 🔭 [plan](../archive/2026/roadmap.md).\n",
    );
    // The link at the index's position, not the same text in code before it.
    expect(read(dir, "code.md")).toBe(
      "`[plan](notes/plan.md)` and `[p](notes/plan.md)` are code; [plan](archive/2026/roadmap.md) and [p](archive/2026/roadmap.md) aren't.\n",
    );
    // It moved two folders deeper: its own relative links follow; no old name written in (21.12).
    expect(existsSync(join(dir, "notes", "plan.md"))).toBe(false);
    expect(read(dir, "archive/2026/roadmap.md")).toBe(
      "---\ntitle: Plan\n---\n# Plan\n\n## Steps\n\nUp: [home](../../index.md) and [index](../../index.md).\n",
    );
    // Every link resolves to it now, by its new path.
    const links = (await cli(["links", "index"], dir)).json.data;
    expect(
      links
        .filter((l: { target: string }) => l.target.includes("roadmap"))
        .every((l: { path: string }) => l.path === "archive/2026/roadmap.md"),
    ).toBe(true);
  });

  test("a file it rewrites keeps its byte order mark; one not valid UTF-8 is left as it is, and said", async () => {
    const dir = vault({ "a.md": "# A\n", "bom.md": "\uFEFF[a](a.md)\n", "sub/own.md": "\uFEFF[a](../a.md)\n" });
    // A note moved, its own links rewritten for its new folder: its mark goes with it.
    expect((await cli(["mv", "sub/own", "own"], dir)).code).toBe(0);
    expect(read(dir, "own.md")).toBe("\uFEFF[a](a.md)\n");
    writeFileSync(
      join(dir, "bad.md"),
      Buffer.concat([Buffer.from("[a](a.md) "), Buffer.from([0xff]), Buffer.from("\n")]),
    );
    const done = await cli(["mv", "a", "d"], dir);
    expect(done.code).toBe(0);
    expect([...readFileSync(join(dir, "bom.md")).subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(read(dir, "bom.md")).toBe("\uFEFF[a](d.md)\n");
    // Its invalid byte would have been written back as U+FFFD: the file is skipped, whole.
    expect([...readFileSync(join(dir, "bad.md"))]).toEqual([...Buffer.from("[a](a.md) "), 0xff, 0x0a]);
    expect(done.json.warnings).toContain("bad.md:1: not valid UTF-8: not rewritten");
  });

  test("refused: an existing target, outside the vault, a file changed since the preview", async () => {
    const dir = vault({ "a.md": "# a\n", "b.md": "# b\n", "index.md": "[a](a.md)\n" });
    expect((await cli(["mv", "a", "b"], dir)).code).toBe(5);
    expect((await cli(["mv", "a", "../elsewhere"], dir)).code).toBe(5);
    const { openGraph: open } = await import("../../../../src/core/workspace/graph/graph.ts");
    const { planNoteRename, applyPlan } = await import("../../../../src/core/workspace/mutations/rename/rename.ts");
    const g = open(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    const plan = planNoteRename(g, "a.md", "c");
    writeFileSync(join(dir, "index.md"), "[a](a.md) edited meanwhile\n");
    expect(() => applyPlan(g, plan)).toThrow(/changed since the preview/);
    expect(existsSync(join(dir, "a.md"))).toBe(true);
    expect(read(dir, "index.md")).toBe("[a](a.md) edited meanwhile\n");
  });

  test("links from other roots are rewritten too; a folder's naming keeps its old name (17.15, 21.10)", async () => {
    const notes = vault({ "plan.md": "# plan\n" });
    const app = vault({
      "links.md": "[p](../NOTES/plan.md) and [t](../NOTES/plan.md)\n".replaceAll("NOTES", basename(notes)),
    });
    await cli(["init", notes, "--name", "rnotes"], notes);
    await cli(["init", app, "--name", "rapp"], app);
    await cli(["ls"], app); // its index: the links into rnotes
    // The preview: another root's file by its root and name (21.10); this one's by neither.
    const preview = (await cli(["mv", "plan", "roadmap", "--dry-run"], notes)).json.data.files;
    expect(preview.find((f: { abs: string }) => f.abs === join(app, "links.md"))).toMatchObject({
      root: app,
      name: "rapp",
    });
    await cli(["mv", "plan", "roadmap"], notes);
    expect(read(app, "links.md")).toBe(
      `[p](../${basename(notes)}/roadmap.md) and [t](../${basename(notes)}/roadmap.md)\n`,
    );
    // The folder's name changed: the config, the old name kept; a path link has no name to fix.
    await cli(["ls"], app);
    const r = await cli(["name", "rnotes2"], notes);
    expect(r.code).toBe(0);
    expect(read(app, "links.md")).toBe(
      `[p](../${basename(notes)}/roadmap.md) and [t](../${basename(notes)}/roadmap.md)\n`,
    );
    const cfg = read(notes, ".slipbox/config.toml");
    expect(cfg).toContain('name = "rnotes2"');
    expect(cfg).toContain('previous_names = ["rnotes"]');
  });

  test("a rename's writes into another vault reach its index at once: a second rename right after fixes them again", async () => {
    const notes = vault({ "plan.md": "# plan\n" });
    const app = vault({ "links.md": `[p](../${basename(notes)}/plan.md)\n` });
    await cli(["init", notes, "--name", "rnotes3"], notes);
    await cli(["init", app, "--name", "rapp3"], app);
    await cli(["ls"], app);
    await cli(["mv", "plan", "roadmap"], notes);
    expect(read(app, "links.md")).toBe(`[p](../${basename(notes)}/roadmap.md)\n`);
    // No opening of the other vault in between: its index already has the new link.
    await cli(["mv", "roadmap", "vision"], notes);
    expect(read(app, "links.md")).toBe(`[p](../${basename(notes)}/vision.md)\n`);
  });

  test("relink: links to a note seen to move are rewritten to where it is now", async () => {
    const { renameSync } = await import("node:fs");
    const dir = vault({ "notes/plan.md": "# Plan\n", "index.md": "[p](notes/plan.md) [s](notes/plan.md#plan)\n" });
    await cli(["ls"], dir);
    renameSync(join(dir, "notes", "plan.md"), join(dir, "roadmap.md"));
    const r = await cli(["relink", "index"], dir);
    expect(r.code).toBe(0);
    expect(read(dir, "index.md")).toBe("[p](roadmap.md) [s](roadmap.md#plan)\n");
  });

  test("a git tree that already has changes is named in the plan (7.3)", async () => {
    const dir = vault({ "a.md": "# a\n", "index.md": "[[a]]\n" });
    const git = Bun.spawnSync(["git", "init", "-q", dir]);
    if (git.exitCode !== 0) return; // no git here
    const r = await cli(["mv", "a", "b", "--dry-run"], dir);
    expect(r.json.data.warnings.join()).toContain("uncommitted changes");
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

  test("a note moved into a nested root: [[name]] links to it become paths into it, its own names and `/` paths relative out", async () => {
    const { planNoteRename } = await import("../../../../src/core/workspace/mutations/rename/rename.ts");
    const { dir, g } = root({
      "home.md": "[[plan]] [p](plan.md) [[plan|the plan]]\n",
      "plan.md": "[[home]] [h](home.md) [r](/home.md) [[docs/x]] ![[pic.png]]\n",
      "docs/x.md": "# X\n",
      "pic.png": "png",
      "N/.slipbox/config.toml": "",
      "N/n.md": "# N\n",
    });
    applyPlan(g, planNoteRename(g, "plan.md", "N/plan.md"));
    expect(read(dir, "home.md")).toBe("[[N/plan]] [p](N/plan.md) [[N/plan|the plan]]\n");
    expect(read(dir, "N/plan.md")).toBe("[[../home]] [h](../home.md) [r](../home.md) [[../docs/x]] ![[../pic.png]]\n");
    const parent = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    for (const l of parent.linksOf("home.md"))
      expect([l.target, l.resolvedKind, l.path]).toEqual([l.target, "note", join(dir, "N", "plan.md")]);
    const nested = openGraph(locateVault({ root: join(dir, "N") }), DEFAULT_CONFIG, false);
    expect(nested.linksOf("plan.md").map((l) => [l.resolvedKind, l.path])).toEqual([
      ["note", join(dir, "home.md")],
      ["note", join(dir, "home.md")],
      ["note", join(dir, "home.md")],
      ["note", join(dir, "docs", "x.md")],
      ["file", join(dir, "pic.png")],
    ]);
  });
});
