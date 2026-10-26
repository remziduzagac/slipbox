import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runLint } from "../src/core/lint.ts";
import { type LinterDef, runLinter } from "../src/core/servers/linters.ts";
import { runTool, toolFailure } from "../src/core/foundation/platform/tool-process.ts";

const run = (source: string, options = {}) =>
  runTool([process.execPath, "-e", source], { cwd: "/tmp", timeoutMs: 1000, ...options });
/** Whether a process group (or, `group` false, a process) still has anyone in it. */
const alive = (pid: number, group = true) => {
  try {
    process.kill(group ? -pid : pid, 0);
    return true;
  } catch {
    return false;
  }
};
const until = async (ok: () => boolean, ms = 3000) => {
  for (const t = Date.now(); !ok() && Date.now() - t < ms; ) await Bun.sleep(20);
  return ok();
};
const reap = (pid: number) => {
  // Never 0: a pid the tool didn't print reads as 0, and signalling 0 or -0 is this process's own group — the runner.
  if (!(pid > 0)) return;
  for (const target of [-pid, pid])
    try {
      process.kill(target, "SIGKILL");
    } catch {}
};
/** A linter of efm's kind, running `command` through the shell. */
const linter = (command: string): LinterDef => ({
  name: "t",
  command,
  stdin: false,
  formats: ["%f:%l:%c: %m"],
  source: "t",
  severity: "error",
  ignoreExitCode: false,
  rootMarkers: [],
  requireMarker: false,
});
/** More than a linter's 16 MiB, on standard output. */
const FLOOD = `process.stdout.write("x".repeat(17 * 1024 * 1024))`;

describe("finite tool runs", () => {
  test("tool captures bounded streams and rejects partial successful output", async () => {
    const result = await run('process.stdout.write("x".repeat(20000));setInterval(()=>{},100)', { outputBytes: 1024 });
    expect(result.stdout.length).toBe(1024);
    expect(result.error).toContain("output limit (1 KiB)");
    expect(result.failure).toBe("overflow");
  });

  test("a tool that ignores the graceful stop is ended by the forced one, and nothing of it is left", async () => {
    const result = await run('process.on("SIGTERM",()=>{});console.log(process.pid);setInterval(()=>{},100)', {
      timeoutMs: 300,
      graceMs: 50,
    });
    expect(result.error).toContain("deadline");
    expect(result.signal).toBe("SIGKILL"); // the forced stop ended it, not the readers' cutoff
    const pid = Number(result.stdout.trim());
    expect(await until(() => !alive(pid, false))).toBe(true);
  });

  test("tool cancellation settles accepted jobs", async () => {
    const controller = new AbortController();
    const result = run("setInterval(()=>{},100)", { signal: controller.signal });
    controller.abort();
    expect(await result).toMatchObject({ error: "tool cancelled", failure: "cancelled" });
  });

  test("tool spawn failure settles, in its own words, and a later run succeeds", async () => {
    const failed = await runTool(["slipbox-no-such-tool"], { cwd: "/tmp", timeoutMs: 50 });
    expect(failed.failure).toBe("spawn");
    expect(toolFailure(failed)).toBe(failed.error!); // nothing printed, nothing discarded
    expect(await run('console.log("done")')).toMatchObject({ code: 0, signal: null, stdout: "done\n" });
  });

  test("a cancel's listener is gone once the run settles", async () => {
    class Counting extends EventTarget {
      aborted = false;
      listening = 0;
      override addEventListener(...a: Parameters<EventTarget["addEventListener"]>) {
        this.listening++;
        super.addEventListener(...a);
      }
      override removeEventListener(...a: Parameters<EventTarget["removeEventListener"]>) {
        this.listening--;
        super.removeEventListener(...a);
      }
    }
    const signal = new Counting();
    const before = ["SIGINT", "SIGTERM", "SIGHUP"].map((s) => process.listenerCount(s));
    const running = run('console.log("done")', { signal: signal as unknown as AbortSignal });
    expect(process.listenerCount("SIGINT")).toBe(before[0]! + 1); // slipbox's end stops it while it runs
    expect(await running).toMatchObject({ code: 0 });
    expect(signal.listening).toBe(0);
    expect(["SIGINT", "SIGTERM", "SIGHUP"].map((s) => process.listenerCount(s))).toEqual(before); // and no longer
  });
});

