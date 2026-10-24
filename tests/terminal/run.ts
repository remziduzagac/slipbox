// The terminal tests: slipbox in headless terminals of its own (terminal.ts), driven by keys and checked by what the
// screen shows, many at once (TT-D6). `bun run test:terminal [--jobs N] [--repeat N] [--keep] [--list] [area, check
// file or name…]`.
//
// Every check gets a fresh copy of the sample folders and its own config, state, cache and home, so nothing in the
// repository or your own setup is touched. A run goes to its end: every failure is reported there, with its screen,
// then a summary by area, and the commands no check ran (SLIPBOX_TRACE).

import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { join } from "node:path";
import { COMMAND_SPECS } from "../../src/core/command-specs.ts";
import { type Check, notRun } from "./check.ts";
import { CHECK_FILES, CHECKS } from "./checks/index.ts";
import { buildAndRecord } from "./release-builds.ts";
import type { WorkerResult } from "./worker.ts";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const bool = (name: string) => (args.includes(name) ? (args.splice(args.indexOf(name), 1), true) : false);
const jobs = Math.max(1, Number(flag("--jobs") ?? process.env.SLIPBOX_TERMINAL_JOBS ?? availableParallelism()));
const keep = bool("--keep");
/** Each chosen check this many times, all in the same pool: a flaky one shows. */
const repeat = Math.max(1, Number(flag("--repeat") ?? 1));
const list = bool("--list");
const filters = args.map((f) => f.toLowerCase());

/** A filter names an area, a check file (`checks/<name>.ts`), or a piece of a check's name. */
const chosen = CHECKS.filter(
  (c) =>
    !filters.length ||
    filters.some((f) => c.area === f || CHECK_FILES[f]?.includes(c) || c.name.toLowerCase().includes(f)),
);

if (list) {
  for (const c of chosen) {
    const why = notRun(c);
    console.log(`${c.area}: ${c.name}${why ? ` (${why})` : ""}`);
  }
  process.exit(0);
}

interface Result extends WorkerResult {
  check: Check;
}

const ran = new Set<string>();
const results: Result[] = [];
const workers = new Set<Bun.Subprocess>();
const scratch = mkdtempSync(join(tmpdir(), "slipbox-terminal-run-"));

process.on("SIGINT", () => {
  for (const w of workers) w.kill("SIGINT");
  process.exit(130);
});

// The two release builds the checks of upgrading drive (UPG): made once, before any worker starts, when one that runs
// is chosen.
const releases = chosen.some((c) => c.releases && !notRun(c)) ? join(scratch, "releases") : null;
let releasesFailed: string | null = null;
if (releases) {
  const t0 = Date.now();
  try {
    const r = buildAndRecord(releases);
    console.log(`release builds of ${r.old} and ${r.new} made, for the checks of upgrading (${Date.now() - t0} ms)`);
  } catch (err) {
    releasesFailed = (err as Error).message;
  }
}

/** One check, in a worker process of its own (worker.ts); what it said, or why it said nothing. */
async function runOne(check: Check, n: number): Promise<Result> {
  const out = join(scratch, `${n}.json`);
  const t0 = Date.now();
  const unrun = notRun(check);
  if (unrun) return { check, outcome: "skip", ms: 0, commands: [], detail: unrun };
  if (check.releases && releasesFailed)
    return { check, outcome: "fail", ms: 0, commands: [], detail: `the release builds failed: ${releasesFailed}` };
  const w = Bun.spawn(
    [
      process.execPath,
      join(import.meta.dir, "worker.ts"),
      String(CHECKS.indexOf(check)),
      out,
      ...(keep ? ["--keep"] : []),
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, ...(releases ? { SLIPBOX_TERMINAL_RELEASES: releases } : {}) },
    },
  );
  workers.add(w);
  const [stdout, stderr] = await Promise.all([new Response(w.stdout).text(), new Response(w.stderr).text(), w.exited]);
  workers.delete(w);
  if (!existsSync(out))
    return {
      check,
      outcome: "fail",
      ms: Date.now() - t0,
      commands: [],
      detail: `its worker died (exit ${w.exitCode})\n${stdout}${stderr}`,
    };
  const r = JSON.parse(readFileSync(out, "utf8")) as WorkerResult;
  for (const c of r.commands) ran.add(c);
  return { check, ...r };
}

const started = Date.now();
const runs = Array.from({ length: repeat }, () => chosen).flat();
const queue = runs.filter((c) => !c.alone);
let n = 0;
await Promise.all(
  Array.from({ length: Math.min(jobs, queue.length) }, async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      const r = await runOne(c, n++);
      results.push(r);
      const mark = r.outcome === "pass" ? "✓" : r.outcome === "fail" ? "✗" : "-";
      console.log(`${mark} ${c.area}: ${c.name} (${r.ms} ms)${r.outcome === "skip" ? ` (skipped: ${r.detail})` : ""}`);
    }
  }),
);
// What's timed against the clock, by itself once the others are done: among them, it would time the machine.
for (const c of runs.filter((c) => c.alone)) {
  const r = await runOne(c, n++);
  results.push(r);
  const mark = r.outcome === "pass" ? "✓" : r.outcome === "fail" ? "✗" : "-";
  console.log(
    `${mark} ${c.area}: ${c.name} (${r.ms} ms, alone)${r.outcome === "skip" ? ` (skipped: ${r.detail})` : ""}`,
  );
}
rmSync(scratch, { recursive: true, force: true });

const failures = results.filter((r) => r.outcome === "fail");
for (const f of failures) console.log(`\n── ${f.check.area}: ${f.check.name}\n${f.detail}`);

console.log("");
const areas = [...new Set(chosen.map((c) => c.area))];
for (const a of areas) {
  const of = results.filter((r) => r.check.area === a);
  const count = (o: Result["outcome"]) => of.filter((r) => r.outcome === o).length;
  console.log(
    `${a}: ${count("pass")} passed, ${count("fail")} failed${count("skip") ? `, ${count("skip")} skipped` : ""}`,
  );
}
const all = COMMAND_SPECS.map((c) => c.id);
const missing = all.filter((id) => !ran.has(id));
// Runs split between machines or invocations: each adds the commands it ran to one file, read together after.
if (process.env.SLIPBOX_TERMINAL_RAN)
  appendFileSync(process.env.SLIPBOX_TERMINAL_RAN, [...ran].map((c) => `${c}\n`).join(""));
const secs = ((Date.now() - started) / 1000).toFixed(1);
const passed = results.filter((r) => r.outcome === "pass").length;
const skipped = results.filter((r) => r.outcome === "skip").length;
console.log(
  `${passed}/${results.length - skipped} checks passed in ${secs} s, ${jobs} at a time${skipped ? `, ${skipped} skipped` : ""}`,
);
console.log(`commands run: ${all.length - missing.length}/${all.length}`);
process.exit(failures.length ? 1 : 0);
