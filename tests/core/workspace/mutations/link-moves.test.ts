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
  readlinkSync,
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
import { applyPlan, outside, planUndo } from "../../../../src/core/workspace/mutations/rename/rename.ts";
import { locateVault, rootAt } from "../../../../src/core/workspace/vaults/vault.ts";
import { stateDir } from "../../../../src/core/foundation/platform/paths.ts";
import { readRoots } from "../../../../src/core/workspace/vaults/registry.ts";
import {
  forgetProbes,
  linkAnswer,
  linksFile,
  probe,
  setLinkAnswer,
} from "../../../../src/core/workspace/vaults/symlinks.ts";

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
    "a note or folder reached through a followed link out of the vault isn't moved out of it, in a vault or in home",
    homed(async (home) => {
      const { vault, outer } = await linked();
      const { planFolderMove, planNoteRename } = await import(
        "../../../../src/core/workspace/mutations/rename/rename.ts"
      );
      const g = openGraph(locateVault({ root: vault }), DEFAULT_CONFIG, false);
      expect(() => planNoteRename(g, "outdir/s.md", "moved.md")).toThrow("outdir/s.md resolves outside the vault");
      expect(() => planFolderMove(g, "outdir/sub", "insub")).toThrow("outdir/sub resolves outside the vault");
      const note = await cli(["mv", "outdir/s.md", "moved.md"], vault);
      expect(note.code).toBe(5);
      expect(note.json.error.message).toBe("outdir/s.md resolves outside the vault");
      expect((await cli(["mv", "outdir/sub", "insub"], vault)).code).toBe(5);
      expect(existsSync(join(outer, "s.md"))).toBe(true);
      expect(existsSync(join(outer, "sub", "t.md"))).toBe(true);
      expect(existsSync(join(vault, "moved.md"))).toBe(false);
      expect(existsSync(join(vault, "insub"))).toBe(false);
      // Home writes a note's text through a link it follows; a move across the link, never.
      writeFileSync(join(home, "n.md"), "# N\n");
      symlinkSync(outer, join(home, "data"));
      setLinkAnswer(join(home, "data"), "follow");
      const homeMove = await cli(["mv", "data/s.md", "s.md"], home);
      expect(homeMove.code).toBe(5);
      expect(homeMove.json.error.message).toBe("data/s.md resolves outside the vault");
      expect(existsSync(join(outer, "s.md"))).toBe(true);
      expect(existsSync(join(home, "s.md"))).toBe(false);
    }),
  );

  test(
    "a followed link out of the vault, named itself, is renamed and moved as a link: its target stays where it is",
    homed(async () => {
      const { top, vault, outer, link } = await linked();
      const { planFolderMove, planNoteRename } = await import(
        "../../../../src/core/workspace/mutations/rename/rename.ts"
      );
      // A file link, and a relative one to a folder of its own.
      const file = join(vault, "ext.md");
      symlinkSync(join(outer, "s.md"), file);
      setLinkAnswer(file, "follow");
      await probe(join(outer, "s.md"));
      mkdirSync(join(top, "far"));
      writeFileSync(join(top, "far", "f.md"), "# F\n");
      const rel = join(vault, "rel");
      symlinkSync("../far", rel);
      setLinkAnswer(rel, "follow");
      await probe(join(top, "far"));
      writeFileSync(join(vault, "b.md"), "# B\n\n[s](outdir/s.md), [e](ext.md) and [f](rel/f.md)\n");
      mkdirSync(join(vault, "box"));
      const g = openGraph(locateVault({ root: vault }), DEFAULT_CONFIG, false);
      expect(planFolderMove(g, "outdir", "outlink").move).toEqual({
        from: link,
        to: join(vault, "outlink"),
        dir: true,
        link: true,
      });
      expect(planNoteRename(g, "ext.md", "box/ext.md").move?.to).toBe(join(vault, "box", "ext.md"));
      // Through the CLI: each link moves, what it leads to stays, and the links to it follow.
      const before = readdirSync(outer).sort();
      expect((await cli(["mv", "outdir", "outlink"], vault)).code).toBe(0);
      expect((await cli(["mv", "ext.md", "box/"], vault)).code).toBe(0);
      const moved = await cli(["mv", "rel", "box/"], vault);
      expect(moved.code).toBe(0);
      expect(moved.json.warnings).toContain(
        `rel is a relative link: written again at box/rel to lead where it did (${join("..", "..", "far")})`,
      );
      expect(lstatSync(join(vault, "outlink")).isSymbolicLink()).toBe(true);
      expect(realpathSync(join(vault, "outlink"))).toBe(outer);
      expect(realpathSync(join(vault, "box", "ext.md"))).toBe(join(outer, "s.md"));
      // A relative one written again, to lead where it did.
      expect(readlinkSync(join(vault, "box", "rel"))).toBe(join("..", "..", "far"));
      expect([existsSync(link), existsSync(file), existsSync(rel)]).toEqual([false, false, false]);
      expect(readdirSync(outer).sort()).toEqual(before);
      expect(readFileSync(join(vault, "b.md"), "utf8")).toBe(
        "# B\n\n[s](outlink/s.md), [e](box/ext.md) and [f](box/rel/f.md)\n",
      );
      // Still followed where they are: read through, and listed there.
      for (const at of ["outlink", "box/ext.md", "box/rel"]) expect(linkAnswer(join(vault, at))).toBe("follow");
      expect((await cli(["read", "outlink/s.md"], vault)).code).toBe(0);
      expect((await cli(["read", "box/rel/f.md"], vault)).code).toBe(0);
      const keys = () =>
        (JSON.parse(readFileSync(linksFile(), "utf8")).links as { link: string }[])
          .map((e) => e.link)
          .filter((k) => k.startsWith(`${vault}/`));
      expect(keys().sort()).toEqual([join(vault, "box", "ext.md"), join(vault, "box", "rel"), join(vault, "outlink")]);
      // Undone, each link is back where it was, as it was written, its answer with it; the relative one said again.
      const undone = await cli(["undo"], vault);
      expect(undone.code).toBe(0);
      expect(undone.json.warnings).toContain(
        "box/rel is a relative link: written again at rel to lead where it did (../far)",
      );
      for (let i = 0; i < 2; i++) expect((await cli(["undo"], vault)).code).toBe(0);
      expect([lstatSync(link), lstatSync(file), lstatSync(rel)].map((s) => s.isSymbolicLink())).toEqual([
        true,
        true,
        true,
      ]);
      expect(readlinkSync(rel)).toBe("../far");
      expect(keys().sort()).toEqual([link, file, rel].sort());
      expect(readFileSync(join(vault, "b.md"), "utf8")).toBe(
        "# B\n\n[s](outdir/s.md), [e](ext.md) and [f](rel/f.md)\n",
      );
      // What the link leads to is still never moved out of it, nor into it; nor a link inside it.
      const g2 = openGraph(locateVault({ root: vault }), DEFAULT_CONFIG, false);
      expect(() => planNoteRename(g2, "outdir/s.md", "s.md")).toThrow("outdir/s.md resolves outside the vault");
      expect(() => planNoteRename(g2, "a.md", "outdir/a.md")).toThrow("outdir/a.md would land outside the vault");
      symlinkSync(join(outer, "s.md"), join(outer, "inner.md"));
      const inner = { from: join(link, "inner.md"), to: join(vault, "inner.md"), dir: false, link: true };
      const plan = { kind: "note" as const, from: "outdir/inner.md", to: "inner.md", move: inner, files: [] };
      expect(() => applyPlan(g2, { ...plan, warnings: [], skipped: [] })).toThrow(
        "outdir/inner.md resolves outside the vault",
      );
      expect(lstatSync(join(outer, "inner.md")).isSymbolicLink()).toBe(true);
    }),
  );

  test(
    "in home, a file reached through a followed link is written through it, never over it: by a rename's relinking, and moving the link itself",
    homed(async (home) => {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
      writeFileSync(join(home, "a.md"), "# A\n");
      writeFileSync(join(top, "s.md"), "# S\n\nsee [a](a.md)\n");
      const ext = join(home, "ext.md");
      symlinkSync(join(top, "s.md"), ext);
      setLinkAnswer(ext, "follow");
      await probe(join(top, "s.md"));
      expect((await cli(["mv", "a.md", "z.md"], home)).code).toBe(0);
      expect(lstatSync(ext).isSymbolicLink()).toBe(true);
      expect(readFileSync(join(top, "s.md"), "utf8")).toBe("# S\n\nsee [a](z.md)\n");
      // The link moved, its own link rewritten from where it is now: in what it leads to.
      mkdirSync(join(home, "box"));
      expect((await cli(["mv", "ext.md", "box/"], home)).code).toBe(0);
      expect(lstatSync(join(home, "box", "ext.md")).isSymbolicLink()).toBe(true);
      expect(readFileSync(join(top, "s.md"), "utf8")).toBe("# S\n\nsee [a](../z.md)\n");
      expect(linkAnswer(join(home, "box", "ext.md"))).toBe("follow");
      expect((await cli(["undo"], home)).code).toBe(0);
      expect(lstatSync(ext).isSymbolicLink()).toBe(true);
      expect(readFileSync(join(top, "s.md"), "utf8")).toBe("# S\n\nsee [a](z.md)\n");
    }),
  );

  test(
    "a followed link to a vault, or to a folder holding one, isn't moved by its name: a vault's place is its real path",
    homed(async () => {
      const { recordLocation, rootAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
      const vault = join(top, "vault");
      const other = join(top, "other");
      const held = join(top, "holder", "v2");
      for (const d of [vault, other, held]) mkdirSync(join(d, ".slipbox"), { recursive: true });
      writeFileSync(join(other, "o.md"), "# O\n");
      writeFileSync(join(held, "h.md"), "# H\n");
      writeFileSync(join(vault, "a.md"), "# A\n\n[o](ov/o.md) and [h](hold/v2/h.md)\n");
      symlinkSync(other, join(vault, "ov"));
      symlinkSync(join(top, "holder"), join(vault, "hold"));
      for (const [link, target] of [
        ["ov", other],
        ["hold", join(top, "holder")],
      ] as const) {
        setLinkAnswer(join(vault, link), "follow");
        await probe(target);
      }
      for (const v of [other, vault]) recordLocation(rootAt(v));
      const roots = () =>
        readRoots()
          .map((r) => r.path)
          .sort();
      const before = roots();
      for (const [from, to] of [
        ["ov", "ov2"],
        ["hold", "held"],
      ] as const) {
        const r = await cli(["mv", from, to], vault);
        expect([r.code, r.json.error.message]).toEqual([5, `${from} resolves outside the vault`]);
        expect(lstatSync(join(vault, from)).isSymbolicLink()).toBe(true);
      }
      expect(roots()).toEqual(before);
      expect(readFileSync(join(vault, "a.md"), "utf8")).toBe("# A\n\n[o](ov/o.md) and [h](hold/v2/h.md)\n");
      // Carried out as a plan made before the link was there: refused as it's carried out.
      const g = openGraph(locateVault({ root: vault }), DEFAULT_CONFIG, false);
      const move = { from: join(vault, "ov"), to: join(vault, "ov2"), dir: true };
      const plan = { kind: "folder" as const, from: "ov", to: "ov2", move, files: [], warnings: [], skipped: [] };
      expect(() => applyPlan(g, { ...plan, vaults: [[move.from, move.to]] })).toThrow("ov resolves outside the vault");
      // Planned as a link, with the vault moving with it: still refused.
      const asLink = { ...plan, move: { ...move, link: true }, vaults: [[move.from, move.to]] as [string, string][] };
      expect(() => applyPlan(g, asLink)).toThrow("ov resolves outside the vault");
      expect(lstatSync(join(vault, "ov")).isSymbolicLink()).toBe(true);
    }),
  );

  test(
    "a file link moved where a link leading nowhere is: refused, nothing written; one shared with another name keeps its own links",
    homed(async (home) => {
      const { planNoteRename } = await import("../../../../src/core/workspace/mutations/rename/rename.ts");
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
      writeFileSync(join(home, "a.md"), "# A\n");
      writeFileSync(join(top, "s.md"), "# S\n\nsee [a](a.md)\n");
      writeFileSync(join(home, "b.md"), "# B\n\n[e](e1.md)\n");
      for (const n of ["e1.md", "e2.md"]) {
        symlinkSync(join(top, "s.md"), join(home, n));
        setLinkAnswer(join(home, n), "follow");
      }
      await probe(join(top, "s.md"));
      mkdirSync(join(home, "box"));
      // Planned, then a link leading nowhere put where it goes: carried out, refused, nothing written.
      const g = openGraph(locateVault({ root: home }), DEFAULT_CONFIG, false);
      const plan = planNoteRename(g, "e1.md", "box/e1.md");
      symlinkSync(join(top, "gone.md"), join(home, "box", "e1.md"));
      expect(() => applyPlan(g, plan)).toThrow("exists now; nothing changed");
      expect(readFileSync(join(home, "b.md"), "utf8")).toBe("# B\n\n[e](e1.md)\n");
      expect(lstatSync(join(home, "e1.md")).isSymbolicLink()).toBe(true);
      const there = await cli(["mv", "e1.md", "box/"], home);
      expect([there.code, there.json.error.message]).toEqual([5, "box/e1.md exists; not overwriting it"]);
      rmSync(join(home, "box", "e1.md"));
      // Where it can't be made (its folder can't be written), nothing is written either.
      chmodSync(join(home, "box"), 0o500);
      try {
        expect(() => applyPlan(g, plan)).toThrow("e1.md can't be moved (EACCES); nothing changed");
      } finally {
        chmodSync(join(home, "box"), 0o755);
      }
      expect(readFileSync(join(home, "b.md"), "utf8")).toBe("# B\n\n[e](e1.md)\n");
      // What it leads to is e2.md's too: its links are left as they are, and said.
      const moved = await cli(["mv", "e1.md", "box/"], home);
      expect(moved.code).toBe(0);
      expect(moved.json.warnings).toContain("e1.md: what it leads to is e2.md too: its own links left as they are");
      expect(readFileSync(join(top, "s.md"), "utf8")).toBe("# S\n\nsee [a](a.md)\n");
      expect(readFileSync(join(home, "b.md"), "utf8")).toBe("# B\n\n[e](box/e1.md)\n");
    }),
  );

  test(
    "undo moves back only what moved as it moved: a link put where a folder went isn't moved back as a link",
    homed(async () => {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
      const vault = join(top, "vault");
      const ext = join(top, "ext");
      mkdirSync(join(vault, ".slipbox"), { recursive: true });
      mkdirSync(join(vault, "a"));
      mkdirSync(ext);
      writeFileSync(join(vault, "a", "n.md"), "# N\n");
      writeFileSync(join(ext, "n.md"), "# N\n\nfrom outside\n");
      expect((await cli(["mv", "a", "b"], vault)).code).toBe(0);
      rmSync(join(vault, "b"), { recursive: true });
      symlinkSync(ext, join(vault, "b")); // a pull made it a link out
      const r = await cli(["undo"], vault);
      expect([r.code, r.json.error.message]).toEqual([
        5,
        "b resolves outside the vault: the move of a/ can't be undone",
      ]);
      expect([lstatSync(join(vault, "b")).isSymbolicLink(), existsSync(join(vault, "a"))]).toEqual([true, false]);
    }),
  );

  test(
    "a folder moved with a relative file link in it that leads out of it: the link's note left as it is, said — never written where the moved link leads",
    homed(async () => {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
      const vault = join(top, "vault");
      mkdirSync(join(vault, ".slipbox"), { recursive: true });
      mkdirSync(join(vault, "a", "docs"), { recursive: true });
      writeFileSync(join(vault, "a", "b.md"), "# B\n");
      // The note kept where the walk leaves it out, reached by its link only; beside the vault, where the link moved up
      // leads.
      writeFileSync(join(vault, ".slipbox", "config.toml"), '[walk]\nexclude = ["shelf/"]\n');
      mkdirSync(join(vault, "shelf"));
      writeFileSync(join(vault, "shelf", "kept.md"), "# Kept\n\n[b](../b.md)\n");
      mkdirSync(join(top, "shelf"));
      writeFileSync(join(top, "shelf", "kept.md"), "# Outside\n");
      symlinkSync("../../shelf/kept.md", join(vault, "a", "docs", "kept.md"));
      const r = await cli(["mv", "a/docs", "docs"], vault);
      expect(r.code).toBe(0);
      // Moved with its folder, the link leads elsewhere after: an edit for it is right for no name.
      expect(r.json.warnings).toContain(
        "a/docs/kept.md:3: a link moving with its folder leads elsewhere after: not rewritten",
      );
      expect(readFileSync(join(vault, "shelf", "kept.md"), "utf8")).toBe("# Kept\n\n[b](../b.md)\n");
      expect(readFileSync(join(top, "shelf", "kept.md"), "utf8")).toBe("# Outside\n");
      expect(lstatSync(join(vault, "docs", "kept.md")).isSymbolicLink()).toBe(true);
      // Undone, the folder back, nothing to give back: never read through the moved link.
      const undone = await cli(["undo"], vault);
      expect([undone.code, undone.json.error?.message]).toEqual([0, undefined]);
      expect(readFileSync(join(vault, "shelf", "kept.md"), "utf8")).toBe("# Kept\n\n[b](../b.md)\n");
      expect(readFileSync(join(top, "shelf", "kept.md"), "utf8")).toBe("# Outside\n");
      expect(lstatSync(join(vault, "a", "docs", "kept.md")).isSymbolicLink()).toBe(true);
    }),
  );

  test(
    "a link moved onto what it leads to, or onto another link to it, is refused: nothing is put over it",
    homed(async () => {
      const { vault, outer, link } = await linked();
      writeFileSync(join(vault, "img.png"), "PNG");
      symlinkSync("img.png", join(vault, "alias.png"));
      writeFileSync(join(vault, "b.md"), "# B\n\n[a](a.md)\n");
      symlinkSync("b.md", join(vault, "e.md"));
      const two = join(vault, "outdir2");
      symlinkSync(outer, two);
      setLinkAnswer(two, "follow");
      for (const [from, to, why] of [
        ["alias.png", "img.png", /^img\.png exists; not overwriting it$/],
        ["e.md", "b.md", /^b\.md exists; not overwriting it$/],
        // A folder there is one to go into, not itself: through the link, out of the vault — or, the walk listing the
        // other of two links to one folder, no folder of the index.
        ["outdir", "outdir2", /^(outdir2\/outdir would land outside the vault|no folder outdir in .*)$/],
      ] as const) {
        const r = await cli(["mv", from, to], vault);
        expect(r.code).toBe(5);
        expect(r.json.error?.message).toMatch(why);
      }
      expect(readFileSync(join(vault, "img.png"), "utf8")).toBe("PNG");
      expect(readFileSync(join(vault, "b.md"), "utf8")).toBe("# B\n\n[a](a.md)\n");
      for (const l of ["alias.png", "e.md", "outdir", "outdir2"])
        expect(lstatSync(join(vault, l)).isSymbolicLink()).toBe(true);
      expect([linkAnswer(link), linkAnswer(two)]).toEqual(["follow", "follow"]);
    }),
  );

  test(
    "in home, a folder moved with a followed link in it: the link's note left, said — not followed at its new place — and the move undone",
    homed(async (home) => {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
      mkdirSync(join(top, "out"));
      writeFileSync(join(top, "out", "s.md"), "# S\n\n[z](../z.md)\n");
      writeFileSync(join(home, "z.md"), "# Z\n");
      mkdirSync(join(home, "a"));
      symlinkSync(join(top, "out", "s.md"), join(home, "a", "l.md"));
      setLinkAnswer(join(home, "a", "l.md"), "follow");
      await probe(join(top, "out", "s.md"));
      const r = await cli(["mv", "a", "b/c/a"], home);
      expect(r.code).toBe(0);
      expect(r.json.warnings).toContain(
        "a/l.md:3: a followed link moving with its folder isn't followed at its new place: not rewritten",
      );
      expect(readFileSync(join(top, "out", "s.md"), "utf8")).toBe("# S\n\n[z](../z.md)\n");
      const undone = await cli(["undo"], home);
      expect([undone.code, undone.json.error?.message]).toEqual([0, undefined]);
      expect(lstatSync(join(home, "a", "l.md")).isSymbolicLink()).toBe(true);
    }),
  );

  test(
    "a folder moved with links in it, each judged by where it leads after, as the disk reads it: an absolute one into the folder left, said; a relative one through another link written",
    homed(async () => {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
      const vault = join(top, "vault");
      mkdirSync(join(vault, ".slipbox"), { recursive: true });
      writeFileSync(join(vault, ".slipbox", "config.toml"), '[walk]\nexclude = ["shelf/"]\n');
      writeFileSync(join(vault, "a.md"), "# A\n");
      // An absolute link to a note in the folder itself: it leads nowhere once the folder has moved.
      mkdirSync(join(vault, "box", "shelf"), { recursive: true });
      writeFileSync(join(vault, "box", "shelf", "t.md"), "# T\n\n[a](../a.md)\n");
      symlinkSync(join(vault, "box", "shelf", "t.md"), join(vault, "box", "l.md"));
      // A relative one whose way goes through another link and back up: it leads where it did.
      mkdirSync(join(vault, "shelf", "inner"), { recursive: true });
      writeFileSync(join(vault, "shelf", "u.md"), "# U\n\n[a](../a.md)\n");
      symlinkSync(join(vault, "shelf", "inner"), join(vault, "box", "lnk"));
      symlinkSync("lnk/../u.md", join(vault, "box", "c.md"));
      mkdirSync(join(vault, "deep"));
      const r = await cli(["mv", "box", "deep/box"], vault);
      expect(r.code).toBe(0);
      expect(r.json.warnings).toContain(
        "box/l.md:3: a link moving with its folder leads elsewhere after: not rewritten",
      );
      expect(readFileSync(join(vault, "deep", "box", "shelf", "t.md"), "utf8")).toBe("# T\n\n[a](../a.md)\n");
      expect(r.json.warnings.filter((w: string) => w.startsWith("box/c.md"))).toEqual([]);
      expect(readFileSync(join(vault, "shelf", "u.md"), "utf8")).toBe("# U\n\n[a](../../a.md)\n");
      const undone = await cli(["undo"], vault);
      expect([undone.code, undone.json.error?.message]).toEqual([0, undefined]);
      expect(readFileSync(join(vault, "shelf", "u.md"), "utf8")).toBe("# U\n\n[a](../a.md)\n");
    }),
  );

  test(
    "a folder moved with a followed link out in it: nothing read through the link at its new place, not followed there; a stale answer isn't one",
    homed(async () => {
      const { top, vault } = await linked();
      mkdirSync(join(top, "out2"));
      writeFileSync(join(top, "out2", "s.md"), "# S\n");
      mkdirSync(join(vault, "a"));
      symlinkSync(join(top, "out2"), join(vault, "a", "out"));
      setLinkAnswer(join(vault, "a", "out"), "follow");
      await probe(join(top, "out2"));
      writeFileSync(join(vault, "b.md"), "# B\n\n[s](a/out/s.md)\n");
      const g = openGraph(locateVault({ root: vault }), DEFAULT_CONFIG, false);
      expect(g.notes.has("a/out/s.md")).toBe(true);
      const { planFolderMove } = await import("../../../../src/core/workspace/mutations/rename/rename.ts");
      applyPlan(g, planFolderMove(g, "a", "c"));
      expect([...g.notes.keys()].filter((r) => r.startsWith("c/out/"))).toEqual([]);
      expect(g.skipped.some((x) => x.rel === "c/out")).toBe(true);
      // A link once followed elsewhere, its answer for another target now: not followed, so judged by where it leads.
      mkdirSync(join(vault, ".slipbox-free", "shelf"), { recursive: true });
      const shelf = join(vault, "shelf2");
      mkdirSync(shelf);
      writeFileSync(join(vault, ".slipbox", "config.toml"), '[walk]\nexclude = ["shelf2/"]\n');
      writeFileSync(join(shelf, "x.md"), "# X\n\n[b](../b.md)\n");
      mkdirSync(join(vault, "f"));
      symlinkSync(join(top, "out2", "s.md"), join(vault, "f", "l.md"));
      setLinkAnswer(join(vault, "f", "l.md"), "follow"); // kept for out2/s.md
      rmSync(join(vault, "f", "l.md"));
      symlinkSync(join(shelf, "x.md"), join(vault, "f", "l.md")); // re-pointed into the vault
      mkdirSync(join(vault, "deep"));
      const r = await cli(["mv", "f", "deep/f"], vault);
      expect(r.code).toBe(0);
      expect(r.json.warnings.filter((w: string) => w.includes("followed link moving"))).toEqual([]);
      expect(readFileSync(join(shelf, "x.md"), "utf8")).toBe("# X\n\n[b](../../b.md)\n");
    }),
  );

  test(
    "in home, an undo reads nothing through a link not followed: refused before it's read, said",
    homed(async (home) => {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
      mkdirSync(join(top, "out"));
      writeFileSync(join(top, "out", "s.md"), "# S\n\n[a](../a.md)\n");
      writeFileSync(join(home, "a.md"), "# A\n");
      mkdirSync(join(home, "box"));
      symlinkSync(join(top, "out"), join(home, "outdir"));
      setLinkAnswer(join(home, "outdir"), "follow");
      await probe(join(top, "out"));
      const shared = join(process.env.XDG_STATE_HOME!, "slipbox");
      const g0 = openGraph(locateVault({ root: home }), DEFAULT_CONFIG, false);
      mkdirSync(stateDir(g0.loc), { recursive: true });
      const move = async () => {
        chmodSync(shared, 0o500);
        try {
          expect((await cli(["mv", "outdir", "box/outdir"], home)).code).toBe(0);
        } finally {
          chmodSync(shared, 0o755);
        }
        expect(readFileSync(join(top, "out", "s.md"), "utf8")).toBe("# S\n\n[a](../../a.md)\n");
      };
      // The note it wrote is reached through the link, not followed at its new name: refused before it's read.
      await move();
      const r = await cli(["undo"], home);
      expect(r.code).toBe(5);
      expect(r.json.error.message).toBe(
        "outdir/s.md is reached through a link that isn't followed: the move of outdir/ can't be undone",
      );
    }),
  );

  test(
    "a link to an image moved by its name: nothing said of its own links, which it has none of",
    homed(async () => {
      const { vault } = await linked();
      writeFileSync(join(vault, "img.png"), "PNG");
      symlinkSync("img.png", join(vault, "alias.png"));
      mkdirSync(join(vault, "box"));
      const r = await cli(["mv", "alias.png", "box/"], vault);
      expect(r.code).toBe(0);
      expect(r.json.warnings.filter((w: string) => w.includes("its own links"))).toEqual([]);
    }),
  );

  test(
    "a followed link moved where its answer can't be kept: said, in the CLI's data too, and nothing read through it at its new name",
    homed(async () => {
      const { vault, outer, link } = await linked();
      writeFileSync(join(vault, "b.md"), "# B\n\n[s](outdir/s.md)\n");
      const shared = join(process.env.XDG_STATE_HOME!, "slipbox");
      const g = openGraph(locateVault({ root: vault }), DEFAULT_CONFIG, false);
      mkdirSync(stateDir(g.loc), { recursive: true }); // the vault's own, there from its first use: its log written
      const { planFolderMove } = await import("../../../../src/core/workspace/mutations/rename/rename.ts");
      const plan = planFolderMove(g, "outdir", "outlink");
      const heard: string[] = [];
      g.onChange((c) => {
        if ("path" in c && c.path.startsWith("outlink/")) heard.push(c.path);
      });
      chmodSync(shared, 0o500);
      try {
        expect(applyPlan(g, plan).warnings).toEqual([
          expect.stringContaining("the link moved, but its answer couldn't be kept for its new place (EACCES)"),
        ]);
      } finally {
        chmodSync(shared, 0o755);
      }
      expect(lstatSync(join(vault, "outlink")).isSymbolicLink()).toBe(true);
      expect([...g.notes.keys()].filter((r) => r.startsWith("outlink/"))).toEqual([]);
      expect(g.dirs.filter((d) => d === "outlink" || d.startsWith("outlink/"))).toEqual([]);
      expect(g.skipped.some((x) => x.rel === "outlink")).toBe(true); // a link of its own, not followed
      expect(heard).toEqual([]); // nothing read through it
      expect(linkAnswer(link, outer)).toBe("follow"); // where it was
      // Not followed at its new name, it isn't the index's to move: undone, it's back where its answer is, followed.
      expect((await cli(["undo"], vault)).code).toBe(0);
      expect(linkAnswer(link)).toBe("follow");
      // The command line's JSON says it in its data, as the plan's own warnings.
      chmodSync(shared, 0o500);
      try {
        const r = await cli(["mv", "outdir", "outlink"], vault);
        expect(r.code).toBe(0);
        expect(r.json.data.warnings).toEqual([
          expect.stringContaining("its answer couldn't be kept for its new place"),
        ]);
      } finally {
        chmodSync(shared, 0o755);
      }
    }),
  );

  test(
    "a vault reached through a followed link is named as before: its own config.toml written, not taken for a hidden folder",
    homed(async (home) => {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
      mkdirSync(join(top, "proj", ".slipbox"), { recursive: true });
      writeFileSync(join(top, "proj", ".slipbox", "config.toml"), '[vault]\nname = "proj"\n');
      writeFileSync(join(top, "proj", "n.md"), "# N\n");
      writeFileSync(join(home, "h.md"), "# H\n");
      symlinkSync(join(top, "proj"), join(home, "work"));
      setLinkAnswer(join(home, "work"), "follow");
      await probe(join(top, "proj"));
      const { planVaultRename } = await import("../../../../src/core/workspace/mutations/rename/rename.ts");
      const g = openGraph(locateVault({ root: home }), DEFAULT_CONFIG, false);
      applyPlan(g, planVaultRename(rootAt(join(home, "work")), "proj2"));
      expect(readFileSync(join(top, "proj", ".slipbox", "config.toml"), "utf8")).toContain('name = "proj2"');
      expect(lstatSync(join(top, "proj", ".slipbox", "config.toml")).isFile()).toBe(true);
    }),
  );

  test(
    "a followed link's case-only rename, as a disk that ignores case has it: the link moved, never refused through it",
    homed(async () => {
      const { top, vault } = await linked();
      // A folder of its own: the only link followed to it.
      mkdirSync(join(top, "case"));
      writeFileSync(join(top, "case", "c.md"), "# C\n");
      symlinkSync(join(top, "case"), join(vault, "Outer"));
      setLinkAnswer(join(vault, "Outer"), "follow");
      await probe(join(top, "case"));
      // A disk that ignores case gives `outer` for `Outer` itself; here, a second name for the link's own entry does.
      const ignoresCase = existsSync(join(vault, "OUTER"));
      if (!ignoresCase && process.platform !== "linux") return;
      if (!ignoresCase) linkSync(join(vault, "Outer"), join(vault, "outer"));
      const g = openGraph(locateVault({ root: vault }), DEFAULT_CONFIG, false);
      // The walk lists one of the names (where case is ignored, there's one): the rename goes to the other.
      const [from, to] = g.dirs.includes("Outer") ? ["Outer", "outer"] : ["outer", "Outer"];
      const { planFolderMove } = await import("../../../../src/core/workspace/mutations/rename/rename.ts");
      const plan = planFolderMove(g, from, to);
      expect(plan.move?.link).toBe(true);
      expect(outside(g, plan)).toBeNull();
      // The command line's own check of where it goes, too.
      const r = await cli(["mv", from, to], vault);
      expect([r.code, r.json.error?.message]).toEqual([0, undefined]);
    }),
  );

  test(
    "another name for a file is never looked for through a followed link whose target has stopped answering",
    homed(async () => {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
      const vault = join(top, "vault");
      mkdirSync(join(vault, ".slipbox"), { recursive: true });
      writeFileSync(join(vault, ".slipbox", "config.toml"), '[walk]\nexclude = ["shelf/"]\n');
      mkdirSync(join(vault, "shelf"));
      writeFileSync(join(vault, "a.md"), "# A\n");
      writeFileSync(join(vault, "shelf", "s.md"), "# S\n\n[a](a.md)\n");
      symlinkSync("shelf/s.md", join(vault, "e1.md"));
      // A second name for it, behind a followed link out of the vault.
      mkdirSync(join(top, "out"));
      symlinkSync(join(vault, "shelf", "s.md"), join(top, "out", "e2.md"));
      symlinkSync(join(top, "out"), join(vault, "q"));
      setLinkAnswer(join(vault, "q"), "follow");
      await probe(join(top, "out"));
      const { planNoteRename } = await import("../../../../src/core/workspace/mutations/rename/rename.ts");
      const g = openGraph(locateVault({ root: vault }), loadConfig({ vaultRoot: vault }).config, false);
      expect(planNoteRename(g, "a.md", "z.md").skipped.map((x) => x.reason)).toEqual([
        "reached as q/e2.md too, from another folder: not rewritten",
      ]);
      // Its target not answering now: nothing is read behind it, so that name isn't one this plan knows.
      forgetProbes();
      expect(planNoteRename(g, "a.md", "z.md").files.map((f) => f.shown)).toEqual(["e1.md"]);
    }),
  );

  test(
    "undo moves a note back only inside the vault: where a link out of it stands now, nothing is moved",
    homed(async () => {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-inside-")));
      const vault = join(top, "vault");
      const ext = join(top, "ext");
      mkdirSync(join(vault, ".slipbox"), { recursive: true });
      mkdirSync(join(vault, "notes"));
      mkdirSync(ext);
      writeFileSync(join(vault, "notes", "a.md"), "# A\n");
      expect((await cli(["mv", "notes/a.md", "b.md"], vault)).code).toBe(0);
      // The folder it came from is a link out of the vault now (a pull made it one).
      rmSync(join(vault, "notes"), { recursive: true });
      symlinkSync(ext, join(vault, "notes"));
      const r = await cli(["undo"], vault);
      expect(r.code).toBe(5);
      expect(r.json.error.message).toBe(
        "notes/a.md resolves outside the vault: the rename of notes/a.md can't be undone",
      );
      expect(existsSync(join(vault, "b.md"))).toBe(true);
      expect(readdirSync(ext)).toEqual([]);
      const g = openGraph(locateVault({ root: vault }), DEFAULT_CONFIG, false);
      expect(() => planUndo(g)).toThrow("resolves outside the vault");
    }),
  );
});
