// The real-terminal checks: what only a real terminal shows — the keys it sends, the widths it draws — slipbox in a
// herdr pane (TT-D2; the rest are headless, tests/terminal/run.ts). `bun run test:herdr [--pane <id> | --tab] [--keep]
// [name filter…]`.
//
// With --pane (or SLIPBOX_HERDR_PANE) it runs in that pane, which must be at a shell prompt; otherwise it splits a
// pane of its own off this one (or, with --tab, opens a tab of its own, as big as the window) and closes it at the
// end. Every check gets a fresh copy of the sample folders and its own config, state and cache, so nothing in the repo
// or in your own setup is touched.

import { HerdrError, Pane } from "./herdr.ts";
import { REPO, Session, Skipped } from "./session.ts";
import { CHECKS } from "./checks.ts";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const given = flag("--pane") ?? process.env.SLIPBOX_HERDR_PANE;
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
const chosen = CHECKS.filter((s) => !filters.length || filters.some((f) => s.name.includes(f)));
const failures: { name: string; error: string }[] = [];
const started = Date.now();
let skipped = 0;
let current: Session | null = null;

// Whatever happens (a failure, herdr going away, ctrl+c), a pane or tab of our own is closed and
// the check's temporary files go.
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
    let skip: string | null = null;
    try {
      await session.start();
      await s.run(session);
    } catch (err) {
      if (err instanceof Skipped) skip = err.message;
      else error = err instanceof Error ? err.message : String(err);
    }
    // A slipbox that won't quit or die (Stuck) ends the run: the pane can't take another.
    const clean = await session.quit();
    if (!error && !clean) error = `slipbox did not exit cleanly\n${pane.recent(30)}`;
    if (!keep) session.cleanup();
    current = null;
    const ms = Date.now() - t0;
    if (error) {
      failures.push({ name: s.name, error });
      console.log(`✗ ${s.name} (${ms} ms)`);
    } else if (skip) {
      skipped++;
      console.log(`- ${s.name} (skipped: ${skip})`);
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
const secs = ((Date.now() - started) / 1000).toFixed(1);
const done = chosen.length - skipped;
console.log(
  `\n${done - failures.length}/${done} checks passed in ${secs} s${skipped ? `, ${skipped} skipped (said above why)` : ""}`,
);
process.exit(failures.length ? 1 : 0);
