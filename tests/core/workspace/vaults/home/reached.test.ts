import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { DEFAULT_CONFIG } from "../../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../../src/core/workspace/graph/graph.ts";
import { homeAt } from "../../../../../src/core/workspace/vaults/vault.ts";
import { walkHomeNow } from "../../../../../src/core/workspace/vaults/home.ts";
import { restamp } from "../../../../support/home-walk.ts";

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

  test("a folder asked for that a capped walk listed is walked whole: what's deeper wasn't listed", async () => {
    const { AutoIndex } = await import("../../../../../src/core/workspace/graph/autoindex.ts");
    const { homeFilter, homeWalk } = await import("../../../../../src/core/workspace/vaults/home.ts");
    await withHome({ "notes/inbox.md": "[d](sub/deep.md)\n", "notes/sub/deep.md": "# D\n" }, (home) => {
      const loc = homeAt(home);
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "notes", "notes/sub"]) utimesSync(join(home, d), hour, hour);
      const job = new AutoIndex(home, null, () => Date.now(), { vaults: false, limits: { notes: 100, folders: 2 } });
      while (job.step(50)) {}
      expect(job.status.capped).toBe("folders");
      const w = homeWalk(loc, homeFilter(loc, DEFAULT_CONFIG), ["notes"]);
      expect(w.walk.files.map((f) => f.rel)).toEqual(["notes/inbox.md", "notes/sub/deep.md"]);
      expect(new Set(w.walk.dirs).size).toBe(w.walk.dirs.length);
    });
  });

  test("a folder asked for, home's index full: the folder whole, home's own deepest notes left out to hold the cap", async () => {
    const { describeCap, homeFilter, homeWalk } = await import("../../../../../src/core/workspace/vaults/home.ts");
    const notes = ["a.md", "b.md", "x/c.md", "x/d.md", "x/y/e.md", "x/y/f.md", "w/notes/n1.md", "w/notes/n2.md"];
    const files = Object.fromEntries([...notes, "w/notes/sub/n3.md", "w/notes/sub/n4.md"].map((f) => [f, "# N\n"]));
    await withHome(files, (home) => {
      const loc = homeAt(home);
      const limits = { notes: 8, folders: 100 };
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "w", "w/notes", "w/notes/sub", "x", "x/y"]) utimesSync(join(home, d), hour, hour);
      // Home's own walk, breadth first, full before it reaches w/notes/sub.
      expect(walkHomeNow(loc, DEFAULT_CONFIG, limits).walk.files.map((f) => f.rel)).toEqual([...notes].sort());
      const w = homeWalk(loc, homeFilter(loc, DEFAULT_CONFIG), ["w/notes"], limits);
      // At the cap still: every note of the folder asked for, and home's own as far as the room left — x/y's, the
      // deepest, left out.
      expect(w.walk.files.map((f) => f.rel)).toEqual([
        "a.md",
        "b.md",
        "w/notes/n1.md",
        "w/notes/n2.md",
        "w/notes/sub/n3.md",
        "w/notes/sub/n4.md",
        "x/c.md",
        "x/d.md",
      ]);
      expect(w.capped).toBe("notes");
      expect(w.asked).toEqual({ folders: ["w/notes"], notes: 4 });
      // Said as the cap is, the folder said to be whole.
      expect(describeCap("notes", w.asked)).toBe(
        "home's index is full: it holds 10,000 notes, those nearest the top — the rest aren't indexed; ~/w/notes, the folder open, is whole",
      );
      expect(describeCap("folders", { folders: ["a", "b"], notes: 2 })).toBe(
        "home's walk stopped at 5,000 folders, those nearest the top — the notes deeper aren't indexed; ~/a and ~/b, the folders open, are whole",
      );
    });
  });

  test("a folder asked for that home's walk covers stays whole when another asked for needs room", async () => {
    const { homeFilter, homeWalk, homeWalkFile } = await import("../../../../../src/core/workspace/vaults/home.ts");
    const notes = ["top.md", "a/x/y/deep1.md", "a/x/y/deep2.md", "o/p.md", "o/q/r.md"];
    await withHome(Object.fromEntries(notes.map((f) => [f, "# N\n"])), (home) => {
      const loc = homeAt(home);
      const limits = { notes: 5, folders: 100 };
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "a", "a/x", "a/x/y", "o", "o/q"]) utimesSync(join(home, d), hour, hour);
      // Exactly at the cap: nothing left out, every folder covered.
      expect(walkHomeNow(loc, DEFAULT_CONFIG, limits).capped).toBeNull();
      // b comes after, the walk kept as if it had seen home with it: home's walk doesn't see it, so it's walked when
      // asked for.
      for (const n of ["b/n1.md", "b/n2.md"]) {
        mkdirSync(dirname(join(home, n)), { recursive: true });
        writeFileSync(join(home, n), "# N\n");
      }
      restamp(homeWalkFile(loc), home, "");
      const w = homeWalk(loc, homeFilter(loc, DEFAULT_CONFIG), ["a", "b"], limits);
      // Home's walk kept, uncapped, covers a: kept whole from it, not walked again.
      expect(JSON.parse(readFileSync(homeWalkFile(loc), "utf8")).capped).toBeNull();
      // a's notes, the deepest in home, stay: home's own make room for b's.
      expect(w.walk.files.map((f) => f.rel)).toEqual([
        "a/x/y/deep1.md",
        "a/x/y/deep2.md",
        "b/n1.md",
        "b/n2.md",
        "top.md",
      ]);
      expect(w.capped).toBe("notes");
      expect(w.asked).toEqual({ folders: ["a", "b"], notes: 4 });
    });
  });

  test("a folder asked for that alone holds more than home's cap: walked whole all the same, home's own all left out", async () => {
    const { describeCap, homeFilter, homeWalk } = await import("../../../../../src/core/workspace/vaults/home.ts");
    const notes = ["a.md", "big/1.md", "big/2.md", "big/s/3.md", "big/s/t/4.md", "big/u/5.md"];
    await withHome(Object.fromEntries(notes.map((f) => [f, "# N\n"])), (home) => {
      const loc = homeAt(home);
      const limits = { notes: 3, folders: 3 };
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "big", "big/s", "big/s/t", "big/u"]) utimesSync(join(home, d), hour, hour);
      expect(walkHomeNow(loc, DEFAULT_CONFIG, limits).capped).toBe("notes");
      const w = homeWalk(loc, homeFilter(loc, DEFAULT_CONFIG), ["big"], limits);
      // Past both caps, every note and folder of it.
      expect(w.walk.files.map((f) => f.rel)).toEqual(notes.slice(1));
      expect(w.walk.dirs).toEqual(expect.arrayContaining(["big", "big/s", "big/s/t", "big/u"]));
      expect(w.capped).toBe("notes");
      expect(w.asked).toEqual({ folders: ["big"], notes: 5 });
      expect(describeCap("notes", { folders: ["big"], notes: 12_345 })).toBe(
        "home's index is full: it holds 12,345 notes, all in ~/big, the folder open — the rest aren't indexed",
      );
    });
  });

  test("a note made in a folder asked for, home's index full: taken in, home's deepest own note left out for it", async () => {
    const { applyToGraph } = await import("../../../../../src/core/workspace/vaults/vault-feed.ts");
    await withHome({ "a.md": "# A\n", "x/y/deep.md": "# D\n", "w/notes/n.md": "# N\n" }, (home) => {
      walkHomeNow(homeAt(home), DEFAULT_CONFIG);
      const g = openGraph(homeAt(home), DEFAULT_CONFIG, true, "lazy");
      g.askFolders([join(home, "w", "notes")]);
      expect(g.askedFolders).toEqual(["w/notes"]);
      for (const n of ["z.md", "w/notes/new.md"]) writeFileSync(join(home, n), "# N\n");
      const created = (rel: string) => ({ rel, kind: "created" as const, isNote: true });
      // Home holds 3 at most here: z.md, home's own, is left to its walk; new.md comes, x/y/deep.md making room.
      applyToGraph(g, { changes: ["z.md", "w/notes/new.md"].map(created), rescan: false }, 1e9, 3);
      expect([...g.notes.keys()].sort()).toEqual(["a.md", "w/notes/n.md", "w/notes/new.md"]);
    });
  });
});
