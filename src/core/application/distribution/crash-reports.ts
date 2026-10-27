// Bun's own crash reports, turned off (D221). Bun's crash handler decides whether to send a report to bun.report
// when it crashes, reading `BUN_ENABLE_CRASH_REPORTING` (and `BUN_CRASH_REPORT_URL`) from the C environment — which
// `process.env` doesn't write to. So the switch is set through libc's own `setenv`, by FFI, first thing at start.
// slipbox's one network call is the update check (D199); a crash still prints Bun's link, to file a report yourself.

import { libc } from "../../foundation/platform/libc.ts";

/** The two variables Bun's crash handler reads: either one set by you is left as you set it. */
export const CRASH_SWITCHES = ["BUN_ENABLE_CRASH_REPORTING", "BUN_CRASH_REPORT_URL"] as const;

/**
 * Turns Bun's crash reports off: `BUN_ENABLE_CRASH_REPORTING=0` in the C environment, unless you set it or
 * `BUN_CRASH_REPORT_URL` yourself (an empty one counts as unset). Silent when libc can't be reached.
 */
export function crashReportsOff(): void {
  try {
    const c = libc();
    if (!c) return;
    if (CRASH_SWITCHES.some((name) => (c.getenv(name) ?? "") !== "")) return;
    c.setenv("BUN_ENABLE_CRASH_REPORTING", "0");
  } catch {
    // reporting stays as Bun has it
  }
}
