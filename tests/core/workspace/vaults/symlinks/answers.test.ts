import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { runCli } from "../../../../../src/cli/cli.ts";

import {
  linkAnswer,
  linksFile,
  moveLink,
  probe,
  setLinkAnswer,
} from "../../../../../src/core/workspace/vaults/symlinks.ts";

import { makeVaultSandbox } from "../../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("the symlinks you've answered: listed, and forgotten (VV-D6)", () => {
  const cli = async (argv: string[], cwd: string) => {
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
    return { code, out, err, json: () => JSON.parse(out) };
  };

  test("slipbox symlinks lists each answer, where it leads and what was said; forget forgets one: asked again, and followed no more, its notes gone from search", async () => {
    const before = process.env.HOME;
    const state = process.env.XDG_STATE_HOME;
    process.env.HOME = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-home-")));
    process.env.XDG_STATE_HOME = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-state-"))); // answers of its own
    try {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-forget-")));
      const vault = join(top, "vault");
      const out = join(top, "out");
      mkdirSync(join(vault, ".slipbox"), { recursive: true });
      mkdirSync(join(top, "other"));
      mkdirSync(out);
      writeFileSync(join(vault, "index.md"), "# Index\n\n[far](data/far.md)\n");
      writeFileSync(join(out, "far.md"), "# Far\n\nquetzal feathers\n");
      symlinkSync(out, join(vault, "data"));
      symlinkSync(join(top, "other"), join(vault, "no"));
      expect((await cli(["symlinks"], vault)).out).toBe(
        "no symlink answered yet: one leading out asks when it's first opened in slipbox\n",
      );
      setLinkAnswer(join(vault, "data"), "follow");
      setLinkAnswer(join(vault, "no"), "no");
      await probe(out);
      expect((await cli(["search", "quetzal"], vault)).out).toContain("data/far.md");
      const listed = await cli(["symlinks"], vault);
      expect(listed.out.split("\n").sort()).toEqual(
        [
          "",
          `${join(vault, "data")} → ${out}  followed`,
          `${join(vault, "no")} → ${join(top, "other")}  not followed`,
        ].sort(),
      );
      const json = (await cli(["symlinks", "--json"], vault)).json().data;
      expect(json.find((a: { link: string }) => a.link === join(vault, "data"))).toMatchObject({
        target: out,
        answer: "follow",
        now: out,
      });
      // Forgotten, by its path from here: followed no more — not listed, nor searched, nor read; asked again in slipbox.
      const forgot = await cli(["symlinks", "forget", "data"], vault);
      expect(forgot.code).toBe(0);
      expect(forgot.out).toBe(`forgot ${join(vault, "data")} → ${out} (followed): asked again when it's next opened\n`);
      expect(linkAnswer(join(vault, "data"))).toBeNull();
      expect((await cli(["ls"], vault)).out).not.toContain("data/far.md");
      expect((await cli(["search", "quetzal"], vault)).out).not.toContain("data/far.md");
      expect((await cli(["read", "data/far.md"], vault)).code).toBe(5);
      expect((await cli(["symlinks"], vault)).out).toBe(`${join(vault, "no")} → ${join(top, "other")}  not followed\n`);
      // Nothing said of it now; nor of a path that's no link.
      expect((await cli(["symlinks", "forget", "data"], vault)).code).toBe(3);
      expect((await cli(["symlinks", "forget", join(vault, "index.md")], vault)).code).toBe(3);
      expect((await cli(["symlinks", "forget"], vault)).code).toBe(2);
      expect((await cli(["symlinks", "follow", "data"], vault)).code).toBe(2);
      expect((await cli(["symlinks", "forget", join(vault, "no")], top)).code).toBe(0);
      expect(linkAnswer(join(vault, "no"))).toBeNull();
    } finally {
      process.env.HOME = before;
      process.env.XDG_STATE_HOME = state;
    }
  });

  test("a link moved as a link: a relative one leads where it did, from its own text; its answer goes with it, and only its", () => {
    const state = process.env.XDG_STATE_HOME;
    const answers = () => JSON.parse(readFileSync(linksFile(), "utf8")).links as { link: string }[];
    process.env.XDG_STATE_HOME = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-state-")));
    try {
      const top = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-move-link-")));
      const w = join(top, "w");
      mkdirSync(join(w, "sub"), { recursive: true });
      mkdirSync(join(top, "far"));
      mkdirSync(join(top, "deep", "inner"), { recursive: true });
      writeFileSync(join(top, "deep", "t.md"), "# T\n");
      symlinkSync("../far", join(w, "b"));
      symlinkSync("b", join(w, "a")); // a link to a link
      symlinkSync(join(top, "deep", "inner"), join(w, "lnk"));
      symlinkSync("lnk/../t.md", join(w, "c.md")); // `..` after a link: the link's target's folder
      setLinkAnswer(join(w, "a"), "follow");
      moveLink(join(w, "a"), join(w, "sub", "a"));
      expect(readlinkSync(join(w, "sub", "a"))).toBe(join("..", "b"));
      expect(realpathSync(join(w, "sub", "a"))).toBe(join(top, "far"));
      expect(existsSync(join(w, "a"))).toBe(false);
      expect([linkAnswer(join(w, "sub", "a")), linkAnswer(join(w, "a"), join(top, "far"))]).toEqual(["follow", null]);
      moveLink(join(w, "c.md"), join(w, "sub", "c.md"));
      expect(readlinkSync(join(w, "sub", "c.md"))).toBe(["..", "lnk", "..", "t.md"].join(sep));
      expect(realpathSync(join(w, "sub", "c.md"))).toBe(join(top, "deep", "t.md"));
      // Back up again, and an absolute link as it is.
      moveLink(join(w, "sub", "a"), join(w, "a"));
      expect(readlinkSync(join(w, "a"))).toBe("b");
      moveLink(join(w, "lnk"), join(w, "sub", "lnk"));
      expect(readlinkSync(join(w, "sub", "lnk"))).toBe(join(top, "deep", "inner"));
      // Moved, without an answer, where one was kept once: one for where it leads holds (an answer is a place and where
      // it leads, as a link made there by hand would find it); one for elsewhere goes.
      symlinkSync("../../far", join(w, "sub", "d"));
      setLinkAnswer(join(w, "sub", "d"), "follow");
      rmSync(join(w, "sub", "d"));
      symlinkSync("../far", join(w, "d"));
      moveLink(join(w, "d"), join(w, "sub", "d"));
      expect(linkAnswer(join(w, "sub", "d"))).toBe("follow");
      symlinkSync(join(top, "deep"), join(w, "sub", "f"));
      setLinkAnswer(join(w, "sub", "f"), "follow");
      rmSync(join(w, "sub", "f"));
      symlinkSync("../far", join(w, "f"));
      moveLink(join(w, "f"), join(w, "sub", "f"));
      expect(linkAnswer(join(w, "sub", "f"))).toBeNull();
      expect(answers().filter((e) => e.link === join(w, "sub", "f"))).toEqual([]);
      // Where it can't be made, nothing has changed.
      writeFileSync(join(w, "sub", "taken"), "x");
      symlinkSync("../far", join(w, "taken"));
      expect(() => moveLink(join(w, "taken"), join(w, "sub", "taken"))).toThrow();
      expect(readlinkSync(join(w, "taken"))).toBe("../far");
      expect(readFileSync(join(w, "sub", "taken"), "utf8")).toBe("x");
      // A `\` is a name's own character here, not a folder's end.
      if (process.platform !== "win32") {
        writeFileSync(join(w, "x\\y.md"), "# XY\n");
        symlinkSync("x\\y.md", join(w, "bs.md"));
        moveLink(join(w, "bs.md"), join(w, "sub", "bs.md"));
        expect(readlinkSync(join(w, "sub", "bs.md"))).toBe("../x\\y.md");
        expect(realpathSync(join(w, "sub", "bs.md"))).toBe(join(w, "x\\y.md"));
      }
      // Moved, but its answer can't be kept for where it is now: said, the link moved all the same.
      symlinkSync("../far", join(w, "e"));
      setLinkAnswer(join(w, "e"), "follow");
      const stateDir = join(process.env.XDG_STATE_HOME!, "slipbox");
      chmodSync(stateDir, 0o500);
      try {
        expect(moveLink(join(w, "e"), join(w, "sub", "e"))).toMatch(
          /sub\/e: the link moved, but its answer couldn't be kept for its new place \(EACCES\)/,
        );
      } finally {
        chmodSync(stateDir, 0o755);
      }
      expect(readlinkSync(join(w, "sub", "e"))).toBe(join("..", "..", "far"));
      // Its answer stayed where it was: moved back there (an undo), the link is followed again.
      expect(moveLink(join(w, "sub", "e"), join(w, "e"))).toBeNull();
      expect(linkAnswer(join(w, "e"))).toBe("follow");
      // A link with no answer of its own, moved where an old one for elsewhere is, the state folder unwritable: no
      // answer lost, so nothing said.
      symlinkSync(join(top, "deep"), join(w, "sub", "h"));
      setLinkAnswer(join(w, "sub", "h"), "follow");
      rmSync(join(w, "sub", "h"));
      symlinkSync("../far", join(w, "h"));
      chmodSync(stateDir, 0o500);
      try {
        expect(moveLink(join(w, "h"), join(w, "sub", "h"))).toBeNull();
      } finally {
        chmodSync(stateDir, 0o755);
      }
    } finally {
      process.env.XDG_STATE_HOME = state;
    }
  });
});
