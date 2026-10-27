import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { runCli } from "../../../src/cli/cli.ts";
import { cli } from "../../support/vault-cli.ts";
import { makeVaultSandbox } from "../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("review round 2 (CLI)", () => {
  const vault = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-r2-"));
    mkdirSync(join(dir, ".slipbox"));
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    return dir;
  };
  test("a note named with a colon resolves as a note, not a URL", async () => {
    const dir = vault({ "Meeting: Q3.md": "# Q3\n" });
    const r = JSON.parse((await cli(["resolve", "Meeting: Q3", "--root", dir, "--json"])).out);
    expect(r.data).toMatchObject({ status: "resolved", path: "Meeting: Q3.md" });
    expect(JSON.parse((await cli(["resolve", "https://x.y", "--root", dir, "--json"])).out).data.status).toBe(
      "external",
    );
  });
});

describe("review round 3 (CLI)", () => {
  test("a name with a colon and a space is a note (maybe missing), never a URL", async () => {
    const r = await cli(["resolve", "Meeting: Q4", "--json"]);
    expect(r.code).toBe(3);
    expect(JSON.parse(r.out).error.message).toContain("unresolved");
  });
});

describe("another folder's file as an argument: its pointer (21.10); vault:path gone (21.12)", () => {
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
  /** a's notes/plan.md links to b's algorithms/dijkstra.md. */
  const two = async () => {
    const base = mkdtempSync(join(tmpdir(), "slipbox-vform-"));
    const tag = basename(base)
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
    const at = (x: string) => join(base, x);
    for (const x of ["a", "b"]) {
      mkdirSync(at(x), { recursive: true });
      await cli(["init", at(x), "--name", `${x}${tag}`], at(x));
    }
    mkdirSync(join(at("a"), "notes"));
    mkdirSync(join(at("b"), "algorithms"));
    writeFileSync(join(at("a"), "notes", "plan.md"), "# Plan\n\n[shortest](../../b/algorithms/dijkstra.md)\n");
    writeFileSync(join(at("a"), "notes", "other.md"), "# Other\n");
    writeFileSync(join(at("b"), "algorithms", "dijkstra.md"), "# Dijkstra\n\n## Relaxation\n\nEdges.\n");
    for (const x of ["a", "b"]) await cli(["ls"], at(x)); // each indexed and known, as when opened
    return { at, a: `a${tag}`, b: `b${tag}` };
  };

  test("in: a pointer names a file of that folder, and the command works there; name:path is the old form, refused", async () => {
    const { at, a, b } = await two();
    const ptr = (x: string, path: string) => `slipbox://${x}/${path}`;
    const read = await cli(["read", ptr(b, "algorithms/dijkstra.md")], at("a"));
    expect(read.code).toBe(0);
    expect(read.json.data).toMatchObject({ path: "algorithms/dijkstra.md" });
    expect(read.json.data.content).toContain("## Relaxation");
    expect((await cli(["outline", ptr(b, "algorithms/dijkstra.md")], at("a"))).json.data.headings[1]).toMatchObject({
      text: "Relaxation",
    });
    // Backlinks of b's note, asked from a: a's link among them, by its path (21.9).
    const bl = (await cli(["backlinks", ptr(b, "algorithms/dijkstra")], at("a"))).json.data.backlinks;
    expect(bl).toContainEqual(
      expect.objectContaining({ from: join(at("a"), "notes", "plan.md"), shown: join(at("a"), "notes", "plan.md") }),
    );
    // find's note is its second argument; context takes several.
    expect((await cli(["find", "Edges", ptr(b, "algorithms/dijkstra.md")], at("a"))).code).toBe(0);
    expect(
      (await cli(["context", ptr(a, "notes/other.md"), ptr(a, "notes/plan.md")], at("b"))).json.data.start,
    ).toEqual(["notes/other.md", "notes/plan.md"]);
    // Each argument itself: the first saying which folder never stands for the rest.
    expect((await cli(["context", "notes/other.md", "notes/plan.md"], at("a"))).json.data.start).toEqual([
      "notes/other.md",
      "notes/plan.md",
    ]);
    // --from too.
    expect((await cli(["resolve", "other.md", "--from", ptr(a, "notes/plan.md")], at("b"))).json.data).toMatchObject({
      status: "resolved",
      path: "notes/other.md",
    });
    // name:path (20.20) is gone: not found, the pointer said.
    const old = await cli(["read", `${b}:algorithms/dijkstra.md`], at("a"));
    expect(old.code).toBe(3);
    expect(old.json.error.message).toContain(`${ptr(b, "algorithms/dijkstra.md")} names it`);
    // No folder by that name: a name, as before — not found, nothing said of pointers.
    const nope = await cli(["read", "nope:x.md"], at("a"));
    expect(nope.code).toBe(3);
    expect(nope.json.error.message).not.toContain("slipbox://");
    // A file by that very name is itself: a path wins.
    mkdirSync(join(at("a"), `${b}:algorithms`));
    writeFileSync(join(at("a"), `${b}:algorithms`, "dijkstra.md"), "# Local\n");
    expect((await cli(["read", `${b}:algorithms/dijkstra.md`], at("a"))).json.data.content).toBe("# Local\n");
  });

  test("resolve: a pointer, and with --from the relative path a link there would carry; name:path its pointer said", async () => {
    const { at, a, b } = await two();
    const r = await cli(
      ["resolve", `slipbox://${b}/algorithms/dijkstra.md#Relaxation`, "--from", "notes/plan.md"],
      at("a"),
    );
    expect(r.json.data).toMatchObject({
      status: "resolved",
      path: join(at("b"), "algorithms", "dijkstra.md"),
      abs: join(at("b"), "algorithms", "dijkstra.md"),
      shown: join(at("b"), "algorithms", "dijkstra.md"),
      href: "../../b/algorithms/dijkstra.md#relaxation",
      heading: "Relaxation",
      line: 3,
      root: at("b"),
      name: b,
    });
    // This folder's own: its path here.
    const own = await cli(["resolve", `slipbox://${a}/notes/other.md`, "--from", "notes/plan.md"], at("a"));
    expect(own.json.data).toMatchObject({
      status: "resolved",
      path: "notes/other.md",
      shown: "notes/other.md",
      href: "other.md",
      root: null,
      name: null,
    });
    // A folder too; a file that isn't there, not.
    expect(
      (await cli(["resolve", `slipbox://${b}/algorithms`, "--from", "notes/plan.md"], at("a"))).json.data,
    ).toMatchObject({ status: "resolved", abs: join(at("b"), "algorithms"), href: "../../b/algorithms" });
    expect((await cli(["resolve", `slipbox://${b}/algorithms/nope.md`, "--from", "notes/plan.md"], at("a"))).code).toBe(
      3,
    );
    // Without --from: no link to write.
    expect((await cli(["resolve", `slipbox://${b}/algorithms/dijkstra.md`], at("a"))).json.data).toMatchObject({
      status: "resolved",
      href: null,
    });
    // The old form: unresolved, and the pointer that is one.
    const old = await cli(["resolve", `${b}:algorithms/dijkstra.md#Relaxation`, "--from", "notes/plan.md"], at("a"));
    expect(old.code).toBe(3);
    expect(old.json.data).toMatchObject({
      status: "unresolved",
      href: null,
      suggest: `slipbox://${b}/algorithms/dijkstra.md`,
    });
    // A path's href too, with the spaces a link encodes.
    writeFileSync(join(at("a"), "notes", "a note.md"), "# A note\n");
    expect((await cli(["resolve", "a note.md", "--from", "notes/plan.md"], at("a"))).json.data.href).toBe(
      "a%20note.md",
    );
  });

  test("out: links and backlinks show another vault's file by its path (21.9), its vault's name beside it", async () => {
    const { at, a, b } = await two();
    const links = (await cli(["links", "notes/plan.md"], at("a"))).json.data;
    expect(links[0]).toMatchObject({
      path: join(at("b"), "algorithms", "dijkstra.md"),
      shown: join(at("b"), "algorithms", "dijkstra.md"),
      root: at("b"),
      name: b,
    });
    expect(await human(["links", "notes/plan.md"], at("a"))).toContain(
      `-> ${join(at("b"), "algorithms", "dijkstra.md")}\n`,
    );
    const bl = (await cli(["backlinks", "algorithms/dijkstra.md"], at("b"))).json.data.backlinks;
    expect(bl[0]).toMatchObject({ shown: join(at("a"), "notes", "plan.md"), root: at("a"), name: a });
    expect(await human(["backlinks", "algorithms/dijkstra.md"], at("b"))).toContain(
      `${join(at("a"), "notes", "plan.md")}:3  shortest`,
    );
  });

  test("mv and cp: a source by its pointer, the command in its folder; a destination a path there, never a pointer", async () => {
    const { at, b } = await two();
    const moved = await cli(
      ["mv", `slipbox://${b}/algorithms/dijkstra.md`, "graphs/dijkstra.md", "--dry-run"],
      at("a"),
    );
    expect(moved.code).toBe(0);
    expect(moved.json.data).toMatchObject({ from: "algorithms/dijkstra.md", to: "graphs/dijkstra.md", dryRun: true });
    const pointed = await cli(
      ["mv", `slipbox://${b}/algorithms/dijkstra.md`, `slipbox://${b}/graphs/dijkstra.md`, "--dry-run"],
      at("a"),
    );
    expect(pointed.code).toBe(5);
    expect(pointed.json.error.message).toContain("not a pointer");
    expect((await cli(["mv", `${b}:algorithms/dijkstra.md`, "graphs/dijkstra.md", "--dry-run"], at("a"))).code).toBe(3); // the old form
    expect((await cli(["cp", `slipbox://${b}/algorithms/dijkstra.md`, "algorithms/copy.md"], at("a"))).code).toBe(0);
    expect(existsSync(join(at("b"), "algorithms", "copy.md"))).toBe(true);
  });
});
