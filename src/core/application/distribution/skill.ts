// The skill for agents, built into slipbox (GR-D10): `slipbox skill` prints it, and `slipbox skill --install <dir>`
// writes it to `<dir>/slipbox/SKILL.md`, where an agent's harness finds skills — so the skill an agent reads matches
// the slipbox it drives. Bun's text import puts the file's text into the compiled binary: a release carries it.

import { lstatSync, readlinkSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import text from "../../../../skills/slipbox/SKILL.md" with { type: "text" };
import { atomicWrite, readRegular, SMALL_FILE } from "../../foundation/platform/fsutil.ts";

/** The skill's text, as `skills/slipbox/SKILL.md` was when this slipbox was built. */
export const SKILL: string = text;

/** The skill's name: its front matter's, and the folder it's installed in. */
export const SKILL_NAME = "slipbox";

/** Whether a file's text is a skill slipbox wrote, this version's or another's: front matter first, naming it slipbox. */
export function isSlipboxSkill(file: string): boolean {
  const fm = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?(?:\n|$)/.exec(file);
  return !!fm && /^name:[ \t]*(["']?)slipbox\1[ \t]*\r?$/m.test(fm[1]!);
}

/**
 * - `created`: nothing was there.
 * - `updated`: another slipbox's skill was, written over.
 * - `replaced`: something else was — a file of another's, or a link — and `force` said to put the skill in its place.
 * - `unchanged`: this skill was there already; nothing written.
 */
export type SkillStatus = "created" | "updated" | "replaced" | "unchanged";

export interface SkillInstall {
  /** `<dir>/slipbox/SKILL.md`, absolute. */
  path: string;
  status: SkillStatus;
  /** The link removed to put the skill in its place (what it led to left as it is); null when there was none. */
  link: { path: string; to: string } | null;
  dryRun: boolean;
}

/** A write `installSkill` won't make: exit 5, as the CLI's other refusals. */
export class SkillRefused extends Error {}

/** Where a symlink at `path` leads, or null when there's none there. */
function linkAt(path: string): string | null {
  try {
    return lstatSync(path).isSymbolicLink() ? readlinkSync(path) : null;
  } catch {
    return null;
  }
}

/**
 * The skill written to `<dir>/slipbox/SKILL.md`, atomically. Never over a file that isn't a skill slipbox wrote, and
 * never through a link (`~/.claude/skills/slipbox` linked to a source checkout's `skills/slipbox`: writing there would
 * change the checkout) — unless `force`, which writes over the file, or removes the link and writes in its place. The
 * same skill there already, through a link or not, is left as it is. A dry run refuses as the run would, writing
 * nothing.
 */
export function installSkill(dir: string, opts: { force?: boolean; dryRun?: boolean } = {}): SkillInstall {
  const folder = join(resolve(dir), SKILL_NAME);
  const path = join(folder, "SKILL.md");
  const dryRun = !!opts.dryRun;
  try {
    const st = lstatSync(folder);
    if (!st.isDirectory() && !st.isSymbolicLink())
      throw new SkillRefused(`${folder} is there and isn't a folder: not writing the skill into it`);
  } catch (err) {
    if (err instanceof SkillRefused) throw err;
  }
  // What's there, read through any link: the same skill is the same wherever it lies.
  let there: string | null = null;
  try {
    there = readRegular(path, SMALL_FILE).toString("utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EFBIG") there = "";
    else if (code === "ENOTREG")
      throw new SkillRefused(`${path} is there and isn't a file: not writing the skill over it`);
    else if (code !== "ENOENT" && code !== "ENOTDIR") throw err;
  }
  if (there === SKILL) return { path, status: "unchanged", link: null, dryRun };
  const linked = linkAt(folder) !== null ? folder : linkAt(path) !== null ? path : null;
  const link = linked ? { path: linked, to: linkAt(linked)! } : null;
  if (link && !opts.force)
    throw new SkillRefused(
      `${link.path} is a link to ${link.to}: not writing through it (--force puts this slipbox's skill in its place, the link removed)`,
    );
  const theirs = there !== null && !isSlipboxSkill(there);
  if (theirs && !opts.force)
    throw new SkillRefused(
      `${path} isn't a skill slipbox wrote (its front matter doesn't name it slipbox): not writing over it (--force does)`,
    );
  const status: SkillStatus = there === null && !link ? "created" : link || theirs ? "replaced" : "updated";
  if (!dryRun) {
    // The link itself goes, never what it leads to; the skill is written in its place.
    if (link) unlinkSync(link.path);
    atomicWrite(path, SKILL);
  }
  return { path, status, link, dryRun };
}
