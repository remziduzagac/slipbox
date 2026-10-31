import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { makeCliProcessSandbox } from "../../support/cli-process.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { MAIN, sandbox, vault, env, slipbox } = makeCliProcessSandbox();

describe("reading", () => {
  test("a missing CLI read stays not found, and write still needs --create (#168)", () => {
    expect(slipbox(["read", "new-file-168.md", "--json"]).code).toBe(3);
    expect(slipbox(["write", "new-file-168.md", "Text", "--json"]).code).toBe(3);
    expect(slipbox(["write", "new-file-168.md", "Text", "--create", "--json"]).code).toBe(0);
  });
  // util-linux's script: a terminal for the TUI's start (a pipe never gets one).
  test.skipIf(!Bun.spawnSync(["script", "--version"]).stdout.toString().includes("util-linux"))(
    "the TUI on a missing folder, or a --root that isn't a vault: a line and exit 3, never a stack trace",
    () => {
      for (const args of [["/nope/missing/"], ["--root", sandbox, "x.md"]]) {
        const cmd = ["bun", MAIN, ...args].map((a) => `'${a}'`).join(" ");
        const r = Bun.spawnSync(["script", "-qec", cmd, "/dev/null"], {
          cwd: vault,
          env,
          stdin: "ignore",
          timeout: 20_000,
        });
        const out = r.stdout.toString();
        expect(out).toMatch(/^slipbox: (no such directory|.* isn't a vault)/m);
        expect(out).not.toContain("    at ");
        expect(r.exitCode).toBe(3);
      }
    },
  );
});
