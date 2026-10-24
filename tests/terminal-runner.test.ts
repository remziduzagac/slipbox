// The terminal checks' runner (tests/terminal/run.ts), over checks made up for it (made-up-checks.ts, preloaded into it
// alone): nothing of slipbox started. A file of its own, small: the runner reaches every check file.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";

describe("the runner (T31)", () => {
  const RUN = join(import.meta.dir, "terminal", "run.ts");
  const MADE_UP = join(import.meta.dir, "terminal", "made-up-checks.ts");
  const runner = (...args: string[]) => {
    const r = Bun.spawnSync([process.execPath, "--preload", MADE_UP, RUN, "--jobs", "1", ...args], {
      stdout: "pipe",
      stderr: "pipe",
      // The environment as tests/setup.ts left it (its TMPDIR): a spawn given none has the process's at its start.
      env: { ...process.env },
    });
    return { code: r.exitCode, stdout: `${r.stdout}`, out: `${r.stdout}${r.stderr}` };
  };
  const NAME = "made up for the runner's test";

  test("a check quarantined is never started, in the pool or alone: reported skipped with its issue, no release builds made for it", () => {
    const r = runner(NAME);
    expect(r.out).toContain(`- reading: ${NAME}: quarantined (0 ms) (skipped: quarantined by #0)\n`);
    expect(r.out).toContain(`- reading: ${NAME}: quarantined, alone (0 ms, alone) (skipped: quarantined by #0)\n`);
    expect(r.out).not.toContain("release builds");
    expect(r.out).toContain("reading: 0 passed, 0 failed, 2 skipped\n");
    expect(r.out).toMatch(/^0\/0 checks passed in [\d.]+ s, 1 at a time, 2 skipped$/m);
    expect(r.code).toBe(0);
  }, 60_000);

  test("its list says which checks are quarantined, by their issue", () => {
    const r = runner("--list", NAME);
    expect(r.stdout).toBe(
      `reading: ${NAME}: quarantined (quarantined by #0)\nreading: ${NAME}: quarantined, alone (quarantined by #0)\n`,
    );
    expect(r.code).toBe(0);
  }, 60_000);
});
