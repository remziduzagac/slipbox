// One terminal check in a process of its own, run by run.ts: `bun tests/terminal/worker.ts <index> <result file>
// [--keep]`. A process per check, since two of Bun's pseudo-terminals in one process can cross their output (Bun
// 1.4.2), and so a check that crashes takes only itself down. The result goes to the file as JSON.

import { writeFileSync } from "node:fs";
import { CHECKS } from "./checks/index.ts";
import { CheckFailed, Session, Skipped } from "./session.ts";

export interface WorkerResult {
  outcome: "pass" | "fail" | "skip";
  ms: number;
  /** The failure's message (with the screen), or why it was skipped. */
  detail?: string;
  /** The commands it ran (SLIPBOX_TRACE). */
  commands: string[];
}

const [index, out] = process.argv.slice(2);
const keep = process.argv.includes("--keep");
const check = CHECKS[Number(index)];
if (!check || !out) {
  console.error("usage: bun tests/terminal/worker.ts <check index> <result file> [--keep]");
  process.exit(2);
}
/** How long one check may take, start to quit, before it's failed (and its slipbox killed). */
const LIMIT = Number(process.env.SLIPBOX_TERMINAL_LIMIT ?? 120_000);

const s = new Session(check.options);
for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, () => {
    keep ? s.term.dispose() : s.cleanup();
    process.exit(130);
  });

const t0 = Date.now();
let timer: ReturnType<typeof setTimeout> | undefined;
const timeout = new Promise<never>((_, reject) => {
  timer = setTimeout(() => reject(new CheckFailed(`took longer than ${LIMIT / 1000} s\n${s.dump()}`)), LIMIT);
});
let outcome: WorkerResult["outcome"] = "pass";
let detail: string | undefined;
try {
  await Promise.race([
    (async () => {
      await s.start();
      await check.run(s);
    })(),
    timeout,
  ]);
} catch (err) {
  if (err instanceof Skipped) (outcome = "skip"), (detail = err.message);
  else (outcome = "fail"), (detail = err instanceof Error ? (err.stack ?? err.message) : String(err));
} finally {
  clearTimeout(timer);
}
const clean = await s.quit();
if (outcome === "pass" && !clean) (outcome = "fail"), (detail = `slipbox did not exit cleanly\n${s.after(30)}`);
const commands = s.commands();
// What a check says it covers, it ran: a declaration is a claim the trace checks.
const unrun = (check.covers.commands ?? []).filter((c) => !commands.includes(c));
if (outcome === "pass" && unrun.length) (outcome = "fail"), (detail = `declared but never ran: ${unrun.join(", ")}`);
if (keep) {
  s.term.dispose();
  if (outcome === "fail") detail = `${detail}\n(kept: ${s.dir})`;
} else s.cleanup();
const result: WorkerResult = { outcome, ms: Date.now() - t0, detail, commands };
writeFileSync(out, JSON.stringify(result));
process.exit(0);
