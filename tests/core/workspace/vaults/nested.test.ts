import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { cpSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../../../src/cli/cli.ts";

import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("nested vaults, known to each other without being opened (17.17)", () => {
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
  const parent = mkdtempSync(join(tmpdir(), "slipbox-nest-parent-"));
  const kid = join(parent, "kid");
  const files: Record<string, string> = {
    ".slipbox/config.toml": '[vault]\nid = "dparent00000001"\nname = "dparent"\n',
    "index.md": "# Index\n\n[k](kid/note.md) and [n](kid/note.md#note)\n",
    "kid/.slipbox/config.toml": '[vault]\nid = "dkid0000000001"\nname = "dkid"\n',
    "kid/note.md": "# Note\n\nUp: [index](../index.md)\n",
  };
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(parent, rel, ".."), { recursive: true });
    writeFileSync(join(parent, rel), text);
  }

  test("a vault nested in this one: by a path into it — never opened on this machine", async () => {
    const links = (await cli(["links", "index"], parent)).json.data;
    for (const l of links)
      expect(l).toMatchObject({ status: "note", path: join(kid, "note.md"), root: kid, name: "dkid" });
    // …and its links count as backlinks here: indexed when found.
    const bl = (await cli(["backlinks", "index"], parent)).json.data.backlinks;
    expect(bl).toContainEqual(expect.objectContaining({ from: join(kid, "note.md"), root: kid, name: "dkid" }));
  });

  test("from inside, the folder it sits in is named by its pointer, once known (21.7); never by name:path (21.12) or [[name:…]] (20.22)", async () => {
    const fresh = mkdtempSync(join(tmpdir(), "slipbox-nest-up-"));
    cpSync(parent, fresh, { recursive: true });
    writeFileSync(join(fresh, ".slipbox", "config.toml"), '[vault]\nid = "dparent00000002"\nname = "dparent2"\n');
    writeFileSync(join(fresh, "kid", ".slipbox", "config.toml"), '[vault]\nid = "dkid0000000002"\nname = "dkid2"\n');
    await cli(["ls"], fresh); // opened once: known on this machine
    const r = await cli(["resolve", "slipbox://dparent2/index.md", "--from", "note.md"], join(fresh, "kid"));
    expect(r.json.data).toMatchObject({
      status: "resolved",
      abs: join(fresh, "index.md"),
      root: fresh,
      name: "dparent2",
      href: "../index.md",
    });
    const old = await cli(["resolve", "dparent2:index.md", "--from", "note.md"], join(fresh, "kid"));
    expect(old.code).toBe(3);
    expect(old.json.data).toMatchObject({ status: "unresolved", suggest: "slipbox://dparent2/index.md" });
    expect((await cli(["resolve", "[[dparent2:index]]"], join(fresh, "kid"))).code).toBe(3);
  });

  test("a second copy (a second clone): each one's names mean its own nested vault, and its links stay its own", async () => {
    // The first copy opened before the second came (as the tests before this one do): its nested vault recorded, and
    // the first known, the default.
    await cli(["links", "index"], parent);
    const second = mkdtempSync(join(tmpdir(), "slipbox-nest-copy-"));
    cpSync(parent, second, { recursive: true });
    // Its nested vault not yet recorded, the first one's is, by the same name: its own still meant.
    const first = (await cli(["links", "index"], second)).json.data;
    expect(first[0]).toMatchObject({ status: "note", path: join(second, "kid", "note.md") });
    for (const root of [parent, second]) await cli(["backlinks", "index"], root); // each indexed, as when opened
    for (const [root, other] of [
      [parent, second],
      [second, parent],
    ] as const) {
      const links = (await cli(["links", "index"], root)).json.data;
      // Two copies of dkid on this machine: each its own, by its path; the name is the folder's (21.6).
      for (const l of links)
        expect(l).toMatchObject({
          status: "note",
          path: join(root, "kid", "note.md"),
          root: join(root, "kid"),
          name: "dkid",
        });
      // dparent by its old form: not a link, nor an argument (21.12); by its pointer, its default copy (21.6).
      expect((await cli(["resolve", "dparent:index.md"], join(root, "kid"))).code).toBe(3);
      expect((await cli(["read", "dparent:index.md"], join(root, "kid"))).code).toBe(3);
      expect((await cli(["resolve", "slipbox://dparent/index.md"], join(root, "kid"))).json.data).toMatchObject({
        status: "resolved",
        abs: join(parent, "index.md"),
      });
      // The other copy's links to its own nested vault aren't backlinks here.
      const bl = (await cli(["backlinks", "note"], join(root, "kid"))).json.data.backlinks;
      expect(bl.map((b: { from: string }) => b.from)).toContain(join(root, "index.md"));
      expect(bl.map((b: { from: string }) => b.from)).not.toContain(join(other, "index.md"));
    }
    // The second made the default: the pointer means it, from anywhere.
    expect((await cli(["folders", "default", "dparent", second], parent)).code).toBe(0);
    expect((await cli(["resolve", "slipbox://dparent/index.md"], join(parent, "kid"))).json.data).toMatchObject({
      status: "resolved",
      abs: join(second, "index.md"),
    });
  });
});
