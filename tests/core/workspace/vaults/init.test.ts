import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { runCli } from "../../../../src/cli/cli.ts";
import { DEFAULT_CONFIG, loadConfig } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { applyPlan } from "../../../../src/core/workspace/mutations/rename/rename.ts";
import { initVault, locateVault } from "../../../../src/core/workspace/vaults/vault.ts";

import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("a folder made a vault, and a vault made a plain folder again (18.11)", () => {
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
  const base = mkdtempSync(join(tmpdir(), "slipbox-make-"));
  const parent = join(base, "parent");
  const other = join(base, "other");
  const files: Record<string, string> = {
    "parent/.slipbox/config.toml": '[vault]\nid = "mkparent000001"\nname = "mkparent"\n',
    "parent/home.md":
      "# Home\n\n[a](proj/alpha.md) [g](proj/deep/gamma.md) [b](proj/beta.md) [b2](proj/beta.md#beta) ![p](proj/pic.png)\n",
    "parent/proj/alpha.md": "# Alpha\n\n[h](../home.md) [b](beta.md) [b2](./beta.md#beta) [g](deep/gamma.md)\n",
    "parent/proj/beta.md": "# Beta\n\n[a](alpha.md)\n",
    "parent/proj/deep/gamma.md": "# Gamma\n\n[up](../alpha.md)\n",
    "parent/proj/pic.png": "png",
    "other/.slipbox/config.toml": '[vault]\nid = "mkother000001"\nname = "mkother"\n',
    "other/index.md": "# Other\n\n[a](../parent/proj/alpha.md) [h](../parent/home.md)\n",
  };
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(base, rel, ".."), { recursive: true });
    writeFileSync(join(base, rel), text);
  }
  const read = (rel: string) => readFileSync(join(base, rel), "utf8");
  /** Every link's file, from each linking file, as absolute paths: what resolves, wherever it's indexed. */
  const reached = async (roots: string[]) => {
    const out: Record<string, string[]> = {};
    for (const root of roots) {
      for (const l of (await cli(["links", "--all"], root)).json.data as {
        from: string;
        status: string;
        path: string | null;
      }[]) {
        const from = join(root, l.from);
        if (l.status !== "note" && l.status !== "file") continue;
        (out[from] ??= []).push(l.path!.startsWith("/") ? l.path! : join(root, l.path!));
      }
    }
    for (const k of Object.keys(out)) out[k]!.sort();
    return out;
  };

  test("made a vault: path links across it are left, and reach the same; made a folder again: it all reaches the same", async () => {
    await cli(["backlinks", "index"], other); // indexed and known, as when opened
    await cli(["links", "home"], parent);
    const texts = Object.fromEntries(Object.keys(files).map((rel) => [rel, read(rel)]));
    const before = await reached([parent]);
    const dry = (await cli(["init", "proj", "--name", "mkproj", "--dry-run"], parent)).json;
    expect(dry.data).toMatchObject({ kind: "make-root", from: "proj", to: "mkproj", dryRun: true });
    expect(existsSync(join(parent, "proj", ".slipbox"))).toBe(false);
    const made = (await cli(["init", "proj", "--name", "mkproj"], parent)).json;
    expect(made.ok).toBe(true);
    expect(existsSync(join(parent, "proj", ".slipbox", "config.toml"))).toBe(true);
    // Into it, out of it, within it, from another vault: relative paths reach across as they are.
    for (const rel of Object.keys(files)) expect([rel, read(rel)]).toEqual([rel, texts[rel]!]);
    // Everything that resolved still does, to the same file.
    expect(await reached([parent, join(parent, "proj")])).toEqual(before);

    // Back: a plain folder again, nothing to rewrite either.
    const back = (await cli(["deinit", "proj"], parent)).json;
    expect(back.data).toMatchObject({ kind: "unmake-root", from: "proj", to: "mkparent", dryRun: false });
    expect(existsSync(join(parent, "proj", ".slipbox"))).toBe(false);
    for (const rel of Object.keys(files)) expect([rel, read(rel)]).toEqual([rel, texts[rel]!]);
    expect(await reached([parent])).toEqual(before);
    // The machine forgot it — a root no more, its name gone with its .slipbox/ — which is in the parent's trash, restorable.
    const { readRoots } = await import("../../../../src/core/workspace/vaults/registry.ts");
    expect(readRoots().some((v) => v.path === join(parent, "proj"))).toBe(false);
    expect((await cli(["folders"], parent)).json.data.some((f: { name: string }) => f.name === "mkproj")).toBe(false);
    expect((await cli(["trash"], parent)).json.data[0]).toMatchObject({ shown: "proj/.slipbox", dir: true });
    // Refused: a folder that's already a vault; a vault not nested in another.
    expect((await cli(["deinit", "proj"], parent)).code).toBe(5);
    expect((await cli(["deinit", "."], other)).code).toBe(5);
    // And a git checkout (20.3): a vault by itself, with .slipbox/ or without — nothing changes.
    mkdirSync(join(parent, "proj", ".git"));
    const repo = (await cli(["deinit", "proj"], parent)).json;
    expect(repo.error.message).toContain("has no .slipbox/ to take away (it's a vault by its .git)");
    await cli(["init", "proj", "--name", "mkrepo"], parent);
    const both = (await cli(["deinit", "proj"], parent)).json;
    expect(both.error.message).toContain("proj is a vault by its .git too: it stays one, with or without .slipbox/");
    expect(existsSync(join(parent, "proj", ".slipbox"))).toBe(true);
  });

  test("deinit rewrites the pointers by its name, which goes with its .slipbox/: from apart, the parent's pointer, else a path (D74, D75)", async () => {
    const { openVault } = await import("../../../../src/core/workspace/links/reach.ts");
    const at = mkdtempSync(join(tmpdir(), "slipbox-deinit-ptr-"));
    const tree: Record<string, string> = {
      "named/.slipbox/config.toml": '[vault]\nid = "dpnamed000001"\nname = "dpnamed"\n',
      "named/home.md": "# Home\n\n[in](slipbox://dpbox/x.md#top) [dir](slipbox://dpbox/)\n",
      "named/box/.slipbox/config.toml": '[vault]\nid = "dpbox00000001"\nname = "dpbox"\n',
      "named/box/x.md": "# Top\n\n[self](slipbox://dpbox/sub/my%20y.md)\n",
      "named/box/sub/my y.md": "# Y\n",
      "plain/.slipbox/config.toml": "",
      "plain/pbox/.slipbox/config.toml": '[vault]\nid = "dppbox0000001"\nname = "dppbox"\n',
      "plain/pbox/z.md": "# Z\n",
      "far/.slipbox/config.toml": '[vault]\nid = "dpfar00000001"\nname = "dpfar"\n',
      "far/links.md": "[x](slipbox://dpbox/x.md#top) [y](<slipbox://dpbox/sub/my y.md>) [z](slipbox://dppbox/z.md)\n",
    };
    for (const [rel, text] of Object.entries(tree)) {
      mkdirSync(join(at, rel, ".."), { recursive: true });
      writeFileSync(join(at, rel), text);
    }
    const read = (rel: string) => readFileSync(join(at, rel), "utf8");
    // This machine has seen them all, with their indexes.
    for (const r of ["far", "named/box", "named", "plain/pbox", "plain"]) openVault(join(at, r)).ensureAll();
    const statuses = async () =>
      (await cli(["links", "links"], join(at, "far"))).json.data.map((l: { status: string; path: string | null }) => [
        l.status,
        l.path,
      ]);
    expect(await statuses()).toEqual([
      ["note", join(at, "named", "box", "x.md")],
      ["note", join(at, "named", "box", "sub", "my y.md")],
      ["note", join(at, "plain", "pbox", "z.md")],
    ]);
    // Previewed: from apart, the named parent's pointer; from the parent and within, a path.
    const dry = (await cli(["deinit", "box", "--dry-run"], join(at, "named"))).json.data;
    expect(
      dry.files.map((f: { abs: string; edits: { after: string }[] }) => [f.abs, f.edits.map((e) => e.after)]),
    ).toEqual(
      expect.arrayContaining([
        [join(at, "named", "box", "x.md"), ["[self](sub/my%20y.md)"]],
        [join(at, "named", "home.md"), ["[in](box/x.md#top) [dir](box/)"]],
        [
          join(at, "far", "links.md"),
          ["[x](slipbox://dpnamed/box/x.md#top) [y](<slipbox://dpnamed/box/sub/my y.md>) [z](slipbox://dppbox/z.md)"],
        ],
      ]),
    );
    expect(dry.files).toHaveLength(3);
    expect((await cli(["deinit", "box"], join(at, "named"))).code).toBe(0);
    expect(read("far/links.md")).toBe(
      "[x](slipbox://dpnamed/box/x.md#top) [y](<slipbox://dpnamed/box/sub/my y.md>) [z](slipbox://dppbox/z.md)\n",
    );
    expect(read("named/home.md")).toBe("# Home\n\n[in](box/x.md#top) [dir](box/)\n");
    expect(read("named/box/x.md")).toBe("# Top\n\n[self](sub/my%20y.md)\n");
    // A parent with no name: a path, which works while the folders are laid out alike.
    expect((await cli(["deinit", "pbox"], join(at, "plain"))).code).toBe(0);
    expect(read("far/links.md")).toBe(
      "[x](slipbox://dpnamed/box/x.md#top) [y](<slipbox://dpnamed/box/sub/my y.md>) [z](../plain/pbox/z.md)\n",
    );
    // Each reaches what it did.
    expect(await statuses()).toEqual([
      ["note", join(at, "named", "box", "x.md")],
      ["note", join(at, "named", "box", "sub", "my y.md")],
      ["note", join(at, "plain", "pbox", "z.md")],
    ]);
    const home = (await cli(["links", "home"], join(at, "named"))).json.data.map(
      (l: { status: string; path: string | null }) => [l.status, l.path],
    );
    expect(home).toEqual([
      ["note", "box/x.md"],
      ["folder", "box"],
    ]);
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

  test("init --name on a [vault] table the edit can't follow (dotted keys, `[ vault ]`): refused, the file as it was", () => {
    for (const text of ['vault.aliases = ["n"]\n\n[render]\ninset = 2\n', '[ vault ]\naliases = ["n"]\n']) {
      const dir = mkdtempSync(join(tmpdir(), "slipbox-c3-init-"));
      mkdirSync(join(dir, ".slipbox"));
      writeFileSync(join(dir, ".slipbox", "config.toml"), text);
      expect(() =>
        initVault(
          dir,
          `n${basename(dir)
            .replace(/[^a-z0-9]/gi, "")
            .toLowerCase()}`,
        ),
      ).toThrow("can't edit .slipbox/config.toml's [vault] table safely: edit it by hand");
      expect(read(dir, ".slipbox/config.toml")).toBe(text);
    }
    // A table it can follow: named, the rest kept.
    const ok = mkdtempSync(join(tmpdir(), "slipbox-c3-init-"));
    mkdirSync(join(ok, ".slipbox"));
    writeFileSync(join(ok, ".slipbox", "config.toml"), '[vault]\naliases = ["n"]\n\n[render]\ninset = 2\n');
    const name = `n${basename(ok)
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase()}`;
    expect(initVault(ok, name)).toMatchObject({ identified: true, name });
    expect(loadConfig({ vaultRoot: ok }).config.render.inset).toBe(2);
  });

  test("init <folder> keeps wikilinks reaching: names into it become paths, its names out relative, its root paths its own", async () => {
    const { planMakeVault } = await import("../../../../src/core/workspace/mutations/rename/rename.ts");
    const { dir, g } = root({
      "home.md": "[[plan]] [[F/plan]] [[docs/x]]\n",
      "docs/x.md": "# X\n",
      "F/plan.md": "[[home]] [[F/other]] [[other]] [[docs/x]] [[F/sub/deep]]\n",
      "F/other.md": "# Other\n",
      "F/sub/deep.md": "# Deep\n",
    });
    applyPlan(g, planMakeVault(g, "F", null));
    expect(read(dir, "home.md")).toBe("[[F/plan]] [[F/plan]] [[docs/x]]\n");
    expect(read(dir, "F/plan.md")).toBe("[[../home]] [[./other]] [[other]] [[../docs/x]] [[sub/deep]]\n");
    const f = openGraph(locateVault({ root: join(dir, "F") }), DEFAULT_CONFIG, false);
    expect(f.linksOf("plan.md").map((l) => [l.resolvedKind, l.path])).toEqual([
      ["note", join(dir, "home.md")],
      ["note", "other.md"],
      ["note", "other.md"],
      ["note", join(dir, "docs", "x.md")],
      ["note", "sub/deep.md"],
    ]);
    const parent = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    expect(parent.linksOf("home.md").map((l) => [l.resolvedKind, l.path])).toEqual([
      ["note", join(dir, "F", "plan.md")],
      ["note", join(dir, "F", "plan.md")],
      ["note", "docs/x.md"],
    ]);
  });

  test("deinit keeps wikilinks reaching what they did: its root paths gain its folder, a name shared with the parent's a path", async () => {
    const { planUnmakeVault } = await import("../../../../src/core/workspace/mutations/rename/rename.ts");
    const { dir, g } = root({
      "home.md": "[[y]] [[solo]]\n",
      "sub/y.md": "# Parent's y\n",
      "solo.md": "# Solo\n",
      "V/.slipbox/config.toml": "",
      "V/a.md": "[[sub/y]] [md](/sub/y.md) [[y]] [[uniq]]\n",
      "V/sub/y.md": "# V's y\n",
      "V/uniq.md": "# Uniq\n",
    });
    expect(g.resolveLink({ kind: "wiki", target: "y" }, "home.md")).toMatchObject({ path: "sub/y.md" });
    applyPlan(g, planUnmakeVault(g, "V"));
    expect(read(dir, "V/a.md")).toBe("[[V/sub/y]] [md](/V/sub/y.md) [[V/sub/y]] [[uniq]]\n");
    expect(read(dir, "home.md")).toBe("[[sub/y]] [[solo]]\n");
    const after = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    expect(after.linksOf("V/a.md").map((l) => [l.resolvedKind, l.path])).toEqual([
      ["note", "V/sub/y.md"],
      ["note", "V/sub/y.md"],
      ["note", "V/sub/y.md"],
      ["note", "V/uniq.md"],
    ]);
    expect(after.linksOf("home.md").map((l) => [l.resolvedKind, l.path])).toEqual([
      ["note", "sub/y.md"],
      ["note", "solo.md"],
    ]);
  });
});
