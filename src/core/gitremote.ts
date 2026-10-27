// The remote's commands and stash (plan 26.6, GIT-D4): fetch, pull (fast-forward; merging or rebasing when asked,
// GIT-D6), push to the branch's upstream, and the stashes listed, saved, applied, popped and dropped — each asked for,
// none on a timer. git runs without a terminal: nothing waits for a password (`GIT_TERMINAL_PROMPT=0`, ssh in batch
// mode unless you set your own ssh command); git's credential helpers still answer. A failure is git's own words. In a
// vault not trusted, `gitArgs`'s guards hold — no hook runs, a push's pre-push neither (D172, D175) — a push and a
// pull's commits aren't signed, submodules aren't reached, and a program the repository's own config names for the
// remote (its ssh command, a credential helper, an upload pack) refuses the command rather than run. Paths and refs are
// git's; nothing here waits on the network.

import { execFile, execFileSync } from "node:child_process";
import type { Checkout } from "./git.ts";
import { gitArgs, refName } from "./gitops.ts";
import { isTrusted } from "./workspace/vaults/trust.ts";

/** Where the branch stands against its upstream, as `git status --branch` says it. */
export interface Track {
  /** The branch checked out; null when HEAD is detached. */
  branch: string | null;
  /** Its upstream (`origin/main`); null when it has none. */
  upstream: string | null;
  ahead: number;
  behind: number;
  /** The upstream is set, but its branch is gone from the remote. */
  gone: boolean;
}

/** `git status --porcelain=v1 --branch`'s first line read: `## main...origin/main [ahead 2, behind 1]`. */
export function parseTrack(header: string): Track | null {
  const m = /^## (.*)$/.exec(header.split("\0")[0]!.split("\n")[0]!);
  if (!m) return null;
  let rest = m[1]!;
  const note = / \[([^\]]*)\]$/.exec(rest);
  if (note) rest = rest.slice(0, note.index);
  // Before the first commit, git says so ahead of the branch's name.
  rest = rest.replace(/^(?:No commits yet on |Initial commit on )/, "");
  if (/^HEAD \(no branch\)$/.test(rest)) return { branch: null, upstream: null, ahead: 0, behind: 0, gone: false };
  // A branch's name can't hold `..`, so the first `...` is where its upstream starts.
  const at = rest.indexOf("...");
  const branch = at < 0 ? rest : rest.slice(0, at);
  const upstream = at < 0 ? null : rest.slice(at + 3) || null;
  const said = note?.[1] ?? "";
  return {
    branch,
    upstream,
    ahead: Number(/ahead (\d+)/.exec(said)?.[1] ?? 0),
    behind: Number(/behind (\d+)/.exec(said)?.[1] ?? 0),
    gone: said === "gone",
  };
}

/** The ahead and behind after the branch where you are (`↑2 ↓1`): only what isn't zero; nothing without an upstream, or in step. */
export function trackText(t: Track | null, ahead = "↑", behind = "↓"): string {
  if (!t?.upstream || t.gone) return "";
  return [t.ahead ? `${ahead}${t.ahead}` : "", t.behind ? `${behind}${t.behind}` : ""].filter(Boolean).join(" ");
}

/**
 * Where a branch with no upstream is pushed, asked first: `origin/<branch>`, or the one remote when there's only one
 * and it isn't called so; null when there's no remote, or several and none is origin.
 */
export function upstreamFor(branch: string, remotes: string[]): { remote: string; branch: string } | null {
  if (remotes.includes("origin")) return { remote: "origin", branch };
  return remotes.length === 1 ? { remote: remotes[0]!, branch } : null;
}

/** A key of git's config, where it's set: `local`, `global`, `system`, `worktree`, `command`. */
export interface Scoped {
  scope: string;
  key: string;
  value: string;
}

/** `git config --show-scope --get-regexp` read: each line's scope, key and value. */
export function parseScoped(out: string): Scoped[] {
  return out
    .split("\n")
    .map((l) => /^(\S+)\t(\S+)(?: (.*))?$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ scope: m[1]!, key: m[2]!, value: m[3] ?? "" }));
}

/**
 * The config that names a program git runs to reach a remote: an ssh command, a proxy, a password asker, a credential
 * helper, the remote's upload or receive pack, a transport allowed (`ext::` runs a command). Keys as git lists them:
 * section and name in lower case.
 */
const PROGRAMS =
  "^(core\\.(sshcommand|gitproxy|askpass)|credential\\..*helper|remote\\..*\\.(uploadpack|receivepack)|protocol\\.(.*\\.)?allow)$";

/** The repository's own: what its `.git/config` (or a worktree's) sets, as opposed to yours. */
const OWN = new Set(["local", "worktree"]);

