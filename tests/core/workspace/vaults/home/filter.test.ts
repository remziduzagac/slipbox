import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import { DEFAULT_CONFIG } from "../../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../../src/core/workspace/graph/graph.ts";
import { homeAt } from "../../../../../src/core/workspace/vaults/vault.ts";

import { makeVaultSandbox } from "../../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("home, a vault without a marker (VV-D2)", () => {
  /** A home folder of its own: `files` in it, `$HOME` while `f` runs. */
  const withHome = async <T>(files: Record<string, string>, f: (home: string) => T | Promise<T>): Promise<T> => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-vhome-")));
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(dirname(join(home, rel)), { recursive: true });
      writeFileSync(join(home, rel), text);
    }
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      return await f(home);
    } finally {
      process.env.HOME = before;
    }
  };

  test("its skip list: hidden folders, the system's, Downloads, the busy folders, and what isn't a note or a text file; large notes listed, not read; no .gitignore", async () => {
    const { homeSkip, isBusyName, SlicedWalk, WalkFilter } = await import(
      "../../../../../src/core/workspace/walk/walk.ts"
    );
    const busy = ["node_modules", ".venv", "venv", "__pycache__", "target", "build", "dist", ".next", "vendor"];
    const busier = ["Pods", "DerivedData", ".gradle", ".tox", "cache", "Caches", ".cache", "pip-cache"];
    const files: Record<string, string> = {
      "a.md": "# A\n",
      "docs/b.md": "# B\n",
      "docs/plan.json": "{}\n",
      "docs/script.py": "print(1)\n",
      "docs/photo.png": "png",
      "docs/archive.zip": "zip",
      "docs/big.md": `# Big\n\n${"x".repeat(300)}\n`,
      ".config/c.md": "# C\n",
      ".local/share/s.md": "# S\n",
      "Downloads/d.md": "# D\n",
      "Library/l.md": "# L\n",
      "AppData/x.md": "# X\n",
      "work/.gitignore": "*\n",
      "work/w.md": "# W\n",
      "work/sub/Downloads/kept.md": "# a Downloads below the top is a folder like any\n",
      "repo/.git/HEAD": "ref: refs/heads/main\n",
      "repo/r.md": "# R\n",
      // A busy name with a note at its top is a folder like any (D237); home reads no .gitignore to say otherwise.
      "notes/build/plan.md": "# Plan\n",
    };
    for (const b of [...busy, ...busier]) files[`work/${b}/pkg/n.md`] = "# busy\n";
    await withHome(files, (home) => {
      const config = structuredClone(DEFAULT_CONFIG);
      config.walk.max_file_size = 200;
      const walk = (platform: string) => {
        const w = new SlicedWalk(home, new WalkFilter(home, config.walk, { home: true, platform }));
        while (w.step(50)) {}
        return w.result!;
      };
      const mac = walk("darwin");
      expect(mac.files.map((f) => f.rel)).toEqual([
        "AppData/x.md",
        "a.md",
        "docs/b.md",
        "notes/build/plan.md",
        "work/sub/Downloads/kept.md",
        "work/w.md",
      ]);
      // Text files are home's files; a picture, an archive aren't.
      expect(mac.assets.sort()).toEqual(["docs/plan.json", "docs/script.py"]);
      // A large note: listed, not read. A vault: a boundary, its own.
      expect(mac.skipped).toContainEqual({ rel: "docs/big.md", reason: expect.stringMatching(/^larger than/) });
      expect(mac.skipped).toContainEqual({ rel: "repo", reason: "nested vault" });
      expect(mac.dirs).not.toContain("Library");
      expect(walk("win32").files.map((f) => f.rel)).toEqual([
        "Library/l.md",
        "a.md",
        "docs/b.md",
        "notes/build/plan.md",
        "work/sub/Downloads/kept.md",
        "work/w.md",
      ]);
      // Each folder's reason, for the explorer's marks to say.
      expect(homeSkip(".config")).toBe("hidden");
      expect(homeSkip("Downloads")).toBe("Downloads");
      expect(homeSkip("Library", { platform: "darwin" })).toBe("system folder");
      expect(homeSkip("work/Library", { platform: "darwin" })).toBeNull();
      expect(homeSkip("x/dist")).toBeNull(); // the filter's, which looks into it
      const filter = new WalkFilter(home, config.walk, { home: true });
      expect(filter.exclusion("work/dist", true)).toBe("busy folder");
      expect(filter.exclusion("notes/build", true)).toBeNull();
      for (const b of [...busy, ...busier]) expect(isBusyName(b)).toBe(true);
      for (const b of ["notes", "docs", "src", "cached-notes", "Builds"]) expect(isBusyName(b)).toBe(false);
      // Named, a file the skip list leaves out is opened, and nothing more: never indexed.
      const g = openGraph(homeAt(home), config, true);
      for (const rel of [".config/c.md", "Downloads/d.md", "work/node_modules/pkg/n.md", "docs/photo.png"])
        expect(g.reachFile(rel, { keep: true })).toBe(false);
      expect(g.reachFile("docs/big.md")).toBe(false);
    });
  });

  test("its Downloads is where the desktop keeps it (user-dirs.dirs)", async () => {
    const { SlicedWalk, WalkFilter } = await import("../../../../../src/core/workspace/walk/walk.ts");
    const files = { "Téléchargements/t.md": "# T\n", "Downloads/d.md": "# D\n" };
    await withHome(files, (home) => {
      const config = join(home, "..", `${basename(home)}-config`);
      mkdirSync(config, { recursive: true });
      writeFileSync(join(config, "user-dirs.dirs"), 'XDG_DOWNLOAD_DIR="$HOME/Téléchargements"\n');
      const before = process.env.XDG_CONFIG_HOME;
      process.env.XDG_CONFIG_HOME = config;
      try {
        const w = new SlicedWalk(home, new WalkFilter(home, DEFAULT_CONFIG.walk, { home: true }));
        while (w.step(50)) {}
        expect(w.result!.files.map((f) => f.rel)).toEqual(["Downloads/d.md"]);
      } finally {
        process.env.XDG_CONFIG_HOME = before;
      }
    });
  });
});
