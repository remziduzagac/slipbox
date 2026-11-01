import { join } from "node:path";

export const FAKE = join(import.meta.dir, "..", "fixtures", "fake-lsp.ts");

export const until = async (ok: () => boolean, ms = 25_000) => {
  for (const t = Date.now(); !ok() && Date.now() - t < ms; ) await Bun.sleep(20);
  return ok();
};

/**
 * Waiting on what a server says, not on a clock: `when(ok)` settles as soon as `ok` holds, checked each time `heard()`
 * says something came in — however long that takes on a loaded machine (the test's own timeout is the only limit).
 */
export function events() {
  const waiting: { ok: () => boolean; go: () => void }[] = [];
  return {
    heard(): void {
      for (const w of [...waiting])
        if (w.ok()) {
          waiting.splice(waiting.indexOf(w), 1);
          w.go();
        }
    },
    when(ok: () => boolean): Promise<void> {
      return ok() ? Promise.resolve() : new Promise((go) => waiting.push({ ok, go }));
    },
  };
}
