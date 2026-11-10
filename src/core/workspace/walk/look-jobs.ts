// What the TUI's look each second asks of a disk thread besides a stat of each path (SD-T4; disk-jobs.ts hands these
// here): each open file's way checked for a link not followed and, none there, the file statted; git's state where the
// vault is; your config and the vault's read and parsed; the root's tool's settings. Each read as the screen's thread
// would read it — the same code, through the seam (SD-D10) — with what that thread knows given in the request (the links
// being looked at) or carried with it (`walkContext`: the environment, the root markers).

import { loadConfig } from "../../application/config/config.ts";
import type { LoadedConfig } from "../../application/config/contracts.ts";
import * as disk from "../../foundation/platform/disk.ts";
import { userConfigFile } from "../../foundation/platform/paths.ts";
import { type ToolRead, toolRead } from "../links/convention.ts";
import { blockingLink, type LinkPlace } from "../vaults/symlinks.ts";
import { configFilesFor, type VaultLocation } from "../vaults/vault.ts";
import { type GitSeen, gitSeenAt } from "../vaults/vault-feed.ts";

/** A path statted: what it is, its mtime, ctime and size; or its error's code (`ENOENT`, `EACCES`, …). */
export type PathStat =
  | { kind: "file" | "dir" | "link" | "other"; mtimeMs: number; ctimeMs: number; size: number }
  | { error: string };

const codeOf = (err: unknown): string => (err as NodeJS.ErrnoException).code ?? (err as Error).message ?? String(err);

/** `path` statted through the seam: its links followed, or its own (`own`, `lstat`). */
export function pathStat(path: string, own = false): PathStat {
  try {
    const st = own ? disk.lstat(path) : disk.stat(path);
    const kind = st.isFile() ? "file" : st.isDirectory() ? "dir" : st.isSymbolicLink() ? "link" : "other";
    return { kind, mtimeMs: st.mtimeMs, ctimeMs: st.ctimeMs, size: st.size };
  } catch (err) {
    return { error: codeOf(err) };
  }
}

/** A place, as `loc` is to the look: a vault's, home's, Elsewhere's. */
type Place = Pick<VaultLocation, "mode" | "root">;

/** Your config and the vault's, as the look reads them: the files, each stamped before it's read (an mtime; -1 for
 *  none), the config they make, and each file's last good contents (a typo saved mid-edit keeps what it said). */
export interface ConfigRead {
  stamps: [string, number][];
  loaded: LoadedConfig;
  lastGood: [string, Record<string, unknown>][];
}

/** A file's way, checked: the link not followed on it that keeps it from being read, else the file statted. */
export interface WayAnswer {
  blocked: { link: string; target: string | null } | null;
  stat: PathStat | null;
}

export type LookJob =
  | { op: "way"; place: LinkPlace; looking: string[]; paths: string[] }
  | { op: "git"; loc: Place }
  | { op: "config"; loc: Place; configFile?: string; lastGood: [string, Record<string, unknown>][] }
  | { op: "tool"; root: string };

export type LookJobAnswer =
  | { ways: WayAnswer[] }
  | { git: GitSeen }
  | { config: ConfigRead }
  | { tool: ToolRead | null };

export const LOOK_OPS: readonly string[] = ["way", "git", "config", "tool"];

/** The config files a place reads, in order (`loadConfig`'s): yours (`--config`, `SLIPBOX_CONFIG` or the XDG one), the
 *  vaults' enclosing it, its own. */
export function configFiles(loc: Place, configFile?: string): string[] {
  const { vaultFile, outerFiles } = configFilesFor(loc);
  return [
    configFile ?? process.env.SLIPBOX_CONFIG ?? userConfigFile(),
    ...outerFiles,
    ...(vaultFile ? [vaultFile] : []),
  ];
}

/** A file's mtime, through the seam; -1 when there's none. */
export function mtimeOf(path: string): number {
  try {
    return disk.stat(path).mtimeMs;
  } catch {
    return -1;
  }
}

/** Your config and the vault's read and parsed (`loadConfig`), each file stamped first. */
function configOf(job: Extract<LookJob, { op: "config" }>): ConfigRead {
  const stamps = configFiles(job.loc, job.configFile).map((f) => [f, mtimeOf(f)] as [string, number]);
  const lastGood = new Map(job.lastGood);
  const loaded = loadConfig({ ...configFilesFor(job.loc), configFile: job.configFile, lastGood });
  return { stamps, loaded, lastGood: [...lastGood] };
}

/** A look's job answered here: what it asked for, read as the screen's thread would. */
export function answerLookJob(job: LookJob): LookJobAnswer {
  switch (job.op) {
    case "way": {
      const looking = new Set(job.looking);
      const ways = job.paths.map((path): WayAnswer => {
        const blocked = blockingLink(job.place, path, { looking: (k) => looking.has(k) });
        return { blocked, stat: blocked ? null : pathStat(path) };
      });
      return { ways };
    }
    case "git":
      return { git: gitSeenAt(job.loc) };
    case "config":
      return { config: configOf(job) };
    case "tool":
      return { tool: toolRead(job.root) };
  }
}
