// What a pull request changed, for CI's jobs (D230): `code=false` when every file it touches is the docs' — docs/, the
// blueprint, the site's pages, a Markdown file at the top — which no test reads but the docs' own (`bun run
// test:docs`, in the lint job), so the tests and the terminal tests are skipped. Anything else, any other event, or a
// diff that can't be read: `code=true`, and everything runs. Written to $GITHUB_OUTPUT when CI sets it; said either way.
import { appendFileSync } from "node:fs";

/** A file only the docs' checks read: the docs, the blueprint, the site's pages (not its packages), a top-level `.md`. */
export const isDocs = (path: string): boolean =>
  /^(?:docs|blueprint|site\/src)\//.test(path) || /^[^/]+\.md$/.test(path);

/** Why everything runs: the first of `files` that isn't the docs', or none changed; null when all are the docs'. */
export function codeChanged(files: string[]): string | null {
  if (files.length === 0) return "no file changed";
  return files.find((f) => !isDocs(f)) ?? null;
}

/** The files a pull request changes: its merge commit against the base, its first parent; null when unreadable. */
function changed(): string[] | null {
  const r = Bun.spawnSync(["git", "diff", "--name-only", "HEAD^1", "HEAD"]);
  if (r.exitCode !== 0) return null;
  return r.stdout.toString().split("\n").filter(Boolean);
}

if (import.meta.main) {
  const event = process.env.GITHUB_EVENT_NAME ?? "";
  const files = event === "pull_request" ? changed() : null;
  const why = files ? codeChanged(files) : `a ${event || "local"} run, or its diff unread`;
  console.log(why ? `everything runs: ${why}` : `the docs only (${files?.length} files): the tests are skipped`);
  const out = process.env.GITHUB_OUTPUT;
  if (out) appendFileSync(out, `code=${why ? "true" : "false"}\n`);
}
