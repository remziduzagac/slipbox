import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { makeCliProcessSandbox } from "../../support/cli-process.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { sandbox, vault, slipbox } = makeCliProcessSandbox();

describe("writing", () => {
  /** A vault of its own, its own state, and `data` in it a link to a folder outside it holding `far.md` and `sub/`. */
  const linkedOut = () => {
    const dir = realpathSync(mkdtempSync(join(sandbox, "linked-")));
    const own = {
      XDG_STATE_HOME: join(dir, "state"),
      XDG_CACHE_HOME: join(dir, "cache"),
      XDG_DATA_HOME: join(dir, "d"),
    };
    const root = join(dir, "root");
    const out = join(dir, "out");
    mkdirSync(join(root, ".slipbox"), { recursive: true });
    mkdirSync(join(out, "sub"), { recursive: true });
    writeFileSync(join(root, "a.md"), "# A\n\n[far](data/far.md)\n");
    writeFileSync(join(out, "far.md"), "# Far\n\nKept out of the vault.\n");
    writeFileSync(join(out, "sub", "s.md"), "# S\n");
    symlinkSync(out, join(root, "data"));
    return { dir, own, root, out, link: join(root, "data") };
  };
  test("a read through a link not followed is refused, exit 5, saying the link and where to choose (VV-D6)", () => {
    const { own, root, out, link } = linkedOut();
    // Named by its path in the vault or by its whole path, read or rendered: said by its path in the vault.
    for (const args of [
      ["read", "data/far.md"],
      ["read", join(link, "far.md")],
      ["render", "data/far.md"],
    ]) {
      const r = slipbox(args, { cwd: root, env: own });
      expect([r.code, r.err]).toEqual([
        5,
        `slipbox: data/far.md is reached through a link that isn't followed (${link} → ${out}): open it in slipbox to choose\n`,
      ]);
      expect(r.out).not.toContain("Kept out of the vault");
    }
  });
  test("a note or folder through a followed link out of the vault isn't moved out of it: mv refused, exit 5 (VV-D6)", () => {
    const { dir, own, root, out, link } = linkedOut();
    // Followed, as the TUI keeps the answer: by the link, and where it leads.
    mkdirSync(join(dir, "state", "slipbox"), { recursive: true });
    writeFileSync(
      join(dir, "state", "slipbox", "links.json"),
      JSON.stringify({ version: 1, links: [{ link, target: out, answer: "follow", at: new Date().toISOString() }] }),
    );
    const run = (args: string[]) => slipbox(args, { cwd: root, env: own });
    // Read and indexed through it, being followed.
    expect(run(["read", "data/far.md"]).out).toContain("Kept out of the vault");
    expect(run(["ls"]).out).toContain("data/far.md");
    for (const [from, to] of [
      ["data/far.md", "far.md"],
      ["data/sub", "sub"],
    ] as const) {
      const r = run(["mv", from, to]);
      expect([r.code, r.err]).toEqual([5, `slipbox: ${from} resolves outside the vault\n`]);
      expect(existsSync(join(root, to))).toBe(false);
    }
    expect(readFileSync(join(out, "far.md"), "utf8")).toBe("# Far\n\nKept out of the vault.\n");
    expect(existsSync(join(out, "sub", "s.md"))).toBe(true);
  });

  /**
   * A vault `root`, and `ov` elsewhere reached from it through a followed link at `link` (below `root`), with the vaults
   * `nested` in `root`; each in a sandbox of its own, its machine's list read by `roots` (#53).
   */
  const followedVault = (link: string, nested: string[] = []) => {
    const dir = realpathSync(mkdtempSync(join(sandbox, "linked-vault-")));
    const own = {
      XDG_STATE_HOME: join(dir, "state"),
      XDG_CACHE_HOME: join(dir, "cache"),
      XDG_DATA_HOME: join(dir, "d"),
    };
    const root = join(dir, "root");
    const ov = join(dir, "elsewhere", "ov");
    for (const d of [root, ov, ...nested.map((n) => join(root, n))])
      mkdirSync(join(d, ".slipbox"), { recursive: true });
    mkdirSync(dirname(join(root, link)), { recursive: true });
    symlinkSync(ov, join(root, link));
    mkdirSync(join(dir, "state", "slipbox"), { recursive: true });
    writeFileSync(
      join(dir, "state", "slipbox", "links.json"),
      JSON.stringify({
        version: 1,
        links: [{ link: join(root, link), target: ov, answer: "follow", at: new Date().toISOString() }],
      }),
    );
    const roots = () =>
      (JSON.parse(readFileSync(join(dir, "state", "slipbox", "roots.json"), "utf8")).roots as { path: string }[])
        .map((r) => r.path)
        .sort();
    return { own, root, ov, roots };
  };

  test("a folder moved with a followed link to a vault elsewhere in it: the link moves, that vault stays where it is (#53)", () => {
    const { own, root, ov, roots } = followedVault("f/ov");
    writeFileSync(join(root, "f", "a.md"), "# A\n\n[o](ov/o.md)\n");
    writeFileSync(join(root, "top.md"), "# Top\n\n[o](f/ov/o.md)\n");
    writeFileSync(join(ov, "o.md"), "# O\n\n[back](../../root/f/a.md)\n");
    // Both opened once: both in the machine's list.
    for (const cwd of [root, ov]) expect(slipbox(["ls"], { cwd, env: own }).code).toBe(0);
    expect(roots()).toEqual([ov, root].sort());
    const r = slipbox(["mv", "f", "g2"], { cwd: root, env: own });
    expect([r.code, r.err]).toEqual([0, ""]);
    // The link moved with its folder, as any file in it; the vault it leads to didn't move.
    expect(realpathSync(join(root, "g2", "ov"))).toBe(ov);
    expect(roots()).toEqual([ov, root].sort());
    // Its own link into what moved follows it, as any other vault's does.
    expect(readFileSync(join(ov, "o.md"), "utf8")).toBe("# O\n\n[back](../../root/g2/a.md)\n");
    expect(readFileSync(join(root, "g2", "a.md"), "utf8")).toBe("# A\n\n[o](ov/o.md)\n");
    // A link through it from what stays: to where the link is now.
    expect(readFileSync(join(root, "top.md"), "utf8")).toBe("# Top\n\n[o](g2/ov/o.md)\n");
  });

  // The link in a vault nested in what moves: that vault moves, the one its link leads to doesn't.
  for (const [what, link, nested, move, moved] of [
    ["a folder holding a vault nested in it", "f/v/ov", "f/v", ["f", "g2"], "g2/v/ov"],
    ["a vault nested in it", "v/ov", "v", ["v", "w"], "w/ov"],
  ] as const)
    test(`${what} moved, with a followed link to a vault elsewhere in that vault: the vault elsewhere stays (#53)`, () => {
      const { own, root, ov, roots } = followedVault(link, [nested]);
      writeFileSync(join(root, nested, "a.md"), "# A\n");
      writeFileSync(join(ov, "o.md"), "# O\n");
      for (const cwd of [root, join(root, nested), ov]) expect(slipbox(["ls"], { cwd, env: own }).code).toBe(0);
      expect(roots()).toContain(ov);
      const r = slipbox(["mv", ...move], { cwd: root, env: own });
      expect([r.code, r.err]).toEqual([0, ""]);
      expect(realpathSync(join(root, moved))).toBe(ov);
      // Known where it is, never by the link's path, old or new.
      expect(roots()).toContain(ov);
      expect(roots().filter((p) => p.startsWith(`${root}/`) && p.endsWith("/ov"))).toEqual([]);
    });
});

