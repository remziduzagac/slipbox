import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { herdr, multiplexer, Pane } from "./herdr.ts";

const saved = { ...process.env };
const dirs: string[] = [];

afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Executables with the public pane/tab responses, recording which backend and owned IDs were used. */
function backend(bin: "herdr" | "herdsman"): () => string[][] {
  const dir = mkdtempSync(join(tmpdir(), "slipbox-live-backend-"));
  dirs.push(dir);
  const log = join(dir, "calls.jsonl");
  const script = join(dir, "backend.ts");
  writeFileSync(
    script,
    `import { appendFileSync } from "node:fs";
const [bin, ...args] = process.argv.slice(2);
appendFileSync(process.env.SLIPBOX_MUX_LOG!, JSON.stringify([bin, ...args]) + "\\n");
if (args[0] === "fail") { console.error("backend refused"); process.exit(1); }
if (args[0] === "tab" && args[1] === "create")
  console.log(JSON.stringify({result: {root_pane: {pane_id: "own:p7"}, tab: {tab_id: "own:t4"}}}));
else if (args[0] === "pane" && args[1] === "split")
  console.log(JSON.stringify({result: {pane: {pane_id: "own:p8"}}}));
else if (args[0] === "pane" && args[1] === "read") console.log("one row\\nanother row");
else console.log("{}");
`,
  );
  const shq = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;
  for (const name of ["herdr", "herdsman"]) {
    const path = join(dir, name);
    writeFileSync(path, `#!/bin/sh\nexec ${shq(process.execPath)} ${shq(script)} ${name} "$@"\n`);
    chmodSync(path, 0o755);
  }
  process.env.PATH = `${dir}:${saved.PATH ?? ""}`;
  process.env.SLIPBOX_MUX_LOG = log;
  delete process.env.HERDR_ENV;
  delete process.env.HERDSMAN_ENV;
  process.env[bin === "herdr" ? "HERDR_ENV" : "HERDSMAN_ENV"] = "1";
  return () =>
    readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
}

describe("live terminal backend", () => {
  test("requires an inherited multiplexer and prefers the active Herdsman context", () => {
    expect(() => multiplexer({})).toThrow("not inside herdr or Herdsman");
    expect(multiplexer({ HERDR_ENV: "1" })).toBe("herdr");
    expect(multiplexer({ HERDSMAN_ENV: "1" })).toBe("herdsman");
    expect(multiplexer({ HERDR_ENV: "1", HERDSMAN_ENV: "1" })).toBe("herdsman");
  });

  for (const bin of ["herdr", "herdsman"] as const) {
    test(`${bin} creates and closes its own tab, sends input and reads the visible screen`, async () => {
      const calls = backend(bin);
      const pane = Pane.open(undefined, "/tmp", true);
      expect(pane.id).toBe("own:p7");
      expect(pane.owned).toBe(true);
      pane.run("echo ready");
      await pane.keys("alt+enter", "ctrl+backspace");
      pane.text("typed");
      expect(pane.screen()).toEqual(["one row", "another row"]);
      pane.close();
      expect(calls()).toEqual([
        [bin, "tab", "create", "--no-focus", "--label", "slipbox terminal", "--cwd", "/tmp"],
        [bin, "pane", "run", "own:p7", "echo ready"],
        [bin, "pane", "send-keys", "own:p7", "alt+enter"],
        [bin, "pane", "send-keys", "own:p7", "ctrl+backspace"],
        [bin, "pane", "send-text", "own:p7", "typed"],
        [bin, "pane", "read", "own:p7", "--source", "visible"],
        [bin, "tab", "close", "own:t4"],
      ]);
    });

    test(`${bin} preserves split-pane cleanup and reports the active backend's errors`, () => {
      const calls = backend(bin);
      const pane = Pane.open(undefined, "/tmp");
      pane.close();
      expect(calls()).toEqual([
        [bin, "pane", "split", "--current", "--direction", "right", "--no-focus", "--cwd", "/tmp"],
        [bin, "pane", "rename", "own:p8", "slipbox terminal"],
        [bin, "pane", "close", "own:p8"],
      ]);
      expect(() => herdr("fail")).toThrow(`${bin} fail: backend refused`);
    });
  }
});