describe.skipIf(process.platform === "win32")("a tool's process group", () => {
  test("inherited pipes cannot keep a finished tool pending, and its helper holding them is stopped", async () => {
    const source = `const c=require("node:child_process").spawn(process.execPath,["-e","setInterval(()=>{},100)"],{stdio:["ignore",1,2]});console.log(c.pid);c.unref()`;
    const result = await run(source, { timeoutMs: 300, graceMs: 20 });
    expect(result.error).toContain("deadline");
    const helper = Number(result.stdout.trim());
    try {
      expect(helper).toBeGreaterThan(0); // its pid printed: 0 would be this process's own group
      expect(await until(() => !alive(helper, false))).toBe(true);
    } finally {
      reap(helper);
    }
  });

  test("a helper in a session of its own holding the pipes: the readers' cutoff settles the run", async () => {
    const source = `const c=require("node:child_process").spawn(process.execPath,["-e","setTimeout(()=>{},20000)"],{stdio:["ignore",1,2],detached:true});console.log(c.pid);c.unref()`;
    const t = Date.now();
    const result = await run(source, { timeoutMs: 300, graceMs: 20 });
    const helper = Number(result.stdout.trim());
    try {
      expect(helper).toBeGreaterThan(0); // its pid printed: 0 would be this process's own group
      expect(result.error).toContain("deadline");
      // The deadline, the grace and the cutoff's 100 ms, 0.42 s; not the helper's 20 s. Bounded halfway between, a wide
      // margin for a slow runner (4.4 s on CI's macOS, #6).
      expect(Date.now() - t).toBeLessThan(10_000);
      expect(alive(helper, false)).toBe(true); // not slipbox's group: left alone
    } finally {
      reap(helper);
    }
  });

  test("nothing of a finished tool's group outlives its run", async () => {
    const source = `const c=require("node:child_process").spawn(process.execPath,["-e","setTimeout(()=>{},20000)"],{stdio:"ignore"});console.log(c.pid);c.unref()`;
    const result = await run(source);
    expect(result).toMatchObject({ code: 0, signal: null });
    expect(result.error).toBeUndefined();
    const helper = Number(result.stdout.trim());
    try {
      expect(helper).toBeGreaterThan(0); // its pid printed: 0 would be this process's own group
      expect(await until(() => !alive(helper, false))).toBe(true);
    } finally {
      reap(helper);
    }
  });

  // A shell's job, sent the signal a terminal sends (Ctrl-C, a closed window) or ending by itself: the linter it
  // started, in a group of its own and deaf to the graceful stop, goes with it, and the job ends as it would have.
  for (const how of ["SIGINT", "SIGHUP", "exit"] as const)
    test(`slipbox ended (${how}) while a linter runs: no linter survives it`, async () => {
      const dir = mkdtempSync(join(tmpdir(), "slipbox-tool-"));
      const pidFile = join(dir, "pid");
      const lint = join(import.meta.dir, "../src/core/lint.ts");
      const script = [
        `import { existsSync } from "node:fs";`,
        `import { runLint } from ${JSON.stringify(lint)};`,
        `void runLint({ argv: ["sh", "-c", ${JSON.stringify(`trap '' TERM; echo $$ > '${pidFile}'; exec sleep 30`)}], literal: false }, ["/tmp/a.md"], "/tmp");`,
        `while (!existsSync(${JSON.stringify(pidFile)})) await Bun.sleep(10);`,
        how === "exit" ? "process.exit(0);" : "await Bun.sleep(30000);",
      ].join("\n");
      const job = spawn(process.execPath, ["-e", script], { detached: true, stdio: "ignore" });
      const ended = new Promise<[number | null, string | null]>((r) => job.once("exit", (c, s) => r([c, s])));
      expect(await until(() => existsSync(pidFile) && readFileSync(pidFile, "utf8").trim() !== "", 10_000)).toBe(true);
      const tool = Number(readFileSync(pidFile, "utf8").trim());
      try {
        expect(alive(tool)).toBe(true);
        if (how !== "exit") process.kill(-job.pid!, how);
        expect(await ended).toEqual(how === "exit" ? [0, null] : [null, how]);
        expect(await until(() => !alive(tool))).toBe(true);
      } finally {
        reap(tool);
        reap(job.pid!);
      }
    });
});

