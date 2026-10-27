import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCliProcessSandbox } from "../../support/cli-process.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { sandbox, slipbox } = makeCliProcessSandbox();

describe("the CLI's edges: help flags, error paths, empty states", () => {
  /** A root of its own, with a state, cache and config only it knows. */
  function fresh(prefix: string): { root: string; dir: string; env: Record<string, string> } {
    const dir = mkdtempSync(join(sandbox, prefix));
    const root = join(dir, "root");
    mkdirSync(join(root, ".slipbox"), { recursive: true });
    const env = {
      XDG_STATE_HOME: join(dir, "state"),
      XDG_CACHE_HOME: join(dir, "cache"),
      XDG_DATA_HOME: join(dir, "data"),
      XDG_CONFIG_HOME: join(dir, "config"),
      SLIPBOX_CONFIG: join(dir, "config", "slipbox", "config.toml"),
    };
    return { root, dir, env };
  }
  test("send: no remote editor set, one that won't start, one that fails — exit 1, said; --server where no nvim answers — exit 3", () => {
    const { root, dir, env } = fresh("send-errors-");
    writeFileSync(join(root, "n.md"), "# N\n");
    const cfg = (name: string, remote: string) => {
      const p = join(dir, `${name}.toml`);
      writeFileSync(p, `[editor]\nremote = ${remote}\n`);
      return p;
    };
    const none = slipbox(["send", "n.md", "--config", cfg("none", "[]")], { cwd: root, env });
    expect(none).toMatchObject({
      code: 1,
      err: "slipbox: set [editor] remote in the config to send notes to a running editor\n",
    });
    const gone = slipbox(["send", "n.md", "--config", cfg("gone", '["slipbox-no-such-editor {file}"]')], {
      cwd: root,
      env,
    });
    expect(gone.code).toBe(1);
    expect(gone.err).toStartWith("slipbox: couldn't start slipbox-no-such-editor");
    const fails = slipbox(["send", "n.md", "--line", "3", "--config", cfg("fail", '["false {file} {line}"]')], {
      cwd: root,
      env,
    });
    expect(fails).toMatchObject({ code: 1, err: `slipbox: false ${join(root, "n.md")} exited with 1\n` });
    // The nvim preset names a {server}: --server must name one that answers.
    const sock = join(dir, "no-nvim.sock");
    const r = slipbox(["send", "n.md", "--server", sock, "--config", cfg("nvim", '["nvim"]'), "--json"], {
      cwd: root,
      env,
    });
    expect(r.code).toBe(3);
    expect(r.json).toMatchObject({ ok: false, error: { code: 3, message: `no nvim answers at ${sock}` } });
  });
});
