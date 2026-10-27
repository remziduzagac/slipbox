import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runCli } from "../../../../../src/cli/cli.ts";
import { DEFAULT_CONFIG } from "../../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../../src/core/workspace/graph/graph.ts";
import { locateVault } from "../../../../../src/core/workspace/vaults/vault.ts";
import { probe, setLinkAnswer } from "../../../../../src/core/workspace/vaults/symlinks.ts";
import { homeWalkFile, walkHomeNow } from "../../../../../src/core/workspace/vaults/home.ts";
import { restamp } from "../../../../support/home-walk.ts";
import { makeVaultSandbox } from "../../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("reading and writing keep to the links of the place a path is in (VV-D6)", () => {
  const capture = async (argv: string[], cwd: string) => {
    let out = "";
    let err = "";
    const code = await runCli(argv, {
      out: (s) => (out += s),
      err: (s) => (err += s),
      stdin: async () => "",
      isTTY: false,
      columns: undefined,
      cwd,
      env: { ...process.env, NO_COLOR: "1" },
    });
    return { code, out, err };
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
  const put = (path: string, text: string) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  };
  /** Elsewhere's folder (outside home and every vault) and a folder beside it its links lead to. */
  const elsewhere = () => {
    const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-way-")));
    const e = join(top, "e");
    const apart = join(top, "apart");
    put(join(apart, "o.md"), "# Apart\n");
    put(join(e, "plain.md"), "# Plain\n");
    symlinkSync(apart, join(e, "od"));
    symlinkSync(join(apart, "o.md"), join(e, "of.md"));
    return { top, e, apart };
  };

  test(
    "in Elsewhere, every link from the folder you work in down asks: one on a path's way not followed is refused, read and write",
    homed(async () => {
      const { top, e, apart } = elsewhere();
      for (const [argv, cwd] of [
        [["read", "od/o.md"], e],
        [["read", join(e, "od", "o.md")], e],
        [["read", "e/od/o.md"], top],
        [["write", "od/o.md", "# Written"], e],
      ] as [string[], string][]) {
        const r = await capture(argv, cwd);
        expect(r.code).toBe(5);
        expect(r.err).toContain(`a link that isn't followed (${join(e, "od")} → ${apart})`);
      }
      expect(readFileSync(join(apart, "o.md"), "utf8")).toBe("# Apart\n");
      // Followed: read through, as the file system allows.
      setLinkAnswer(join(e, "od"), "follow");
      expect((await capture(["read", "od/o.md"], e)).out).toBe("# Apart\n");
      expect((await capture(["read", "plain.md"], e)).out).toBe("# Plain\n");
    }),
  );

  test(
    "in Elsewhere, a linked note named is refused — read, render, outline — however it's named",
    homed(async () => {
      const { top, e } = elsewhere();
      for (const [argv, cwd] of [
        [["read", "of.md"], e],
        [["render", "of.md"], e],
        [["outline", "of.md"], e],
        [["read", join(e, "of.md")], top],
      ] as [string[], string][]) {
        const r = await capture(argv, cwd);
        expect(r.code).toBe(5);
        expect(r.err).toContain("isn't followed");
      }
    }),
  );

  test(
    "a write that lands in a hidden folder of home, through a link followed in Elsewhere, is refused as home refuses it",
    homed(async (home) => {
      const { top } = elsewhere();
      put(join(home, ".config", "tool", "settings.md"), "# Settings\n");
      put(join(home, "notes", "n.md"), "# N\n");
      const unpacked = join(top, "unpacked");
      put(join(unpacked, "README.md"), "# Readme\n");
      symlinkSync(home, join(unpacked, "docs"));
      setLinkAnswer(join(unpacked, "docs"), "follow");
      const r = await capture(["write", "docs/.config/tool/settings.md", "# Changed"], unpacked);
      expect(r.code).toBe(5);
      expect(r.err).toContain("it lands in a folder the walk doesn't list");
      expect(readFileSync(join(home, ".config", "tool", "settings.md"), "utf8")).toBe("# Settings\n");
      // As named in home itself.
      expect((await capture(["write", ".config/tool/settings.md", "# Changed"], home)).code).toBe(5);
      // A note of home's where the walk lists it: written through the link followed.
      expect((await capture(["write", "docs/notes/n.md", "# Rewritten"], unpacked)).code).toBe(0);
      expect(readFileSync(join(home, "notes", "n.md"), "utf8")).toBe("# Rewritten\n");
    }),
  );

  test(
    "a new note that lands in a busy folder of home, through a link followed in Elsewhere, is refused as home refuses it",
    homed(async (home) => {
      const { top } = elsewhere();
      put(join(home, "work", "node_modules", "pkg", "README.md"), "# Pkg\n"); // no note at its top: busy
      put(join(home, "notes", "n.md"), "# N\n");
      const unpacked = join(top, "unpacked");
      put(join(unpacked, "README.md"), "# Readme\n");
      symlinkSync(home, join(unpacked, "docs"));
      setLinkAnswer(join(unpacked, "docs"), "follow");
      const r = await capture(["write", "docs/work/node_modules/pkg/x.md", "text", "--create"], unpacked);
      expect(r.code).toBe(5);
      expect(r.err).toContain("it lands in a busy folder, which its vault doesn't index");
      expect(existsSync(join(home, "work", "node_modules", "pkg", "x.md"))).toBe(false);
      // As named in home itself.
      expect((await capture(["write", "work/node_modules/pkg/x.md", "text", "--create"], home)).code).toBe(5);
      // Where home indexes it: written through the link followed.
      expect((await capture(["write", "docs/notes/m.md", "text", "--create"], unpacked)).code).toBe(0);
      expect(existsSync(join(home, "notes", "m.md"))).toBe(true);
    }),
  );

  test(
    "capture --snippet reads a file as read does: never through a link not followed, nor anything but a regular file",
    homed(async () => {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-snip-")));
      const vault = join(top, "vault");
      const apart = join(top, "apart");
      put(join(vault, ".slipbox", "config.toml"), "");
      put(join(vault, "a.md"), "# A\n");
      put(join(apart, "kept.md"), "# Kept apart\nsecond line\n");
      symlinkSync(join(apart, "kept.md"), join(vault, "fl.md"));
      symlinkSync(apart, join(vault, "od"));
      for (const ref of ["fl.md:1", "od/kept.md:1-2"]) {
        const r = await capture(["capture", "hi", "--ref", ref, "--snippet"], vault);
        expect(r.code).toBe(5);
        expect(r.err).toContain("isn't followed");
      }
      expect((await capture(["scratch"], vault)).out).not.toContain("Kept apart");
      // A device: refused at once, never read without end.
      const dev = await capture(["capture", "hi", "--ref", "/dev/zero:1", "--snippet"], vault);
      expect(dev.code).toBe(3);
      expect(dev.err).toContain("not a regular file");
    }),
  );

  test(
    "home's warm start keeps a followed file link only while it leads where it was followed to: pointed elsewhere, it asks again",
    homed(async (home) => {
      const ext = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-ext-")));
      put(join(ext, "a.md"), "# A\n\nalpha\n");
      put(join(ext, "b.md"), "# B\n\nbravo\n");
      put(join(home, "notes", "n.md"), "# N\n");
      const link = join(home, "notes", "x.md");
      symlinkSync(join(ext, "a.md"), link);
      setLinkAnswer(link, "follow");
      await probe(join(ext, "a.md"));
      const loc = locateVault({ path: home, cwd: home });
      const longAgo = new Date(Date.now() - 86_400_000);
      for (const d of [home, join(home, "notes")]) utimesSync(d, longAgo, longAgo);
      walkHomeNow(loc, DEFAULT_CONFIG);
      const notes = () => [...openGraph(loc, DEFAULT_CONFIG, false).notes.keys()].sort();
      expect(notes()).toEqual(["notes/n.md", "notes/x.md"]);
      // Pointed elsewhere, its folder unchanged as far as the walk kept knows: never indexed through it.
      rmSync(link);
      symlinkSync(join(ext, "b.md"), link);
      restamp(homeWalkFile(loc), home, "notes");
      expect(notes()).toEqual(["notes/n.md"]);
      const read = await capture(["read", "notes/x.md"], home);
      expect(read.code).toBe(5);
      expect(read.out).not.toContain("bravo");
    }),
  );

  test(
    "in home, a note's text, a new note and a folder go through a followed link; a move, copy or delete across it is refused",
    homed(async (home) => {
      const ext = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-ext-")));
      put(join(ext, "a.md"), "# A\n");
      put(join(ext, "b.md"), "# B\n");
      put(join(home, "n.md"), "# N\n");
      symlinkSync(ext, join(home, "data"));
      setLinkAnswer(join(home, "data"), "follow");
      await probe(ext);
      expect((await capture(["write", "data/a.md", "# Edited"], home)).code).toBe(0);
      expect(readFileSync(join(ext, "a.md"), "utf8")).toBe("# Edited\n");
      expect((await capture(["write", "data/new.md", "# New", "--create"], home)).code).toBe(0);
      expect(existsSync(join(ext, "new.md"))).toBe(true);
      expect((await capture(["mkdir", "data/sub"], home)).code).toBe(0);
      expect(existsSync(join(ext, "sub"))).toBe(true);
      for (const [argv, said] of [
        [["rm", "data/b.md"], "data/b.md resolves outside the vault"],
        [["cp", "n.md", "data/n-copy.md"], "data/n-copy.md would land outside the vault"],
        [["mv", "n.md", "data/n.md"], "data/n.md would land outside the vault"],
      ] as [string[], string][]) {
        const r = await capture(argv, home);
        expect(r.code).toBe(5);
        expect(r.err).toContain(said);
      }
      expect(existsSync(join(ext, "b.md"))).toBe(true);
      expect(existsSync(join(home, "n.md"))).toBe(true);
      expect(readdirSync(ext).sort()).toEqual(["a.md", "b.md", "new.md", "sub"]);
    }),
  );
});