describe("linter output", () => {
  test("output past a linter's limit: this run's findings aren't shown, and the linter isn't failed", async () => {
    const said: string[] = [];
    const source = `console.log("/tmp/a.md:1 MD001/rule finding");${FLOOD}`;
    const result = await runLint(
      { argv: [process.execPath, "-e", source], literal: false },
      ["/tmp/a.md"],
      "/tmp",
      10_000,
      (text) => said.push(text),
    );
    expect(result).toEqual({ skipped: "stdout output limit (16 MiB) exceeded; partial output discarded" });
    expect(said).toEqual([]); // the caller says it, once
    const efm = await runLinter(linter(`${JSON.stringify(process.execPath)} -e '${FLOOD}'`), "/tmp/a.txt", "", "/tmp");
    expect(efm).toEqual({ skipped: "t: stdout output limit (16 MiB) exceeded; partial output discarded" });
  });

  test("a linter ended by a signal is a failed run, never its partial findings", async () => {
    const killed = 'echo "/tmp/a.md:1 MD001/heading-increment first of many"; kill -9 $$';
    const r = await runTool(["sh", "-c", killed], { cwd: "/tmp", timeoutMs: 5000 });
    expect(r).toMatchObject({ code: null, signal: "SIGKILL" });
    expect(r.error).toBeUndefined();
    expect(toolFailure(r)).toBe("ended by SIGKILL");
    const said: string[] = [];
    expect(
      await runLint({ argv: ["sh", "-c", killed], literal: false }, ["/tmp/a.md"], "/tmp", 5000, (t) => said.push(t)),
    ).toBeNull();
    expect(said).toEqual(["linter: ended by SIGKILL"]);
    expect(await runLinter(linter("echo 'stdin:1:1: first'; kill -9 $$"), "/tmp/a.txt", "", "/tmp")).toEqual({
      failed: "error",
      detail: "t: ended by SIGKILL",
    });
  });

  test("'partial output discarded' only for slipbox's own stop, and only once something was printed", async () => {
    expect(toolFailure(await run("setInterval(()=>{},100)", { timeoutMs: 100, graceMs: 20 }))).toBe(
      "tool deadline exceeded",
    );
    expect(toolFailure(await run('console.log("a");setInterval(()=>{},100)', { timeoutMs: 300, graceMs: 20 }))).toBe(
      "tool deadline exceeded; partial output discarded",
    );
    // A linter that can't start says so in its own words, as before; the [lint] command, nothing at all.
    const gone = join(tmpdir(), "slipbox-no-such-folder");
    const r = await runLinter(linter("true"), join(gone, "a.txt"), "", gone);
    expect(r).toEqual({ failed: "error", detail: expect.stringMatching(/^t: [^;]*ENOENT[^;]*$/) }); // no "; partial…"
    const said: string[] = [];
    const none = await runLint({ argv: ["slipbox-no-such-linter"], literal: false }, ["/tmp/a.md"], "/tmp", 5000, (t) =>
      said.push(t),
    );
    expect([none, said]).toEqual([null, []]);
  });
});
