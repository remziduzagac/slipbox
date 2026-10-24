// A report posted with GitHub's `gh` (RPT-D4): offered when `gh` is on `PATH`, nothing run before you choose it. Then
// the account it will post as, read without the network, for the yes-or-no; on yes, `gh issue create`, the text on
// its input, from the home folder (never a vault's, so no folder's settings reach it), a minute at most.

import { sanitize } from "./sanitize.ts";

/** `gh`, as `PATH` finds it now (Bun.which alone reads the start-up one), or null. */
export function ghPath(env: Record<string, string | undefined> = process.env): string | null {
  return Bun.which("gh", { PATH: env.PATH ?? "" });
}

interface Ran {
  code: number | null;
  out: string;
  err: string;
  timedOut: boolean;
}

/** A program run, its input given, its output read, killed after `timeout`. */
async function run(
  argv: string[],
  opts: { cwd: string; env: Record<string, string | undefined>; input?: string; timeout: number },
): Promise<Ran> {
  let p: ReturnType<typeof Bun.spawn>;
  try {
    p = Bun.spawn({
      cmd: argv,
      cwd: opts.cwd,
      // Passed whole: a spawn without `env` has the environment slipbox started with, not today's.
      env: { ...opts.env, GH_PROMPT_DISABLED: "1" },
      stdin: opts.input === undefined ? "ignore" : Buffer.from(opts.input),
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (err) {
    return { code: null, out: "", err: (err as Error).message, timedOut: false };
  }
  const done = Promise.all([
    new Response(p.stdout as ReadableStream).text(),
    new Response(p.stderr as ReadableStream).text(),
    p.exited,
  ]).then(([out, err, code]): Ran => ({ code, out, err, timedOut: false }));
  // Out of time: killed, and answered at once — a child of its own may hold its output open.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<Ran>((resolve) => {
    timer = setTimeout(() => {
      p.kill("SIGKILL");
      resolve({ code: null, out: "", err: "", timedOut: true });
    }, opts.timeout);
  });
  const r = await Promise.race([done, late]);
  clearTimeout(timer);
  return r;
}

/** The first lines gh said, as a message holds them. */
function said(text: string, lines = 2): string {
  return sanitize(text)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, lines)
    .join(" — ");
}

/**
 * The account gh will post as, as it decides, without asking GitHub: a token in `GH_TOKEN` or `GITHUB_TOKEN` comes
 * before what gh keeps, so then it's that token's account, unchecked; else the account gh keeps for github.com. Null
 * when it has none: `gh auth login` first.
 */
export async function ghAccount(
  gh: string,
  opts: { env: Record<string, string | undefined>; home: string },
): Promise<string | null> {
  for (const k of ["GH_TOKEN", "GITHUB_TOKEN"]) if (opts.env[k]) return `the account of ${k} (not checked)`;
  const r = await run([gh, "config", "get", "-h", "github.com", "user"], { ...opts, cwd: opts.home, timeout: 5000 });
  const name = r.code === 0 ? said(r.out, 1) : "";
  return name || null;
}

export const POST_TIMEOUT = 60_000;

export type Posted = { ok: true; url: string } | { ok: false; why: string; timedOut: boolean };

/** `gh issue create --repo github.com/<repo> --title <title> --body-file -`, the body on its input, from the home folder:
 *  github.com by name, as its account was read and the bug form is, whatever `GH_HOST` says. */
export async function ghPost(
  gh: string,
  post: { repo: string; title: string; body: string },
  opts: { env: Record<string, string | undefined>; home: string; timeout?: number },
): Promise<Posted> {
  const argv = [gh, "issue", "create", "--repo", `github.com/${post.repo}`, "--title", post.title, "--body-file", "-"];
  const r = await run(argv, { cwd: opts.home, env: opts.env, input: post.body, timeout: opts.timeout ?? POST_TIMEOUT });
  if (r.timedOut) return { ok: false, why: "gh didn't answer in a minute", timedOut: true };
  const url = /https:\/\/\S+\/issues\/\d+/.exec(r.out)?.[0];
  if (r.code === 0 && url) return { ok: true, url: sanitize(url) };
  return { ok: false, why: said(r.err) || said(r.out) || `gh exited with ${r.code ?? "an error"}`, timedOut: false };
}
