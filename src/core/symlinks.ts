// Links followed only when you say so (VV-D6). A symlinked folder or file leading out of where it is — its vault, home;
// anywhere in Elsewhere (VV-D3), which has nothing to stay inside — is shown as a link and not read until you answer,
// the first time it's opened: follow it, just look, or no. A link within its own vault, or within home (the links
// `stow` makes), is a second name for what's there: never asked about, never indexed twice.
//
// The answers are kept in slipbox's state (`links.json`), by link and target, never in the vault: a cloned repository
// can't bring its links trusted, and a link a pull points elsewhere is asked about again. What a yes allows: in home,
// reading, the index and writing through it; in a vault, reading and the index, never a write out of the vault; in
// Elsewhere, what the file system allows. A followed target is asked whether it answers before it's walked, off the
// main thread: one on a disk that doesn't answer is given up on (`probe`).

import { lstatSync, promises, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { climbsOut, ensureDir, readJson, realTarget, writeJson } from "./fsutil.ts";
import { stateHome, tildePath } from "./paths.ts";

/** What you answered for a link: follow it, or not. Just looking is for this once, never kept. */
export type LinkAnswer = "follow" | "no";

/** A link's answer, as `links.json` keeps it: the link by its own path, the target it led to then. */
export interface KeptLink {
  link: string;
  target: string;
  answer: LinkAnswer;
  at: string;
}

/** Where the answers are kept: slipbox's state, never the vault (VV-D6). */
export function linksFile(): string {
  return join(stateHome(), "links.json");
}

let cache: { file: string; mtime: number; list: KeptLink[] } | null = null;

/** The answers kept, read again when the file changed (another slipbox answered). */
function kept(): KeptLink[] {
  const file = linksFile();
  let mtime = -1;
  try {
    mtime = statSync(file).mtimeMs;
  } catch {}
  if (cache?.file === file && cache.mtime === mtime) return cache.list;
  const raw = readJson<{ links?: unknown } | null>(file, null);
  const list = (Array.isArray(raw?.links) ? (raw.links as Partial<KeptLink>[]) : []).filter(
    (e): e is KeptLink =>
      !!e && typeof e.link === "string" && typeof e.target === "string" && (e.answer === "follow" || e.answer === "no"),
  );
  cache = { file, mtime, list };
  return list;
}

function real(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/** Whether `path` is `dir` or in it. */
function within(dir: string, path: string): boolean {
  return !climbsOut(relative(dir, path));
}

/** A link by its own path: its folder by its real path, then its name — the same link however it's reached. */
export function linkKey(link: string): string {
  const p = resolve(link);
  return join(real(dirname(p)), basename(p));
}

/** Where a link leads now, by its real path; null when it's broken (nothing there, or a loop). */
export function linkTarget(link: string): string | null {
  try {
    return realpathSync(link);
  } catch {
    return null;
  }
}

/** Whether `path` is a symlink itself, not what it leads to. */
export function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * What you answered for `link` while it leads to `target` (where it leads now, by default): null when nothing was, or
 * it led elsewhere then — asked again.
 */
export function linkAnswer(link: string, target: string | null = linkTarget(link)): LinkAnswer | null {
  return target ? answerAt(linkKey(link), target) : null;
}

/** What you answered for the link known by `key` (`linkKey`) while it leads to `target`: `linkAnswer`, read nowhere
 *  near the link. */
function answerAt(key: string, target: string): LinkAnswer | null {
  const k = kept().find((e) => e.link === key);
  return k?.target === target ? k.answer : null;
}

/** Where you said to follow `link` to, as kept — read without going near it; null when it isn't followed. */
export function followedTarget(link: string): string | null {
  const key = linkKey(link);
  const k = kept().find((e) => e.link === key);
  return k?.answer === "follow" ? k.target : null;
}

/** Keep an answer for `link` and where it leads now — or, null, forget it: asked again. */
export function setLinkAnswer(link: string, answer: LinkAnswer | null): void {
  const key = linkKey(link);
  const target = linkTarget(link);
  const list = kept().filter((e) => e.link !== key);
  if (answer && target) list.push({ link: key, target, answer, at: new Date().toISOString() });
  ensureDir(stateHome());
  writeJson(linksFile(), { version: 1, links: list });
  cache = null;
}

/** An answer kept (VV-D6), as it's listed: and where the link leads now, the answer holding only while it's `target`. */
export interface AnswerKept extends KeptLink {
  /** Where the link leads now, by its real path; null when it's gone, or leads nowhere. */
  now: string | null;
}

/** The answers kept (VV-D6), newest first: each link by its own path, where it led then, what you said, and when. */
export function answersKept(): AnswerKept[] {
  return kept()
    .map((e) => ({ ...e, now: isLink(e.link) ? linkTarget(e.link) : null }))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/**
 * Forget what you answered for `link` (VV-D6) — named by its path as reached, or as `answersKept` lists it: asked
 * again the next time it's opened; followed, it's followed no more. The answer forgotten; null when none was kept.
 */
export function forgetLinkAnswer(link: string): KeptLink | null {
  const keys = new Set([linkKey(link), resolve(link)]);
  const list = kept();
  const hit = list.find((e) => keys.has(e.link));
  if (!hit) return null;
  ensureDir(stateHome());
  writeJson(linksFile(), { version: 1, links: list.filter((e) => e !== hit) });
  cache = null;
  return hit;
}

/**
 * Where a vault's links may lead without asking (VV-D6), by its real path: a vault's own folder; home's, home.
 * Elsewhere has none: every link there asks.
 */
export function linkScope(loc: { mode: string; root: string }): string | null {
  return loc.mode === "folder" ? null : real(loc.root);
}

/** How a link is taken where it is (VV-D6). */
export type LinkState =
  /** Within its vault or home: a second name for what's there, never asked about. */
  | "within"
  /** Out, and you said to follow it. */
  | "followed"
  /** Out, and not answered — or answered while it led elsewhere. */
  | "ask"
  /** Out, and you said no. */
  | "no"
  /** Leading nowhere: nothing there, or a loop. */
  | "broken";

/** How the link at `link` is taken from `scope` (`linkScope`'s): within it, followed, to ask about, refused, broken. */
export function linkState(link: string, scope: string | null, target = linkTarget(link)): LinkState {
  return linkStateAt(target ? linkKey(link) : "", scope, target);
}

/** `linkState` of the link known by `key` (`linkKey`), leading to `target`: from what was read of it elsewhere (T12: a
 *  listing on its own thread), nothing read here but the answers kept. */
export function linkStateAt(key: string, scope: string | null, target: string | null): LinkState {
  if (!target) return "broken";
  if (scope !== null && within(scope, target)) return "within";
  const a = answerAt(key, target);
  return a === "follow" ? "followed" : a === "no" ? "no" : "ask";
}

/** How the links on a path's way are taken. */
export interface WayOptions {
  /** A link being looked at, this once, by its key: read through, never followed. */
  looking?: (key: string) => boolean;
  /** Only through targets that answered (`answered`): what the index reads, never a disk not asked yet. */
  answering?: boolean;
}

/**
 * The first link on the way from `top` down to `path` — `path` itself among them — that leads out of `scope` and you
 * haven't said to follow (`opts`: one looked at, or, for the index, one whose target hasn't answered): what keeps
 * `path` from being read through it. Null when there's none, or `path` isn't under `top`. Only what's there is looked
 * at: a file not written yet ends the way.
 */
export function unfollowedLink(
  top: string,
  path: string,
  scope: string | null,
  opts: WayOptions = {},
): { link: string; target: string | null } | null {
  const rel = relative(top, resolve(path));
  if (!rel || climbsOut(rel)) return null;
  let at = top;
  for (const part of rel.split(sep)) {
    at = join(at, part);
    let link: boolean;
    try {
      link = lstatSync(at).isSymbolicLink();
    } catch {
      return null;
    }
    if (!link || opts.looking?.(linkKey(at))) continue;
    // A target followed that hasn't answered: not read through here, nor gone near.
    const followed = opts.answering ? followedTarget(at) : null;
    if (followed && answered(followed) !== true) return { link: at, target: followed };
    const target = linkTarget(at);
    const state = linkState(at, scope, target);
    if (state === "within" || state === "followed") continue;
    return { link: at, target };
  }
  return null;
}

/** A place, as the links on a path's way are looked at in it: a vault's, home's, Elsewhere's (`VaultLocation`'s). */
export interface LinkPlace {
  mode: string;
  root: string;
  /** Elsewhere's on the command line: the folder you work in. */
  workDir?: string;
}

/**
 * Where the links on the way to `path` are looked at from (VV-D6): a vault's folder, home; in Elsewhere, the folder you
 * work in (the command line's) or opened, when the path is under it — every link from there down asks — or, a path
 * named outright outside both, the file's own folder: what's above the folder you work in is yours to name, and only the
 * file itself, a link, asks.
 */
function wayFrom(loc: LinkPlace, path: string): string {
  if (loc.mode !== "folder") return loc.root;
  const p = resolve(path);
  for (const top of [loc.workDir, loc.root]) if (top && within(top, p)) return top;
  return dirname(p);
}

/**
 * The first link on the way to `path` that keeps it from being read in `loc` (VV-D6) — one leading out of its vault or
 * home, or any in Elsewhere, you haven't said to follow (`opts`: `unfollowedLink`'s); null when none.
 */
export function blockingLink(
  loc: LinkPlace,
  path: string,
  opts: WayOptions = {},
): { link: string; target: string | null } | null {
  return unfollowedLink(wayFrom(loc, path), path, linkScope(loc), opts);
}

/**
 * Whether a write to `path` (as reached) may land where it does (VV-D6): in home, through the links it follows; in
 * Elsewhere, as the file system allows, once its links are followed; in a vault, never out of it, followed or not —
 * a link a pull can change could lead a save to `~/.bashrc`.
 */
export function writesThrough(loc: LinkPlace, path: string): boolean {
  if (loc.mode === "vault") return within(real(loc.root), realTarget(path));
  return blockingLink(loc, path) === null;
}

/** A link, as a message says it: `~/notes/data → /mnt/disk/data`. */
export function linkSaid(link: string, target: string | null): string {
  return target ? `${tildePath(link)} → ${tildePath(target)}` : `${tildePath(link)} (leading nowhere)`;
}

/**
 * Why agents seeing what a link leads to deserves a word (VV-D6): what's followed is in search, the context bundle and
 * the command line's answers. Said when the target is hidden — a folder or file on its way from home starting with a
 * dot, `~/.ssh`, `~/.aws` — or outside home. Null otherwise.
 */
export function agentsWarning(target: string, home = process.env.HOME || homedir()): string | null {
  const rel = relative(real(home), target);
  if (climbsOut(rel)) return `${target} is outside your home folder`;
  if (rel.split(sep).some((p) => p.startsWith("."))) return `${join("~", rel)} is hidden`;
  return null;
}

/** How long a followed link's target has to answer before it's given up on (VV-D6). */
export const PROBE_MS = 3000;

/** A target given up on is asked again after this long: a disk mounted again comes back. */
const RETRY_MS = 60_000;

const probed = new Map<string, { ok: boolean; at: number }>();

/** Whether a followed target answered when last asked: true; false, given up on; null, not asked yet (or long ago). */
export function answered(target: string, now = Date.now()): boolean | null {
  const p = probed.get(target);
  if (!p) return null;
  return p.ok || now - p.at < RETRY_MS ? p.ok : null;
}

/** A target read as the walk would begin to: a folder listed, a file statted — on libuv's threads, not the main one. */
async function readTarget(target: string): Promise<boolean> {
  const st = await promises.stat(target);
  if (st.isDirectory()) await promises.readdir(target);
  return true;
}

/**
 * Ask `target` whether it answers — a folder listed, a file statted — within `ms`, off the main thread: a disk that
 * doesn't (a share gone, a mount hung) is given up on, never waited for. The answer is kept for the walk.
 */
export async function probe(target: string, ms = PROBE_MS, read = readTarget): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ok = await Promise.race([
    read(target).catch(() => false),
    new Promise<boolean>((done) => {
      timer = setTimeout(() => done(false), ms);
    }),
  ]);
  clearTimeout(timer);
  probed.set(target, { ok, at: Date.now() });
  return ok;
}

/** What the targets answered, forgotten (a test's clean start). */
export function forgetProbes(): void {
  probed.clear();
}

/** What the targets answered, and when: for a walk on another thread, which has no answers of its own (T12). */
export function probeAnswers(): [string, { ok: boolean; at: number }][] {
  return [...probed];
}

/** The answers another thread had (`probeAnswers`), taken as this thread's: a walk there reads them as here. */
export function takeProbeAnswers(answers: readonly [string, { ok: boolean; at: number }][]): void {
  probed.clear();
  for (const [target, p] of answers) probed.set(target, p);
}

/**
 * The followed links in `top` (by their path) whose targets haven't been asked yet, asked whether they answer: those
 * that did, and those given up on.
 */
export async function probeFollowed(
  top: string,
  ms = PROBE_MS,
): Promise<{ answered: string[]; gaveUp: { link: string; target: string }[] }> {
  const at = real(top);
  // The target as answered for, never the link read again here: reading it is what may not answer.
  const mine = kept().filter((e) => e.answer === "follow" && within(at, e.link) && answered(e.target) === null);
  const results = await Promise.all(mine.map(async (e) => ({ e, ok: await probe(e.target, ms) })));
  return {
    answered: results.filter((r) => r.ok).map((r) => r.e.link),
    gaveUp: results.filter((r) => !r.ok).map((r) => ({ link: r.e.link, target: r.e.target })),
  };
}
