import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverNvims, nvimSockets } from "../../../../src/core/documents/external-editors/nvim.ts";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("finding running nvims (4.12)", () => {
  test("sockets named nvim.* only, then only the ones that answer", async () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-nv-"));
    const net = await import("node:net");
    const listen = (p: string) =>
      new Promise<import("node:net").Server>((res) => {
        const srv = net.createServer();
        srv.listen(p, () => res(srv));
      });
    const a = await listen(join(dir, "nvim.123.0"));
    const b = await listen(join(dir, "nvim.wt-abc.sock"));
    const c = await listen(join(dir, "other.sock"));
    writeFileSync(join(dir, "nvim.notasocket"), "");
    try {
      expect(nvimSockets([dir, join(dir, "missing")])).toEqual([
        join(dir, "nvim.123.0"),
        join(dir, "nvim.wt-abc.sock"),
      ]);
      const found = discoverNvims({
        dirs: [dir],
        probe: (s) => (s.endsWith(".sock") ? { socket: s, cwd: "/w", file: "" } : null),
      });
      expect(found.map((f) => f.socket)).toEqual([join(dir, "nvim.wt-abc.sock")]);
    } finally {
      for (const srv of [a, b, c]) srv.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("finding running nvims (4.12): where, and what each says", () => {
  test("the sockets' folders: $XDG_RUNTIME_DIR, then each of nvim's own under $TMPDIR/nvim.$USER", async () => {
    const { nvimSocketDirs } = await import("../../../../src/core/documents/external-editors/nvim.ts");
    const { userInfo } = await import("node:os");
    const tmp = mkdtempSync(join(tmpdir(), "slipbox-nvdirs-"));
    const base = join(tmp, `nvim.${userInfo().username}`);
    mkdirSync(join(base, "a1"), { recursive: true });
    mkdirSync(join(base, "b2"));
    const dirs = nvimSocketDirs({ XDG_RUNTIME_DIR: "/run/user/7", TMPDIR: tmp });
    expect(dirs[0]).toBe("/run/user/7");
    expect(dirs.slice(1).sort()).toEqual([join(base, "a1"), join(base, "b2")]);
    expect(nvimSocketDirs({ TMPDIR: join(tmp, "none") })).toEqual([]); // no runtime dir, no nvim folder
    rmSync(tmp, { recursive: true, force: true });
  });

  test("each socket asked its cwd and file; one that fails, says nothing, or hangs is left out", async () => {
    const { probeNvim } = await import("../../../../src/core/documents/external-editors/nvim.ts");
    // A fake nvim on a PATH of its own: the user's nvims are never asked.
    const bin = mkdtempSync(join(tmpdir(), "slipbox-fakenvim-"));
    writeFileSync(
      join(bin, "nvim"),
      `#!/bin/sh\nprintf '%s\\n' "$@" > "\${0%/*}/args"\ncase "$2" in\n  *live*) printf '/work dir\\n/work dir/a.md\\n' ;;\n  *empty*) printf '\\n' ;;\n  *nofile*) printf '/w\\n\\n' ;;\n  *slow*) exec /bin/sleep 5 ;;\n  *) echo 'E247: Failed to connect'; exit 1 ;;\nesac\n`,
    );
    chmodSync(join(bin, "nvim"), 0o755);
    const was = process.env.PATH;
    process.env.PATH = bin;
    try {
      expect(probeNvim("/s/live")).toEqual({ socket: "/s/live", cwd: "/work dir", file: "/work dir/a.md" });
      expect(readFileSync(join(bin, "args"), "utf8").split("\n").slice(0, 3)).toEqual([
        "--server",
        "/s/live",
        "--remote-expr",
      ]);
      expect(probeNvim("/s/nofile")).toEqual({ socket: "/s/nofile", cwd: "/w", file: "" });
      expect(probeNvim("/s/stale")).toBeNull(); // nothing listening: nvim fails, whatever it printed
      expect(probeNvim("/s/empty")).toBeNull();
      const t = Date.now();
      expect(probeNvim("/s/slow", 300)).toBeNull();
      expect(Date.now() - t).toBeLessThan(3000);
    } finally {
      process.env.PATH = was;
      rmSync(bin, { recursive: true, force: true });
    }
  });
});
