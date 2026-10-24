import { expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyTextAsync, readClipboardAsync } from "../src/core/clipboard.ts";
import { harness, makeSandbox } from "./tui-harness.ts";

makeSandbox();

async function withTool(body: string, run: (dir: string) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), "slipbox-async-clipboard-"));
  const keys = ["PATH", "WAYLAND_DISPLAY", "DISPLAY", "SLIPBOX_CLIPBOARD", "WSL_DISTRO_NAME", "WSL_INTEROP"];
  const previous = keys.map((key) => process.env[key]);
  for (const name of ["wl-copy", "wl-paste"]) {
    writeFileSync(join(dir, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(dir, name), 0o755);
  }
  for (const key of keys) delete process.env[key];
  process.env.PATH = dir;
  process.env.WAYLAND_DISPLAY = "test";
  try {
    await run(dir);
  } finally {
    keys.forEach((key, i) => {
      if (previous[i] === undefined) delete process.env[key];
      else process.env[key] = previous[i];
    });
    rmSync(dir, { recursive: true, force: true });
  }
}

test("clipboard helpers leave the event loop available while copying and reading", async () => {
  // The helper holds on until the test lets it go (three seconds at most): the event loop runs meanwhile, or the
  // copy has ended by the time it looks. A helper that only slept could finish before a timer's turn on a loaded
  // machine.
  await withTool(
    'i=0; while [ ! -f "${0%/*}/go" ] && [ $i -lt 300 ]; do /bin/sleep 0.01; i=$((i+1)); done; case "$0" in *wl-copy) /bin/cat > "${0%/*}/board" ;; *) /bin/cat "${0%/*}/board" ;; esac',
    async (dir) => {
      let done = false;
      const copying = copyTextAsync("copied text", { fallbackDir: dir, osc52: () => false });
      void copying.then(() => (done = true));
      await new Promise((r) => setTimeout(r, 0));
      expect(done).toBe(false);
      writeFileSync(join(dir, "go"), "");
      const result = await copying;
      expect(result.confirmed).toBe(true);
      expect(readFileSync(join(dir, "board"), "utf8")).toBe("copied text");
      expect(await readClipboardAsync(dir)).toBe("copied text");
    },
  );
});

/** Whether no process is left in the group `pid` leads. */
const groupGone = (pid: number) => {
  try {
    process.kill(-pid, 0);
    return false;
  } catch {
    return true;
  }
};
const until = async (ok: () => boolean, ms = 10_000) => {
  for (const t = Date.now(); !ok() && Date.now() - t < ms; ) await Bun.sleep(20);
  return ok();
};

test("clipboard timeout falls back and cancellation settles without fallback", async () => {
  // A helper that outlives the copy's 1 s stop by far: the copy falls back once it's stopped it. Bounded at half the
  // helper's life, a wide margin over the stop for a slow runner (2.6 s on CI's macOS, #6), and the helper's group
  // seen killed, not left running.
  await withTool('echo $$ > "${0%/*}/pid"; /bin/sleep 20; : > "${0%/*}/finished"', async (dir) => {
    const pidFile = join(dir, "pid");
    const pid = () => Number(existsSync(pidFile) ? readFileSync(pidFile, "utf8").trim() : 0);
    try {
      const start = performance.now();
      const result = await copyTextAsync("fallback", { fallbackDir: dir, osc52: () => false });
      expect(performance.now() - start).toBeLessThan(10_000);
      expect(result.file).toBe(join(dir, "clipboard.txt"));
      expect(readFileSync(result.file!, "utf8")).toBe("fallback");
      // Killed before its first command, it wrote no pid at all.
      if (await until(() => pid() > 0, 1000)) expect(await until(() => groupGone(pid()))).toBe(true);
      expect(existsSync(join(dir, "finished"))).toBe(false);
      const controller = new AbortController();
      const pending = copyTextAsync("cancelled", { fallbackDir: dir, osc52: () => false, signal: controller.signal });
      setTimeout(() => controller.abort(), 30);
      expect((await pending).file).toBeNull();
      expect(readFileSync(join(dir, "clipboard.txt"), "utf8")).toBe("fallback");
    } finally {
      try {
        if (pid() > 0) process.kill(-pid(), "SIGKILL"); // a helper left behind by a failure
      } catch {}
    }
  });
});

test("clipboard reads stop at their output budget", async () => {
  await withTool("/bin/dd if=/dev/zero bs=1048576 count=34 2>/dev/null", async (dir) => {
    expect(await readClipboardAsync(dir)).toBeNull();
  });
});

test("the TUI: a copy whose helper answers late is said and drawn then; one while eight wait is refused, and said", async () => {
  const h = await harness();
  let renders = 0;
  h.app.host.requestRender = () => void renders++;
  await withTool("/bin/sleep 0.3; /bin/cat > /dev/null", async () => {
    const first = h.app.copy("late");
    expect(h.copied).toEqual(["late"]); // OSC 52 at once, the helper still running
    for (let i = 0; i < 7; i++) void h.app.copy(`queued ${i}`, false);
    expect(await h.app.copy("refused", false)).toBe(false);
    expect(h.app.messages.at(-1)?.text).toBe("clipboard busy — copy again after it finishes");
    renders = 0;
    expect(await first).toBe(true);
    expect(h.app.messages.at(-1)?.text).toBe("copied 4 characters");
    expect(renders).toBeGreaterThan(0);
    h.app.quit(); // the queued copies' helpers stopped, none started
  });
});
