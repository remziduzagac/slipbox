// The in-process CLI fixture keeps its original streams, environment and vault.
import { runCli } from "../../src/cli/cli.ts";
import { VAULT } from "./vault-sandbox.ts";

export interface Captured {
  code: number;
  out: string;
  err: string;
}

export async function cli(argv: string[], stdin = ""): Promise<Captured> {
  let out = "";
  let err = "";
  const code = await runCli(argv, {
    out: (s) => (out += s),
    err: (s) => (err += s),
    stdin: async () => stdin,
    isTTY: false,
    columns: undefined,
    cwd: VAULT,
    env: { ...process.env, NO_COLOR: "1" },
  });
  return { code, out, err };
}
