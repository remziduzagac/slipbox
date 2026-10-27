import { describe, expect, spyOn, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { type Config, DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { type ListOverlay, App } from "../../../../src/tui/app/runtime/app.ts";
import { makeSandbox, makeVault, harness, stepToEnd, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
const sandbox = makeSandbox();

describe("the background auto-index in the TUI (20.9)", () => {
  test("it works only while nobody is: no key or click here, no agent's command, this vault indexed; and it can be off", async () => {
    const { activityFile } = await import("../../../../src/core/workspace/graph/autoindex.ts");
    const h = await harness({ config: (c) => (c.index.background = true) }); // off in tests unless asked
    const quiet = h.app.config.index.idle_seconds * 1000;
    const now = Date.now();
    writeFileSync(activityFile(), "0\n");
    utimesSync(activityFile(), new Date(now - 2 * quiet), new Date(now - 2 * quiet));
    h.app.lastInputAt = now - 2 * quiet;
    expect(h.app.watch.autoIndexDue(now)).toBe(true);
    await h.keys("j"); // a key now
    expect(h.app.watch.autoIndexDue(Date.now())).toBe(false);
    h.app.lastInputAt = now - 2 * quiet;
    utimesSync(activityFile(), new Date(now), new Date(now)); // an agent just ran a command
    expect(h.app.watch.autoIndexDue(now)).toBe(false);
    utimesSync(activityFile(), new Date(now - 2 * quiet), new Date(now - 2 * quiet));
    h.app.indexing = 3; // this vault's own index first
    expect(h.app.watch.autoIndexDue(now)).toBe(false);
    h.app.indexing = 0;
    h.app.config.index.background = false;
    expect(h.app.watch.autoIndexDue(now)).toBe(false);
  });

  test("home the vault open (VV-D2): its walk and index made while nobody works, the background index off — then its notes have their backlinks", async () => {
    const { homeAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const home = realpathSync(mkdtempSync(join(sandbox, "home-")));
    mkdirSync(join(home, "deep", "er"), { recursive: true });
    writeFileSync(join(home, "a.md"), "# A\n");
    writeFileSync(join(home, "deep", "er", "b.md"), "[a](../../a.md)\n");
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const h = await harness({ loc: homeAt(home), open: "a.md" });
      // Not walked yet: its top alone.
      expect(h.app.graph.home?.walked).toBeNull();
      expect(h.app.graph.backlinks("a.md")).toEqual([]);
      const job = h.app.watch.indexJob();
      expect(job?.root).toBe(home);
      await stepToEnd(job!);
      await h.app.watch.homeRefreshed;
      expect(h.app.graph.home?.walked).not.toBeNull();
      expect(h.app.graph.backlinks("a.md").map((b) => b.from)).toEqual(["deep/er/b.md"]);
      // In a vault, the background index off: nothing works while nobody does.
      const v = await harness({});
      expect(v.app.watch.indexJob()).toBeNull();
    } finally {
      process.env.HOME = before;
    }
  });

  /** Until `ok`, or `ms` gone by: the watcher's batches come in their own time. */
  const until = async (ok: () => boolean, ms = 25_000) => {
    const end = Date.now() + ms;
    while (!ok() && Date.now() < end) await Bun.sleep(20);
  };

  test("home never walked, its watcher leaves what the walk is to look into (VV-D2): a note saved in a folder of home comes, nothing a folder down; a folder come into home's top is listed and watched, its folders the walk's, nothing dropped (#16)", async () => {
    const { homeAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const home = realpathSync(mkdtempSync(join(sandbox, "home-")));
    mkdirSync(join(home, "Documents", "d0", "sub"), { recursive: true });
    writeFileSync(join(home, "a.md"), "# A\n");
    writeFileSync(join(home, "Documents", "d0", "sub", "n.md"), "# N\n");
    const hour = new Date(Date.now() - 3_600_000);
    for (const d of ["", "Documents"]) utimesSync(join(home, d), hour, hour);
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const h = await harness({
        loc: homeAt(home),
        open: "a.md",
        watch: true,
        config: (c) => ((c.watch.debounce_ms = 20), (c.watch.poll_ms = 50)),
      });
      try {
        expect(h.app.graph.home?.walked).toBeNull();
        expect(h.app.graph.dirs).toEqual(["", "Documents"]);
        writeFileSync(join(home, "Documents", "letter.md"), "# Letter\n");
        await until(() => h.app.graph.notes.has("Documents/letter.md"));
        // Dated back, as if saved a while ago: Documents settles, listed again no more.
        utimesSync(join(home, "Documents"), hour, hour);
        await Bun.sleep(300); // ticks enough to list Documents again
        expect([...h.app.graph.notes.keys()].sort()).toEqual(["Documents/letter.md", "a.md"]);
        mkdirSync(join(home, "cloned", "x"), { recursive: true });
        writeFileSync(join(home, "cloned", "x", "deep.md"), "# Deep\n");
        await until(() => h.app.graph.dirs.includes("cloned"));
        await Bun.sleep(300);
        expect(h.app.graph.dirs).toEqual(["", "Documents", "cloned"]);
        expect(h.app.explorer.treeRows().find((r) => r.path === "cloned")).toBeDefined();
        // Named in a batch held while git wrote, a folder become a vault since is neither listed nor watched.
        mkdirSync(join(home, "vaulted", ".slipbox"), { recursive: true });
        const watched = h.app.watcher!.watchedCount;
        h.app.watch.applyChanges({ changes: [], rescan: false, toWalk: ["vaulted"] });
        expect(h.app.graph.dirs).not.toContain("vaulted");
        expect(h.app.watcher!.watchedCount).toBe(watched);
        // Listed, not built again: what came before stays.
        expect([...h.app.graph.notes.keys()].sort()).toEqual(["Documents/letter.md", "a.md"]);
        // And watched: a note saved in it comes.
        writeFileSync(join(home, "cloned", "top.md"), "# Top\n");
        await until(() => h.app.graph.notes.has("cloned/top.md"));
        await Bun.sleep(300);
        expect([...h.app.graph.notes.keys()].sort()).toEqual(["Documents/letter.md", "a.md", "cloned/top.md"]);
        // A batch both rescanning and naming (two merged while git wrote; its graph built again): the name forgotten
        // all the same.
        const left = (h.app.watcher as unknown as { left: Map<string, boolean> }).left;
        left.set("vaulted", true);
        h.app.watch.applyChanges({ changes: [], rescan: true, toWalk: ["vaulted"] });
        expect(left.has("vaulted")).toBe(false);
        // Walked, while nobody works (here at once): every note of home's. Its walks are on their own thread: stepped
        // as the TUI steps them, their answers awaited — a loop that never yields never gets one, and spins for good.
        const job = h.app.watch.indexJob();
        await stepToEnd(job!);
        await h.app.watch.homeRefreshed;
        expect(h.app.graph.home?.walked).not.toBeNull();
        expect([...h.app.graph.notes.keys()].sort()).toEqual([
          "Documents/d0/sub/n.md",
          "Documents/letter.md",
          "a.md",
          "cloned/top.md",
          "cloned/x/deep.md",
        ]);
        // A batch naming a folder, held while git wrote and applied once home is walked: home has it already — nothing
        // listed, no walk asked for again.
        mkdirSync(join(home, "late"));
        h.app.watch.applyChanges({ changes: [], rescan: false, toWalk: ["late"] });
        expect(h.app.graph.dirs).not.toContain("late");
        expect(job!.status.home).toBe(true);
      } finally {
        h.app.watcher?.close();
      }
    } finally {
      process.env.HOME = before;
    }
  });

  test("home never walked, a folder come into its top leaves the rest watched as it was: a folder made in one asked for by name, taken in, still sees its notes (#16)", async () => {
    const { homeAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const home = realpathSync(mkdtempSync(join(sandbox, "home-")));
    mkdirSync(join(home, "notes"), { recursive: true });
    writeFileSync(join(home, "notes", "inbox.md"), "# Inbox\n");
    const hour = new Date(Date.now() - 3_600_000);
    for (const d of ["", "notes"]) utimesSync(join(home, d), hour, hour);
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      // `slipbox ~/notes`, home never walked: notes is walked whole, the rest the walk's.
      const h = await harness({
        loc: homeAt(home),
        open: null,
        folder: join(home, "notes"),
        watch: true,
        config: (c) => ((c.watch.debounce_ms = 20), (c.watch.poll_ms = 50)),
      });
      try {
        expect(h.app.graph.home?.walked).toBeNull();
        // A folder made in notes: taken in, as notes is whole; then left alone a while, as if made long ago.
        mkdirSync(join(home, "notes", "fresh", "sub"), { recursive: true });
        writeFileSync(join(home, "notes", "fresh", "sub", "a.md"), "# A\n");
        await until(() => h.app.graph.notes.has("notes/fresh/sub/a.md"));
        for (const d of ["notes", "notes/fresh", "notes/fresh/sub"]) utimesSync(join(home, d), hour, hour);
        await Bun.sleep(300);
        // A folder come into home's top: listed, and the watcher otherwise as it was.
        mkdirSync(join(home, "cloned"));
        await until(() => h.app.graph.dirs.includes("cloned"));
        utimesSync(home, hour, hour);
        await Bun.sleep(300);
        writeFileSync(join(home, "notes", "fresh", "sub", "b.md"), "# B\n");
        await until(() => h.app.graph.notes.has("notes/fresh/sub/b.md"), 5000);
        expect(h.app.graph.notes.has("notes/fresh/sub/b.md")).toBe(true);
      } finally {
        h.app.watcher?.close();
      }
    } finally {
      process.env.HOME = before;
    }
  });

  test("a link from a vault to a note of home's peeks (VV-D2, VV-D7): home names it, t keeps it read-only, o goes into home; the scratch is no note of home's", async () => {
    const home = realpathSync(mkdtempSync(join(sandbox, "home-")));
    const notes = join(home, "notes");
    mkdirSync(join(notes, ".slipbox"), { recursive: true });
    writeFileSync(join(notes, "index.md"), "# Index\n\n[the list](../todo.md)\n");
    writeFileSync(join(home, "todo.md"), "# To do\n\nA list of home's own: [more](more.md).\n");
    writeFileSync(join(home, "more.md"), "# More\n");
    const before = { home: process.env.HOME, state: process.env.XDG_STATE_HOME };
    process.env.HOME = home;
    // slipbox's own state folder under ~, as by default: the scratch there.
    process.env.XDG_STATE_HOME = join(home, ".local", "state");
    try {
      const h = await harness({ root: notes, open: "index.md" });
      await h.keys("tab", "enter");
      expect(h.app.loc.root).toBe(notes);
      expect(h.app.floating?.kind).toBe("peek");
      expect(h.app.view!.buf.abs).toBe(join(home, "todo.md"));
      expect(h.frame()).toContain("~ › todo.md");
      // Kept as a tab: home's, read-only here.
      await h.keys("t");
      expect(h.app.loc.root).toBe(notes);
      expect(h.app.displayName(h.app.view!.buf)).toBe("~: todo.md");
      expect(h.app.view!.buf.readOnly).toContain("go into ~ to edit it");
      // o: into home, the note its own there.
      await h.app.run("peek.go");
      expect(h.app.loc).toMatchObject({ mode: "home", root: home });
      expect(h.app.view!.buf.rel).toBe("todo.md");
      expect(h.app.view!.buf.readOnly).toBeNull();
      // In home, a link to home's own note opens there: no peek.
      await h.keys("tab", "enter");
      expect(h.app.floating).toBeNull();
      expect(h.app.view!.buf.rel).toBe("more.md");
      await h.app.run("history.back");
      await h.app.run("history.back");
      expect(h.app.loc.root).toBe(notes);
      // The scratch, in slipbox's state folder under ~, opens beside: no vault's to go into, home's neither.
      h.app.scratch.open("right");
      expect(h.app.loc.root).toBe(notes);
      expect(h.app.view!.buf.abs).toBe(h.app.scratch.location().path);
      expect(h.app.view!.buf.elsewhere ?? null).toBeNull();
    } finally {
      process.env.HOME = before.home;
      process.env.XDG_STATE_HOME = before.state;
    }
  });

  test("home's Downloads opened (VV-D2): left out of home's index, and said so; listed in the explorer a level at a time", async () => {
    const { homeAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const home = realpathSync(mkdtempSync(join(sandbox, "home-")));
    mkdirSync(join(home, "Downloads", "sub"), { recursive: true });
    mkdirSync(join(home, "empty"));
    writeFileSync(join(home, "a.md"), "# A\n");
    writeFileSync(join(home, "Downloads", "d.md"), "# D\n");
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const h = await harness({ loc: homeAt(home), open: null, folder: join(home, "Downloads") });
      expect(h.app.graph.notes.has("Downloads/d.md")).toBe(false);
      // Not "no notes": they're there, and home's index leaves them out.
      expect(h.app.messages.map((m) => m.text)).toContain(
        "~/Downloads: left out of home's index (Downloads) — its files are listed in the explorer, not indexed",
      );
      const names = h.app.explorer.treeRows().map((r) => r.name);
      expect(names).toContain("d.md");
      expect(names).toContain("sub");
      // A folder of home with no notes says so, by its path from home.
      const empty = await harness({ loc: homeAt(home), open: null, folder: join(home, "empty") });
      expect(empty.app.messages.at(-1)?.text).toBe("no notes in ~/empty");
    } finally {
      process.env.HOME = before;
    }
  });

  test("a folder of home opened by name (VV-D2): its notes there at once, home never walked — its own note open, before one of a folder in it, the switcher listing them; a file's folder too", async () => {
    const { homeAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const { homeWalkKept } = await import("../../../../src/core/workspace/vaults/home.ts");
    const home = realpathSync(mkdtempSync(join(sandbox, "home-")));
    mkdirSync(join(home, "notes", "ideas"), { recursive: true });
    mkdirSync(join(home, "other"), { recursive: true });
    // Home's own notes, at its top and in another folder: neither is what was asked for.
    writeFileSync(join(home, "README.md"), "# Home\n");
    writeFileSync(join(home, "other", "o.md"), "# O\n");
    writeFileSync(join(home, "notes", "inbox.md"), "# Inbox\n\nIdeas so far: [coffee](ideas/coffee.md).\n");
    writeFileSync(join(home, "notes", "ideas", "coffee.md"), "# Coffee\n");
    const loc = homeAt(home);
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      // `slipbox ~/notes`, home never walked: no idle wait, the folder walked at once — home's walk still to make.
      const h = await harness({ loc, open: null, folder: join(home, "notes") });
      expect(h.app.graph.home?.walked).toBeNull();
      expect(homeWalkKept(loc)).toBe(false);
      expect(h.app.view?.buf.rel).toBe("notes/inbox.md"); // its own, before a note of a folder in it;
      expect(h.app.explorer.top).toBe(join(home, "notes"));
      await h.keys("ctrl+p");
      const o = h.app.overlay as ListOverlay;
      expect(o.title).toBe("Open note (3)");
      expect(o.filtered.map((e) => e.item.data).sort()).toEqual([
        "README.md",
        "notes/ideas/coffee.md",
        "notes/inbox.md",
      ]);
      await h.keys("escape");
      // Built again (a reindex, the watcher's rescan), it's walked again: still there.
      await h.app.run("vault.reindex");
      expect(h.app.graph.notes.has("notes/inbox.md")).toBe(true);
      // A file of it opened: its folder's notes known, so its link reaches one.
      const f = await harness({ loc, open: join(home, "notes", "inbox.md") });
      expect(f.app.view?.buf.rel).toBe("notes/inbox.md");
      expect(f.app.graph.notes.has("notes/ideas/coffee.md")).toBe(true);
      expect(f.app.graph.linksOf("notes/inbox.md").map((l) => [l.resolvedKind, l.path])).toEqual([
        ["note", "notes/ideas/coffee.md"],
      ]);
      // Home walked and kept: the folder's in that walk, never walked whole a second time — a note come since is found
      // by the walk kept, which lists the folder again, its time set back as if nothing had come all the same (#12).
      // Its time well before the walk, so the walk stamps it with that time, not to list again.
      const twoHours = new Date(Date.now() - 7_200_000);
      utimesSync(join(home, "notes"), twoHours, twoHours);
      const job = h.app.watch.indexJob()!;
      await stepToEnd(job);
      await h.app.watch.homeRefreshed;
      expect(homeWalkKept(loc)).toBe(true);
      writeFileSync(join(home, "notes", "late.md"), "# Late\n");
      const hour = new Date(Date.now() - 3_600_000);
      utimesSync(join(home, "notes"), hour, hour);
      const again = await harness({ loc, open: null, folder: join(home, "notes") });
      expect(again.app.graph.home?.walked).not.toBeNull();
      expect(again.app.graph.home?.asked).toBeUndefined();
      expect(again.app.graph.notes.has("notes/inbox.md")).toBe(true);
      expect(again.app.graph.notes.has("notes/late.md")).toBe(true);
      expect(again.app.view?.buf.rel).toBe("notes/inbox.md");
      await again.app.run("vault.reindex");
      expect(again.app.graph.home?.asked).toBeUndefined();
      expect(again.app.graph.notes.has("notes/late.md")).toBe(true);
    } finally {
      process.env.HOME = before;
    }
  });

  /** A home of its own: a note at its top, `notes` (a note in it, one in a folder of it), `other` (two notes). */
  const homeWithFolders = () => {
    const home = realpathSync(mkdtempSync(join(sandbox, "home-")));
    mkdirSync(join(home, "notes", "ideas"), { recursive: true });
    mkdirSync(join(home, "other"));
    writeFileSync(join(home, "README.md"), "# Home\n");
    writeFileSync(join(home, "notes", "inbox.md"), "# Inbox\n\nIdeas so far: [coffee](ideas/coffee.md).\n");
    writeFileSync(join(home, "notes", "ideas", "coffee.md"), "# Coffee\n");
    writeFileSync(join(home, "other", "o.md"), "# O\n");
    writeFileSync(join(home, "other", "p.md"), "# P\n");
    return home;
  };

  test("a folder of home gone into from a vault — a note of it opened, the folder revealed — has its notes at once, home never walked (VV-D2)", async () => {
    const { homeAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const { homeWalkKept } = await import("../../../../src/core/workspace/vaults/home.ts");
    const home = homeWithFolders();
    const vault = makeVault();
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const h = await harness({ root: vault, open: "index.md" });
      // A note of it opened by choice (`:e`, the explorer, a peek's `o`): into home, its folder's notes known.
      expect(h.app.vaults.intoOther(join(home, "notes", "inbox.md"))).toBe(true);
      expect(h.app.loc).toMatchObject({ mode: "home", root: home });
      expect(homeWalkKept(homeAt(home))).toBe(false);
      expect(h.app.view?.buf.rel).toBe("notes/inbox.md");
      expect(h.app.graph.linksOf("notes/inbox.md").map((l) => [l.resolvedKind, l.path])).toEqual([
        ["note", "notes/ideas/coffee.md"],
      ]);
      // Back in the vault, the folder revealed (a link to it): its notes there, its own note open.
      h.app.vaults.back();
      expect(h.app.loc.root).toBe(vault);
      h.app.explorer.revealFolder(join(home, "notes"));
      expect(h.app.loc.mode).toBe("home");
      expect(h.app.homeFolder).toBe("notes");
      expect(h.app.graph.notes.has("notes/ideas/coffee.md")).toBe(true);
      expect(h.app.view?.buf.rel).toBe("notes/inbox.md");
    } finally {
      process.env.HOME = before;
    }
  });

  test("a [walk] setting changed in a folder of home opened by name: its notes stay (VV-D2)", async () => {
    const { homeAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const home = homeWithFolders();
    const cfg = join(mkdtempSync(join(sandbox, "cfg-")), "config.toml");
    writeFileSync(cfg, "");
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const h = await harness({ loc: homeAt(home), open: null, folder: join(home, "notes"), configFile: cfg });
      writeFileSync(cfg, '[walk]\nexclude = ["scratch/"]\n');
      h.app.settings.reload("file changed");
      expect(h.app.messages.at(-1)?.text).toMatch(/changed: .*\bwalk\b/);
      expect(h.app.graph.notes.has("notes/inbox.md")).toBe(true);
      expect(h.app.graph.notes.has("notes/ideas/coffee.md")).toBe(true);
    } finally {
      process.env.HOME = before;
    }
  });

  test("home's walk done at its cap, a folder of it opened by name: the cap said as ever, the folder said to be whole (VV-D2)", async () => {
    const { homeAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const { walkHomeNow } = await import("../../../../src/core/workspace/vaults/home.ts");
    const home = homeWithFolders();
    const loc = homeAt(home);
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      expect(walkHomeNow(loc, DEFAULT_CONFIG, { notes: 2, folders: 100 }).capped).toBe("notes");
      const h = await harness({ loc, open: null, folder: join(home, "notes") });
      expect(h.app.graph.notes.has("notes/ideas/coffee.md")).toBe(true);
      // The walk just made and kept, home's graph built again from it: its cap said.
      (h.app.watch as unknown as { homeIndexed(capped: "notes"): void }).homeIndexed("notes");
      await h.app.watch.homeRefreshed;
      expect(h.app.messages.at(-1)?.text).toBe(
        "home's index is full: it holds 10,000 notes, those nearest the top — the rest aren't indexed; ~/notes, the folder open, is whole",
      );
    } finally {
      process.env.HOME = before;
    }
  });

  test("each folder of home opened by name has its own tabs, as before home was a vault; home's top keeps its own (VV-D2)", async () => {
    const { homeAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const { sessionFile } = await import("../../../../src/core/workspace/session/position.ts");
    const home = homeWithFolders();
    const loc = homeAt(home);
    const on = (c: Config) => (c.ui.restore_session = true);
    // Each tab's note by its path in home.
    const open = (h: Harness) => h.app.tabs.map((t) => relative(home, t.views[t.active]!.buf.abs));
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const top = await harness({ loc, open: null, config: on });
      expect(open(top)).toEqual(["README.md"]);
      top.app.openInNewTab("notes/ideas/coffee.md");
      top.app.session.save();
      // Kept before folders kept their own tabs: home's top's, as they were.
      const file = sessionFile(loc);
      const kept = JSON.parse(readFileSync(file, "utf8"));
      delete kept.folders;
      writeFileSync(file, JSON.stringify(kept));
      const other = await harness({ loc, open: null, folder: join(home, "other"), config: on });
      expect(open(other)).toEqual(["other/o.md"]);
      other.app.openInNewTab("other/p.md");
      other.app.session.save();
      // Another folder: its own note, not the tabs left in the one before.
      const notes = await harness({ loc, open: null, folder: join(home, "notes"), config: on });
      expect(open(notes)).toEqual(["notes/inbox.md"]);
      notes.app.session.save();
      // Each brought back as it was left.
      expect(open(await harness({ loc, open: null, folder: join(home, "other"), config: on }))).toEqual([
        "other/o.md",
        "other/p.md",
      ]);
      expect(open(await harness({ loc, open: null, config: on }))).toEqual(["README.md", "notes/ideas/coffee.md"]);
    } finally {
      process.env.HOME = before;
    }
  });

  test("home's tabs brought back, in folders its walk hasn't reached: their folders walked at once, their notes known (VV-D2, #13)", async () => {
    const { homeAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const home = homeWithFolders();
    const loc = homeAt(home);
    const on = (c: Config) => (c.ui.restore_session = true);
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const first = await harness({ loc, open: null, config: on });
      first.app.openInNewTab("notes/inbox.md");
      first.app.openInNewTab("other/p.md");
      first.app.session.save();
      const h = await harness({ loc, open: null, config: on });
      expect(h.app.graph.home?.walked).toBeNull();
      // Each brought back as a note of home's: its vault path, its links resolved, its backlinks there.
      expect(h.app.tabs.map((t) => t.views[t.active]!.buf.rel)).toEqual(["README.md", "notes/inbox.md", "other/p.md"]);
      expect(h.app.graph.linksOf("notes/inbox.md").map((l) => [l.resolvedKind, l.path])).toEqual([
        ["note", "notes/ideas/coffee.md"],
      ]);
      expect(h.app.graph.backlinks("notes/ideas/coffee.md").map((b) => b.from)).toEqual(["notes/inbox.md"]);
      expect(h.app.graph.notes.has("other/o.md")).toBe(true);
    } finally {
      process.env.HOME = before;
    }
  });

  test("home's tabs brought back: one build for all their folders, a split's other window's too; a file gone, or one home leaves out, walks nothing (VV-D2, #13)", async () => {
    const { homeAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const { Graph } = await import("../../../../src/core/workspace/graph/graph.ts");
    const { sessionFile } = await import("../../../../src/core/workspace/session/position.ts");
    const home = homeWithFolders();
    mkdirSync(join(home, "Downloads"));
    writeFileSync(join(home, "Downloads", "list.md"), "# List\n");
    mkdirSync(join(home, "old"));
    writeFileSync(join(home, "old", "kept.md"), "# Kept\n");
    const loc = homeAt(home);
    const on = (c: Config) => (c.ui.restore_session = true);
    const before = process.env.HOME;
    process.env.HOME = home;
    const build = spyOn(Graph.prototype, "build");
    try {
      const first = await harness({ loc, open: null, config: on });
      first.app.session.save();
      const file = sessionFile(loc);
      const kept = JSON.parse(readFileSync(file, "utf8"));
      const pane = (path: string) => ({ ...kept.tabs[0].panes[0], path });
      const tabs = [
        { panes: [pane("README.md"), pane("other/o.md")], active: 0, orientation: "side", ratio: 0.5 },
        { panes: [pane("notes/ideas/coffee.md")], active: 0 },
        { panes: [pane("notes/inbox.md")], active: 0 },
        { panes: [pane("Downloads/list.md")], active: 0 },
        { panes: [pane("old/gone.md")], active: 0 },
      ];
      kept.folders[""].tabs = tabs;
      writeFileSync(file, JSON.stringify(kept));
      build.mockClear();
      const h = await harness({ loc, open: null, config: on });
      // Its graph opened, then built once more for the tabs' folders: `notes` holds `notes/ideas`.
      expect(build).toHaveBeenCalledTimes(2);
      expect(h.app.graph.home?.asked?.folders.toSorted()).toEqual(["notes", "other"]);
      expect(h.app.tabs.map((t) => t.views.map((v) => v.buf.rel))).toEqual([
        ["README.md", "other/o.md"],
        ["notes/ideas/coffee.md"],
        ["notes/inbox.md"],
        // Opened, never indexed (home's skip list), as before.
        [null],
      ]);
      expect(h.app.graph.notes.has("Downloads/list.md")).toBe(false);
      // A folder home's walk never goes into isn't asked for at all: nothing to walk.
      expect(h.app.graph.askedFolders).not.toContain("Downloads");
      // A file gone: its tab isn't brought back, and its folder isn't walked for it.
      expect(h.app.graph.notes.has("old/kept.md")).toBe(false);
      // Not live (a test's app): no background parse started by the build.
      expect(h.app.indexing).toBe(0);
    } finally {
      build.mockRestore();
      process.env.HOME = before;
    }
  });

  test("home's tab behind a link out of home not followed: nothing asked for it, nothing read through it (VV-D2, VV-D6, #13)", async () => {
    const { homeAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const { sessionFile } = await import("../../../../src/core/workspace/session/position.ts");
    const home = homeWithFolders();
    const shelf = realpathSync(mkdtempSync(join(sandbox, "shelf-")));
    writeFileSync(join(shelf, "far.md"), "# Far\n");
    symlinkSync(shelf, join(home, "shelf"));
    const loc = homeAt(home);
    const on = (c: Config) => (c.ui.restore_session = true);
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const first = await harness({ loc, open: null, config: on });
      first.app.session.save();
      const file = sessionFile(loc);
      const kept = JSON.parse(readFileSync(file, "utf8"));
      const pane = (path: string) => ({ ...kept.tabs[0].panes[0], path });
      kept.folders[""].tabs = [
        { panes: [pane("README.md")], active: 0 },
        { panes: [pane("shelf/far.md")], active: 0 },
      ];
      writeFileSync(file, JSON.stringify(kept));
      const h = await harness({ loc, open: null, config: on });
      expect(h.app.tabs.map((t) => t.views[t.active]!.buf.rel)).toEqual(["README.md"]);
      expect(h.app.graph.askedFolders).toEqual([]);
    } finally {
      process.env.HOME = before;
    }
  });

  test("a folder of home opened by name, its tabs in a folder of it: no second build (VV-D2, #13)", async () => {
    const { homeAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const { Graph } = await import("../../../../src/core/workspace/graph/graph.ts");
    const home = homeWithFolders();
    const loc = homeAt(home);
    const on = (c: Config) => (c.ui.restore_session = true);
    const before = process.env.HOME;
    process.env.HOME = home;
    const build = spyOn(Graph.prototype, "build");
    try {
      const first = await harness({ loc, open: null, folder: join(home, "notes"), config: on });
      first.app.openInNewTab("notes/ideas/coffee.md");
      first.app.session.save();
      build.mockClear();
      mkdirSync(join(home, "notes", "deep"));
      writeFileSync(join(home, "notes", "deep", "d.md"), "# D\n");
      const h = await harness({ loc, open: null, folder: join(home, "notes"), config: on });
      // Its graph opened, then built once with `notes` walked whole: `notes/ideas` is in it.
      expect(build).toHaveBeenCalledTimes(2);
      expect(h.app.tabs.map((t) => t.views[t.active]!.buf.rel)).toEqual(["notes/inbox.md", "notes/ideas/coffee.md"]);
      // A branch's tab, later, in `notes/deep`, listed in `notes` walked whole: no build for it.
      build.mockClear();
      const anchor = { heading: null, headingIndex: 0, offset: 0, line: 0 };
      h.app.session.openTabs([{ panes: [{ path: "notes/deep/d.md", anchor }], active: 0 }], 0);
      expect(build).toHaveBeenCalledTimes(0);
      expect(h.app.tabs.at(-1)!.views[0]!.buf.rel).toBe("notes/deep/d.md");
    } finally {
      build.mockRestore();
      process.env.HOME = before;
    }
  });

  test("a tab brought back in a folder made since a folder holding it was walked: walked then (VV-D2, #13)", async () => {
    const { homeAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const home = homeWithFolders();
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const h = await harness({ loc: homeAt(home), open: null, folder: join(home, "notes") });
      mkdirSync(join(home, "notes", "new"));
      writeFileSync(join(home, "notes", "new", "topic.md"), "# Topic\n\nFrom [the inbox](../inbox.md).\n");
      // A branch's tabs, say, brought back before the watcher has said: `notes` was walked, `notes/new` wasn't there.
      const anchor = { heading: null, headingIndex: 0, offset: 0, line: 0 };
      h.app.tabs = [];
      h.app.session.openTabs([{ panes: [{ path: "notes/new/topic.md", anchor }], active: 0 }], 0);
      expect(h.app.tabs.map((t) => t.views[t.active]!.buf.rel)).toEqual(["notes/new/topic.md"]);
      expect(h.app.graph.backlinks("notes/inbox.md").map((b) => b.from)).toEqual(["notes/new/topic.md"]);
    } finally {
      process.env.HOME = before;
    }
  });

  test("home's walk kept, stopped at its cap: a tab brought back has its folder walked all the same (VV-D2, #13)", async () => {
    const { homeAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const { walkHomeNow } = await import("../../../../src/core/workspace/vaults/home.ts");
    const home = homeWithFolders();
    const loc = homeAt(home);
    const on = (c: Config) => (c.ui.restore_session = true);
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const first = await harness({ loc, open: null, config: on });
      first.app.openInNewTab("notes/inbox.md");
      first.app.session.save();
      // Breadth first, the cap reached in `notes`: it's listed, `notes/ideas` isn't. The folders' times an hour back,
      // so the walk kept is read as it was, none listed again.
      const hour = new Date(Date.now() - 3_600_000);
      for (const d of ["", "notes", "notes/ideas", "other"]) utimesSync(join(home, d), hour, hour);
      expect(walkHomeNow(loc, first.app.config, { notes: 2, folders: 100 }).capped).toBe("notes");
      const h = await harness({ loc, open: null, config: on });
      expect(h.app.graph.home?.walked).not.toBeNull();
      expect(h.app.graph.home?.capped).toBe("notes");
      // `notes` walked whole for its tab: a walk stopped at its cap covers no folder it listed.
      expect(h.app.graph.home?.asked?.folders).toEqual(["notes"]);
      expect(h.app.tabs.map((t) => t.views[t.active]!.buf.rel)).toEqual(["README.md", "notes/inbox.md"]);
      expect(h.app.graph.linksOf("notes/inbox.md").map((l) => [l.resolvedKind, l.path])).toEqual([
        ["note", "notes/ideas/coffee.md"],
      ]);
    } finally {
      process.env.HOME = before;
    }
  });

  test("into home from a vault, its tabs brought back: their folders walked at once (VV-D2, #13)", async () => {
    const { homeAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const { Graph } = await import("../../../../src/core/workspace/graph/graph.ts");
    const home = homeWithFolders();
    const vault = makeVault();
    const on = (c: Config) => (c.ui.restore_session = true);
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const first = await harness({ loc: homeAt(home), open: null, config: on });
      first.app.openInNewTab("notes/inbox.md");
      first.app.session.save();
      const h = await harness({ root: vault, open: "index.md", config: on });
      // A note of `other` opened by choice: into home, its tabs back, `notes`'s note among them — home's graph built
      // once, `other` and `notes` walked in it.
      const build = spyOn(Graph.prototype, "build");
      try {
        expect(h.app.vaults.intoOther(join(home, "other", "o.md"))).toBe(true);
        expect(build).toHaveBeenCalledTimes(1);
      } finally {
        build.mockRestore();
      }
      expect(h.app.loc).toMatchObject({ mode: "home", root: home });
      expect(h.app.tabs.map((t) => t.views[t.active]!.buf.rel)).toEqual(["README.md", "notes/inbox.md", "other/o.md"]);
      expect(h.app.graph.linksOf("notes/inbox.md").map((l) => [l.resolvedKind, l.path])).toEqual([
        ["note", "notes/ideas/coffee.md"],
      ]);
    } finally {
      process.env.HOME = before;
    }
  });

  test("home a repository, a branch's tabs brought back as it's checked out: their folders walked at once (VV-D2, 5.9, #13)", async () => {
    const { homeAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const home = homeWithFolders();
    const loc = homeAt(home);
    const git = (...args: string[]) =>
      Bun.spawnSync([
        "git",
        "-c",
        "user.email=t@example.invalid",
        "-c",
        "user.name=t",
        "-c",
        "commit.gpgsign=false",
        "-C",
        home,
        ...args,
      ]).exitCode;
    if (git("init", "-q", "-b", "main") !== 0) return;
    expect(git("add", "-A")).toBe(0);
    expect(git("commit", "-q", "-m", "start")).toBe(0);
    expect(git("branch", "feat")).toBe(0);
    const on = (c: Config) => (c.ui.restore_session = true);
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      // feat's tabs, kept: home's top and a note of `notes`.
      const first = await harness({ loc, open: "README.md", config: on });
      first.app.openInNewTab("notes/inbox.md");
      first.app.session.save("feat");
      const h = await harness({ loc, open: "README.md", config: on });
      expect(h.app.git.checkHead()).toBe(false);
      expect(h.app.graph.notes.has("notes/inbox.md")).toBe(false);
      expect(git("checkout", "-q", "feat")).toBe(0);
      expect(h.app.git.checkHead()).toBe(true);
      expect(h.app.messages.at(-1)!.text).toBe("switched to branch feat: its tabs are back");
      expect(h.app.tabs.map((t) => t.views[t.active]!.buf.rel)).toEqual(["README.md", "notes/inbox.md"]);
      expect(h.app.graph.linksOf("notes/inbox.md").map((l) => [l.resolvedKind, l.path])).toEqual([
        ["note", "notes/ideas/coffee.md"],
      ]);
    } finally {
      process.env.HOME = before;
    }
  });

  test("home a repository, a branch checked out as its batch lands: an open note it changed read again once, after its tabs' build (VV-D2, D153, #13)", async () => {
    const { homeAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const home = homeWithFolders();
    const loc = homeAt(home);
    const git = (...args: string[]) =>
      Bun.spawnSync([
        "git",
        "-c",
        "user.email=t@example.invalid",
        "-c",
        "user.name=t",
        "-c",
        "commit.gpgsign=false",
        "-C",
        home,
        ...args,
      ]).exitCode;
    if (git("init", "-q", "-b", "main") !== 0) return;
    expect(git("add", "-A")).toBe(0);
    expect(git("commit", "-q", "-m", "start")).toBe(0);
    expect(git("checkout", "-q", "-b", "feat")).toBe(0);
    writeFileSync(join(home, "README.md"), "# Home\n\nAs feat has it.\n");
    expect(git("commit", "-q", "-am", "feat's README")).toBe(0);
    expect(git("checkout", "-q", "main")).toBe(0);
    const on = (c: Config) => (c.ui.restore_session = true);
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      // feat's tabs, kept: README.md and a note of `notes`, a folder home's walk hasn't reached.
      const first = await harness({ loc, open: "README.md", config: on });
      first.app.openInNewTab("notes/inbox.md");
      first.app.session.save("feat");
      const h = await harness({ loc, open: "README.md", config: on });
      expect(h.app.git.checkHead()).toBe(false);
      expect(git("checkout", "-q", "feat")).toBe(0);
      // The watcher's batch for what git wrote: the switch seen first, its tabs back, their folder walked, then the
      // batch — the note read again once, never before the batch and again with it.
      h.app.feed.receive({ changes: [{ rel: "README.md", kind: "changed", isNote: true }], rescan: false });
      expect(h.app.messages.some((m) => m.text === "switched to branch feat: its tabs are back")).toBe(true);
      expect(h.app.graph.notes.has("notes/inbox.md")).toBe(true);
      expect(h.app.buffers.get("README.md")!.source).toBe("# Home\n\nAs feat has it.\n");
      expect(h.app.messages.filter((m) => m.text.endsWith("README.md changed on disk — reloaded"))).toHaveLength(1);
    } finally {
      process.env.HOME = before;
    }
  });

  test("home's tabs brought back as a branch is checked out, their folders walked: search finds their notes (VV-D2, #13)", async () => {
    const { homeAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const home = homeWithFolders();
    const loc = homeAt(home);
    const on = (c: Config) => {
      c.ui.restore_session = true;
      c.search.engine = "auto";
    };
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const h = await harness({ loc, open: null, config: on });
      await h.app.search.whenIndexed();
      // A branch's tabs brought back as it's checked out, `notes`'s note among them: walked then, search following.
      const anchor = { heading: null, headingIndex: 0, offset: 0, line: 0 };
      h.app.session.openTabs([{ panes: [{ path: "notes/inbox.md", anchor }], active: 0 }], 0);
      await h.app.search.whenIndexed();
      const found = h.app.search.query("coffee");
      expect(found.engine).toBe("index");
      expect(found.hits.map((x) => x.path).toSorted()).toEqual(["notes/ideas/coffee.md", "notes/inbox.md"]);
    } finally {
      process.env.HOME = before;
    }
  });

  test("slipbox started in home: its graph built once, with the folder opened and its tabs' folders (VV-D2, #13)", async () => {
    const { homeAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const { Graph } = await import("../../../../src/core/workspace/graph/graph.ts");
    const { prepare } = await import("../../../../src/tui/shell/terminal/run.ts");
    const home = homeWithFolders();
    const loc = homeAt(home);
    const on = (c: Config) => (c.ui.restore_session = true);
    const before = process.env.HOME;
    process.env.HOME = home;
    const build = spyOn(Graph.prototype, "build");
    try {
      const first = await harness({ loc, open: null, folder: join(home, "notes"), config: on });
      first.app.openInNewTab("other/p.md");
      first.app.session.save();
      build.mockClear();
      // As slipbox starts: `prepare`, then the screen, which builds the graph.
      const start = prepare([join(home, "notes")]);
      if (typeof start === "number") throw new Error(`exit ${start}`);
      const app = new App({ ...start, host: { requestRender() {}, osc52: () => true, quit() {} }, watch: false });
      expect(build).toHaveBeenCalledTimes(1);
      expect(app.graph.home?.asked?.folders.toSorted()).toEqual(["notes", "other"]);
      expect(app.tabs.map((t) => t.views[t.active]!.buf.rel)).toEqual(["notes/inbox.md", "other/p.md"]);
    } finally {
      build.mockRestore();
      process.env.HOME = before;
    }
  });

  test("slipbox ~ started, nothing asked for: home's graph built all the same, once, by the screen (VV-D2, #13)", async () => {
    const { Graph } = await import("../../../../src/core/workspace/graph/graph.ts");
    const { prepare } = await import("../../../../src/tui/shell/terminal/run.ts");
    const home = homeWithFolders();
    const before = process.env.HOME;
    process.env.HOME = home;
    const build = spyOn(Graph.prototype, "build");
    try {
      const start = prepare([home]);
      if (typeof start === "number") throw new Error(`exit ${start}`);
      expect(build).toHaveBeenCalledTimes(0);
      const app = new App({ ...start, host: { requestRender() {}, osc52: () => true, quit() {} }, watch: false });
      expect(build).toHaveBeenCalledTimes(1);
      expect(app.view!.buf.rel).toBe("README.md");
    } finally {
      build.mockRestore();
      process.env.HOME = before;
    }
  });

  test("slipbox started in a vault: its graph built once, before the screen, never again by it (#13)", async () => {
    const { Graph } = await import("../../../../src/core/workspace/graph/graph.ts");
    const { prepare } = await import("../../../../src/tui/shell/terminal/run.ts");
    const root = makeVault();
    const build = spyOn(Graph.prototype, "build");
    try {
      const start = prepare([join(root, "index.md")]);
      if (typeof start === "number") throw new Error(`exit ${start}`);
      // Built before the screen is taken: a long build never holds a blank screen.
      expect(start.graph.notes.has("index.md")).toBe(true);
      const app = new App({ ...start, host: { requestRender() {}, osc52: () => true, quit() {} }, watch: false });
      expect(build).toHaveBeenCalledTimes(1);
      expect(app.view!.buf.rel).toBe("index.md");
      expect(app.graph.notes.size).toBeGreaterThan(1);
    } finally {
      build.mockRestore();
    }
  });

  test("home: a buffer open before its folder was walked is home's note once it is — a tab brought back, home's walk (VV-D2, #13)", async () => {
    const { homeAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const home = homeWithFolders();
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const h = await harness({ loc: homeAt(home), open: null });
      // Opened before: a place in a window's history gone back to, say.
      const inbox = h.app.buffer("notes/inbox.md")!;
      const p = h.app.buffer("other/p.md")!;
      expect([inbox.rel, p.rel]).toEqual([null, null]);
      // A branch's tabs brought back as it's checked out, that note among them: the same buffer, home's note now. Not
      // live (a test's app): the build starts no background parse.
      const anchor = { heading: null, headingIndex: 0, offset: 0, line: 0 };
      h.app.session.openTabs([{ panes: [{ path: "notes/inbox.md", anchor }], active: 0 }], 0);
      expect(h.app.indexing).toBe(0);
      expect(h.app.tabs.at(-1)!.views[0]!.buf).toBe(inbox);
      expect(inbox.rel).toBe("notes/inbox.md");
      expect(h.app.graph.linksOf("notes/inbox.md").map((l) => [l.resolvedKind, l.path])).toEqual([
        ["note", "notes/ideas/coffee.md"],
      ]);
      // Home's walk made, reaching `other`: its buffer too.
      await stepToEnd(h.app.watch.indexJob()!);
      await h.app.watch.homeRefreshed;
      expect(p.rel).toBe("other/p.md");
    } finally {
      process.env.HOME = before;
    }
  });

  test("home: a buffer open before its folder was walked, changed on disk since it was read: read again as the build follows, then home's note (VV-D2, #13)", async () => {
    const { homeAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const home = homeWithFolders();
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const h = await harness({ loc: homeAt(home), open: null });
      const p = h.app.buffer("other/p.md")!;
      expect([p.rel, p.source]).toEqual([null, "# P\n"]);
      // Changed by someone else before the poll looked: the poll looks no more once it's home's note.
      writeFileSync(join(home, "other", "p.md"), "# P\n\nChanged elsewhere.\n");
      const anchor = { heading: null, headingIndex: 0, offset: 0, line: 0 };
      h.app.session.openTabs([{ panes: [{ path: "other/p.md", anchor }], active: 0 }], 0);
      // The build that walks its folder reads it again, then makes it home's note: never its old text as the vault's.
      expect([p.rel, p.source]).toEqual(["other/p.md", "# P\n\nChanged elsewhere.\n"]);
    } finally {
      process.env.HOME = before;
    }
  });

  test("a note open, then left out by a [walk] setting, changed by an agent: read again, never indexed again (#13)", async () => {
    const root = makeVault();
    mkdirSync(join(root, "parked"));
    writeFileSync(join(root, "parked", "p.md"), "# P\n");
    const h = await harness({ root, open: "parked/p.md" });
    const p = h.app.view!.buf;
    expect(p.rel).toBe("parked/p.md");
    // The vault's own [walk] (it comes before yours) leaves parked/ out now.
    const own = join(root, ".slipbox", "config.toml");
    writeFileSync(own, readFileSync(own, "utf8").replace(/^exclude = .*$/m, 'exclude = ["drafts/", "parked/"]'));
    h.app.settings.reload("file changed");
    expect(h.app.graph.notes.has("parked/p.md")).toBe(false);
    writeFileSync(join(root, "parked", "p.md"), "# P\n\nTo [the index](../index.md).\n");
    expect(h.app.watch.poll()).toBe(true);
    expect(p.source).toBe("# P\n\nTo [the index](../index.md).\n");
    // Neither a note nor any file of the graph's.
    expect(h.app.graph.known("parked/p.md")).toBe(false);
  });

  test("a hidden note reached in a folder the watcher watches: polled all the same, the graph told (#13)", async () => {
    const root = makeVault();
    writeFileSync(join(root, ".draft.md"), "# Draft\n");
    const h = await harness({ root, open: "index.md" });
    await h.app.run("note.open .draft.md");
    const draft = h.app.view!.buf;
    expect(draft.rel).toBe(".draft.md");
    writeFileSync(join(root, ".draft.md"), "# Draft\n\nTo [the index](index.md).\n");
    expect(h.app.watch.poll()).toBe(true);
    expect(draft.source).toBe("# Draft\n\nTo [the index](index.md).\n");
    expect(h.app.graph.linksOf(".draft.md").map((l) => l.path)).toEqual(["index.md"]);
  });

  test("a reached note changed: the poll tells the watcher it heard it, so its sweep says it no second time (#13)", async () => {
    const root = makeVault();
    mkdirSync(join(root, ".stash"));
    writeFileSync(join(root, ".stash", "h.md"), "# Hidden\n");
    const h = await harness({ root, open: "index.md", watch: true });
    try {
      await h.app.run("note.open .stash/h.md");
      const heard = spyOn(h.app.watcher!, "heard");
      writeFileSync(join(root, ".stash", "h.md"), "# Hidden\n\nRewritten.\n");
      expect(h.app.watch.poll()).toBe(true);
      expect(heard).toHaveBeenCalledWith(".stash/h.md", expect.objectContaining({ size: 21 }));
      heard.mockRestore();
    } finally {
      h.app.quit();
    }
  });

  test("a buffer the conflict left with the disk's text, the graph knowing it since: home's note at the next poll (#13)", async () => {
    const { homeAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const home = homeWithFolders();
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const h = await harness({ loc: homeAt(home), open: null });
      const p = h.app.buffer("other/p.md")!;
      writeFileSync(join(home, "other", "p.md"), "# P\n\nTheirs.\n");
      // The graph comes to know it while it's changed on disk: not claimed yet.
      h.app.graph.askFolders([join(home, "other")]);
      expect(p.rel).toBeNull();
      // The disk's text taken (as a conflict's "theirs" takes it), not by reloadBuffer: the next poll claims it.
      p.load();
      h.app.watch.poll();
      expect(p.rel).toBe("other/p.md");
    } finally {
      process.env.HOME = before;
    }
  });

  test("a change to one file claims its own buffer, not every buffer open (#13)", async () => {
    const root = makeVault();
    mkdirSync(join(root, ".stash"));
    for (const n of ["a", "b", "c"]) writeFileSync(join(root, ".stash", `${n}.md`), `# ${n}\n`);
    const h = await harness({ root, open: "index.md" });
    for (const n of ["a", "b", "c"]) expect(h.app.buffer(`.stash/${n}.md`)!.rel).toBeNull();
    const claim = spyOn(h.app, "claim");
    try {
      h.app.graph.reachFile(".stash/b.md", { keep: true });
      expect(claim).toHaveBeenCalledTimes(1);
      expect(h.app.buffer(".stash/b.md")!.rel).toBe(".stash/b.md");
    } finally {
      claim.mockRestore();
    }
  });

  test("a reached note changed while git holds its index lock: told to the graph once git lets go (5.10, #13)", async () => {
    const root = makeVault();
    if (Bun.spawnSync(["git", "init", "-q", "-b", "main", root]).exitCode !== 0) return;
    mkdirSync(join(root, ".stash"));
    writeFileSync(join(root, ".stash", "h.md"), "# Hidden\n");
    const h = await harness({ root, open: "index.md" });
    await h.app.run("note.open .stash/h.md");
    expect(h.app.view!.buf.rel).toBe(".stash/h.md");
    writeFileSync(join(root, ".git", "index.lock"), "");
    writeFileSync(join(root, ".stash", "h.md"), "# Hidden\n\nTo [the index](../index.md).\n");
    h.app.watch.poll();
    // Held while git writes, as the watcher's news is.
    expect(h.app.graph.linksOf(".stash/h.md")).toEqual([]);
    rmSync(join(root, ".git", "index.lock"));
    await new Promise((r) => setTimeout(r, 400));
    expect(h.app.graph.linksOf(".stash/h.md").map((l) => l.path)).toEqual(["index.md"]);
  });

  test("a reached note's folder made a file, or unreadable: the poll takes it as gone, never throws (#13)", async () => {
    const root = makeVault();
    for (const d of [".stash", ".locked"]) {
      mkdirSync(join(root, d));
      writeFileSync(join(root, d, "h.md"), "# Hidden\n");
    }
    const h = await harness({ root, open: "index.md" });
    await h.app.run("note.open .stash/h.md");
    const stash = h.app.view!.buf;
    await h.app.run("note.open .locked/h.md");
    const locked = h.app.view!.buf;
    expect([stash.rel, locked.rel]).toEqual([".stash/h.md", ".locked/h.md"]);
    rmSync(join(root, ".stash"), { recursive: true });
    writeFileSync(join(root, ".stash"), "A file now.\n");
    expect(() => h.app.watch.poll()).not.toThrow();
    expect(stash.deleted).toBe(true);
    // Root reads any folder: a locked one is only locked for others.
    if (process.getuid?.() === 0) return;
    chmodSync(join(root, ".locked"), 0o000);
    try {
      expect(() => h.app.watch.poll()).not.toThrow();
      expect(locked.deleted).toBe(true);
    } finally {
      chmodSync(join(root, ".locked"), 0o755);
    }
  });

  test("a reached note deleted, then made again while open: reached again, its links found (20.8, #13)", async () => {
    const root = makeVault();
    mkdirSync(join(root, ".stash"));
    writeFileSync(join(root, ".stash", "h.md"), "# Hidden\n\nTo [the index](../index.md).\n");
    const h = await harness({ root, open: "index.md" });
    await h.app.run("note.open .stash/h.md");
    const buf = h.app.view!.buf;
    rmSync(join(root, ".stash", "h.md"));
    h.app.watch.poll();
    expect([buf.deleted, h.app.graph.known(".stash/h.md")]).toEqual([true, false]);
    writeFileSync(join(root, ".stash", "h.md"), "# Hidden again\n\nTo [the index](../index.md).\n");
    h.app.watch.poll();
    expect([buf.source, buf.rel, h.app.graph.known(".stash/h.md")]).toEqual([
      "# Hidden again\n\nTo [the index](../index.md).\n",
      ".stash/h.md",
      true,
    ]);
    expect(h.app.graph.backlinks("index.md").map((b) => b.from)).toContain(".stash/h.md");
  });

  test("a reached note with unsaved changes, changed on disk: told to the graph once, not at every poll (#13)", async () => {
    const root = makeVault();
    mkdirSync(join(root, ".stash"));
    writeFileSync(join(root, ".stash", "h.md"), "# Hidden\n");
    const h = await harness({ root, open: "index.md" });
    await h.app.run("note.open .stash/h.md");
    await h.keys("shift+g", "o");
    await h.keys(..."typed".split(""));
    await h.keys("escape");
    expect(h.app.view!.buf.dirty).toBe(true);
    writeFileSync(join(root, ".stash", "h.md"), "# Hidden\n\nRewritten.\n");
    const updated = spyOn(h.app.graph, "updateFile");
    try {
      h.app.watch.poll();
      h.app.watch.poll();
      expect(updated).toHaveBeenCalledTimes(1);
    } finally {
      updated.mockRestore();
    }
  });

  test("a buffer the graph comes to know mid-anything (a file reached): drawn again (#13)", async () => {
    const root = makeVault();
    mkdirSync(join(root, ".stash"));
    writeFileSync(join(root, ".stash", "h.md"), "# Hidden\n");
    const h = await harness({ root, open: "index.md" });
    const hidden = h.app.buffer(".stash/h.md")!;
    expect(hidden.rel).toBeNull();
    const drawn = spyOn(h.app.host, "requestRender");
    try {
      h.app.graph.reachFile(".stash/h.md", { keep: true });
      expect(hidden.rel).toBe(".stash/h.md");
      expect(drawn).toHaveBeenCalled();
    } finally {
      drawn.mockRestore();
    }
  });

  test("a build listener that throws: the build ends all the same, the others told (#13)", async () => {
    const h = await harness({ open: "index.md" });
    const told: number[] = [];
    h.app.graph.onBuild(() => {
      throw new Error("a listener's own bug");
    });
    h.app.graph.onBuild(() => told.push(1));
    expect(() => h.app.graph.build(false, "lazy")).not.toThrow();
    expect(told).toEqual([1]);
  });

  test("space v r: an open note changed while nobody watched is read again (#13)", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "index.md" });
    const index = h.app.view!.buf;
    writeFileSync(join(root, "index.md"), "# Index\n\nRewritten by an agent.\n");
    await h.app.run("vault.reindex");
    expect(index.source).toBe("# Index\n\nRewritten by an agent.\n");
  });

  test("space v r while git holds its index lock: an open note git changed is read again once git lets go, not before (D153, #13)", async () => {
    const root = makeVault();
    if (Bun.spawnSync(["git", "init", "-q", "-b", "main", root]).exitCode !== 0) return;
    const h = await harness({ root, open: "index.md" });
    const index = h.app.view!.buf;
    writeFileSync(join(root, ".git", "index.lock"), "");
    writeFileSync(join(root, "index.md"), "# Index\n\nRewritten by git.\n");
    await h.app.run("vault.reindex");
    // What git does lands as one change: nothing read again while it writes.
    expect(index.source).not.toContain("Rewritten");
    rmSync(join(root, ".git", "index.lock"));
    await new Promise((r) => setTimeout(r, 400));
    expect(index.source).toBe("# Index\n\nRewritten by git.\n");
    expect(h.app.messages.filter((m) => m.text.endsWith("changed on disk — reloaded"))).toHaveLength(1);
  });

  test("a batch naming an open note twice (held while git wrote): read again once, as its last change has it (D153, #13)", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "index.md" });
    const index = h.app.view!.buf;
    writeFileSync(join(root, "index.md"), "# Index\n\nRewritten twice.\n");
    h.app.watch.applyChanges({
      changes: [
        { rel: "index.md", kind: "changed", isNote: true },
        { rel: "index.md", kind: "changed", isNote: true },
      ],
      rescan: false,
    });
    expect(index.source).toBe("# Index\n\nRewritten twice.\n");
    expect(h.app.messages.filter((m) => m.text.endsWith("changed on disk — reloaded"))).toHaveLength(1);
  });

  test("a reached file the graph takes as a note since (walk.extensions), changed: told to the graph as a note (#13)", async () => {
    const root = makeVault();
    mkdirSync(join(root, ".stash"));
    writeFileSync(join(root, ".stash", "x.txt"), "plain\n");
    const h = await harness({ root, open: "index.md" });
    await h.app.run("note.open .stash/x.txt");
    const x = h.app.view!.buf;
    expect(h.app.graph.notes.has(".stash/x.txt")).toBe(false);
    // Text files are notes now (the vault's own [walk]); the file reached again, a note of the new graph.
    const own = join(root, ".slipbox", "config.toml");
    writeFileSync(own, readFileSync(own, "utf8").replace("[walk]", '[walk]\nextensions = ["md", "txt"]'));
    h.app.settings.reload("file changed");
    await h.app.run("note.open .stash/x.txt");
    expect(h.app.graph.notes.has(".stash/x.txt")).toBe(true);
    writeFileSync(join(root, ".stash", "x.txt"), "plain, to [the index](../index.md)\n");
    h.app.watch.poll();
    expect(h.app.graph.linksOf(".stash/x.txt").map((l) => l.path)).toEqual(["index.md"]);
    expect(x.source).toBe("plain, to [the index](../index.md)\n");
  });

  test("space v r: a note made while nobody watched is searched after the reindex (#13)", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "index.md", config: (c) => (c.search.engine = "auto") });
    await h.app.search.whenIndexed();
    writeFileSync(join(root, "late.md"), "# Late\n\nA zanzibar crossing.\n");
    await h.app.run("vault.reindex");
    await h.app.search.whenIndexed();
    const found = h.app.search.query("zanzibar");
    expect(found.engine).toBe("index");
    expect(found.hits.map((x) => x.path)).toEqual(["late.md"]);
  });

  test("a buffer open before the vault's graph knew its file is the vault's once it does — :e reaching it, a reindex, a [walk] setting (#13)", async () => {
    const root = makeVault();
    mkdirSync(join(root, "parked"));
    writeFileSync(join(root, "parked", "d.md"), "# D\n\nTo [the index](../index.md).\n");
    writeFileSync(join(root, "parked", "e.md"), "# E\n");
    mkdirSync(join(root, ".stash"));
    writeFileSync(join(root, ".stash", "h.md"), "# Hidden\n");
    const cfg = join(mkdtempSync(join(sandbox, "cfg-")), "config.toml");
    writeFileSync(cfg, '[walk]\nexclude = ["parked/"]\n');
    const h = await harness({
      root,
      open: "index.md",
      configFile: cfg,
      config: (c) => (c.walk.exclude = ["parked/"]),
    });
    // Left out by the walk, opened before (a window's history, say): no vault path.
    const d = h.app.buffer("parked/d.md")!;
    const e = h.app.buffer("parked/e.md")!;
    const hidden = h.app.buffer(".stash/h.md")!;
    expect([d.rel, hidden.rel]).toEqual([null, null]);
    // :e reaching one in a hidden folder (20.8): the same buffer, the vault's.
    await h.app.run("note.open .stash/h.md");
    expect(h.app.view!.buf).toBe(hidden);
    expect(hidden.rel).toBe(".stash/h.md");
    // No watcher looks in .stash: the poll still does, its change read, and the graph told.
    writeFileSync(join(root, ".stash", "h.md"), "# Hidden\n\nChanged by an agent, to [the index](../index.md).\n");
    expect(h.app.watch.poll()).toBe(true);
    expect(hidden.source).toBe("# Hidden\n\nChanged by an agent, to [the index](../index.md).\n");
    expect(h.app.graph.linksOf(".stash/h.md").map((l) => [l.resolvedKind, l.path])).toEqual([["note", "index.md"]]);
    // A note made while nobody watched, its buffer open first, then a reindex.
    writeFileSync(join(root, "late.md"), "# Late\n");
    const late = h.app.buffer("late.md")!;
    expect(late.rel).toBeNull();
    await h.app.run("vault.reindex");
    expect(late.rel).toBe("late.md");
    // A [walk] setting that takes parked/ in, the note changed on disk meanwhile: the new graph knows it, the buffer
    // waits for the poll to read it again — then it's the vault's note.
    writeFileSync(join(root, "parked", "d.md"), "# D\n\nAgain, to [the index](../index.md).\n");
    writeFileSync(cfg, "[walk]\nexclude = []\n");
    h.app.settings.reload("file changed");
    expect(h.app.graph.notes.has("parked/d.md")).toBe(true);
    // One unchanged is the vault's note at once, as the new graph is followed.
    expect(e.rel).toBe("parked/e.md");
    expect([d.rel, d.source]).toEqual([null, "# D\n\nTo [the index](../index.md).\n"]);
    h.app.watch.poll();
    expect([d.rel, d.source]).toEqual(["parked/d.md", "# D\n\nAgain, to [the index](../index.md).\n"]);
    expect(h.app.graph.backlinks("index.md").map((b) => b.from)).toContain("parked/d.md");
  });

  test("a folder of home opened by name lists the vaults in it at once, home never walked: a repository's row, one deeper's (VV-D2)", async () => {
    const { homeAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const home = realpathSync(mkdtempSync(join(sandbox, "home-")));
    mkdirSync(join(home, "work", "kestrel", ".git"), { recursive: true });
    mkdirSync(join(home, "work", "clients", "heron", ".slipbox"), { recursive: true });
    writeFileSync(join(home, "work", "plan.md"), "# Plan\n");
    const vault = makeVault();
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const roots = (h: Harness) =>
        h.app.explorer
          .rows()
          .filter((r) => r.kind === "root")
          .map((r) => r.name);
      const h = await harness({ loc: homeAt(home), open: null, folder: join(home, "work") });
      expect(h.app.graph.home?.walked).toBeNull();
      expect(roots(h)).toEqual(["kestrel"]);
      h.app.explorer.expanded.add("work/clients");
      h.app.explorer.invalidateTree();
      expect(roots(h)).toEqual(["heron", "kestrel"]);
      // Gone into from a vault, revealed: the same.
      const v = await harness({ root: vault, open: "index.md" });
      v.app.explorer.revealFolder(join(home, "work"));
      expect(v.app.graph.nestedRoots().sort()).toEqual(["work/clients/heron", "work/kestrel"]);
    } finally {
      process.env.HOME = before;
    }
  });
});
