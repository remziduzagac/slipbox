import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, setSystemTime, test } from "bun:test";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
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
import { homeAt } from "../../../../../src/core/workspace/vaults/vault.ts";
import { probe, setLinkAnswer } from "../../../../../src/core/workspace/vaults/symlinks.ts";
import { walkHomeNow } from "../../../../../src/core/workspace/vaults/home.ts";
import { keptStamps, markKept, unwritten, restamp } from "../../../../support/home-walk.ts";

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
  const cli = async (args: string[], cwd: string) => {
    const out: string[] = [];
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

  test("its walk kept lists again a folder whose time differs from the walk's, set back too: cp -a, rsync -a, a clock behind (#12)", async () => {
    const { walkHomeNow, homeWalkFile } = await import("../../../../../src/core/workspace/vaults/home.ts");
    await withHome({ "a.md": "# A\n", "keep/k.md": "# K\n", "proj/p.md": "# P\n", "w/w.md": "# W\n" }, (home) => {
      const loc = homeAt(home);
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "keep", "proj", "w"]) utimesSync(join(home, d), hour, hour);
      walkHomeNow(loc, DEFAULT_CONFIG);
      const notes = () => [...openGraph(loc, DEFAULT_CONFIG, true).notes.keys()].sort();
      expect(notes()).toEqual(["a.md", "keep/k.md", "proj/p.md", "w/w.md"]);
      // A note come, its folder's time then set back to before the walk, as `rsync -a` or `cp -a` leave it.
      writeFileSync(join(home, "keep", "new.md"), "# New\n");
      const twoHours = new Date(Date.now() - 7_200_000);
      utimesSync(join(home, "keep"), twoHours, twoHours);
      expect(notes()).toEqual(["a.md", "keep/k.md", "keep/new.md", "proj/p.md", "w/w.md"]);
      // Kept so: the folder's stamp its time now, the others' as they were.
      expect(keptStamps(homeWalkFile(loc))).toMatchObject({
        "": hour.getTime(),
        keep: twoHours.getTime(),
        w: hour.getTime(),
      });
      // A disk whose clock is behind: the folder's time moved, but to before the walk.
      writeFileSync(join(home, "proj", "late.md"), "# Late\n");
      const behind = new Date(Date.now() - 30_000);
      utimesSync(join(home, "proj"), behind, behind);
      expect(notes()).toEqual(["a.md", "keep/k.md", "keep/new.md", "proj/late.md", "proj/p.md", "w/w.md"]);
      // A time set back, nothing in its folder changed: kept again all the same, with its new stamp, so that it isn't
      // listed again at every build. Set back from the walk's time, after its stamp (`cp -a` from a backup made since) …
      const halfHour = new Date(Date.now() - 1_800_000);
      utimesSync(join(home, "w"), halfHour, halfHour);
      expect(notes()).toEqual(["a.md", "keep/k.md", "keep/new.md", "proj/late.md", "proj/p.md", "w/w.md"]);
      expect(keptStamps(homeWalkFile(loc)).w).toBe(halfHour.getTime());
      // … or before its stamp.
      utimesSync(join(home, "w"), twoHours, twoHours);
      expect(notes()).toEqual(["a.md", "keep/k.md", "keep/new.md", "proj/late.md", "proj/p.md", "w/w.md"]);
      expect(keptStamps(homeWalkFile(loc)).w).toBe(twoHours.getTime());
      // Not listed again at the next build: a note taken out of the walk kept stays out.
      const file = homeWalkFile(loc);
      const before = readFileSync(file, "utf8");
      const kept = JSON.parse(before);
      writeFileSync(file, JSON.stringify({ ...kept, notes: kept.notes.filter((n: string) => n !== "w/w.md") }));
      expect(notes()).toEqual(["a.md", "keep/k.md", "keep/new.md", "proj/late.md", "proj/p.md"]);
      writeFileSync(file, before);
      // A note come, its folder's time put back to exactly its stamp: listed again all the same, its ctime moved.
      writeFileSync(join(home, "w", "put.md"), "# Put\n");
      utimesSync(join(home, "w"), twoHours, twoHours);
      expect(notes()).toEqual(["a.md", "keep/k.md", "keep/new.md", "proj/late.md", "proj/p.md", "w/put.md", "w/w.md"]);
      // Made a vault, its time set back as if nothing had come: it leaves home all the same.
      mkdirSync(join(home, "proj", ".git"));
      utimesSync(join(home, "proj"), twoHours, twoHours);
      expect(notes()).toEqual(["a.md", "keep/k.md", "keep/new.md", "w/put.md", "w/w.md"]);
      expect(openGraph(loc, DEFAULT_CONFIG, true).nestedRoots()).toEqual(["proj"]);
    });
  });

  test("a folder of home walked within two seconds of its change is listed again: a change its time can't tell apart is found (#12)", async () => {
    const { walkHomeNow, homeWalkFile } = await import("../../../../../src/core/workspace/vaults/home.ts");
    await withHome({ "notes/a.md": "# A\n" }, (home) => {
      const loc = homeAt(home);
      const notes = join(home, "notes");
      utimesSync(home, new Date(Date.now() - 3_600_000), new Date(Date.now() - 3_600_000));
      // Changed just before the walk: a coarse clock can give the next change the very same time. The clock held
      // still for the walk, so a slow run can't take it past the two seconds.
      const now = Date.now();
      const was = new Date(now - 100);
      utimesSync(notes, was, was);
      setSystemTime(new Date(now));
      try {
        walkHomeNow(loc, DEFAULT_CONFIG);
      } finally {
        setSystemTime();
      }
      expect(keptStamps(homeWalkFile(loc)).notes).toBe(-1);
      // A note come, the folder's time put back to the same: found (its ctime moved too, here; the -1 above is the
      // rule a file system with coarse times needs).
      writeFileSync(join(notes, "b.md"), "# B\n");
      utimesSync(notes, was, was);
      expect([...openGraph(loc, DEFAULT_CONFIG, true).notes.keys()].sort()).toEqual(["notes/a.md", "notes/b.md"]);
    });
  });

  test("a folder of home whose time is still its stamp isn't listed again, wherever walk.json has it (#12)", async () => {
    const { walkHomeNow, homeWalkFile } = await import("../../../../../src/core/workspace/vaults/home.ts");
    await withHome({ "a.md": "# A\n", "keep/k.md": "# K\n", "proj/p.md": "# P\n" }, (home) => {
      const loc = homeAt(home);
      // Each folder a time of its own, so a stamp given to the wrong folder would tell.
      const at = (min: number) => new Date(Date.now() - 3_600_000 - min * 60_000);
      const times = { "": at(0), keep: at(1), proj: at(2) };
      for (const [d, t] of Object.entries(times)) utimesSync(join(home, d), t, t);
      walkHomeNow(loc, DEFAULT_CONFIG);
      // Its folders and their stamps in another order, and its notes taken out: each stamp stays with its folder, so
      // none is listed again — one that was would bring its note back.
      const file = homeWalkFile(loc);
      const kept = JSON.parse(readFileSync(file, "utf8"));
      kept.dirs.push(kept.dirs.shift());
      kept.times.push(kept.times.shift());
      kept.notes = [];
      writeFileSync(file, JSON.stringify(kept));
      expect([...openGraph(loc, DEFAULT_CONFIG, true).notes.keys()]).toEqual([]);
    });
  });

  test("a walk kept without its folders' times (an earlier version's) is brought up to now as before, none taken as seen until it's listed (#12)", async () => {
    const { walkHomeNow, homeWalkFile } = await import("../../../../../src/core/workspace/vaults/home.ts");
    await withHome({ "a.md": "# A\n", "keep/k.md": "# K\n", "proj/p.md": "# P\n" }, (home) => {
      const loc = homeAt(home);
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "keep", "proj"]) utimesSync(join(home, d), hour, hour);
      walkHomeNow(loc, DEFAULT_CONFIG);
      const file = homeWalkFile(loc);
      const rewrite = (times: unknown) => {
        const kept = JSON.parse(readFileSync(file, "utf8"));
        if (times === undefined) delete kept.times;
        else kept.times = times;
        writeFileSync(file, JSON.stringify(kept));
      };
      const notes = () => [...openGraph(loc, DEFAULT_CONFIG, true).notes.keys()].sort();
      rewrite(undefined);
      expect(notes()).toEqual(["a.md", "keep/k.md", "proj/p.md"]);
      // A folder's time set back: not told from no change, as before — newer than the walk is what it goes by.
      writeFileSync(join(home, "keep", "new.md"), "# New\n");
      const twoHours = new Date(Date.now() - 7_200_000);
      utimesSync(join(home, "keep"), twoHours, twoHours);
      expect(notes()).toEqual(["a.md", "keep/k.md", "proj/p.md"]);
      // Another folder changed, so the walk is kept again: the one not listed isn't stamped as seen.
      writeFileSync(join(home, "proj", "q.md"), "# Q\n");
      expect(notes()).toEqual(["a.md", "keep/k.md", "proj/p.md", "proj/q.md"]);
      // `proj`, listed, is stamped (-1 if within two seconds of its change); `keep` stays unknown.
      const stamps = keptStamps(file);
      expect(stamps.keep).toBeNull();
      expect(typeof stamps.proj).toBe("number");
      // Times that don't match its folders say nothing: none known.
      rewrite([
        [1, 1],
        [2, 2],
      ]);
      expect(notes()).toEqual(["a.md", "keep/k.md", "proj/p.md", "proj/q.md"]);
      // Home walked again: every folder stamped, the note found.
      walkHomeNow(loc, DEFAULT_CONFIG);
      expect(notes()).toEqual(["a.md", "keep/k.md", "keep/new.md", "proj/p.md", "proj/q.md"]);
      expect(Object.values(keptStamps(file)).every((t) => typeof t === "number")).toBe(true);
    });
  });

  test("a folder's stamp: its mtime and ctime; to list again when either is too recent to tell a later change apart — its ctime only in whole seconds, a coarse clock's (#12)", async () => {
    const { RELIST, stampOf } = await import("../../../../../src/core/workspace/walk/walk.ts");
    const now = 1_800_000_000_000;
    const old = now - 3_600_000;
    expect(stampOf(old, old + 0.25, now)).toEqual([old, old + 0.25]);
    expect(stampOf(now - 100, old + 0.25, now)).toEqual(RELIST); // its mtime just now
    expect(stampOf(old, now - 999.75, now)).toEqual([old, now - 999.75]); // a fine ctime just now: a change moves it
    expect(stampOf(old, now - 1000, now)).toEqual(RELIST); // a coarse one just now: a change in its second might not
    expect(stampOf(old, now - 3000, now)).toEqual([old, now - 3000]); // a coarse one long enough ago
  });

  test("a folder listed again for its stamp alone is kept with its new stamp; one whose time moved on past the walk isn't (#12)", async () => {
    const { walkHomeNow, homeWalkFile } = await import("../../../../../src/core/workspace/vaults/home.ts");
    await withHome({ "a.md": "# A\n", "v/v.md": "# V\n", "w/w.md": "# W\n" }, (home) => {
      const loc = homeAt(home);
      const twoHours = new Date(Date.now() - 7_200_000);
      for (const d of ["", "v", "w"]) utimesSync(join(home, d), twoHours, twoHours);
      walkHomeNow(loc, DEFAULT_CONFIG);
      // As a walk made in slices leaves it: begun three hours back, its folders listed two hours back.
      const file = homeWalkFile(loc);
      const kept = JSON.parse(readFileSync(file, "utf8"));
      writeFileSync(file, JSON.stringify({ ...kept, walked: new Date(Date.now() - 3 * 3_600_000).toISOString() }));
      const notes = () => [...openGraph(loc, DEFAULT_CONFIG, true).notes.keys()].sort();
      // w's time moved on past the walk's start, nothing new in it (a shell's history written over): listed again at
      // each build, as "newer than the walk" listed it, the walk not kept again for it.
      const recent = new Date(Date.now() - 30_000);
      utimesSync(join(home, "w"), recent, recent);
      markKept(file);
      expect(notes()).toEqual(["a.md", "v/v.md", "w/w.md"]);
      expect(unwritten(file)).toBe(true);
      // v set back to before its stamp, still after the walk's start (`cp -a`): kept again, with its new stamp.
      const between = new Date(Date.now() - 2.5 * 3_600_000);
      utimesSync(join(home, "v"), between, between);
      expect(notes()).toEqual(["a.md", "v/v.md", "w/w.md"]);
      expect(keptStamps(file).v).toBe(between.getTime());
    });
  });

  test("a folder of home that can't be read is listed again at each build, the walk not kept again for it; readable, its notes come back (#12)", async () => {
    if (process.getuid?.() === 0) return; // root reads everything
    const { walkHomeNow, homeWalkFile } = await import("../../../../../src/core/workspace/vaults/home.ts");
    await withHome({ "a.md": "# A\n", "p/n.md": "# N\n" }, (home) => {
      const loc = homeAt(home);
      const p = join(home, "p");
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "p"]) utimesSync(join(home, d), hour, hour);
      walkHomeNow(loc, DEFAULT_CONFIG);
      const file = homeWalkFile(loc);
      const notes = () => [...openGraph(loc, DEFAULT_CONFIG, true).notes.keys()].sort();
      try {
        // Its ctime moved by the chmod: listed again, and it can't be read — to list again, its notes out meanwhile.
        chmodSync(p, 0o000);
        expect(notes()).toEqual(["a.md"]);
        expect(keptStamps(file).p).toBe(-1);
        // Listed again, still unreadable: nothing new to keep, the walk not written again.
        markKept(file);
        expect(notes()).toEqual(["a.md"]);
        expect(unwritten(file)).toBe(true);
        chmodSync(p, 0o755);
        expect(notes()).toEqual(["a.md", "p/n.md"]);
      } finally {
        chmodSync(p, 0o755);
      }
    });
  });

  test("a folder of home that can't be read when home is walked is tried again at each build; readable, its notes are found (#12)", async () => {
    if (process.getuid?.() === 0) return; // root reads everything
    const { walkHomeNow, homeWalkFile } = await import("../../../../../src/core/workspace/vaults/home.ts");
    await withHome({ "a.md": "# A\n", "p/n.md": "# N\n" }, (home) => {
      const loc = homeAt(home);
      const p = join(home, "p");
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "p"]) utimesSync(join(home, d), hour, hour);
      try {
        chmodSync(p, 0o000);
        walkHomeNow(loc, DEFAULT_CONFIG);
        // p isn't in the walk: the folder holding it, home's top, is stamped to list again, so p is tried again.
        const file = homeWalkFile(loc);
        expect(keptStamps(file)).toEqual({ "": -1 });
        const notes = () => [...openGraph(loc, DEFAULT_CONFIG, true).notes.keys()].sort();
        markKept(file);
        expect(notes()).toEqual(["a.md"]);
        expect(unwritten(file)).toBe(true); // tried again, still unreadable: the walk not written again
        // Readable: a chmod moves p's ctime alone, which the walk doesn't hold — found all the same.
        chmodSync(p, 0o755);
        expect(notes()).toEqual(["a.md", "p/n.md"]);
      } finally {
        chmodSync(p, 0o755);
      }
    });
  });

  test("a vault of home that's home's again, unreadable then, is tried again at each build; readable, its notes are found (#12)", async () => {
    if (process.getuid?.() === 0) return; // root reads everything
    const { walkHomeNow, homeWalkFile } = await import("../../../../../src/core/workspace/vaults/home.ts");
    await withHome({ "a.md": "# A\n", "proj/.git/HEAD": "ref: refs/heads/main\n", "proj/p.md": "# P\n" }, (home) => {
      const loc = homeAt(home);
      const proj = join(home, "proj");
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "proj"]) utimesSync(join(home, d), hour, hour);
      walkHomeNow(loc, DEFAULT_CONFIG);
      const notes = () => [...openGraph(loc, DEFAULT_CONFIG, true).notes.keys()].sort();
      expect(notes()).toEqual(["a.md"]); // proj a vault of its own
      try {
        // Its marker gone, and it can't be read (searched, not listed: its marker's absence still seen).
        rmSync(join(proj, ".git"), { recursive: true });
        chmodSync(proj, 0o311);
        expect(notes()).toEqual(["a.md"]);
        // Not in the walk: home's top, which holds it, to list again, so it's tried again.
        expect(keptStamps(homeWalkFile(loc))[""]).toBe(-1);
        chmodSync(proj, 0o755);
        expect(notes()).toEqual(["a.md", "proj/p.md"]);
      } finally {
        chmodSync(proj, 0o755);
      }
    });
  });

  test("a folder listed again whose folder can't be read keeps its own stamp: only the one in it is to list again (#12)", async () => {
    if (process.getuid?.() === 0) return; // root reads everything
    const { walkHomeNow, homeWalkFile } = await import("../../../../../src/core/workspace/vaults/home.ts");
    await withHome({ "a/n.md": "# N\n", "a/b/m.md": "# M\n" }, (home) => {
      const loc = homeAt(home);
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "a", "a/b"]) utimesSync(join(home, d), hour, hour);
      walkHomeNow(loc, DEFAULT_CONFIG);
      const ab = join(home, "a", "b");
      try {
        // A note in a, its time then set back, and a/b made unreadable: both listed again.
        writeFileSync(join(home, "a", "x.md"), "# X\n");
        const back = new Date(Date.now() - 7_200_000);
        utimesSync(join(home, "a"), back, back);
        chmodSync(ab, 0o000);
        expect([...openGraph(loc, DEFAULT_CONFIG, true).notes.keys()].sort()).toEqual(["a/n.md", "a/x.md"]);
        // a/b is to list again itself; a, which was read, keeps the stamp it was read with.
        const stamps = keptStamps(homeWalkFile(loc));
        expect(stamps["a/b"]).toBe(-1);
        expect(stamps.a).toBe(back.getTime());
      } finally {
        chmodSync(ab, 0o755);
      }
    });
  });

  test("a walk of home that couldn't read its top is no walk of home's to the command line: walked again at its next command (#12)", async () => {
    if (process.getuid?.() === 0) return; // root reads everything
    const { walkHomeNow, homeWalkFile, homeWalkKept } = await import(
      "../../../../../src/core/workspace/vaults/home.ts"
    );
    await withHome({ "a.md": "# A\n", "keep/k.md": "# K\n" }, async (home) => {
      const loc = homeAt(home);
      try {
        chmodSync(home, 0o311); // searched, not listed
        walkHomeNow(loc, DEFAULT_CONFIG);
      } finally {
        chmodSync(home, 0o755);
      }
      const file = homeWalkFile(loc);
      expect(JSON.parse(readFileSync(file, "utf8")).dirs).toEqual([]);
      expect(homeWalkKept(loc)).toBe(false);
      expect(homeWalkKept(loc, DEFAULT_CONFIG, true)).toBe(false);
      expect((await cli(["ls"], home)).code).toBe(0);
      expect(JSON.parse(readFileSync(file, "utf8")).notes).toEqual(["a.md", "keep/k.md"]);
    });
  });

  test("a folder of home that can't be looked at any more is tried again from the folder holding it, not dropped for good (#12)", async () => {
    if (process.getuid?.() === 0) return; // root reads everything
    const { walkHomeNow, homeWalkFile } = await import("../../../../../src/core/workspace/vaults/home.ts");
    await withHome({ "a/n.md": "# N\n", "a/b/m.md": "# M\n" }, (home) => {
      const loc = homeAt(home);
      const a = join(home, "a");
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "a", "a/b"]) utimesSync(join(home, d), hour, hour);
      walkHomeNow(loc, DEFAULT_CONFIG);
      const file = homeWalkFile(loc);
      const notes = () => [...openGraph(loc, DEFAULT_CONFIG, true).notes.keys()].sort();
      try {
        // a readable, not searched: a/b can't be statted, as a permission, a policy or a disk's error can have it. The
        // walk kept as if it had seen a so: a/b alone is lost, and a, which holds it, is to list again.
        chmodSync(a, 0o600);
        restamp(file, home, "a");
        expect(notes()).toEqual([]);
        expect(keptStamps(file).a).toBe(-1);
        chmodSync(a, 0o755);
        expect(notes()).toEqual(["a/b/m.md", "a/n.md"]);
      } finally {
        chmodSync(a, 0o755);
      }
    });
  });

  test("a walk of home that couldn't read its top is no walk of home's for a plan across it either: walked again (#12)", async () => {
    if (process.getuid?.() === 0) return; // root reads everything
    const { walkHomeNow } = await import("../../../../../src/core/workspace/vaults/home.ts");
    const { openVault } = await import("../../../../../src/core/workspace/links/reach.ts");
    await withHome({ "a.md": "# A\n", "keep/k.md": "# K\n" }, (home) => {
      const loc = homeAt(home);
      try {
        chmodSync(home, 0o311); // searched, not listed
        walkHomeNow(loc, DEFAULT_CONFIG);
      } finally {
        chmodSync(home, 0o755);
      }
      expect([...openVault(home).notes.keys()].sort()).toEqual(["a.md", "keep/k.md"]);
    });
  });

  test("a walk of home that couldn't read its top is no walk of home's to the TUI either: home's top shown, its walk made again (#12)", async () => {
    if (process.getuid?.() === 0) return; // root reads everything
    const { walkHomeNow, homeFilter, homeWalk } = await import("../../../../../src/core/workspace/vaults/home.ts");
    await withHome({ "a.md": "# A\n", "keep/k.md": "# K\n" }, (home) => {
      const loc = homeAt(home);
      try {
        chmodSync(home, 0o311); // searched, not listed
        walkHomeNow(loc, DEFAULT_CONFIG);
      } finally {
        chmodSync(home, 0o755);
      }
      // Readable again: home's top alone, as for a walk under other settings, home not walked yet.
      const h = homeWalk(loc, homeFilter(loc, DEFAULT_CONFIG));
      expect(h.walked).toBeNull();
      expect(h.walk.files.map((f) => f.rel)).toEqual(["a.md"]);
    });
  });

  test("a vault of home through a link the walk follows, its target away for a while (a disk taken away), is found again when it's back (#12)", async () => {
    const { walkHomeNow, homeWalkFile } = await import("../../../../../src/core/workspace/vaults/home.ts");
    await withHome({ "a.md": "# A\n" }, async (home) => {
      const loc = homeAt(home);
      const disk = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-disk-")));
      try {
        mkdirSync(join(disk, "proj", ".git"), { recursive: true });
        writeFileSync(join(disk, "proj", "p.md"), "# P\n");
        const lnk = join(home, "lnk");
        symlinkSync(join(disk, "proj"), lnk);
        setLinkAnswer(lnk, "follow");
        expect(await probe(join(disk, "proj"))).toBe(true);
        const hour = new Date(Date.now() - 3_600_000);
        utimesSync(home, hour, hour);
        walkHomeNow(loc, DEFAULT_CONFIG);
        const file = homeWalkFile(loc);
        expect(JSON.parse(readFileSync(file, "utf8")).skipped).toContainEqual({ rel: "lnk", reason: "nested vault" });
        const notes = () => [...openGraph(loc, DEFAULT_CONFIG, true).notes.keys()].sort();
        // The disk taken away: the link there, what it leads to not. Home's top, holding it, to list again, build after
        // build, the link looked at again each time.
        renameSync(join(disk, "proj"), join(disk, "proj-away"));
        expect(notes()).toEqual(["a.md"]);
        expect(notes()).toEqual(["a.md"]);
        expect(keptStamps(file)[""]).toBe(-1);
        // Back, its marker gone meanwhile: home's again, its note found.
        renameSync(join(disk, "proj-away"), join(disk, "proj"));
        rmSync(join(disk, "proj", ".git"), { recursive: true });
        expect(await probe(join(disk, "proj"))).toBe(true);
        expect(notes()).toEqual(["a.md", "lnk/p.md"]);
      } finally {
        rmSync(disk, { recursive: true, force: true });
      }
    });
  });

  test("a folder of home through a link the walk follows, its target not to be looked at when home's top is listed again, is found again once it can be (#12)", async () => {
    if (process.getuid?.() === 0) return; // root reads everything
    const { walkHomeNow, homeWalkFile } = await import("../../../../../src/core/workspace/vaults/home.ts");
    await withHome({ "a.md": "# A\n" }, async (home) => {
      const loc = homeAt(home);
      const disk = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-disk-")));
      try {
        mkdirSync(join(disk, "notes"));
        writeFileSync(join(disk, "notes", "n.md"), "# N\n");
        symlinkSync(join(disk, "notes"), join(home, "shelf"));
        setLinkAnswer(join(home, "shelf"), "follow");
        expect(await probe(join(disk, "notes"))).toBe(true);
        const hour = new Date(Date.now() - 3_600_000);
        utimesSync(home, hour, hour);
        walkHomeNow(loc, DEFAULT_CONFIG);
        const file = homeWalkFile(loc);
        const notes = () => [...openGraph(loc, DEFAULT_CONFIG, true).notes.keys()].sort();
        expect(notes()).toEqual(["a.md", "shelf/n.md"]);
        // The disk not searched; a note in home's top, its time then set back, so home's top is listed again while
        // what shelf leads to can't be looked at. Home's top to list again, build after build.
        chmodSync(disk, 0o600);
        writeFileSync(join(home, "b.md"), "# B\n");
        const twoHours = new Date(Date.now() - 7_200_000);
        utimesSync(home, twoHours, twoHours);
        expect(notes()).toEqual(["a.md", "b.md"]);
        expect(notes()).toEqual(["a.md", "b.md"]);
        expect(keptStamps(file)[""]).toBe(-1);
        // Searched again: shelf walked again, its note back.
        chmodSync(disk, 0o755);
        expect(await probe(join(disk, "notes"))).toBe(true);
        expect(notes()).toEqual(["a.md", "b.md", "shelf/n.md"]);
      } finally {
        chmodSync(disk, 0o755);
        rmSync(disk, { recursive: true, force: true });
      }
    });
  });

  test("a note of home through a link the walk follows, its target away for a while, has its folder listed again till it's back (#12)", async () => {
    const { walkHomeNow, homeWalkFile } = await import("../../../../../src/core/workspace/vaults/home.ts");
    await withHome({ "a.md": "# A\n" }, async (home) => {
      const loc = homeAt(home);
      const disk = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-disk-")));
      try {
        writeFileSync(join(disk, "far.md"), "# Far\n");
        symlinkSync(join(disk, "far.md"), join(home, "far.md"));
        setLinkAnswer(join(home, "far.md"), "follow");
        expect(await probe(join(disk, "far.md"))).toBe(true);
        const hour = new Date(Date.now() - 3_600_000);
        utimesSync(home, hour, hour);
        walkHomeNow(loc, DEFAULT_CONFIG);
        const file = homeWalkFile(loc);
        const notes = () => [...openGraph(loc, DEFAULT_CONFIG, true).notes.keys()].sort();
        expect(notes()).toEqual(["a.md", "far.md"]);
        // What far.md leads to taken away, home's top unchanged: home's top to list again all the same.
        renameSync(join(disk, "far.md"), join(disk, "far-away.md"));
        expect(notes()).toEqual(["a.md"]);
        expect(keptStamps(file)[""]).toBe(-1);
        renameSync(join(disk, "far-away.md"), join(disk, "far.md"));
        expect(notes()).toEqual(["a.md", "far.md"]);
      } finally {
        rmSync(disk, { recursive: true, force: true });
      }
    });
  });

  test("a vault home's again that home's cap left unreached isn't taken as unreadable: its folder not to list again for it (#12)", async () => {
    const { walkHomeNow, homeWalkFile, homeFilter, homeWalk } = await import(
      "../../../../../src/core/workspace/vaults/home.ts"
    );
    await withHome(
      { "a.md": "# A\n", "big/b0.md": "# B\n", "proj/.git/HEAD": "ref: refs/heads/main\n", "proj/p.md": "# P\n" },
      (home) => {
        const loc = homeAt(home);
        const hour = new Date(Date.now() - 3_600_000);
        for (const d of ["", "big", "proj"]) utimesSync(join(home, d), hour, hour);
        walkHomeNow(loc, DEFAULT_CONFIG);
        // big gets ten notes, listed again; proj's marker goes, home's again — after big, past a cap of five notes.
        for (let i = 1; i <= 10; i++) writeFileSync(join(home, "big", `n${i}.md`), "# N\n");
        rmSync(join(home, "proj", ".git"), { recursive: true });
        expect(homeWalk(loc, homeFilter(loc, DEFAULT_CONFIG), [], { notes: 5, folders: 100 }).capped).toBe("notes");
        // proj wasn't reached, not unreadable: home's top keeps its stamp.
        expect(keptStamps(homeWalkFile(loc))[""]).toBe(hour.getTime());
      },
    );
  });

  test("a note of home that can't be looked at any more has its folder tried again, not dropped for good (#12)", async () => {
    if (process.getuid?.() === 0) return; // root reads everything
    const { walkHomeNow, homeWalkFile } = await import("../../../../../src/core/workspace/vaults/home.ts");
    await withHome({ "a.md": "# A\n", "n/one.md": "# One\n", "n/two.md": "# Two\n" }, (home) => {
      const loc = homeAt(home);
      const n = join(home, "n");
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "n"]) utimesSync(join(home, d), hour, hour);
      walkHomeNow(loc, DEFAULT_CONFIG);
      const file = homeWalkFile(loc);
      const notes = () => [...openGraph(loc, DEFAULT_CONFIG, true).notes.keys()].sort();
      try {
        // n readable, not searched: its notes can't be statted, as a permission, a policy or a disk's error can have
        // it. The walk kept as if it had seen n so: its notes lost, n to list again.
        chmodSync(n, 0o600);
        restamp(file, home, "n");
        expect(notes()).toEqual(["a.md"]);
        expect(keptStamps(file).n).toBe(-1);
        // Listed again, its notes still not to be looked at: still to list again, not stamped as seen.
        expect(notes()).toEqual(["a.md"]);
        expect(keptStamps(file).n).toBe(-1);
        chmodSync(n, 0o755);
        expect(notes()).toEqual(["a.md", "n/one.md", "n/two.md"]);
      } finally {
        chmodSync(n, 0o755);
      }
    });
  });

  test("the command line walks home again, once, when its walk kept is an earlier version's, without folders' stamps (#12)", async () => {
    const { walkHomeNow, homeWalkFile, homeWalkKept } = await import(
      "../../../../../src/core/workspace/vaults/home.ts"
    );
    await withHome({ "a.md": "# A\n", "keep/k.md": "# K\n", "proj/p.md": "# P\n" }, async (home) => {
      const loc = homeAt(home);
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "keep", "proj"]) utimesSync(join(home, d), hour, hour);
      walkHomeNow(loc, DEFAULT_CONFIG);
      const file = homeWalkFile(loc);
      const kept = JSON.parse(readFileSync(file, "utf8"));
      delete kept.times;
      writeFileSync(file, JSON.stringify(kept));
      // A note come, its folder's time set back: a walk without stamps can't tell.
      writeFileSync(join(home, "keep", "new.md"), "# New\n");
      const twoHours = new Date(Date.now() - 7_200_000);
      utimesSync(join(home, "keep"), twoHours, twoHours);
      expect(homeWalkKept(loc, DEFAULT_CONFIG, true)).toBe(false);
      // Another folder changed (the TUI building home, say), so it's kept again: a stamp for that one, not for all.
      writeFileSync(join(home, "proj", "q.md"), "# Q\n");
      openGraph(loc, DEFAULT_CONFIG, true);
      expect(keptStamps(file).keep).toBeNull();
      expect(homeWalkKept(loc, DEFAULT_CONFIG, true)).toBe(false);
      // The next command walks home again, as the first one did: the note found, every folder stamped.
      expect((await cli(["ls"], home)).code).toBe(0);
      expect(JSON.parse(readFileSync(file, "utf8")).notes).toContain("keep/new.md");
      expect(Object.values(keptStamps(file)).every((t) => typeof t === "number")).toBe(true);
      expect(homeWalkKept(loc, DEFAULT_CONFIG, true)).toBe(true);
    });
  });

  test("a plan across home (openVault, the TUI's too) goes by its walk kept, an earlier version's as well: never walks home for want of its stamps (#12)", async () => {
    const { walkHomeNow, homeWalkFile, homeWalkKept } = await import(
      "../../../../../src/core/workspace/vaults/home.ts"
    );
    const { openVault } = await import("../../../../../src/core/workspace/links/reach.ts");
    await withHome({ "a.md": "# A\n", "keep/k.md": "# K\n" }, (home) => {
      const loc = homeAt(home);
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "keep"]) utimesSync(join(home, d), hour, hour);
      walkHomeNow(loc, DEFAULT_CONFIG);
      const file = homeWalkFile(loc);
      const { times: _, ...kept } = JSON.parse(readFileSync(file, "utf8"));
      writeFileSync(file, JSON.stringify(kept));
      expect(homeWalkKept(loc, DEFAULT_CONFIG)).toBe(true);
      expect([...openVault(home).notes.keys()].sort()).toEqual(["a.md", "keep/k.md"]);
      expect(JSON.parse(readFileSync(file, "utf8")).times).toBeUndefined();
    });
  });

  test("a folder of home listed again for a disk taken away, and unreadable then, is stamped to list again, not as seen (#12)", async () => {
    if (process.getuid?.() === 0) return; // root reads everything
    const { setMountTable } = await import("../../../../../src/core/workspace/vaults/mounts.ts");
    const { homeFilter, homeWalk, homeWalkFile } = await import("../../../../../src/core/workspace/vaults/home.ts");
    await withHome({ "p/n.md": "# N\n", "p/mnt/m.md": "# M\n" }, (home) => {
      const loc = homeAt(home);
      const p = join(home, "p");
      const mounts = [{ device: "server:/share", at: join(p, "mnt"), type: "nfs", options: "rw" }];
      setMountTable(() => mounts);
      try {
        const hour = new Date(Date.now() - 3_600_000);
        for (const d of ["", "p", "p/mnt"]) utimesSync(join(home, d), hour, hour);
        walkHomeNow(loc, DEFAULT_CONFIG);
        const notes = () => homeWalk(loc, homeFilter(loc, DEFAULT_CONFIG)).walk.files.map((f) => f.rel);
        expect(notes()).toEqual(["p/n.md"]);
        // The disk taken away, p's time unchanged: listed again for it — but it can't be read now. (The chmod moved
        // p's ctime: the walk kept as if it had seen p so, so that the disk alone lists it again.)
        mounts.length = 0;
        chmodSync(p, 0o000);
        restamp(homeWalkFile(loc), home, "p");
        expect(notes()).toEqual([]);
        expect(keptStamps(homeWalkFile(loc)).p).toBe(-1);
        // Readable again, its time as it was: listed again all the same, what it holds back.
        chmodSync(p, 0o755);
        expect(notes()).toEqual(["p/mnt/m.md", "p/n.md"]);
      } finally {
        chmodSync(p, 0o755);
        setMountTable(null);
      }
    });
  });
});
