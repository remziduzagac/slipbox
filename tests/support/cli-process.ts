// A fresh demo copy and process environment for each CLI scenario owner.
import { afterAll, beforeAll } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Run {
  code: number;
  out: string;
  err: string;
  /** The --json envelope, when asked for. */
  json: {
    schema: number;
    ok: boolean;
    command: string;
    // biome-ignore lint/suspicious/noExplicitAny: each command's data has its own shape, read by the test that asks
    data: any;
    error?: { code: number; message: string };
    warnings: string[];
    stale: string[];
  };
}

export function makeCliProcessSandbox() {
  const MAIN = join(import.meta.dir, "../..", "src", "main.ts");
  const DEMO = join(import.meta.dir, "../..", "examples", "vault");
  const sandbox = mkdtempSync(join(tmpdir(), "slipbox-cli-"));
  const vault = join(sandbox, "vault");
  const env = {
    ...process.env,
    XDG_STATE_HOME: join(sandbox, "state"),
    XDG_CACHE_HOME: join(sandbox, "cache"),
    XDG_CONFIG_HOME: join(sandbox, "config"),
    XDG_DATA_HOME: join(sandbox, "data"), // the home vault (17.2)
    NO_COLOR: "1",
    SLIPBOX_CLIPBOARD: "file", // never the developer's clipboard
    // The sandbox's own config: an exported SLIPBOX_CONFIG would win over XDG_CONFIG_HOME and could
    // name the developer's real editor (send runs it).
    SLIPBOX_CONFIG: join(sandbox, "config", "slipbox", "config.toml"),
  };

  beforeAll(() => {
    cpSync(DEMO, vault, { recursive: true });
    mkdirSync(join(sandbox, "config", "slipbox"), { recursive: true });
    // `send` runs this instead of reaching a real editor.
    writeFileSync(join(sandbox, "config", "slipbox", "config.toml"), '[editor]\nremote = ["true {file} {line}"]\n');
  });
  afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

  function slipbox(args: string[], opts: { stdin?: string; cwd?: string; env?: Record<string, string> } = {}): Run {
    // A timeout, so a hang (a read that never ends) fails the test instead of the run.
    const r = Bun.spawnSync(["bun", MAIN, ...args], {
      cwd: opts.cwd ?? vault,
      env: { ...env, ...opts.env },
      stdin: opts.stdin === undefined ? "ignore" : Buffer.from(opts.stdin),
      timeout: 20_000,
    });
    const out = r.stdout.toString();
    let json = null;
    if (args.includes("--json")) json = JSON.parse(out);
    return { code: r.exitCode ?? -1, out, err: r.stderr.toString(), json: json as Run["json"] };
  }

  const note = (rel: string) => readFileSync(join(vault, rel), "utf8");

  return { MAIN, DEMO, sandbox, vault, env, slipbox, note };
}
