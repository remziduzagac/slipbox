// Finding the nvims to send a note to (plan 4.12). Every nvim since 0.9 listens on a socket of
// its own — `$XDG_RUNTIME_DIR/nvim.<pid>.0`, or `/tmp/nvim.$USER/<dir>/nvim.<pid>.0` without that
// variable — and `nvim --listen` sockets are usually named `nvim.*` there too. A socket can
// outlive its nvim, so each is asked what it's doing; the ones that don't answer are left out.

import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";

export interface NvimServer {
  /** The socket to pass to `--server`. */
  socket: string;
  /** Its working directory and the file in its current window ("" for none). */
  cwd: string;
  file: string;
}

/** The directories nvim puts its sockets in. */
export function nvimSocketDirs(env: Record<string, string | undefined> = process.env): string[] {
  const out: string[] = [];
  if (env.XDG_RUNTIME_DIR) out.push(env.XDG_RUNTIME_DIR);
  let user = env.USER ?? "";
  try {
    user = userInfo().username;
  } catch {}
  // Without XDG_RUNTIME_DIR, nvim uses a private folder per server under /tmp/nvim.$USER.
  const base = join(env.TMPDIR ?? tmpdir(), `nvim.${user}`);
  try {
    for (const d of readdirSync(base)) out.push(join(base, d));
  } catch {}
  return out;
}

/** Sockets named like nvim's in those directories (not yet known to be alive). */
export function nvimSockets(dirs: string[]): string[] {
  const out: string[] = [];
  for (const dir of dirs) {
    let names: string[] = [];
    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }
    for (const n of names.sort()) {
      if (!n.startsWith("nvim.")) continue;
      const p = join(dir, n);
      try {
        if (statSync(p).isSocket()) out.push(p);
      } catch {}
    }
  }
  return out;
}

/** Ask one nvim what it's doing; null when nothing answers (a stale socket) in `timeoutMs`. */
export function probeNvim(socket: string, timeoutMs = 1000): NvimServer | null {
  const r = spawnSync("nvim", ["--server", socket, "--remote-expr", 'getcwd() . "\\n" . expand("%:p")'], {
    encoding: "utf8",
    timeout: timeoutMs,
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (r.status !== 0 || typeof r.stdout !== "string" || !r.stdout.trim()) return null;
  const [cwd = "", file = ""] = r.stdout.split("\n");
  return { socket, cwd, file };
}

/** The live nvims, found and probed. */
export function discoverNvims(opts: { dirs?: string[]; probe?: (socket: string) => NvimServer | null } = {}): NvimServer[] {
  const probe = opts.probe ?? probeNvim;
  return nvimSockets(opts.dirs ?? nvimSocketDirs())
    .map((s) => probe(s))
    .filter((s): s is NvimServer => s !== null);
}

/** The preset for `[editor] remote = "nvim"`: open the file, then go to the line (nvim's
 *  `--remote` takes no `+line`). `{server}` is the chosen socket. */
export const NVIM_REMOTE = ["nvim --server {server} --remote {file}", "nvim --server {server} --remote-send <C-\\><C-N>:{line}<CR>"];
