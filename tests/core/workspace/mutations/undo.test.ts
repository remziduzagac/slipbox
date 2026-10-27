import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { runCli } from "../../../../src/cli/cli.ts";

import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("undoing a rename (7.4)", () => {
  const cli = async (args: string[], cwd: string) => {
    const out: string[] = [];
    const code = await runCli([...args, "--json"], {
      out: (s: string) => out.push(s),
      err: () => {},
      stdin: async () => "",
      isTTY: false,
      columns: 80,
      cwd,
      env: process.env,
    });
    return { code, json: JSON.parse(out.join("")) };
  };
  let made = 0;
  const vault = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), `slipbox-undo-${++made}-`));
    mkdirSync(join(dir, ".slipbox"));
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(join(dir, rel, ".."), { recursive: true });
      writeFileSync(join(dir, rel), text);
    }
    return dir;
  };
  const read = (dir: string, rel: string) => readFileSync(join(dir, rel), "utf8");
  /** Every file under a folder, by path, with its text (.slipbox/ left out). */
  const snapshot = (dir: string): Record<string, string> => {
    const out: Record<string, string> = {};
    const walk = (rel: string) => {
      for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (r === ".slipbox") continue;
        if (e.isDirectory()) {
          out[`${r}/`] = "";
          walk(r);
        } else out[r] = readFileSync(join(dir, r), "utf8");
      }
    };
    walk("");
    return out;
  };

  test("a note's rename taken back: every file as it was, byte for byte, the folders it made gone; previewed first", async () => {
    const dir = vault({
      "notes/plan.md": "---\ntitle: Plan\n---\n# Plan\n\nUp: [home](../index.md) and [index](../index.md).\n",
      "index.md": "# Index\n\n[plan](notes/plan.md) and [p](notes/plan.md) 🔭 [the plan](notes/plan.md#plan)\n",
      "other.md": "untouched [index](index.md)\n",
    });
    const before = snapshot(dir);
    expect((await cli(["mv", "plan", "archive/2026/roadmap"], dir)).code).toBe(0);
    expect(existsSync(join(dir, "archive", "2026", "roadmap.md"))).toBe(true);
    // The preview: the rename's lines, the other way; nothing written.
    const dry = await cli(["undo", "--dry-run"], dir);
    expect(dry.json.data).toMatchObject({
      kind: "note",
      from: "archive/2026/roadmap.md",
      to: "notes/plan.md",
      dryRun: true,
      undo: { at: expect.any(String) },
    });
    expect(dry.json.data.files.find((f: { path: string }) => f.path === "index.md").edits[0]).toMatchObject({
      line: 3,
      before:
        "[plan](archive/2026/roadmap.md) and [p](archive/2026/roadmap.md) 🔭 [the plan](archive/2026/roadmap.md#plan)",
      after: "[plan](notes/plan.md) and [p](notes/plan.md) 🔭 [the plan](notes/plan.md#plan)",
    });
    expect(existsSync(join(dir, "notes", "plan.md"))).toBe(false);
    const done = await cli(["undo"], dir);
    expect(done.code).toBe(0);
    expect(snapshot(dir)).toEqual(before); // its previous name, the moved links, the folders it made: all gone
    // The index follows: it's where it was, and a link to it reaches it again, not by a redirect.
    expect((await cli(["resolve", "[p](notes/plan.md)", "--from", "index.md"], dir)).json.data).toMatchObject({
      status: "resolved",
      path: "notes/plan.md",
    });
    // Taken back, it's out of the log: nothing more to undo.
    const none = await cli(["undo"], dir);
    expect(none.code).toBe(3);
    expect(none.json.error.message).toContain("nothing to undo");
  });

  test("an undo of a move, made or applied from a plan, warns of nothing: not of the path it moved from (DF A10)", async () => {
    const dir = vault({ "notes/plan.md": "# Plan\n", "index.md": "[plan](notes/plan.md)\n", "other.md": "# Other\n" });
    expect((await cli(["mv", "plan", "archive/plan"], dir)).json.warnings).toEqual([]);
    const undone = await cli(["undo"], dir);
    expect(undone.json.data).toMatchObject({
      kind: "note",
      from: "archive/plan.md",
      to: "notes/plan.md",
      dryRun: false,
    });
    expect(undone.json.warnings).toEqual([]);
    const planned = await cli(["mv", "plan", "archive/plan", "--plan"], dir);
    expect((await cli(["apply", planned.json.data.plan.id], dir)).json.warnings).toEqual([]);
    const again = await cli(["undo"], dir);
    expect(again.json.data).toMatchObject({
      kind: "note",
      from: "archive/plan.md",
      to: "notes/plan.md",
      dryRun: false,
    });
    expect(again.json.warnings).toEqual([]);
    expect(read(dir, "index.md")).toBe("[plan](notes/plan.md)\n");
  });

  test("newest first: a folder's move, then a note's rename, then the move; a file changed since stops it, and it waits", async () => {
    const dir = vault({
      "a/one.md": "# One\n\n[two](two.md)\n",
      "a/two.md": "# Two\n",
      "index.md": "[x](a/one.md) [y](a/two.md)\n",
    });
    const before = snapshot(dir);
    await cli(["mv", "a", "b"], dir);
    await cli(["mv", "b/two", "b/deux"], dir);
    const mid = snapshot(dir);
    expect(mid["index.md"]).toBe("[x](b/one.md) [y](b/deux.md)\n");
    // Changed since: refused, nothing written, the rename still next.
    writeFileSync(join(dir, "index.md"), "[x](b/one.md) [y](b/deux.md) edited\n");
    const refused = await cli(["undo"], dir);
    expect(refused.code).toBe(5);
    expect(refused.json.error.message).toBe("index.md has changed since: the rename of b/two.md can't be undone");
    expect(existsSync(join(dir, "b", "deux.md"))).toBe(true);
    writeFileSync(join(dir, "index.md"), "[x](b/one.md) [y](b/deux.md)\n");
    await cli(["undo"], dir);
    expect(read(dir, "index.md")).toBe("[x](b/one.md) [y](b/two.md)\n");
    expect(read(dir, "b/one.md")).toBe("# One\n\n[two](two.md)\n");
    const back = await cli(["undo"], dir);
    expect(back.json.data).toMatchObject({ kind: "folder", from: "b", to: "a", dryRun: false });
    expect(snapshot(dir)).toEqual(before);
  });

  test("a folder's naming taken back: its name; a relink too", async () => {
    const one = vault({ "n.md": "# N\n" });
    const two = vault({ "x.md": `[n](../${basename(one)}/n.md)\n` });
    await cli(["init", one, "--name", "undo-one"], one);
    await cli(["init", two, "--name", "undo-two"], two);
    await cli(["ls"], two); // its index: the links into undo-one
    const cfg = read(one, ".slipbox/config.toml");
    await cli(["name", "undo-uno"], one);
    const r = await cli(["undo"], one);
    expect(r.json.data).toMatchObject({ kind: "root", from: "undo-uno", to: "undo-one" });
    expect(read(two, "x.md")).toBe(`[n](../${basename(one)}/n.md)\n`);
    expect(read(one, ".slipbox/config.toml")).toBe(cfg);
    // The lookup has its name back at once, as seen from another root (21.6).
    expect((await cli(["folders"], two)).json.data.find((f: { default: string }) => f.default === one)).toMatchObject({
      name: "undo-one",
    });
    // A relink: the moved note's old paths back as they were written.
    const dir = vault({ "notes/plan.md": "# Plan\n", "i.md": "[p](notes/plan.md) and [x](notes/plan.md#plan)\n" });
    await cli(["ls"], dir);
    renameSync(join(dir, "notes", "plan.md"), join(dir, "plan.md"));
    await cli(["relink"], dir);
    expect(read(dir, "i.md")).toBe("[p](plan.md) and [x](plan.md#plan)\n");
    expect((await cli(["undo"], dir)).json.data.kind).toBe("relink");
    expect(read(dir, "i.md")).toBe("[p](notes/plan.md) and [x](notes/plan.md#plan)\n");
  });
});
