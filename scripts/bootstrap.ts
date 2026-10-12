#!/usr/bin/env bun
// The installer at a fixed address (GR-D14): the Pages site's `install.sh`, which reads a channel's file, then
// downloads that release's own installer, checks its sum and runs it (GR-D15). It's `bootstrap.template.sh` with the
// repository and its Pages site written in; the Pages workflow makes it:
//
//   bun --no-install scripts/bootstrap.ts <owner/name> <out-file>
//
// The repository is checked strictly, as a release's is: it goes into addresses, and into a shell script. It needs
// no package installed: Node's own modules only, as pages.yml runs it.

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pagesUrl, repoOf } from "./release.ts";

const ROOT = resolve(import.meta.dir, "..");

/** The bootstrap for a repository: the template with it and its Pages site written in; anything odd refused. */
export function bootstrapScript(template: string, repo: string): string {
  if (repoOf(repo) !== repo) throw new Error(`not a repository: ${repo} (name it owner/name)`);
  const out = template.replaceAll("@REPO@", repo).replaceAll("@PAGES@", pagesUrl(repo));
  const left = /@[A-Z]+@/.exec(out);
  if (left) throw new Error(`the bootstrap's template has ${left[0]} left`);
  return out;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    process.stderr.write("bootstrap: bun scripts/bootstrap.ts <owner/name> <out-file>\n");
    process.exit(2);
  }
  const [repo, out] = args as [string, string];
  try {
    const template = readFileSync(join(ROOT, "scripts", "bootstrap.template.sh"), "utf8");
    writeFileSync(resolve(out), bootstrapScript(template, repo), { mode: 0o755 });
    process.stdout.write(`${resolve(out)}\n`);
  } catch (err) {
    process.stderr.write(`bootstrap: ${(err as Error).message}\n`);
    process.exit(1);
  }
}