describe("the vault and the tool", () => {
  test("review cycle 2: a symlink out of the vault is never read by path", () => {
    const outside = mkdtempSync(join(tmpdir(), "slipbox-cli-read-"));
    writeFileSync(join(outside, "secret.md"), "SECRET\n");
    symlinkSync(join(outside, "secret.md"), join(vault, "evil.md"));
    const r = slipbox(["read", "evil.md"]);
    expect(r.code).toBe(5);
    expect(r.out).not.toContain("SECRET");
    expect(slipbox(["find", "SECRET", "evil.md"]).out).not.toContain("SECRET");
    rmSync(join(vault, "evil.md"));
  });
  test("review cycle 4: a hostile vault — device symlinks and FIFOs never hang; JSON and new names stay clean", () => {
    const h = join(sandbox, "hostile");
    mkdirSync(join(h, ".slipbox"), { recursive: true });
    mkdirSync(join(h, "sub"));
    writeFileSync(join(h, "index.md"), "# a\n");
    symlinkSync("/dev/zero", join(h, ".slipbox", "config.toml"));
    symlinkSync("/dev/zero", join(h, ".slipbox", "version"));
    symlinkSync("/dev/zero", join(h, "sub", ".gitignore"));
    Bun.spawnSync(["mkfifo", join(h, "pipe")]);
    symlinkSync("pipe", join(h, "flink.md"));
    for (const args of [["ls"], ["info"], ["find", "a"], ["read", "flink.md"], ["backlinks", "index"]]) {
      const r = slipbox(["--root", h, ...args]);
      expect(r.code).not.toBe(-1); // -1: killed by the timeout
      expect(r.code).not.toBeNull();
    }
    expect(slipbox(["--root", h, "info"]).err).toContain("not a regular file");
    // C1 controls and bidi overrides are escaped in --json; the value is unchanged.
    const odd = "n\u009b31m\u202egnp.md";
    writeFileSync(join(h, odd), "# odd\n");
    const ls = slipbox(["--root", h, "ls", "--json"]);
    expect(ls.out).not.toMatch(/[\u0080-\u009f\u202a-\u202e]/);
    expect(ls.json.data.map((n: { path: string }) => n.path)).toContain(odd);
    expect(slipbox(["--root", h, "write", "sub\u202e/x", "hi", "--create"]).code).toBe(5);
    expect(existsSync(join(h, "sub\u202e"))).toBe(false);
  });
});
