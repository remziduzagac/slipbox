import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../../../src/cli/cli.ts";

import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("generated edits as plans, in two steps (20.18)", () => {
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
  const vaultWith = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-plan-"));
    mkdirSync(join(dir, ".slipbox"));
    for (const [rel, text] of Object.entries(files)) writeFileSync(join(dir, rel), text);
    return dir;
  };

  test("--plan saves what it would do, writing nothing; slipbox apply writes it once, and it's gone", async () => {
    const dir = vaultWith({ "a.md": "# A\n", "index.md": "[a](a.md)\n" });
    const planned = await cli(["mv", "a", "b", "--plan"], dir);
    expect(planned.code).toBe(0);
    const id = planned.json.data.plan.id;
    expect(id).toMatch(/^[0-9a-f]{8}$/);
    expect(existsSync(join(dir, "a.md"))).toBe(true);
    expect(readFileSync(join(dir, "index.md"), "utf8")).toBe("[a](a.md)\n");
    expect((await cli(["apply"], dir)).json.data.find((p: { id: string }) => p.id === id)).toMatchObject({
      command: "mv",
      kind: "note",
      from: "a.md",
      to: "b.md",
      root: dir,
      files: 1,
    }); // index.md: nothing written into the note itself (21.12)
    const dry = await cli(["apply", id, "--dry-run"], dir);
    expect(dry.json.data.files[0].edits[0].after).toBe("[a](b.md)");
    expect(dry.json.warnings.join()).not.toContain("stale");
    const applied = await cli(["apply", id], dir);
    expect(applied.json.data.dryRun).toBe(false);
    expect(existsSync(join(dir, "b.md"))).toBe(true);
    expect(readFileSync(join(dir, "index.md"), "utf8")).toBe("[a](b.md)\n");
    expect((await cli(["apply", id], dir)).code).toBe(3); // applied once: gone
    expect((await cli(["apply", "nope"], dir)).code).toBe(3);
    // A plan file that isn't one (cut short, edited by hand): no plan, not a crash.
    const { plansDir } = await import("../../../../src/core/workspace/mutations/plans.ts");
    writeFileSync(join(plansDir(), "deadbeef.json"), '{"version": 1, "root": 7}');
    expect((await cli(["apply", "deadbeef"], dir)).code).toBe(3);
  });

  test("a stale plan is never applied: a file it changes changed since, nothing is written", async () => {
    const dir = vaultWith({ "a.md": "# A\n", "index.md": "[a](a.md)\n" });
    const id = (await cli(["mv", "a", "c", "--plan"], dir)).json.data.plan.id;
    writeFileSync(join(dir, "index.md"), "[a](a.md) edited meanwhile\n");
    expect((await cli(["apply", id, "--dry-run"], dir)).json.warnings.join()).toContain(
      "stale: index.md changed since it was planned",
    );
    const refused = await cli(["apply", id], dir);
    expect(refused.code).toBe(5);
    expect(refused.json.error.message).toContain("changed since the preview");
    expect(existsSync(join(dir, "a.md"))).toBe(true);
    expect(readFileSync(join(dir, "index.md"), "utf8")).toBe("[a](a.md) edited meanwhile\n");
  });
});