/** Of the remote's programs, those the repository's own config names. */
export const ownPrograms = (config: Scoped[]): string[] => config.filter((c) => OWN.has(c.scope)).map((c) => c.key);

/**
 * git's environment for a merge or a rebase (GIT-D6): no terminal prompt, and no editor — the repository's own
 * `core.editor` names a program too — so a message is kept as git has it.
 */
export function editorless(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...env, GIT_TERMINAL_PROMPT: "0", GIT_EDITOR: "true", GIT_SEQUENCE_EDITOR: "true" };
}

/**
 * git's environment where slipbox reads its words (a refusal, a conflict, "Everything up-to-date"): git's own
 * English, whatever your locale — `LC_ALL=C`, and no `LANGUAGE`, which would win over it.
 */
export function inEnglish(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...env, LC_ALL: "C" };
  delete out.LANGUAGE;
  return out;
}

/** How a git run in the background was stopped, if it was: it printed too much, or took too long; null if it wasn't. */
export function stopOf(err: unknown): string | null {
  const e = err as { code?: unknown; killed?: boolean };
  if (e.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") return "git printed more than slipbox reads, and was stopped";
  if (e.killed) return "git took too long, and was stopped";
  return null;
}

/** Why a git run in the background failed: what it printed, else that it printed too much, or took too long. */
export function failureOf(err: unknown, stderr: string, stdout: string): string {
  return stopOf(err) ?? gitReason(stderr, stdout);
}

/**
 * A name slipbox hands git — a remote's, a branch's, a ref's, a base — checked first, as `refName` has it (git's own
 * rules for a ref's name): one that isn't such a name, one that starts with `-` among them, is refused, said why (null:
 * it's fine). No remote or branch git makes is named so; git is also told where its options end.
 */
export function refusedName(what: string, name: string): string | null {
  if (refName(name)) return null;
  return name.startsWith("-")
    ? `${what} "${name}" starts with "-": slipbox doesn't pass it to git`
    : `${what} "${name}" isn't a name git takes: slipbox doesn't pass it to git`;
}

/**
 * The environment git reaches a remote with: never a terminal prompt — a login git can't make with what it has fails
 * at once — and ssh in batch mode, which asks for no password or passphrase, unless you set your own ssh command
 * (`GIT_SSH_COMMAND`, `GIT_SSH`, or `core.sshCommand`, `sshCommandSet`).
 */
export function remoteEnv(env: NodeJS.ProcessEnv, sshCommandSet: boolean): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...env, GIT_TERMINAL_PROMPT: "0" };
  if (!env.GIT_SSH_COMMAND && !env.GIT_SSH && !sshCommandSet) out.GIT_SSH_COMMAND = "ssh -o BatchMode=yes";
  return out;
}

/**
 * Why git failed, in its words, from what it printed: a remote's refusal (`! [rejected] main -> main (fetch first)`),
 * else its `fatal:` or `error:` line (and the files it names after it), else a merge's conflict, else its first line
 * that isn't a hint.
 */
