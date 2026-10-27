import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../../../src/cli/cli.ts";
import { DEFAULT_CONFIG, loadConfig } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { applyPlan, planUndo } from "../../../../src/core/workspace/mutations/rename/rename.ts";
import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import { probe, setLinkAnswer } from "../../../../src/core/workspace/vaults/symlinks.ts";

import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("plans write only inside the vault (VV-D6)", () => {
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
  /** A test run with a home of its own: nothing it does is near the real one. */
  const homed = (fn: (home: string) => Promise<void>) => async () => {
    const before = process.env.HOME;
    const home = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-home-")));
    process.env.HOME = home;
    try {
      await fn(home);
    } finally {
      process.env.HOME = before;
    }
  };
  /** A vault, a folder outside it with notes, and a link to it from the vault that you follow. */
  const linked = async () => {
    const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
    const vault = join(top, "vault");
    const outer = join(top, "out");
    mkdirSync(join(vault, ".slipbox"), { recursive: true });
    mkdirSync(join(outer, "sub"), { recursive: true });
    writeFileSync(join(vault, "a.md"), "# A\n\n## H\n");
    writeFileSync(join(outer, "x.md"), "# X\n\nsee [[a]] and [h](../a.md#h) TOKEN\n");
    writeFileSync(join(outer, "s.md"), "# S\n");
    writeFileSync(join(outer, "sub", "t.md"), "# T\n");
    const link = join(vault, "outdir");
    symlinkSync(outer, link);
    setLinkAnswer(link, "follow");
    await probe(outer);
    return { top, vault, outer, link };
  };

  test(
    "a rename's relinking, a replace across files, the converter and a heading's rename leave a note through a followed link out of the vault as it is, and say so",
    homed(async () => {
      const { vault, outer } = await linked();
      const x = readFileSync(join(outer, "x.md"), "utf8");
      const skipped = "outdir/x.md:3: a link leads it out of the vault: not rewritten";
      expect(JSON.stringify((await cli(["backlinks", "a.md"], vault)).json.data.backlinks)).toContain("outdir/x.md");
      for (const argv of [
        ["replace", "--all", "TOKEN", "CHANGED"],
        ["convert-links"],
        ["rename-heading", "a.md", "H", "Renamed"],
        ["mv", "a.md", "b.md"],
      ]) {
        const r = await cli(argv, vault);
        expect(r.code).toBe(0);
        expect(r.json.warnings).toContain(skipped);
        expect(readFileSync(join(outer, "x.md"), "utf8")).toBe(x);
      }
      // The rename itself went ahead in the vault.
      expect(existsSync(join(vault, "b.md"))).toBe(true);
    }),
  );

  test(
    "applying a plan writes nothing when any file of it, or what it moves, lands out of the vault",
    homed(async () => {
      const { vault, outer, link } = await linked();
      const g = openGraph(locateVault({ root: vault }), DEFAULT_CONFIG, false);
      type Plan = Parameters<typeof applyPlan>[1];
      const change = (abs: string, from: string, to: string) => {
        const text = readFileSync(abs, "utf8");
        return { abs, shown: "a.md", vault: null, edits: [], text, next: text.replace(from, to) };
      };
      const a = readFileSync(join(vault, "a.md"), "utf8");
      const x = readFileSync(join(outer, "x.md"), "utf8");
      const plan: Plan = {
        kind: "replace",
        from: "TOKEN",
        to: "CHANGED",
        move: null,
        files: [change(join(vault, "a.md"), "# A", "# CHANGED"), change(join(link, "x.md"), "TOKEN", "CHANGED")],
        warnings: [],
        skipped: [],
      };
      expect(() => applyPlan(g, plan)).toThrow(
        "outdir/x.md: a link leads it out of the vault, where nothing is written; nothing changed",
      );
      expect(readFileSync(join(vault, "a.md"), "utf8")).toBe(a);
      expect(readFileSync(join(outer, "x.md"), "utf8")).toBe(x);
      // A move out of the link's target, or into it.
      const moving = (from: string, to: string): Plan => ({
        kind: "note",
        from,
        to,
        move: { from: join(vault, from), to: join(vault, to), dir: false },
        files: [],
        warnings: [],
        skipped: [],
      });
      expect(() => applyPlan(g, moving("outdir/s.md", "s.md"))).toThrow("outdir/s.md resolves outside the vault");
      expect(() => applyPlan(g, moving("a.md", "outdir/a.md"))).toThrow("outdir/a.md resolves outside the vault");
      expect(existsSync(join(outer, "s.md"))).toBe(true);
      expect(existsSync(join(vault, "s.md"))).toBe(false);
      expect(existsSync(join(vault, "a.md"))).toBe(true);
    }),
  );

  test(
    "a rename's relinking never writes through a link into a folder the walk doesn't list, in a vault or home: said",
    homed(async (home) => {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
      const vault = join(top, "vault");
      mkdirSync(join(vault, ".slipbox"), { recursive: true });
      mkdirSync(join(vault, ".hidden"));
      mkdirSync(join(vault, "box"));
      writeFileSync(join(vault, "a.md"), "# A\n");
      writeFileSync(join(vault, ".hidden", "n.md"), "# N\n\nsee [a](a.md)\n");
      symlinkSync(".hidden/n.md", join(vault, "n.md"));
      const r = await cli(["mv", "a.md", "z.md"], vault);
      expect(r.code).toBe(0);
      expect(r.json.warnings).toContain("n.md:3: a link leads it into a folder the walk doesn't list: not rewritten");
      expect(readFileSync(join(vault, ".hidden", "n.md"), "utf8")).toBe("# N\n\nsee [a](a.md)\n");
      // The link moved itself: its own links aren't written there either.
      expect((await cli(["mv", "n.md", "box/"], vault)).code).toBe(0);
      expect(lstatSync(join(vault, "box", "n.md")).isSymbolicLink()).toBe(true);
      expect(readFileSync(join(vault, ".hidden", "n.md"), "utf8")).toBe("# N\n\nsee [a](a.md)\n");
      // Home's own: a note that is a link to ~/.bashrc.
      writeFileSync(join(home, "b.md"), "# B\n");
      writeFileSync(join(home, ".bashrc"), "# rc\n\n[b](b.md)\n");
      symlinkSync(join(home, ".bashrc"), join(home, "rc.md"));
      expect((await cli(["mv", "b.md", "c.md"], home)).code).toBe(0);
      expect(readFileSync(join(home, ".bashrc"), "utf8")).toBe("# rc\n\n[b](b.md)\n");
    }),
  );

  test(
    "a file reached by two links from two folders isn't written for either: said; two names moved together, written once",
    homed(async () => {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
      const vault = join(top, "vault");
      mkdirSync(join(vault, ".slipbox"), { recursive: true });
      writeFileSync(join(vault, ".slipbox", "config.toml"), '[walk]\nexclude = ["shelf/"]\n');
      mkdirSync(join(vault, "shelf"));
      mkdirSync(join(vault, "sub"));
      writeFileSync(join(vault, "sub", "a.md"), "# A\n");
      writeFileSync(join(vault, "shelf", "s.md"), "# S\n\n[x](sub/a.md) [y](a.md)\n");
      // Two links to it, each reading its links from its own folder: each would edit it its own way.
      symlinkSync("shelf/s.md", join(vault, "e1.md"));
      symlinkSync("../shelf/s.md", join(vault, "sub", "e2.md"));
      const r = await cli(["mv", "sub/a.md", "sub/z.md"], vault);
      expect(r.code).toBe(0);
      const why = (other: string) => `reached as ${other} too, from another folder: not rewritten`;
      expect(r.json.warnings).toEqual(
        expect.arrayContaining([`e1.md:3: ${why("sub/e2.md")}`, `sub/e2.md:3: ${why("e1.md")}`]),
      );
      expect(readFileSync(join(vault, "shelf", "s.md"), "utf8")).toBe("# S\n\n[x](sub/a.md) [y](a.md)\n");
      expect((await cli(["undo"], vault)).code).toBe(0);
      // Both names moved together, by the same way: each edits it the same, so it's written once.
      writeFileSync(join(vault, "a.md"), "# A\n");
      writeFileSync(join(vault, "shelf", "t.md"), "# T\n\n[a](../a.md)\n");
      mkdirSync(join(vault, "box"));
      for (const n of ["e3.md", "e4.md"]) symlinkSync(join(vault, "shelf", "t.md"), join(vault, "box", n));
      const moved = await cli(["mv", "box", "deep/box"], vault);
      expect(moved.code).toBe(0);
      expect(moved.json.warnings.filter((w: string) => w.includes("too"))).toEqual([]);
      expect(moved.json.data.files.map((f: { path: string }) => f.path)).toEqual(["box/e3.md"]);
      expect(readFileSync(join(vault, "shelf", "t.md"), "utf8")).toBe("# T\n\n[a](../../a.md)\n");
      expect((await cli(["undo"], vault)).code).toBe(0);
      expect(readFileSync(join(vault, "shelf", "t.md"), "utf8")).toBe("# T\n\n[a](../a.md)\n");
      // Written once, through one name: the other's links indexed again too, as an undo's.
      const g = openGraph(locateVault({ root: vault }), loadConfig({ vaultRoot: vault }).config, false);
      const { planNoteRename } = await import("../../../../src/core/workspace/mutations/rename/rename.ts");
      applyPlan(g, planNoteRename(g, "a.md", "b.md"));
      const from = (rel: string) =>
        g
          .backlinks(rel)
          .map((b) => b.from)
          .sort();
      expect(from("b.md")).toEqual(["box/e3.md", "box/e4.md"]);
      applyPlan(g, planUndo(g));
      expect(from("a.md")).toEqual(["box/e3.md", "box/e4.md", "e1.md"]);
      // Two names in one folder edited otherwise each: neither is written, both said.
      const { Collector } = await import("../../../../src/core/workspace/mutations/rename/rename-plan.ts");
      const c = new Collector(openGraph(locateVault({ root: vault }), loadConfig({ vaultRoot: vault }).config, false));
      for (const [n, to] of [
        ["e3.md", "[a](x.md)"],
        ["e4.md", "[a](y.md)"],
      ] as const)
        c.line(join(vault, "box", n), null, 3, () => to, "");
      expect(c.result()).toEqual([]);
      expect(c.skipped.map((x) => `${x.shown}:${x.line}: ${x.reason}`)).toEqual([
        "box/e3.md:3: reached as box/e4.md too, edited otherwise there: not rewritten",
        "box/e4.md:3: reached as box/e3.md too, edited otherwise there: not rewritten",
      ]);
    }),
  );

  test(
    "a reached note in a hidden folder that is a link into another hidden folder isn't written through: as it's refused named",
    homed(async () => {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
      const vault = join(top, "vault");
      mkdirSync(join(vault, ".slipbox"), { recursive: true });
      for (const d of [".notes", ".private"]) mkdirSync(join(vault, d));
      writeFileSync(join(vault, "a.md"), "# A\n\n[n](.notes/n.md)\n");
      writeFileSync(join(vault, "b.md"), "# B\n");
      writeFileSync(join(vault, ".private", "p.md"), "# P\n\n[b](../b.md)\n");
      symlinkSync("../.private/p.md", join(vault, ".notes", "n.md"));
      const r = await cli(["mv", "b.md", "c.md"], vault);
      expect(r.code).toBe(0);
      expect(r.json.warnings).toContain(
        ".notes/n.md:3: a link leads it into a folder the walk doesn't list: not rewritten",
      );
      expect(readFileSync(join(vault, ".private", "p.md"), "utf8")).toBe("# P\n\n[b](../b.md)\n");
    }),
  );

  test(
    "a note of another vault reached through a link isn't written for the link's reading of it: its own vault reads its links otherwise; said",
    homed(async (home) => {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
      const parent = join(top, "parent");
      const nested = join(parent, "sub", "n");
      for (const d of [parent, nested]) mkdirSync(join(d, ".slipbox"), { recursive: true });
      writeFileSync(join(parent, "t.md"), "# T\n");
      writeFileSync(join(nested, "t.md"), "# NT\n"); // its own `t.md`, as it reads the link
      writeFileSync(join(nested, "n.md"), "# N\n\n[t](t.md)\n");
      symlinkSync("sub/n/n.md", join(parent, "alias.md"));
      const r = await cli(["mv", "t.md", "u.md"], parent);
      expect(r.code).toBe(0);
      expect(r.json.warnings).toContain("alias.md:3: reached as sub/n/n.md too, from another folder: not rewritten");
      expect(readFileSync(join(nested, "n.md"), "utf8")).toBe("# N\n\n[t](t.md)\n");
      // In home, through a followed link into a vault of home's, and one into a vault out of it.
      mkdirSync(join(home, "notes", ".slipbox"), { recursive: true });
      writeFileSync(join(home, "notes", "a.md"), "# NA\n");
      writeFileSync(join(home, "notes", "s.md"), "# S\n\n[a](a.md)\n");
      writeFileSync(join(home, "a.md"), "# A\n");
      symlinkSync("notes/s.md", join(home, "ext.md"));
      mkdirSync(join(top, "proj", ".slipbox"), { recursive: true });
      writeFileSync(join(top, "proj", "a.md"), "# PA\n");
      writeFileSync(join(top, "proj", "p.md"), "# P\n\n[a](a.md)\n");
      symlinkSync(join(top, "proj", "p.md"), join(home, "far.md"));
      setLinkAnswer(join(home, "far.md"), "follow");
      await probe(join(top, "proj", "p.md"));
      const h = await cli(["mv", "a.md", "z.md"], home);
      expect(h.code).toBe(0);
      expect(h.json.warnings).toEqual(
        expect.arrayContaining([
          "ext.md:3: reached as notes/s.md too, from another folder: not rewritten",
          `far.md:3: reached as ${join(top, "proj", "p.md")} too, from another folder: not rewritten`,
        ]),
      );
      expect(readFileSync(join(home, "notes", "s.md"), "utf8")).toBe("# S\n\n[a](a.md)\n");
      expect(readFileSync(join(top, "proj", "p.md"), "utf8")).toBe("# P\n\n[a](a.md)\n");
    }),
  );

  test(
    "a data file and a link to it from another folder: a rename writes it for neither, said",
    homed(async () => {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
      const vault = join(top, "vault");
      mkdirSync(join(vault, ".slipbox"), { recursive: true });
      for (const d of ["docs", "other"]) mkdirSync(join(vault, d));
      writeFileSync(join(vault, "docs", "real.json"), '{"$ref": "./x.md"}\n');
      writeFileSync(join(vault, "docs", "x.md"), "# X\n");
      writeFileSync(join(vault, "other", "x.md"), "# OX\n");
      symlinkSync("../docs/real.json", join(vault, "other", "alias.json")); // from other/, its `./x.md` is other's
      const r = await cli(["mv", "docs/x.md", "docs/sub/x.md"], vault);
      expect(r.code).toBe(0);
      expect(r.json.warnings).toContain(
        "docs/real.json:1: reached as other/alias.json too, from another folder: not rewritten",
      );
      expect(readFileSync(join(vault, "docs", "real.json"), "utf8")).toBe('{"$ref": "./x.md"}\n');
    }),
  );

  test(
    "a move planned, its note gone before it's carried out: refused, nothing written; a rename onto a second name for the file (a hard link): refused",
    homed(async () => {
      const { vault } = await linked();
      writeFileSync(join(vault, "index.md"), "# Index\n\n[a](a.md)\n");
      const g = openGraph(locateVault({ root: vault }), DEFAULT_CONFIG, false);
      const { planNoteRename } = await import("../../../../src/core/workspace/mutations/rename/rename.ts");
      const plan = planNoteRename(g, "a.md", "b.md");
      rmSync(join(vault, "a.md"));
      expect(() => applyPlan(g, plan)).toThrow("a.md isn't there any more; nothing changed");
      expect(readFileSync(join(vault, "index.md"), "utf8")).toBe("# Index\n\n[a](a.md)\n");
      // Two names for one file (hard links) — another name in its folder, its name in another — aren't one entry: the
      // second isn't the first's case-only rename.
      mkdirSync(join(vault, "sub"));
      writeFileSync(join(vault, "sub", "h.md"), "# H\n");
      linkSync(join(vault, "sub", "h.md"), join(vault, "sub", "h2.md"));
      linkSync(join(vault, "sub", "h.md"), join(vault, "h.md"));
      for (const [to, why] of [
        ["sub/h2.md", "sub/h2.md exists; not overwriting it"],
        ["h.md", "h.md exists; not overwriting it"],
      ] as const) {
        const r = await cli(["mv", "sub/h.md", to], vault);
        expect([r.code, r.json.error?.message]).toEqual([5, why]);
      }
      expect(readFileSync(join(vault, "sub", "h.md"), "utf8")).toBe("# H\n");
    }),
  );

  test(
    "a move that can't be finished changes nothing: what a link leads to can't be written there, what moves can't leave its folder or go into one",
    homed(async (home) => {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
      mkdirSync(join(top, "out"));
      writeFileSync(join(home, "a.md"), "# A\n");
      writeFileSync(join(top, "out", "s.md"), "# S\n\nsee [a](a.md)\n");
      writeFileSync(join(home, "b.md"), "# B\n\n[e](ext.md) [r](box/rel.md)\n");
      const ext = join(home, "ext.md");
      symlinkSync(join(top, "out", "s.md"), ext);
      setLinkAnswer(ext, "follow");
      await probe(join(top, "out", "s.md"));
      mkdirSync(join(home, "box"));
      writeFileSync(join(home, "t.md"), "# T\n");
      symlinkSync("../t.md", join(home, "box", "rel.md"));
      const b = readFileSync(join(home, "b.md"), "utf8");
      // What it leads to is in a folder that can't be written: its own link can't be, so nothing moves.
      chmodSync(join(top, "out"), 0o500);
      try {
        const r = await cli(["mv", "ext.md", "deep/"], home);
        expect([r.code, r.json.error?.message]).toEqual([
          5,
          "ext.md can't be written where it is (EACCES); nothing changed",
        ]);
      } finally {
        chmodSync(join(top, "out"), 0o755);
      }
      expect([lstatSync(ext).isSymbolicLink(), existsSync(join(home, "deep"))]).toEqual([true, false]);
      expect(readFileSync(join(top, "out", "s.md"), "utf8")).toBe("# S\n\nsee [a](a.md)\n");
      // A link that can't leave its folder: the folders made for it are taken away again.
      chmodSync(join(home, "box"), 0o500);
      try {
        const r = await cli(["mv", "box/rel.md", "new/sub/rel.md"], home);
        expect([r.code, r.json.error?.message]).toEqual([5, "box/rel.md can't be moved (EACCES); nothing changed"]);
      } finally {
        chmodSync(join(home, "box"), 0o755);
      }
      expect([lstatSync(join(home, "box", "rel.md")).isSymbolicLink(), existsSync(join(home, "new"))]).toEqual([
        true,
        false,
      ]);
      expect(readFileSync(join(home, "b.md"), "utf8")).toBe(b);
      // A note moved into a folder that can't be written, a folder out of one: nothing written, nothing made.
      writeFileSync(join(home, "c.md"), "# C\n\n[a](a.md)\n");
      mkdirSync(join(home, "ro"));
      mkdirSync(join(home, "shut", "f"), { recursive: true });
      writeFileSync(join(home, "shut", "f", "n.md"), "# N\n");
      for (const d of ["ro", "shut"]) chmodSync(join(home, d), 0o500);
      try {
        const into = await cli(["mv", "a.md", "ro/"], home);
        expect([into.code, into.json.error?.message]).toEqual([5, "a.md can't be moved (EACCES); nothing changed"]);
        const out = await cli(["mv", "shut/f", "new2/f"], home);
        expect([out.code, out.json.error?.message]).toEqual([5, "shut/f can't be moved (EACCES); nothing changed"]);
      } finally {
        for (const d of ["ro", "shut"]) chmodSync(join(home, d), 0o755);
      }
      expect(readFileSync(join(home, "c.md"), "utf8")).toBe("# C\n\n[a](a.md)\n");
      expect([existsSync(join(home, "a.md")), existsSync(join(home, "new2"))]).toEqual([true, false]);
      // Planned, then its folder made one that can be written but not searched: refused as it's carried out.
      mkdirSync(join(home, "src"));
      writeFileSync(join(home, "src", "s.md"), "# S\n");
      writeFileSync(join(home, "ref.md"), "# Ref\n\n[s](src/s.md)\n");
      const { planNoteRename } = await import("../../../../src/core/workspace/mutations/rename/rename.ts");
      const plan = planNoteRename(openGraph(locateVault({ root: home }), DEFAULT_CONFIG, false), "src/s.md", "s.md");
      chmodSync(join(home, "src"), 0o600);
      try {
        expect(() => applyPlan(openGraph(locateVault({ root: home }), DEFAULT_CONFIG, false), plan)).toThrow(
          "src/s.md can't be moved (EACCES); nothing changed",
        );
      } finally {
        chmodSync(join(home, "src"), 0o755);
      }
      expect(readFileSync(join(home, "ref.md"), "utf8")).toBe("# Ref\n\n[s](src/s.md)\n");
    }),
  );

  test(
    "a note the vault reached in a hidden folder, and a link to it from another folder: written for neither name, said",
    homed(async () => {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
      const vault = join(top, "vault");
      mkdirSync(join(vault, ".slipbox"), { recursive: true });
      mkdirSync(join(vault, ".hidden"));
      writeFileSync(join(vault, "b.md"), "# B\n");
      writeFileSync(join(vault, ".hidden", "b.md"), "# HB\n");
      writeFileSync(join(vault, ".hidden", "n.md"), "# N\n\n[b](b.md)\n");
      writeFileSync(join(vault, "r.md"), "# R\n\n[x](.hidden/b.md) [n](.hidden/n.md)\n"); // what reaches them
      symlinkSync(".hidden/n.md", join(vault, "l.md")); // from the top, its `b.md` is the top's
      const r = await cli(["mv", ".hidden/b.md", "c.md"], vault);
      expect(r.code).toBe(0);
      expect(r.json.warnings).toContain(".hidden/n.md:3: reached as l.md too, from another folder: not rewritten");
      expect(readFileSync(join(vault, ".hidden", "n.md"), "utf8")).toBe("# N\n\n[b](b.md)\n");
    }),
  );

  test(
    "a folder moved under a folder that can't be made: refused, said, nothing changed",
    homed(async () => {
      const { vault } = await linked();
      mkdirSync(join(vault, "f"));
      writeFileSync(join(vault, "f", "n.md"), "# N\n");
      mkdirSync(join(vault, "ro"));
      const g = openGraph(locateVault({ root: vault }), DEFAULT_CONFIG, false);
      const { planFolderMove } = await import("../../../../src/core/workspace/mutations/rename/rename.ts");
      const plan = planFolderMove(g, "f", "ro/deep/f");
      chmodSync(join(vault, "ro"), 0o500);
      try {
        expect(() => applyPlan(g, plan)).toThrow(
          `${join(vault, "ro", "deep")} can't be made (EACCES); nothing changed`,
        );
      } finally {
        chmodSync(join(vault, "ro"), 0o755);
      }
      expect(existsSync(join(vault, "f", "n.md"))).toBe(true);
    }),
  );

  test(
    "apply takes a plan by its id, from slipbox's plans only: each file shown where it is, and one out of the vault refused",
    homed(async () => {
      const { plansDir } = await import("../../../../src/core/workspace/mutations/plans.ts");
      const { top, vault } = await linked();
      const loose = join(top, "loose.txt");
      writeFileSync(loose, "before\n");
      const saved = {
        version: 1,
        id: "0123abcd",
        made: new Date().toISOString(),
        root: vault,
        command: "mv",
        plan: {
          kind: "replace",
          from: "before",
          to: "after",
          move: null,
          files: [
            {
              abs: loose,
              shown: "a.md",
              vault: null,
              edits: [{ line: 1, before: "before", after: "after" }],
              text: "before\n",
              next: "after\n",
            },
          ],
          warnings: [],
          skipped: [],
        },
      };
      // A plan file named by its path isn't one.
      writeFileSync(join(vault, "plan.json"), JSON.stringify(saved));
      expect((await cli(["apply", join(vault, "plan.json")], vault)).code).toBe(3);
      expect((await cli(["apply", "plan.json"], vault)).code).toBe(3);
      // Among slipbox's plans: shown by where it is, and refused, nothing written.
      mkdirSync(plansDir(), { recursive: true });
      writeFileSync(join(plansDir(), "0123abcd.json"), JSON.stringify(saved));
      const dry = await cli(["apply", "0123abcd", "--dry-run"], vault);
      expect(dry.json.data.files[0].path).toBe(loose);
      expect(dry.json.warnings.join()).toContain(`${loose}: a link leads it out of the vault`);
      const r = await cli(["apply", "0123abcd"], vault);
      expect(r.code).toBe(5);
      expect(readFileSync(loose, "utf8")).toBe("before\n");
    }),
  );

  test(
    "an export of a note through a followed link out of the vault isn't written beside it unless --out names a place",
    homed(async () => {
      const { vault, outer } = await linked();
      const r = await cli(["export", "outdir/s.md", "--to", "md"], vault);
      expect(r.code).toBe(5);
      expect(r.json.error.message).toContain("name a place with --out");
      expect(readdirSync(outer).sort()).toEqual(["s.md", "sub", "x.md"]);
      expect((await cli(["export", "outdir/s.md", "--to", "md", "--out", "s.md"], vault)).code).toBe(0);
      expect(readFileSync(join(vault, "s.md"), "utf8")).toContain("# S");
    }),
  );
});
