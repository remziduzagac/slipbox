// The docs' screenshots (docs/images/): slipbox in a headless terminal of 120×34 (terminal.ts), driven as the terminal
// checks drive it, each screen read cell by cell with its colours and drawn into a PNG by scripts/screenshot.ts.
// Retake them when the UI changes; no multiplexer and no real terminal needed:
//
//   bun run shots [--jobs N] [--out <dir>] [--list] [name filter…]
//
// The shots are tests/terminal/shots/*.ts, a file per doc (shot.ts says how one is made). Each starts on the sample
// folders only, never yours: the default theme, plain Unicode glyphs (the pictures are drawn with DejaVu Sans Mono,
// which has no Nerd Font icons), and a terminal that draws Kitty's graphics, so a note's pictures are placeholder cells
// a shot's `pictures` are drawn over. `--out` writes them elsewhere, to compare before replacing.

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fromCells, toPng, toSvg, undrawable } from "../../scripts/screenshot.ts";
import { CheckFailed, REPO, Session } from "./session.ts";
import { allShots, SHOT_SIZE, type Shot } from "./shot.ts";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const bool = (name: string) => (args.includes(name) ? (args.splice(args.indexOf(name), 1), true) : false);
const jobs = Math.max(1, Number(flag("--jobs") ?? 1));
const out = resolve(flag("--out") ?? join(REPO, "docs", "images"));
const list = bool("--list");
const chosen = (await allShots()).filter((x) => !args.length || args.some((f) => x.name.includes(f)));

if (list) {
  for (const shot of chosen) console.log(shot.name);
  process.exit(0);
}
if (!chosen.length) {
  console.error(`no shot's name contains ${args.join(" or ")}`);
  process.exit(2);
}

/** One shot taken and written: null, or why it failed, with the screen as it was. */
async function take(shot: Shot): Promise<{ error: string | null; lacking: string[] }> {
  const s = new Session({
    ...shot.options,
    size: SHOT_SIZE,
    graphics: true,
    env: { SLIPBOX_GLYPHS: "unicode", ...shot.options.env },
  });
  try {
    await s.start();
    await shot.take(s);
    // The background index's count in the top bar is a passing state, not part of the picture.
    await s.until(() => !/indexing/.test(s.topBar()), 30000, "indexing to finish");
    await s.settle(undefined, 3000, 250);
    const screen = fromCells(s.term.cells());
    const svg = toSvg(screen, { cols: s.cols, rows: s.rows, pictures: shot.pictures?.map((p) => join(s.dir, p)) });
    writeFileSync(join(out, `${shot.name}.png`), await toPng(svg, 1.5));
    return { error: null, lacking: undrawable(screen) };
  } catch (err) {
    // A wait that failed says so with the screen; anything else, the screen added.
    const error = err instanceof CheckFailed ? err.message : `${err instanceof Error ? err.stack : err}\n${s.dump()}`;
    return { error, lacking: [] };
  } finally {
    await s.quit();
    s.cleanup();
  }
}

mkdirSync(out, { recursive: true });
const queue = [...chosen];
let failed = 0;
await Promise.all(
  Array.from({ length: Math.min(jobs, queue.length) }, async () => {
    for (let shot = queue.shift(); shot; shot = queue.shift()) {
      const { error, lacking } = await take(shot);
      if (error) failed++;
      console.log(error ? `✗ ${shot.name}: ${error}` : `✓ ${shot.name}`);
      // Drawn as the font's empty box: a shape for it belongs in scripts/screenshot.ts.
      if (lacking.length) console.log(`  ! no font draws ${lacking.join(" ")}: an empty box in the picture`);
    }
  }),
);
console.log(`\n${chosen.length - failed}/${chosen.length} shots taken into ${out}`);
process.exit(failed ? 1 : 0);