export function gitReason(stderr: string, stdout = ""): string {
  const lines = stderr.split(/\r?\n/);
  const rejected = lines.find((l) => /^ ! \[/.test(l));
  if (rejected) return rejected.trim().replace(/^! /, "").replace(/\s+/g, " ");
  const at = lines.findIndex((l) => /^(fatal|error): /.test(l));
  if (at >= 0) {
    const files = [];
    for (let i = at + 1; i < lines.length && /^\t/.test(lines[i]!); i++) files.push(lines[i]!.trim());
    const said = lines[at]!.replace(/^(fatal|error): /, "");
    return files.length ? `${said.replace(/:$/, "")}: ${files.join(", ")}` : said;
  }
  const out = stdout.split(/\r?\n/);
  const conflict = out.find((l) => /^CONFLICT /.test(l));
  if (conflict) return `${conflict}${out.some((l) => /stash entry is kept/.test(l)) ? " — the stash is kept" : ""}`;
  const first = [...lines, ...out].find((l) => l.trim() && !/^hint:/.test(l));
  return first?.trim() ?? "git failed";
}

/** Whether a failure is a login git couldn't make without a terminal: a password, a passphrase, a host's key. */
export const needsLogin = (reason: string): boolean =>
  /terminal prompts disabled|could not read (Username|Password)|Authentication failed|Permission denied|Host key verification failed|Could not read from remote repository|passphrase/i.test(
    reason,
  );

const SHORT = { encoding: "utf8" as const, timeout: 15_000, maxBuffer: 16 * 1024 * 1024 };

/** A quick question to git, waited for: its output, or null when it failed. */
function ask(c: Pick<Checkout, "root">, args: string[]): string | null {
  try {
    return execFileSync("git", gitArgs(c.root, args), { ...SHORT, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

/** The repository's remotes, by name; null without git. */
export function remotesOf(c: Pick<Checkout, "root">): string[] | null {
  const out = ask(c, ["remote"]);
  return out === null ? null : out.split("\n").filter(Boolean);
}

/** The branch's upstream as git keeps it: the remote and the branch's ref there; null with none (or detached). */
export function upstreamOf(c: Pick<Checkout, "root">, branch: string): { remote: string; ref: string } | null {
  const out = ask(c, [
    "for-each-ref",
    "--format=%(upstream:remotename)%00%(upstream:remoteref)",
    `refs/heads/${branch}`,
  ]);
  const [remote = "", ref = ""] = (out ?? "").trim().split("\0");
  return remote && ref ? { remote, ref } : null;
}

/** HEAD's commit, short; null before the first. */
export function headShort(c: Pick<Checkout, "root">): string | null {
  return ask(c, ["rev-parse", "--short", "HEAD"])?.trim() || null;
}

/**
 * What git would run for the remote, asked of its config: whether you set your own ssh command, and the programs the
 * repository's own config names. Null when git can't say (too old for `--show-scope`, 2.26).
 */
function remoteConfig(c: Pick<Checkout, "root">): { sshCommandSet: boolean; own: string[] } | null {
  try {
    const out = execFileSync("git", gitArgs(c.root, ["config", "--show-scope", "--get-regexp", PROGRAMS]), {
      ...SHORT,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const config = parseScoped(out);
    return { sshCommandSet: config.some((s) => s.key === "core.sshcommand"), own: ownPrograms(config) };
  } catch (err) {
    // Nothing set: git says so by its exit, 1.
    if ((err as { status?: number }).status === 1) return { sshCommandSet: false, own: [] };
    return null;
  }
}

/** What a remote's command ended in: done, with what git printed; or why not, in git's words. */
/**
 * A git command run in the background: what it printed, or why not. `kept`: the commit of the stash git kept the
 * changes in, where a rebase's `--autostash` couldn't put them back (`withAutostash`).
 */
export type RemoteDone =
  | { ok: true; out: string; err: string; kept?: string }
  | { ok: false; why: string; login: boolean };

/** Long enough for a big repository over a slow line; a git that never answers isn't waited on for ever. */
const NETWORK_MS = 10 * 60_000;

/** A git command that may reach the remote or change the files, run in the background. */
function runLater(
  c: Pick<Checkout, "root">,
  args: string[],
  network: boolean,
  signal?: AbortSignal,
): Promise<RemoteDone> {
  const trusted = isTrusted(c.root);
  let env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  if (network) {
    const config = remoteConfig(c);
    if (!trusted && config === null)
      return Promise.resolve({
        ok: false,
        why: "this vault isn't trusted, and git couldn't say whose config names its programs for the remote (git 2.26 or later can)",
        login: false,
      });
    if (!trusted && config!.own.length)
      return Promise.resolve({
        ok: false,
        why: `this vault isn't trusted, and its repository's own config names a program for the remote (${config!.own.join(", ")}) — :trust lets it run`,
        login: false,
      });
    env = remoteEnv(process.env, config?.sshCommandSet ?? false);
  }
  const [cmd, ...rest] = args;
  // A pull that merges or rebases (GIT-D6) opens no editor: a message is git's own.
  if (cmd === "pull") env = editorless(env);
  // Not trusted: nothing signed (the repository's config could name the signing program), no submodule reached.
  const guarded = trusted
    ? args
    : cmd === "push"
      ? ["push", "--no-recurse-submodules", ...rest]
      : cmd === "fetch" || cmd === "pull"
        ? [cmd, "--no-recurse-submodules", ...rest]
        : args;
  // A pull's merge commit, or the commits a rebase replays, likewise unsigned.
  const signing = trusted
    ? []
    : cmd === "push"
      ? ["-c", "push.gpgSign=false"]
      : cmd === "pull"
        ? ["-c", "commit.gpgSign=false"]
        : [];
  return new Promise((done) => {
    execFile(
      "git",
      [...signing, ...gitArgs(c.root, guarded)],
      // git's words in English: what it said is matched (a pull's "Not possible to fast-forward", a conflict).
      {
        signal,
        encoding: "utf8",
        env: inEnglish(env),
        timeout: network ? NETWORK_MS : 120_000,
        maxBuffer: 16 * 1024 * 1024,
      },
      (err, out, stderr) => {
        if (!err) return done({ ok: true, out, err: stderr });
        const why = failureOf(err, stderr, out);
        done({ ok: false, why, login: network && needsLogin(why) });
      },
    );
  });
}

/** Fetched: the branch's remote, else origin (git's own choice). */
export function fetchLater(c: Pick<Checkout, "root">, signal?: AbortSignal): Promise<RemoteDone> {
  return runLater(c, ["fetch"], true, signal);
}

/** The newest stash's commit, or null: an autostash git kept is a new one (`withAutostash`). */
function stashTip(c: Pick<Checkout, "root">): string | null {
  return ask(c, ["rev-parse", "-q", "--verify", "refs/stash"])?.trim() || null;
}

/**
 * `run`, a rebase or a pull with `--autostash` (D247): where putting the changes back conflicts, git keeps them in the
 * stash, and `kept` is that stash's commit — known by a stash that wasn't there before, never by git's words, which
 * change between its versions.
 */
export async function withAutostash(c: Pick<Checkout, "root">, run: () => Promise<RemoteDone>): Promise<RemoteDone> {
  const before = stashTip(c);
  const r = await run();
  const after = r.ok ? stashTip(c) : null;
  return r.ok && after !== null && after !== before ? { ...r, kept: after } : r;
}

/**
 * Pulled: fast-forward only (`ff`), git refusing in its words where both sides moved; or, asked (GIT-D6), the two
 * brought together by a merge or a rebase — the files changed stashed for the rebase and put back after, asked
 * (`autostash`, D247).
 */
export function pullLater(
  c: Pick<Checkout, "root">,
  how: "ff" | "merge" | "rebase" = "ff",
  autostash = false,
): Promise<RemoteDone> {
  const args =
    how === "ff"
      ? ["--ff-only", "--no-rebase"]
      : how === "merge"
        ? // A merge where both moved (GIT-D6): its commit with git's own message, never an editor; `--ff` over a
          // `pull.ff = only` of yours, which would refuse it again.
          ["--no-rebase", "--ff", "--no-edit"]
        : ["--rebase", ...(autostash ? ["--autostash"] : [])];
  const pull = () => runLater(c, ["pull", ...args], true);
  return autostash && how === "rebase" ? withAutostash(c, pull) : pull();
}

/**
 * Pushed to the branch's upstream (`to`), or, asked first, to a remote's branch of the same name, which becomes its
 * upstream (`track`). The remote's name and the refs are checked first (`refusedName`), and passed after git's options.
 */
export function pushLater(
  c: Pick<Checkout, "root">,
  branch: string,
  to: { remote: string; ref: string },
  track = false,
): Promise<RemoteDone> {
  const why =
    refusedName("the remote's name", to.remote) ??
    refusedName("the branch", branch) ??
    refusedName("the upstream's branch", to.ref);
  if (why) return Promise.resolve({ ok: false, why, login: false });
  return runLater(
    c,
    ["push", ...(track ? ["-u"] : []), "--end-of-options", to.remote, `refs/heads/${branch}:${to.ref}`],
    true,
  );
}

/** A stash: its name now (`stash@{0}`), its commit (the name moves as others are saved), its message, when. */
export interface Stash {
  ref: string;
  hash: string;
  message: string;
  when: string;
}

/** `git stash list` read, as `%gd%x00%H%x00%gs%x00%cr`, a stash a line. */
export function parseStashes(out: string): Stash[] {
  return out
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [ref = "", hash = "", message = "", when = ""] = l.split("\0");
      return { ref, hash, message, when };
    });
}

/** The stashes, newest first; null without git. */
export function stashesOf(c: Pick<Checkout, "root">): Stash[] | null {
  const out = ask(c, ["stash", "list", "--format=%gd%x00%H%x00%gs%x00%cr"]);
  return out === null ? null : parseStashes(out);
}

/**
 * The changes stashed, with a message (none: git's own, `WIP on main: …`) — untracked files too, if asked. git's "No
 * local changes to save" is no error.
 */
export function stashSaveLater(c: Pick<Checkout, "root">, message: string, untracked: boolean): Promise<RemoteDone> {
  const m = message ? ["-m", message] : [];
  return runLater(c, ["stash", "push", ...(untracked ? ["--include-untracked"] : []), ...m], false);
}

/**
 * A stash applied, popped (applied, then dropped) or dropped. Only the stash listed: one whose name has moved to
 * another (a stash saved meanwhile, by an agent or a terminal) is refused, said why.
 */
export function stashLater(
  c: Pick<Checkout, "root">,
  how: "apply" | "pop" | "drop",
  s: Pick<Stash, "ref" | "hash">,
): Promise<RemoteDone> {
  const now = ask(c, ["rev-parse", "--verify", "--quiet", "--end-of-options", s.ref])?.trim();
  if (now !== s.hash)
    return Promise.resolve({
      ok: false,
      why: `the stashes changed since they were listed: ${s.ref} isn't that one now`,
      login: false,
    });
  return runLater(c, ["stash", how, ...(how === "drop" ? ["-q"] : []), s.ref], false);
}
