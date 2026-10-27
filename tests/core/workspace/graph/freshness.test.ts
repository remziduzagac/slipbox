import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { runCli } from "../../../../src/cli/cli.ts";

import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("freshness and coverage (20.10)", () => {
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
  const vaultAt = (dir: string, files: Record<string, string>) => {
    mkdirSync(join(dir, ".slipbox"), { recursive: true });
    for (const [rel, text] of Object.entries(files)) writeFileSync(join(dir, rel), text);
    return dir;
  };

  test("slipbox index --refresh <path>: any vault's index brought up to date, opened or not — read again, gone, how fresh", async () => {
    const base = mkdtempSync(join(tmpdir(), "slipbox-fresh-"));
    const here = vaultAt(join(base, "here"), { "h.md": "# H\n" });
    const there = vaultAt(join(base, "there"), { "a.md": "# A\n", "b.md": "# B\n" });
    const first = await cli(["index", "--refresh", there], here);
    expect(first.json.data).toMatchObject({ root: there, notes: 2, changed: 2, gone: 0 });
    expect(first.json.data.indexed).not.toBeNull();
    const { readRoots } = await import("../../../../src/core/workspace/vaults/registry.ts");
    expect(readRoots().find((v) => v.path === there)?.indexed).toBeDefined();
    writeFileSync(join(there, "a.md"), "# A, longer now\n");
    rmSync(join(there, "b.md"));
    expect((await cli(["index", "--refresh", join(there, "a.md")], here)).json.data).toMatchObject({
      root: there,
      notes: 1,
      changed: 1,
      unchanged: 0,
      gone: 1,
    });
    expect((await cli(["index", "--refresh"], here)).json.data.root).toBe(here); // this one, unnamed
    // Elsewhere has no index (VV-D3): refused; home has one (VV-D2), its every folder listed again.
    const loose = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-fresh-loose-")));
    writeFileSync(join(loose, "l.md"), "# L\n");
    expect((await cli(["index", "--refresh", loose], here)).code).toBe(5);
    const home = process.env.HOME;
    process.env.HOME = loose;
    try {
      mkdirSync(join(loose, "sub"));
      writeFileSync(join(loose, "sub", "m.md"), "# M\n");
      expect((await cli(["index", "--refresh", join(loose, "sub")], here)).json.data).toMatchObject({
        root: loose,
        notes: 2,
      });
    } finally {
      process.env.HOME = home;
    }
    expect((await cli(["index", "--refresh", join(base, "nope")], here)).code).toBe(3);
  });

  test("info says how fresh this vault's index is, and where the background index of the home folder has got to", async () => {
    const dir = vaultAt(mkdtempSync(join(tmpdir(), "slipbox-fresh-info-")), { "n.md": "# N\n" });
    await cli(["ls"], dir);
    const info = (await cli(["info"], dir)).json.data;
    expect(info.index.written).not.toBeNull();
    expect(info.index).toMatchObject({ reached: 0, gone: 0 });
    expect(info.background).toMatchObject({ on: true });
    const lines: string[] = [];
    await runCli(["info"], {
      out: (x: string) => lines.push(x),
      err: () => {},
      stdin: async () => "",
      isTTY: false,
      columns: 80,
      cwd: dir,
      env: process.env,
    });
    expect(lines.join("")).toMatch(/\nindex {5}written \d{4}-\d\d-\d\d \d\d:\d\d\n/);
    expect(lines.join("")).toMatch(/\nhome {6}background index\b/);
    const { describeBackground } = await import("../../../../src/core/workspace/graph/autoindex.ts");
    const b = { found: 0, indexed: 0, left: 0, finished: null, started: null, home: false, homeNotes: 0, capped: null };
    expect(describeBackground({ ...b, on: false })).toBe("background index off ([index] background)");
    expect(describeBackground({ ...b, on: true, started: "x" })).toBe("background index: walking home");
    expect(
      describeBackground({ ...b, on: true, found: 2, indexed: 1, left: 7, started: "x", home: true, homeNotes: 12 }),
    ).toBe("background index: home's 12 notes indexed, 2 vaults found so far, 7 left");
    expect(
      describeBackground({
        ...b,
        on: true,
        found: 1,
        started: "x",
        finished: "2026-10-15T09:30:00Z",
        home: true,
        homeNotes: 1,
        capped: "notes",
      }),
    ).toBe(
      "background index: pass done 2026-10-15 09:30 — home's 1 note, 1 vault found — home's index is full: it holds 10,000 notes, those nearest the top — the rest aren't indexed",
    );
  });

  test("a drive unplugged: its roots unavailable, not gone — kept, never pruned, and a link into one says why it's broken", async () => {
    const { pruneWorktrees, readRoots, recordRoot, unavailable } = await import(
      "../../../../src/core/workspace/vaults/registry.ts"
    );
    const drive = `/media/slipbox-test-nodrive-${basename(mkdtempSync(join(tmpdir(), "slipbox-nodrive-")))}`;
    expect(unavailable(`${drive}/notes`)).toBe(true);
    expect(unavailable("/tmp/certainly/not/here")).toBe(false);
    expect(unavailable(tmpdir())).toBe(false);
    const long = new Date(Date.now() - 60 * 86_400_000);
    recordRoot({ kind: "vault", path: `${drive}/notes` }, long);
    recordRoot({ kind: "vault", path: `${drive}/wt`, worktree: { name: "wt", main: `${drive}/notes` } }, long);
    recordRoot({ kind: "folder", path: `${drive}/loose` }, long);
    pruneWorktrees();
    expect(
      readRoots()
        .filter((v) => v.path.startsWith(`${drive}/`))
        .map((v) => v.kind)
        .sort(),
    ).toEqual(["folder", "vault", "vault"]);
    const dir = vaultAt(mkdtempSync(join(tmpdir(), "slipbox-fresh-drive-")), {
      "n.md": `[far](${drive}/notes/a.md) [near](gone.md)\n`,
    });
    const problems = (await cli(["diagnostics", "n.md", "--severity", "info"], dir)).json.data.problems.map(
      (p: { message: string }) => p.message,
    );
    expect(problems).toContain(`broken link: ${drive}/notes/a.md — its drive isn't there`);
    expect(problems).toContain("no note at gone.md yet");
  });
});
