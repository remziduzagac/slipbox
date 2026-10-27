// Automatic user skill lifecycle (ASI): shared by installation, upgrades and uninstall.
import { lstatSync, rmdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { readRegular, SMALL_FILE } from "../../foundation/platform/fsutil.ts";
import { installSkill, isSlipboxSkill } from "./skill.ts";

export type SkillEnv = Record<string, string | undefined>;
/** Homebrew preserves prefixed variables through its formula environment filter. */
function skillEnvironment(env: SkillEnv): SkillEnv {
  return {
    ...env,
    CLAUDE_CONFIG_DIR: env.CLAUDE_CONFIG_DIR || env.HOMEBREW_SLIPBOX_CLAUDE_CONFIG_DIR,
    CODEX_HOME: env.CODEX_HOME || env.HOMEBREW_SLIPBOX_CODEX_HOME,
    SLIPBOX_NO_SKILL: env.SLIPBOX_NO_SKILL || env.HOMEBREW_SLIPBOX_NO_SKILL,
  };
}

export interface SkillLocation {
  path: string;
  what: string;
}

/** Known user destinations only; an existing configuration directory is the detection signal. */
export function skillDirectories(env: SkillEnv): string[] {
  env = skillEnvironment(env);
  const home = env.HOME;
  if (!home || !isAbsolute(home)) return [];
  const configured = (value: string | undefined, fallback: string) =>
    value && isAbsolute(value) ? value : join(home, fallback);
  const claude = configured(env.CLAUDE_CONFIG_DIR, ".claude");
  const codex = configured(env.CODEX_HOME, ".codex");
  const directory = (path: string) => {
    try {
      return statSync(path).isDirectory();
    } catch {
      return false;
    }
  };
  const dirs: string[] = [];
  if (directory(claude)) dirs.push(join(claude, "skills"));
  if (directory(codex)) {
    dirs.push(join(codex, "skills"));
    if (!env.CODEX_HOME) dirs.push(join(home, ".agents", "skills"));
  }
  return [...new Set(dirs)];
}

/** Automatic operations preserve links anywhere in the destination, including linked skills parents. */
function linkedAncestor(path: string): boolean {
  for (let at = resolve(path); ; at = dirname(at)) {
    try {
      if (lstatSync(at).isSymbolicLink()) return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    if (dirname(at) === at) return false;
  }
}

export function automaticSkills(env: SkillEnv): { reports: string[]; skipped: boolean } {
  env = skillEnvironment(env);
  if (env.SLIPBOX_NO_SKILL === "1") return { reports: ["agent skills skipped (SLIPBOX_NO_SKILL=1)"], skipped: true };
  const reports: string[] = [];
  for (const dir of skillDirectories(env)) {
    const path = join(dir, "slipbox", "SKILL.md");
    try {
      if (linkedAncestor(path)) {
        reports.push(`left ${path}: linked destination`);
        continue;
      }
      const result = installSkill(dir);
      reports.push(`${result.status} agent skill: ${result.path}`);
    } catch (err) {
      reports.push(`left ${path}: ${(err as Error).message}`);
    }
  }
  if (!reports.length)
    reports.push("no Claude Code or Codex user configuration found; slipbox skill --install <dir> installs the skill");
  return { reports, skipped: false };
}

/** Read-only ownership check, also used immediately before deletion. */
export function ownedSkill(path: string): boolean {
  return (
    !linkedAncestor(path) && lstatSync(path).isFile() && isSlipboxSkill(readRegular(path, SMALL_FILE).toString("utf8"))
  );
}

export function skillRemovalPlan(env: SkillEnv): { remove: SkillLocation[]; notes: string[] } {
  const remove: SkillLocation[] = [];
  const notes: string[] = [];
  for (const dir of skillDirectories(env)) {
    const path = join(dir, "slipbox", "SKILL.md");
    try {
      if (ownedSkill(path)) remove.push({ path, what: "the agent skill" });
      else notes.push(`left ${path}: hand-written or linked agent skill`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") notes.push(`left ${path}: ${(err as Error).message}`);
      // A dangling link at the folder is reported too.
      else if (linkedAncestor(path)) notes.push(`left ${path}: linked agent skill`);
    }
  }
  return { remove, notes };
}

/** Only the recognized file goes; a folder with any other contents stays. */
export function removeOwnedSkill(path: string): void {
  if (!ownedSkill(path)) throw new Error("no longer a regular skill owned by slipbox");
  unlinkSync(path);
  try {
    rmdirSync(dirname(path));
  } catch {}
}
