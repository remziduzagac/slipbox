import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { runCli } from "../../../../src/cli/cli.ts";

import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("links across vaults: paths; names only for the converter (17.7–17.11, 20.22)", () => {
  const io = (cwd: string) => {
    const out: string[] = [];
    const err: string[] = [];
    return {
      io: {
        out: (s: string) => out.push(s),
        err: (s: string) => err.push(s),
        stdin: async () => "",
        isTTY: false,
        columns: 80,
        cwd,
        env: process.env,
      },
      out,
      err,
    };
  };
  const cli = async (args: string[], cwd: string) => {
    const r = io(cwd);
    const code = await runCli([...args, "--json"], r.io);
    return { code, json: JSON.parse(r.out.join("")) };
  };
  const base = mkdtempSync(join(tmpdir(), "slipbox-reach-"));
  const notes = join(base, "notes");
  const app = join(base, "app");
  const files: Record<string, string> = {
    "notes/index.md":
      "# Index\n\n[[xapp:design]] [[xapp:design#Goals|the goals]] [[xapp:missing]] [[nope:x]] [[xnotes:todo]]\n\n[[nick]] [[old-name]] [paths](../app/design.md)\n",
    "notes/todo.md": "# Todo\n",
    "notes/person.md": "---\naliases: [nick]\n---\n# Person\n",
    "notes/renamed.md": "---\nprevious_names: [old-name]\n---\n# Renamed\n",
    "notes/a:b.md": "# colon\n",
    "app/design.md": "# Design\n\nIntro.\n\n## Goals\n",
    "app/links.md": "[todo](../notes/todo.md) and [t](../notes/person.md)\n",
  };
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(base, rel, ".."), { recursive: true });
    writeFileSync(join(base, rel), text);
  }
  const ready = (async () => {
    await cli(["init", notes, "--name", "xnotes"], notes);
    await cli(["init", app, "--name", "xapp"], app);
    await cli(["ls"], app); // app's index, as of now: its links into notes
  })();

  /** What the converter would write for index.md (20.1): the legacy reader's answers. */
  const converted = async () => {
    const r = await cli(["convert-links", "index", "--dry-run"], notes);
    return {
      after: r.json.data.files.flatMap((f: { edits: { after: string }[] }) => f.edits.map((e) => e.after)).join("\n"),
      skipped: r.json.data.skipped.map((x: { reason: string }) => x.reason) as string[],
    };
  };

  test("[[vault:note]] and vault:path aren't read (20.22, 21.12): the old form, its pointer said; the converter reads it, into the named vault (17.8)", async () => {
    await ready;
    const r = await cli(["resolve", "[[xapp:design#Goals]]"], notes);
    expect(r.code).toBe(3);
    expect(r.json.data.reason).toContain("names a folder the old way");
    // Bare, it was a path in that vault (20.20): gone with vaults (21.12), the pointer said instead.
    const bare = await cli(["resolve", "xapp:design.md#Goals"], notes);
    expect(bare.code).toBe(3);
    expect(bare.json.data).toMatchObject({ status: "unresolved", abs: null, suggest: "slipbox://xapp/design.md" });
    expect((await cli(["resolve", "[g](xapp:design.md#Goals)"], notes)).json.data.suggest).toBe(
      "slipbox://xapp/design.md",
    );
    expect((await cli(["resolve", "slipbox://xapp/design.md#Goals"], notes)).json.data).toMatchObject({
      status: "resolved",
      abs: join(app, "design.md"),
      root: app,
      name: "xapp",
      line: 5,
    });
    expect((await cli(["resolve", "xapp:design"], notes)).code).toBe(3);
    // A note named with a colon is still a note here, by its name as a command names it.
    expect((await cli(["resolve", "a:b"], notes)).json.data.path).toBe("a:b.md");
    const c = await converted();
    expect(c.after).toContain("[xapp:design](../app/design.md) [the goals](../app/design.md#goals)");
    expect(c.after).toContain("[xnotes:todo](todo.md)"); // this vault, by its own name
  });

  test("a note or folder that isn't there: the converter says which, and leaves it (17.8, 21.6)", async () => {
    await ready;
    const { skipped } = await converted();
    expect(
      skipped.some((x) => x.includes("[[xapp:missing]]") && x.includes('no note "missing" in folder "xapp"')),
    ).toBe(true);
    expect(skipped.some((x) => x.includes("[[nope:x]]") && x.includes('unknown folder "nope"'))).toBe(true);
  });

  test("a colon in a name no folder has: the converter reads it as the alias it is (21.3)", async () => {
    await ready;
    writeFileSync(join(notes, "q3.md"), '---\naliases: ["Meeting: Q3"]\n---\n# Q3\n');
    writeFileSync(join(notes, "meet.md"), "[[Meeting: Q3]] [[nope:x]]\n");
    expect((await cli(["resolve", "[[Meeting: Q3]]"], notes)).json.data).toMatchObject({
      status: "resolved",
      path: "q3.md",
    });
    const r = await cli(["convert-links", "meet", "--dry-run"], notes);
    const after = r.json.data.files
      .flatMap((f: { edits: { after: string }[] }) => f.edits.map((e) => e.after))
      .join("\n");
    expect(after).toContain("[Meeting: Q3](q3.md)");
    const skipped = r.json.data.skipped.map((x: { reason: string }) => x.reason) as string[];
    expect(skipped.some((x) => x.includes("[[nope:x]]") && x.includes('unknown folder "nope"'))).toBe(true);
    rmSync(join(notes, "q3.md"));
    rmSync(join(notes, "meet.md"));
  });

  test("an alias is a name again (21.3), a previous name isn't — the converter reads both (17.7)", async () => {
    await ready;
    expect((await cli(["resolve", "[[nick]]"], notes)).json.data).toMatchObject({
      status: "resolved",
      path: "person.md",
    });
    expect((await cli(["resolve", "[[old-name]]"], notes)).code).toBe(3);
    expect((await converted()).after).toContain("[nick](person.md) [old-name](renamed.md)");
  });

  test("a path out of the root reaches the file in the other vault (17.9)", async () => {
    await ready;
    const links = (await cli(["links", "index"], notes)).json.data;
    expect(links.find((l: { target: string }) => l.target === "../app/design.md")).toMatchObject({
      status: "note",
      path: join(app, "design.md"),
      root: app,
      name: "xapp",
    });
  });

  test("backlinks come from other vaults' indexes too, as of their last indexing (17.11)", async () => {
    await ready;
    const todo = (await cli(["backlinks", "todo"], notes)).json.data.backlinks;
    expect(todo).toContainEqual(
      expect.objectContaining({ from: join(app, "links.md"), root: app, name: "xapp", kind: "markdown" }),
    );
    const person = (await cli(["backlinks", "person"], notes)).json.data.backlinks;
    expect(person).toContainEqual(
      expect.objectContaining({ from: join(app, "links.md"), root: app, name: "xapp", kind: "markdown" }),
    );
  });

  test("another root's picture and path wikilinks are backlinks too; a move here rewrites them (17.11, 17.16)", async () => {
    const top = mkdtempSync(join(tmpdir(), "slipbox-reach-img-"));
    const ra = join(top, "ra");
    const rb = join(top, "rb");
    mkdirSync(ra, { recursive: true });
    mkdirSync(rb, { recursive: true });
    writeFileSync(join(ra, "note.md"), "# Note\n");
    writeFileSync(join(ra, "pic.png"), "png");
    writeFileSync(join(rb, "b.md"), "![x](../ra/pic.png) [[../ra/note]] ![[../ra/pic.png]]\n");
    await cli(["init", ra], ra);
    await cli(["init", rb], rb);
    await cli(["ls"], rb); // rb's index: its links into ra
    const back = async (rel: string) =>
      (await cli(["backlinks", rel], ra)).json.data.backlinks.map(
        (x: { from: string; kind: string; target: string }) => [x.from, x.kind, x.target],
      );
    expect(await back("pic.png")).toEqual([
      [join(rb, "b.md"), "image", "../ra/pic.png"],
      [join(rb, "b.md"), "embed", "../ra/pic.png"],
    ]);
    expect(await back("note.md")).toEqual([[join(rb, "b.md"), "wiki", "../ra/note"]]);
    expect((await cli(["mv", "pic.png", "img/pic.png"], ra)).code).toBe(0);
    expect(readFileSync(join(rb, "b.md"), "utf8")).toBe(
      "![x](../ra/img/pic.png) [[../ra/note]] ![[../ra/img/pic.png]]\n",
    );
  });

  test("another root's links to this repository's hosting are backlinks here, as its pointers are (D87, 17.11)", async () => {
    const { openVault } = await import("../../../../src/core/workspace/links/reach.ts");
    const top = mkdtempSync(join(tmpdir(), "slipbox-reach-host-"));
    const tag = basename(top)
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
    const ra = join(top, "A");
    const rb = join(top, "B");
    mkdirSync(join(ra, ".git"), { recursive: true });
    writeFileSync(join(ra, ".git", "HEAD"), "ref: refs/heads/main\n");
    writeFileSync(join(ra, ".git", "config"), `[remote "origin"]\n\turl = git@github.com:me/a${tag}.git\n`);
    writeFileSync(join(ra, "x.md"), "# X\n");
    mkdirSync(join(rb, ".slipbox"), { recursive: true });
    const url = `https://github.com/me/a${tag}/blob/main/x.md`;
    // Another repository's file of the same path: not this one's.
    writeFileSync(
      join(rb, "README.md"),
      `# B\n\n[x](${url}#x) [them](https://github.com/them/a${tag}/blob/main/x.md)\n`,
    );
    openVault(ra); // A known on this machine, by its remote (21.6)
    openVault(rb).ensureAll(); // B's index: its links
    const g = openVault(ra);
    expect(g.backlinks("x.md").map((b) => [b.from, b.target])).toEqual([[join(rb, "README.md"), `${url}#x`]]);
  });

  test("a file named with # or % in another root: its backlinks found all the same (17.11)", async () => {
    const { openVault } = await import("../../../../src/core/workspace/links/reach.ts");
    const top = mkdtempSync(join(tmpdir(), "slipbox-reach-hash-"));
    const rg = join(top, "G");
    const ro = join(top, "O");
    for (const [rel, text] of Object.entries({
      "G/.slipbox/config.toml": "",
      "G/C#.md": "# C#\n",
      "G/x.md": "# x\n",
      "O/.slipbox/config.toml": "",
      "O/o.md": "[c](../G/C%23.md) [x](../G/x.md)\n",
    })) {
      mkdirSync(join(top, rel, ".."), { recursive: true });
      writeFileSync(join(top, rel), text);
    }
    openVault(ro).ensureAll(); // O's index: its links into G
    const g = openVault(rg);
    expect(g.backlinks("x.md").map((b) => b.from)).toEqual([join(ro, "o.md")]);
    expect(g.backlinks("C#.md").map((b) => b.from)).toEqual([join(ro, "o.md")]);
  });

  test("a renamed vault's old name: the converter reaches it, checked by its id; a moved-away vault says where it was", async () => {
    await ready;
    const cfg = join(app, ".slipbox", "config.toml");
    const before = readFileSync(cfg, "utf8");
    writeFileSync(cfg, before.replace('name = "xapp"', 'name = "xapp2"\nprevious_names = ["xapp"]'));
    await cli(["ls"], app); // the machine sees the new name
    expect((await converted()).after).toContain("[xapp:design](../app/design.md)");
    const moved = join(base, "app-moved");
    const { renameSync } = await import("node:fs");
    renameSync(app, moved);
    writeFileSync(
      join(notes, "index.md"),
      readFileSync(join(notes, "index.md"), "utf8").replace("[[xapp:design]]", "[[xapp2:design]]"),
    );
    expect((await converted()).skipped.some((x) => x.includes(`was last seen at ${app}`))).toBe(true);
    writeFileSync(join(notes, "index.md"), files["notes/index.md"]!);
    renameSync(moved, app);
    writeFileSync(cfg, before);
    await cli(["ls"], app);
  });
});
