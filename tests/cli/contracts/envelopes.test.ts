import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cli } from "../../support/vault-cli.ts";
import { makeVaultSandbox } from "../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("CLI (9.x)", () => {
  test("--json is one object with a stable envelope", async () => {
    const r = await cli(["ls", "--json"]);
    expect(r.code).toBe(0);
    const j = JSON.parse(r.out);
    expect(Object.keys(j)).toEqual(["schema", "ok", "command", "data", "warnings", "stale"]);
    expect(j.schema).toBe(1);
    expect(j.data.map((n: { path: string }) => n.path)).toContain("notes/alpha.md");
  });
  test("exit codes: not found 3, ambiguous 4, usage 2", async () => {
    expect((await cli(["resolve", "missing-note"])).code).toBe(3);
    expect((await cli(["render", "no-such-note"])).code).toBe(3);
    expect((await cli(["frobnicate"])).code).toBe(2);
    expect((await cli(["render", "--width"])).code).toBe(2);
    const dir = mkdtempSync(join(tmpdir(), "slipbox-amb-"));
    mkdirSync(join(dir, ".slipbox"));
    mkdirSync(join(dir, "a"));
    mkdirSync(join(dir, "b"));
    writeFileSync(join(dir, "a", "dup.md"), "# a\n");
    writeFileSync(join(dir, "b", "dup.md"), "# b\n");
    const amb = await cli(["resolve", "dup", "--root", dir, "--json"]);
    expect(amb.code).toBe(4);
    expect(JSON.parse(amb.out).data.candidates).toEqual(["a/dup.md", "b/dup.md"]);
  });
  test("resolve follows a link from a note, with the heading's line", async () => {
    const r = await cli(["resolve", "notes/alpha.md#Section Two", "--from", "index.md", "--json"]);
    expect(JSON.parse(r.out).data).toMatchObject({ status: "resolved", path: "notes/alpha.md", line: 11 });
    // A path, never a name (20.22): `alpha` from index.md is a file that isn't there.
    expect((await cli(["resolve", "alpha#Section Two", "--from", "index.md", "--json"])).code).toBe(3);
  });
  test("resolve lands a block and lines as a heading; a heading or block that isn't there: the note, at its top, said", async () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-frag-"));
    mkdirSync(join(dir, ".slipbox"));
    writeFileSync(join(dir, "n.md"), "# N\n\n## Setup\n\nthe marked paragraph ^mark\n");
    writeFileSync(join(dir, "a.md"), "# A\n");
    const r = async (link: string) =>
      JSON.parse((await cli(["--root", dir, "resolve", link, "--from", "a.md", "--json"])).out);
    expect((await r("n.md#^mark")).data).toMatchObject({
      status: "resolved",
      path: "n.md",
      line: 5,
      href: "n.md#^mark",
    });
    expect((await r("[[n#^mark]]")).data).toMatchObject({ status: "resolved", path: "n.md", line: 5 });
    expect((await r("n.md#L3")).data).toMatchObject({ line: 3, href: "n.md#L3" });
    expect((await r("n.md#Setup")).warnings).toEqual([]);
    const heading = await r("n.md#Nowhere");
    expect(heading.data).toMatchObject({ status: "resolved", path: "n.md", line: null });
    expect(heading.warnings).toEqual(['no heading "Nowhere" in n.md: the link lands at its top']);
    const block = await r("n.md#^none");
    expect(block.data).toMatchObject({ status: "resolved", path: "n.md", line: null, href: "n.md#^none" });
    expect(block.warnings).toEqual(["no block ^none in n.md: the link lands at its top"]);
    expect((await r("[[n#^none]]")).warnings).toEqual(["no block ^none in n.md: the link lands at its top"]);
    // Read by a person: the note's path alone, the warning beside it.
    const human = await cli(["--root", dir, "resolve", "n.md#Nowhere", "--from", "a.md"]);
    expect(human.out).toBe(`${join(dir, "n.md")}\n`);
    expect(human.err).toBe('slipbox: warning: no heading "Nowhere" in n.md: the link lands at its top\n');
  });
  test("render is plain when piped, and never leaks escapes from the note", async () => {
    const r = await cli(["render", "escapes.md", "--width", "60"]);
    expect(r.code).toBe(0);
    expect(r.out).not.toContain("\x1b");
    expect(r.out).toContain("red");
  });
  test("capture, scratch show/path/clear with --if-unchanged", async () => {
    await cli(["scratch", "clear"]);
    await cli(["capture", "first thought"]);
    await cli(["capture", "--ref", "notes/alpha.md:7-9", "--snippet"]);
    await cli(["capture", "--ref", "index.md:3", "--stdin"], "piped selection");
    await cli(["capture", "--ref", "index.md:1", "say", "more"]); // with a reference, the text is its note (D229)
    const shown = JSON.parse((await cli(["scratch", "show", "--json"])).out).data;
    expect(shown.content).toBe(
      [
        "first thought",
        "---",
        "**At:** `notes/alpha.md:7-9`",
        "```markdown\n## Section One\n\nBack to [index](../index.md) and on to [beta](beta.md).\n```",
        "---",
        "**At:** `index.md:3`",
        "```markdown\npiped selection\n```",
        "---",
        "**At:** `index.md:1`",
        "**Note:** say more\n",
      ].join("\n\n"),
    );
    expect((await cli(["scratch", "clear", "--if-unchanged", "0000"])).code).toBe(5);
    expect((await cli(["scratch", "clear", "--if-unchanged", shown.sha])).code).toBe(0);
    expect((await cli(["scratch", "show"])).out).toBe("");
  });
  test("init creates the marker with a version stamp (0.12, 1.10)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-init-"));
    const r = await cli(["init", dir, "--json"]);
    expect(JSON.parse(r.out).data.created).toBe(true);
    expect(require("node:fs").readFileSync(join(dir, ".slipbox", "version"), "utf8")).toBe("1\n");
    expect(JSON.parse((await cli(["init", dir, "--json"])).out).data.created).toBe(false);
  });
});

describe("review round 2 (CLI)", () => {
  const vault = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-r2-"));
    mkdirSync(join(dir, ".slipbox"));
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    return dir;
  };
  test("--json prints one envelope even for usage errors, help and version", async () => {
    const bad = await cli(["ls", "--json", "--bogus"]);
    expect(bad.code).toBe(2);
    expect(JSON.parse(bad.out)).toMatchObject({ ok: false, error: { code: 2 }, warnings: [], stale: [] });
    expect(JSON.parse((await cli(["help", "--json"])).out)).toMatchObject({ ok: true, command: "help" });
    expect(JSON.parse((await cli(["-V", "--json"])).out)).toMatchObject({ ok: true, warnings: [], stale: [] });
  });
  test("plain output never carries a note's escapes", async () => {
    const dir = vault({ "o.md": "# Title \u001b]0;HACKED\u0007 \u001b[31mred\n" });
    const r = await cli(["outline", join(dir, "o.md"), "--root", dir]);
    expect(r.out).toContain("Title");
    expect(r.out).not.toContain("\u001b");
  });
});

describe("review round 3 (CLI)", () => {
  test("a usage error's envelope names the command, never a flag's value", async () => {
    const r = await cli(["--root", "/tmp", "--bogus", "--json"]);
    expect(JSON.parse(r.out).command).toBe("help");
    expect(JSON.parse((await cli(["--root", "/tmp", "ls", "--bogus", "--json"])).out).command).toBe("ls");
  });
});
