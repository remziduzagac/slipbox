import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { chmodSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("commands run by your shell (25.7)", () => {
  test(":!cmd and its ranges parsed: '<,'>, %, ., a line, two; no command, none", async () => {
    const { parseBang } = await import("../../../../src/core/foundation/platform/shell.ts");
    expect(parseBang("!ls -la")).toEqual({ range: null, command: "ls -la" });
    expect(parseBang("  '<,'>!sort -u ")).toEqual({ range: "selection", command: "sort -u" });
    expect(parseBang("%!column -t")).toEqual({ range: "all", command: "column -t" });
    expect(parseBang(".!tr a-z A-Z")).toEqual({ range: "line", command: "tr a-z A-Z" });
    expect(parseBang("7!rev")).toEqual({ range: { from: 7, to: 7 }, command: "rev" });
    expect(parseBang("9, 3!sort")).toEqual({ range: { from: 3, to: 9 }, command: "sort" });
    expect([parseBang("!"), parseBang("%!  "), parseBang("w !sudo tee %"), parseBang("ls")]).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  test("% is the file's path, quoted for the shell; \\% a percent; none without a file", async () => {
    const { expandPercent, shellQuote } = await import("../../../../src/core/foundation/platform/shell.ts");
    expect(shellQuote("it's here")).toBe(`'it'\\''s here'`);
    expect(expandPercent("wc -l % && echo 50\\%", "notes/a b.md")).toBe("wc -l 'notes/a b.md' && echo 50%");
    expect(expandPercent("echo 50\\%", null)).toBe("echo 50%");
    expect(expandPercent("cat %", null)).toBeNull();
  });

  test("run in a folder with your shell: its input, both streams as they came, its exit; stopped, what it started too", async () => {
    const { runShell } = await import("../../../../src/core/foundation/platform/shell.ts");
    const was = process.env.SHELL;
    process.env.SHELL = "/bin/sh";
    try {
      const dir = mkdtempSync(join(tmpdir(), "slipbox-shell-"));
      // Each line written once the one before has been read (a file the test makes), so the order they came in is the
      // one written, however busy the machine: two pipes read at once could come either way. At most three seconds.
      const wait = (go: string) => `i=0; while [ ! -f ${go} ] && [ $i -lt 300 ]; do sleep 0.01; i=$((i+1)); done`;
      const r = await runShell(`pwd; echo out; ${wait("1")}; echo err >&2; ${wait("2")}; echo $SLIPBOX_X; exit 3`, {
        cwd: dir,
        env: { SLIPBOX_X: "x1" },
        onOutput: (text) => {
          const lines = text.split("\n");
          if (lines.includes("out")) writeFileSync(join(dir, "1"), "");
          if (lines.includes("err")) writeFileSync(join(dir, "2"), "");
        },
      }).done;
      expect(r).toMatchObject({ code: 3, signal: null, truncated: false });
      expect(r.output).toBe(`${realpathSync(dir)}\nout\nerr\nx1\n`);
      expect(r.stdout).toBe(`${realpathSync(dir)}\nout\nx1\n`);
      const sorted = await runShell("sort", { cwd: dir, input: "b\na\n" }).done;
      expect(sorted.stdout).toBe("a\nb\n");
      // A command that reads none of its input isn't an error.
      expect((await runShell("true", { cwd: dir, input: "x\n".repeat(100000) }).done).code).toBe(0);
      // Stopped: the shell and the sleep it started.
      const job = runShell("sleep 30 & sleep 30; echo never", { cwd: dir });
      await Bun.sleep(100);
      job.stop();
      const stopped = await job.done;
      expect(stopped.signal).toBe("SIGTERM");
      expect(stopped.output).toBe("");
      expect(stopped.ms).toBeLessThan(5000);
      // Your shell, as $SHELL names it: given -c and the command.
      const fake = join(dir, "fake-shell");
      writeFileSync(fake, '#!/bin/sh\necho "fake $1 $2"\n');
      chmodSync(fake, 0o755);
      process.env.SHELL = fake;
      expect((await runShell("echo hi", { cwd: dir }).done).output).toBe("fake -c echo hi\n");
      process.env.SHELL = "/bin/sh";
      // More than a window keeps: cut short, and said.
      const big = await runShell("head -c 3000000 /dev/zero | tr '\\0' x", { cwd: dir }).done;
      expect(big.truncated).toBe(true);
      expect(big.output.length).toBe(2 * 1024 * 1024);
      // A filter's own limit is 32 MB: its standard output whole, though more than the window keeps.
      expect(big.stdoutTruncated).toBe(false);
      expect(big.stdout.length).toBe(3_000_000);
      // A last piece past the window's limit is cut, and said so, as one after it would be.
      const edge = await runShell(
        `head -c ${2 * 1024 * 1024 - 10} /dev/zero | tr '\\0' x; sleep 0.2; printf '%020d' 0`,
        { cwd: dir },
      ).done;
      expect(edge).toMatchObject({ truncated: true, stdoutTruncated: false });
      expect(edge.output.length).toBe(2 * 1024 * 1024);
    } finally {
      process.env.SHELL = was;
    }
  });

  test("a character cut across two reads is kept whole, on either stream, merged or not", async () => {
    const { runShell } = await import("../../../../src/core/foundation/platform/shell.ts");
    const was = process.env.SHELL;
    process.env.SHELL = "/bin/sh";
    try {
      const dir = mkdtempSync(join(tmpdir(), "slipbox-shell-"));
      // An em dash's first two bytes, then its last, apart enough to be read apart: decoded a read at a time, each half
      // was a replacement character.
      for (const [to, merged] of [
        ["", false],
        [" >&2", false],
        ["", true],
        [" >&2", true],
      ] as const) {
        const r = await runShell(`printf '\\342\\200'${to}; sleep 0.2; printf '\\224 dash\\n'${to}`, {
          cwd: dir,
          merged,
        }).done;
        expect(r.output).toBe("— dash\n");
        expect(r.stdout).toBe(to && !merged ? "" : "— dash\n");
      }
    } finally {
      if (was === undefined) delete process.env.SHELL;
      else process.env.SHELL = was;
    }
  });

  test("merged (a window's, D264): its errors through its output's pipe, in the order written — your shell given -c and the command, its exit, its signal; stopped, what it started too", async () => {
    const { runShell } = await import("../../../../src/core/foundation/platform/shell.ts");
    const was = process.env.SHELL;
    try {
      const dir = mkdtempSync(join(tmpdir(), "slipbox-shell-"));
      // One pipe: what it writes to its errors is in standard output, where it wrote it, with no wait between (on two
      // pipes, CI's macOS read `c1.md` before `err`, #6).
      process.env.SHELL = "/bin/sh";
      const r = await runShell("echo out; echo err >&2; echo out2; exit 3", { cwd: dir, merged: true }).done;
      expect(r).toMatchObject({ code: 3, signal: null, output: "out\nerr\nout2\n", stdout: "out\nerr\nout2\n" });
      const turns = Array.from({ length: 50 }, (_, i) => `o${i}\ne${i}\n`).join("");
      const by = await runShell("i=0; while [ $i -lt 50 ]; do echo o$i; echo e$i >&2; i=$((i+1)); done", {
        cwd: dir,
        merged: true,
      }).done;
      expect(by.output).toBe(turns);
      // Unmerged (a filter's), its standard output alone.
      expect((await runShell("echo out; echo err >&2", { cwd: dir }).done).stdout).toBe("out\n");
      // Your shell, wherever it is (a space in its path), given -c and the command; none set, /bin/sh.
      const fake = join(dir, "my shell");
      writeFileSync(fake, '#!/bin/sh\necho "fake $1 $2"; echo "fake err" >&2\n');
      chmodSync(fake, 0o755);
      process.env.SHELL = fake;
      expect((await runShell("echo hi", { cwd: dir, merged: true }).done).output).toBe("fake -c echo hi\nfake err\n");
      delete process.env.SHELL;
      expect((await runShell("echo $0", { cwd: dir, merged: true }).done).output).toBe("/bin/sh\n");
      process.env.SHELL = "/bin/sh";
      // Ended by a signal: said so. Stopped once both its sleeps have started: the shell and both sleeps gone (a length
      // of sleep no other process here has, to find them by).
      expect((await runShell("kill -TERM $$", { cwd: dir, merged: true }).done).signal).toBe("SIGTERM");
      const nap = `sleep 30.${process.pid}${Math.floor(Math.random() * 1000)}`; // this run's alone
      const sleeps = () =>
        Bun.spawnSync(["ps", "-A", "-ww", "-o", "command="])
          .stdout.toString()
          .split("\n")
          .filter((line) => line.trim() === nap || line.trim().endsWith(`/${nap}`)).length; // not the shell running them
      let started = false;
      const job = runShell(`${nap} & ${nap} & echo started; wait; echo never`, {
        cwd: dir,
        merged: true,
        onOutput: (text) => (started ||= text.includes("started")),
      });
      for (const t = Date.now(); !(started && sleeps() === 2) && Date.now() - t < 10_000; ) await Bun.sleep(20);
      expect(sleeps()).toBe(2);
      job.stop();
      const stopped = await job.done;
      expect(stopped).toMatchObject({ signal: "SIGTERM", output: "started\n" });
      for (const t = Date.now(); sleeps() > 0 && Date.now() - t < 10_000; ) await Bun.sleep(20);
      expect(sleeps()).toBe(0);
    } finally {
      if (was === undefined) delete process.env.SHELL;
      else process.env.SHELL = was;
    }
  });
});
