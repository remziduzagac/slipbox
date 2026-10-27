#!/usr/bin/env bun
// The dependencies' known vulnerabilities (greenrepo DEP-04), run by `bun run audit`: `bun audit`, which reads
// bun.lock and asks npm's advisory database, every package in it (the dev tools too: they run here and in CI).
// `.github/workflows/audit.yml` runs it weekly and when bun.lock changes; it is never part of `bun run check`, so a
// new advisory doesn't fail unrelated work. An advisory looked at and accepted is listed below, with why and the date
// to look at it again: past that date it counts again, and the run fails until it's fixed or looked at anew.

import { resolve } from "node:path";

/** Advisories accepted, by package: their ids (GHSA), why, and the date to look again (YYYY-MM-DD). */
export interface Accepted {
  package: string;
  advisories: string[];
  why: string;
  until: string;
}

export const ACCEPTED: Accepted[] = [
  {
    package: "@xmldom/xmldom@0.9.10",
    advisories: [
      "GHSA-6gmq-8vp8-gcm6",
      "GHSA-6mj3-qw4j-hgrw",
      "GHSA-g53g-w8rj-fmg7",
      "GHSA-w2rr-34g9-rvrj",
      "GHSA-4w3w-2rp5-g8jm",
      "GHSA-c7q8-3ch8-vqpv",
      "GHSA-27p8-2357-5qqv",
      "GHSA-3px3-54cx-rmw9",
      "GHSA-vr34-hp96-76pp",
      "GHSA-6h8r-xr42-gp59",
      "GHSA-8344-3jmq-59r6",
      "GHSA-965w-775f-mr7g",
      "GHSA-93r5-fhx6-vmg9",
    ],
    why:
      "speech-rule-engine's, through mathjax-full, which pins 0.9.10 (0.9.12 fixes them). Only MathJax's " +
      "accessibility code and menu load speech-rule-engine; slipbox's TeX-to-SVG (core/rendering/media/typeset.ts) loads neither, " +
      "so neither is in the binary (checked by bundling it, 2026-10-12).",
    until: "2027-01-12",
  },
  {
    package: "katex@0.16.47",
    advisories: ["GHSA-238p-pmpm-9mq7"],
    why:
      "micromark-extension-math's (^0.16, through remark-math), for its HTML output, which slipbox doesn't use: it " +
      "takes the math syntax only, and MathJax draws math. KaTeX isn't in the binary (checked by bundling it, " +
      "2026-10-12); the advisory needs a prototype already polluted and KaTeX's `trust` option besides.",
    until: "2027-01-12",
  },
  {
    package: "nanoid@2.1.11",
    advisories: ["GHSA-mwcw-c2x4-8c55", "GHSA-28wg-ghj8-5hjv", "GHSA-2v37-7h3g-55p8", "GHSA-xwg4-73v4-xw9w"],
    why:
      "hunspell-asm's and emscripten-wasm-loader's (^2; the fixed 3.x changed its API). Both call nanoid(45): " +
      "the default generator, a constant size. The advisories need a size from outside (fractional, negative, " +
      "zero or past 2^31) or a custom or non-secure generator.",
    until: "2027-01-12",
  },
  {
    package: "braces@3.0.3",
    advisories: ["GHSA-vfj7-8cjw-p6xm"],
    why:
      "markdownlint-cli2's (through globby, fast-glob and micromatch), a dev tool the docs check runs over the " +
      "repository's own Markdown: the patterns it expands are ours, and it isn't in the binary. No fixed version " +
      "is published (3.0.3 is the latest, 2026-10-13).",
    until: "2027-01-12",
  },
  {
    package: "markdown-it@15.0.1",
    advisories: ["GHSA-vfgh-jcmw-g37q", "GHSA-gfr2-rv44-r23c", "GHSA-r7fv-28h4-cvq7"],
    why:
      "markdownlint-cli2's (0.23.3 pins it), a dev tool the docs check runs over the repository's own Markdown: " +
      "the input is ours, the advisories are slow-input denial of service only, and it isn't in the binary. " +
      "markdownlint-cli2 0.24.0 takes the fixed 15.0.3, published 2026-10-21: it's taken once it's a week old.",
    until: "2026-10-29",
  },
];

/** The `--ignore` arguments for the advisories accepted on `today`; those past their date are `expired`. */
export function ignoreArgs(accepted: Accepted[], today: string): { args: string[]; expired: Accepted[] } {
  const live = accepted.filter((a) => a.until >= today);
  return {
    args: live.flatMap((a) => a.advisories.map((id) => `--ignore=${id}`)),
    expired: accepted.filter((a) => a.until < today),
  };
}

/** What's wrong with the list itself: a date not a date, an id not a GHSA id, an id twice, a reason missing. */
export function acceptedProblems(accepted: Accepted[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const a of accepted) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.until) || Number.isNaN(Date.parse(a.until)))
      out.push(`${a.package}: "${a.until}" isn't a date (YYYY-MM-DD)`);
    if (!a.why.trim()) out.push(`${a.package}: no reason given`);
    for (const id of a.advisories) {
      if (!/^GHSA(-[23456789cfghjmpqrvwx]{4}){3}$/.test(id)) out.push(`${a.package}: ${id} isn't a GHSA id`);
      if (seen.has(id)) out.push(`${a.package}: ${id} is listed twice`);
      seen.add(id);
    }
  }
  return out;
}

if (import.meta.main) {
  const problems = acceptedProblems(ACCEPTED);
  if (problems.length) {
    process.stderr.write(
      `audit: the advisories accepted (scripts/audit.ts):\n${problems.map((p) => `  ${p}\n`).join("")}`,
    );
    process.exit(2);
  }
  const { args, expired } = ignoreArgs(ACCEPTED, new Date().toISOString().slice(0, 10));
  for (const e of expired)
    process.stderr.write(
      `audit: ${e.package}'s advisories were to be looked at again by ${e.until}: they count again\n`,
    );
  const r = Bun.spawnSync([process.execPath, "audit", ...args], {
    cwd: resolve(import.meta.dir, ".."),
    stdout: "inherit",
    stderr: "inherit",
  });
  process.exit(r.exitCode ?? 1);
}
