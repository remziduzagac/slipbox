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
import { join } from "node:path";
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
