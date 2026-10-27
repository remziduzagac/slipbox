// Other processes, as slipbox asks after them: a running TUI's unsaved notes (stale.ts), an export's spool
// (rendering/export/spool.ts), an upgrade's lock (update.ts).

/** A process still running (or one this user can't signal: someone else's, so not ours to judge). */
export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}
