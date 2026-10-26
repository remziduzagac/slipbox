// A report posted with GitHub's `gh` (RPT-D4): offered when `gh` is on `PATH`, nothing run before you choose it. Then
// the account it will post as, read without the network, for the yes-or-no; on yes, `gh issue create`, the text on
// its input, from the home folder (never a vault's, so no folder's settings reach it), a minute at most.

import { sanitize } from "./foundation/text/sanitize.ts";
import { runTool } from "./foundation/platform/tool-process.ts";

/** `gh`, as `PATH` finds it now (Bun.which alone reads the start-up one), or null. */
export function ghPath(env: Record<string, string | undefined> = process.env): string | null {
  return Bun.which("gh", { PATH: env.PATH ?? "" });
}

/** gh run as every helper is (`core/foundation/platform/tool-process.ts`): its output capped, its process group stopped at its deadline
 *  and when slipbox ends; never waiting on a question of its own. */
function run(
  argv: string[],
  opts: { cwd: string; env: Record<string, string | undefined>; input?: string; timeout: number },
) {
  return runTool(argv, {
    cwd: opts.cwd,
    env: { ...opts.env, GH_PROMPT_DISABLED: "1" },
    timeoutMs: opts.timeout,
    ...(opts.input === undefined ? {} : { input: opts.input }),
  });
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
 * before what gh keeps, so then it's that token's account, unchecked; else the account gh keeps for github.com. None:
 * `gh auth login` first; gh not answering, or not starting, said as that.
 */
export async function ghAccount(
  gh: string,
  opts: { env: Record<string, string | undefined>; home: string; timeout?: number },
): Promise<{ account: string } | { why: string }> {
  for (const k of ["GH_TOKEN", "GITHUB_TOKEN"])
    if (opts.env[k]) return { account: `the account of ${k} (not checked)` };
  const r = await run([gh, "config", "get", "-h", "github.com", "user"], {
    ...opts,
    cwd: opts.home,
    timeout: opts.timeout ?? 5000,
  });
  if (r.failure === "deadline") return { why: "gh didn't say its account in time" };
  if (r.failure) return { why: `gh couldn't run: ${said(r.error ?? "")}` };
  const name = r.code === 0 ? said(r.stdout, 1) : "";
  return name ? { account: name } : { why: "gh has no account for github.com here — gh auth login first" };
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
  if (r.failure === "deadline") return { ok: false, why: "gh didn't answer in a minute", timedOut: true };
  if (r.failure) return { ok: false, why: `gh couldn't run: ${said(r.error ?? "")}`, timedOut: false };
  const url = /https:\/\/\S+\/issues\/\d+/.exec(r.stdout)?.[0];
  if (r.code === 0 && url) return { ok: true, url: sanitize(url) };
  return {
    ok: false,
    why: said(r.stderr) || said(r.stdout) || `gh exited with ${r.code ?? "an error"}`,
    timedOut: false,
  };
}
