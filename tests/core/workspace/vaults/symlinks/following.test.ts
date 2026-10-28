import { watcherState } from "../../../../support/watcher-access.ts";
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
  statSync,
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
import {
  agentsWarning,
  answered,
  blockingLink,
  forgetProbes,
  linkAnswer,
  linkScope,
  linksFile,
  linkState,
  probe,
  setLinkAnswer,
  writesThrough,
} from "../../../../../src/core/workspace/vaults/symlinks.ts";
import { LINK_REASON, WalkFilter, walkVault } from "../../../../../src/core/workspace/walk/walk.ts";
import { walkHomeNow } from "../../../../../src/core/workspace/vaults/home.ts";
import { makeVaultSandbox } from "../../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("links followed only when you say so (VV-D6)", () => {
  /** A vault, a folder outside it holding a note, and a link from the vault to that folder. */
  const linked = () => {
    const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-links-")));
    const vault = join(top, "vault");
    const out = join(top, "out");
    mkdirSync(join(vault, ".slipbox"), { recursive: true });
    mkdirSync(out);
    writeFileSync(join(vault, "index.md"), "[far](data/far.md)\n");
    writeFileSync(join(out, "far.md"), "# Far\n\n[home](../../vault/index.md)\n");
    symlinkSync(out, join(vault, "data"));
    return { top, vault, out, link: join(vault, "data") };
  };
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

  test("the answer is kept by link and target, in slipbox's state — asked again when the link leads elsewhere", () => {
    const { vault, top, link, out } = linked();
    expect(linkAnswer(link)).toBeNull();
    setLinkAnswer(link, "follow");
    expect(linkAnswer(link)).toBe("follow");
    expect(readFileSync(linksFile(), "utf8")).toContain(JSON.stringify(out));
    expect(linksFile().startsWith(process.env.XDG_STATE_HOME!)).toBe(true);
    expect(readdirSync(vault).sort()).toEqual([".slipbox", "data", "index.md"]);
    // The link pointed elsewhere (a pull changed it): nothing answered for that target.
    mkdirSync(join(top, "other"));
    rmSync(link);
    symlinkSync(join(top, "other"), link);
    expect(linkAnswer(link)).toBeNull();
    expect(linkState(link, linkScope({ mode: "vault", root: vault }))).toBe("ask");
    setLinkAnswer(link, "no");
    expect(linkAnswer(link)).toBe("no");
  });
  test("which links ask: one out of its vault or home; within either, a second name, never; in Elsewhere, every one", () => {
    const { vault, top, link } = linked();
    symlinkSync(join(vault, "index.md"), join(vault, "again.md"));
    const scope = linkScope({ mode: "vault", root: vault });
    expect(linkState(join(vault, "again.md"), scope)).toBe("within");
    expect(linkState(link, scope)).toBe("ask");
    // Home: a link within home, the kind stow makes, is a second name, even into a vault of its own.
    expect(linkState(link, linkScope({ mode: "home", root: top }))).toBe("within");
    // Elsewhere: nothing to stay inside.
    expect(linkScope({ mode: "folder", root: top })).toBeNull();
    expect(linkState(join(vault, "again.md"), null)).toBe("ask");
    expect(linkState(join(top, "nowhere"), scope)).toBe("broken");
  });
  test("the walk goes through a link only when it's followed and its target answered; a second name never twice", async () => {
    const { vault, link, out } = linked();
    mkdirSync(join(vault, "notes"));
    writeFileSync(join(vault, "notes", "n.md"), "# N\n");
    symlinkSync(join(vault, "notes"), join(vault, "again"));
    const walk = () => walkVault(vault, new WalkFilter(vault, DEFAULT_CONFIG.walk));
    let w = walk();
    expect(w.files.map((f) => f.rel)).toEqual(["index.md", "notes/n.md"]);
    expect(w.skipped).toContainEqual({ rel: "data", reason: LINK_REASON.out, link: { target: out, dir: true } });
    expect(w.skipped).toContainEqual({
      rel: "again",
      reason: LINK_REASON.within,
      link: { target: join(vault, "notes"), dir: true },
    });
    // Followed, its target not asked yet: never read on the walk's own thread.
    setLinkAnswer(link, "follow");
    expect(walk().skipped).toContainEqual({
      rel: "data",
      reason: LINK_REASON.waiting,
      link: { target: out, dir: true },
    });
    expect(await probe(out)).toBe(true);
    w = walk();
    expect(w.files.map((f) => f.rel)).toEqual(["data/far.md", "index.md", "notes/n.md"]);
    expect(w.dirs).toContain("data");
    // Indexed as the vault's: its links, its backlinks.
    const g = openGraph(locateVault({ root: vault }), DEFAULT_CONFIG, false);
    expect(g.backlinks("data/far.md").map((b) => b.from)).toEqual(["index.md"]);
    // A second link to the same folder walks it once; one to a folder holding the vault, never.
    symlinkSync(out, join(vault, "data2"));
    setLinkAnswer(join(vault, "data2"), "follow");
    symlinkSync(dirname(vault), join(vault, "up"));
    setLinkAnswer(join(vault, "up"), "follow");
    await probe(dirname(vault));
    w = walk();
    const far = w.files.filter((f) => f.rel.endsWith("far.md")).map((f) => f.rel);
    expect(far).toHaveLength(1); // whichever the folder lists first
    const other = far[0] === "data/far.md" ? "data2" : "data";
    expect(w.skipped.find((s) => s.rel === other)?.reason).toBe(LINK_REASON.twice);
    expect(w.skipped.find((s) => s.rel === "up")?.reason).toBe(LINK_REASON.loop);
    // Said no: not walked.
    setLinkAnswer(link, "no");
    expect(walk().files.map((f) => f.rel)).not.toContain("data/far.md");
  });
  test("home's kept walk goes through a link while it's followed and answering: followed since, walked; no longer, dropped", async () => {
    const { vault: home, link, out } = linked();
    writeFileSync(join(home, "index.md"), "# Index\n"); // no link to reach it by: only the walk finds it
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const loc = locateVault({ path: home, cwd: home });
      expect(loc.mode).toBe("home");
      // Its folder unchanged since the walk: only the link's answer says to list it again.
      const longAgo = new Date(Date.now() - 86_400_000);
      utimesSync(home, longAgo, longAgo);
      walkHomeNow(loc, DEFAULT_CONFIG);
      const notes = () => [...openGraph(loc, DEFAULT_CONFIG, false).notes.keys()].sort();
      expect(notes()).toEqual(["index.md"]);
      // Followed since, and answering: the kept walk lists its folder again, so it goes through.
      setLinkAnswer(link, "follow");
      await probe(out);
      expect(notes()).toEqual(["data/far.md", "index.md"]);
      // Not answering (a disk gone): left out, never read through, and walked again once it answers.
      forgetProbes();
      expect(notes()).toEqual(["index.md"]);
      await probe(out);
      expect(notes()).toEqual(["data/far.md", "index.md"]);
      // Said no: dropped with all it held.
      setLinkAnswer(link, "no");
      expect(notes()).toEqual(["index.md"]);
    } finally {
      process.env.HOME = before;
    }
  });
  test("a target followed but not answering isn't read through, not even by a note's link reaching it", () => {
    const { vault, link } = linked();
    setLinkAnswer(link, "follow"); // its target never asked: on a disk that may not answer
    const g = openGraph(locateVault({ root: vault }), DEFAULT_CONFIG, false);
    expect(g.notes.get("index.md")?.links.map((l) => l.target)).toEqual(["data/far.md"]);
    expect(g.notes.has("data/far.md")).toBe(false);
  });
  test("a target that doesn't answer is given up on: never waited for", async () => {
    const never = () => new Promise<boolean>(() => {});
    const t0 = performance.now();
    expect(await probe("/nowhere/at/all", 50, never)).toBe(false);
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(answered("/nowhere/at/all")).toBe(false);
  });
  test("the watcher follows a followed link: a note made in its folder comes as the vault's", async () => {
    const { VaultWatcher } = await import("../../../../../src/core/workspace/graph/watch.ts");
    const { vault, link, out } = linked();
    setLinkAnswer(link, "follow");
    await probe(out);
    const filter = new WalkFilter(vault, DEFAULT_CONFIG.walk);
    const changes: string[] = [];
    const w = new VaultWatcher({
      root: vault,
      filter,
      dirs: [""],
      debounceMs: 20,
      known: new Map([["index.md", statSync(join(vault, "index.md")).mtimeMs]]),
      onBatch: (b) => changes.push(...b.changes.map((c) => `${c.kind} ${c.rel}`)),
      onDegraded: () => {},
    });
    try {
      // Seen now as it would be when it came: the link followed, what it holds the vault's.
      watcherState(w).pending.add("data");
      w.flush();
      expect(changes).toContain("created data/far.md");
      expect(w.watchedCount).toBe(2);
      // A folder that comes holding a link you follow: walked through it, as the walk would.
      mkdirSync(join(vault, "moved"));
      symlinkSync(out, join(vault, "moved", "in"));
      setLinkAnswer(join(vault, "moved", "in"), "follow");
      watcherState(w).pending.add("moved");
      w.flush();
      expect(changes).toContain("created moved/in/far.md");
      // Not followed: nothing through it.
      setLinkAnswer(link, "no");
      const w2 = new VaultWatcher({
        root: vault,
        filter,
        dirs: [""],
        debounceMs: 20,
        known: new Map(),
        onBatch: (b) => changes.push(...b.changes.map((c) => `again ${c.kind} ${c.rel}`)),
        onDegraded: () => {},
      });
      watcherState(w2).pending.add("data");
      w2.flush();
      expect(changes.filter((c) => c.startsWith("again"))).toEqual([]);
      w2.close();
    } finally {
      w.close();
    }
  });
  test("writes: in a vault never out of it, followed or not; in home through a link it follows; in Elsewhere as the file system allows", () => {
    const { vault, top, link, out } = linked();
    setLinkAnswer(link, "follow");
    const far = join(link, "far.md");
    expect(writesThrough({ mode: "vault", root: vault }, far)).toBe(false);
    expect(writesThrough({ mode: "home", root: vault }, far)).toBe(true);
    setLinkAnswer(link, "no");
    expect(writesThrough({ mode: "home", root: vault }, far)).toBe(false);
    // Elsewhere: every link below the folder opened asks; a path named outright outside it, only the file itself.
    expect(blockingLink({ mode: "folder", root: top }, far)?.link).toBe(link);
    expect(blockingLink({ mode: "folder", root: out }, far)).toBeNull();
    symlinkSync(join(out, "far.md"), join(top, "far-link.md"));
    expect(writesThrough({ mode: "folder", root: top }, join(top, "far-link.md"))).toBe(false);
    setLinkAnswer(join(top, "far-link.md"), "follow");
    expect(writesThrough({ mode: "folder", root: top }, join(top, "far-link.md"))).toBe(true);
    expect(writesThrough({ mode: "folder", root: out }, join(out, "far.md"))).toBe(true);
  });
  test("the command line refuses a link not followed — reading, writing — and in a vault never writes through one", async () => {
    const { vault, link } = linked();
    const read = await capture(["read", "data/far.md"], vault);
    expect(read.code).toBe(5);
    expect(read.err).toContain("isn't followed");
    expect((await capture(["write", "data/far.md", "x"], vault)).code).toBe(5);
    expect((await capture(["write", "data/new.md", "x", "--create"], vault)).code).toBe(5);
    // Followed (asked in the TUI): read and indexed; never written to, being outside the vault.
    setLinkAnswer(link, "follow");
    forgetProbes();
    // Its target asked first, before the walk goes through it: listed with the vault's notes.
    expect((await capture(["ls"], vault)).out).toContain("data/far.md");
    expect((await capture(["read", "data/far.md"], vault)).out).toBe("# Far\n\n[home](../../vault/index.md)\n");
    expect((await capture(["backlinks", "data/far.md"], vault)).out).toContain("index.md");
    const write = await capture(["write", "data/far.md", "x"], vault);
    expect(write.code).toBe(5);
    expect(write.err).toContain("a link leads it out of the vault");
    expect(readFileSync(join(link, "far.md"), "utf8")).toStartWith("# Far");
  });
  test("the command line makes no folder through a link not followed; in home, writes through one it follows", async () => {
    const { vault, link, out } = linked();
    const mkdir = await capture(["mkdir", "data/sub"], vault);
    expect(mkdir.code).toBe(5);
    expect(existsSync(join(out, "sub"))).toBe(false);
    const before = process.env.HOME;
    process.env.HOME = vault; // the folder is home: its link leads out of home
    try {
      expect((await capture(["write", "data/far.md", "y"], vault)).code).toBe(5); // not followed yet
      setLinkAnswer(link, "follow");
      const r = await capture(["write", "data/far.md", "# Written"], vault);
      expect(r.err).toBe("");
      expect(r.code).toBe(0);
      expect(readFileSync(join(out, "far.md"), "utf8")).toBe("# Written\n");
    } finally {
      process.env.HOME = before;
    }
  });
  test("agents see what's followed: said for a hidden target, or one outside home", () => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-agents-")));
    expect(agentsWarning(join(home, ".ssh"), home)).toBe("~/.ssh is hidden");
    expect(agentsWarning(join(home, "work", ".aws", "x"), home)).toBe("~/work/.aws/x is hidden");
    expect(agentsWarning("/mnt/disk/data", home)).toBe("/mnt/disk/data is outside your home folder");
    expect(agentsWarning(join(home, "work", "notes"), home)).toBeNull();
  });
});
