// The terminal tests: slipbox in a real terminal (a herdr pane), driven by keys, checked by what the
// screen shows. `bun run e2e [--pane <id> | --tab] [--keep] [name filter…]`.
//
// With --pane (or SLIPBOX_E2E_PANE) it runs in that pane, which must be at a shell prompt;
// otherwise it splits a pane of its own off this one (or, with --tab, opens a tab of its own, as
// big as the window) and closes it at the end. Scenarios that need room are skipped in a small
// pane. Every scenario gets a fresh copy of the demo vault and its own config, state and cache, so
// nothing in the repo or in your own setup is touched. At the end it lists the commands no
// scenario ran (SLIPBOX_TRACE).

import { appendFileSync } from "node:fs";
import { COMMAND_SPECS } from "../../src/core/command-specs.ts";
import { HerdrError, Pane } from "./herdr.ts";
import { REPO, Session } from "./session.ts";
import { SCENARIOS } from "./scenarios.ts";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const given = flag("--pane") ?? process.env.SLIPBOX_E2E_PANE;
const bool = (name: string) => (args.includes(name) ? (args.splice(args.indexOf(name), 1), true) : false);
const keep = bool("--keep");
const tab = bool("--tab");
const filters = args;

let pane: Pane;
try {
  pane = Pane.open(given, REPO, tab);
} catch (err) {
  console.error(err instanceof HerdrError ? err.message : err);
  process.exit(2);
}

// A given pane must be at a shell prompt, not running slipbox (keys would edit notes there).
if (given && /\b(READ|SOURCE|INSERT|LENS|VISUAL)\b/.test(pane.screen().at(-1) ?? "")) {
  console.error(`pane ${given} is running slipbox; quit it first`);
  process.exit(2);
}
const chosen = SCENARIOS.filter((s) => !filters.length || filters.some((f) => s.name.includes(f)));
const ran = new Set<string>();
const failures: { name: string; error: string }[] = [];
const started = Date.now();
let skipped = 0;
let current: Session | null = null;

// Whatever happens (a failure, herdr going away, ctrl+c), a pane or tab of our own is closed and
// the scenario's temporary files go.
const cleanUp = () => {
  if (keep) return;
  try {
    current?.cleanup();
    pane.close();
  } catch {}
};
process.on("SIGINT", () => {
  cleanUp();
  process.exit(130);
});

async function runAll(): Promise<void> {
  await pane.measure();
  console.log(`pane ${pane.id}: ${pane.cols}×${pane.rows}`);
  for (const s of chosen) {
    const need = s.needs ?? {};
    if ((need.cols && pane.cols < need.cols) || (need.rows && pane.rows < need.rows)) {
      skipped++;
      console.log(`- ${s.name} (skipped: needs ${need.cols ?? "any"}×${need.rows ?? "any"})`);
      continue;
    }
    const session = new Session(pane, s.options);
    current = session;
    const t0 = Date.now();
    let error: string | null = null;
    try {
      await session.start();
      await s.run(session);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    // A slipbox that won't quit or die (Stuck) ends the run: the pane can't take another.
    const clean = await session.quit();
    if (!error && !clean) error = `slipbox did not exit cleanly\n${pane.recent(30)}`;
    for (const c of session.commands()) ran.add(c);
    if (!keep) session.cleanup();
    current = null;
    const ms = Date.now() - t0;
    if (error) {
      failures.push({ name: s.name, error });
      console.log(`✗ ${s.name} (${ms} ms)`);
    } else console.log(`✓ ${s.name} (${ms} ms)`);
  }
}

try {
  await runAll();
} catch (err) {
  failures.push({ name: "(the run)", error: err instanceof Error ? err.message : String(err) });
} finally {
  cleanUp();
}

for (const f of failures) console.log(`\n── ${f.name}\n${f.error}`);
const all = COMMAND_SPECS.map((c) => c.id);
const missing = all.filter((id) => !ran.has(id));
// A run split over several panes: each adds the commands it ran to one file, read together after.
if (process.env.SLIPBOX_E2E_RAN) appendFileSync(process.env.SLIPBOX_E2E_RAN, [...ran].map((c) => `${c}\n`).join(""));
const secs = ((Date.now() - started) / 1000).toFixed(1);
const done = chosen.length - skipped;
console.log(`\n${done - failures.length}/${done} scenarios passed in ${secs} s${skipped ? `, ${skipped} skipped (pane too small; try --tab)` : ""}`);
console.log(`commands run: ${all.length - missing.length}/${all.length}`);
if (missing.length && !filters.length) console.log(`not run by any scenario:\n  ${missing.join("\n  ")}`);
process.exit(failures.length ? 1 : 0);
