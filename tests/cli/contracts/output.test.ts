import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { CliError, type Io } from "../../../src/cli/common.ts";
import { UsageError } from "../../../src/cli/args.ts";
import { CliOutput } from "../../../src/cli/output.ts";
import { VaultError } from "../../../src/core/workspace/vaults/vault.ts";
import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";

setDefaultTimeout(UNIT_TIMEOUT_MS);

function capture(json: boolean, debug = false) {
  const writes: { stream: "out" | "err"; text: string }[] = [];
  const io: Io = {
    out: (text) => writes.push({ stream: "out", text }),
    err: (text) => writes.push({ stream: "err", text }),
    stdin: async () => "",
    isTTY: false,
    columns: undefined,
    cwd: process.cwd(),
    env: { SLIPBOX_DEBUG: debug ? "1" : "" },
  };
  return { output: new CliOutput(io, json), writes };
}

const session = {
  stale: () => [{ path: "dirty.md", pid: process.pid }],
  allWarnings: () => ["first\u202e warning", "second warning"],
};

describe("CLI output policy", () => {
  test("human result, warnings and stale diagnostics keep stream/order; render retains its layout escapes", () => {
    const { output, writes } = capture(false);
    expect(output.result("read", { data: null, human: "note\u202e\n", code: 1 }, session)).toBe(1);
    expect(writes).toEqual([
      { stream: "out", text: "note\n" },
      { stream: "err", text: "slipbox: warning: first warning\n" },
      { stream: "err", text: "slipbox: warning: second warning\n" },
      { stream: "err", text: "slipbox: warning: unsaved changes in a running slipbox: dirty.md\n" },
    ]);
    const rendered = capture(false);
    const human = "\u001b[31mred\u001b[0m\n";
    expect(rendered.output.result("render", { data: null, human }, { ...session, allWarnings: () => [] })).toBe(0);
    expect(rendered.writes[0]).toEqual({ stream: "out", text: human });
  });

  test("JSON success retains handler data, nonzero codes and omitted undefined data; init never reads stale", () => {
    const { output, writes } = capture(true);
    expect(output.result("read", { data: undefined, code: 1 }, session)).toBe(1);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.stream).toBe("out");
    expect(writes[0]?.text).toContain("\\u202e");
    expect(JSON.parse(writes[0]!.text)).toEqual({
      schema: 1,
      ok: true,
      command: "read",
      warnings: session.allWarnings(),
      stale: ["dirty.md"],
    });
    const init = capture(true);
    const noStale = {
      ...session,
      stale: () => {
        throw Error("init must skip stale");
      },
    };
    expect(init.output.result("init", { data: false }, noStale)).toBe(0);
    expect(JSON.parse(init.writes[0]!.text)).toMatchObject({ data: false, stale: [] });
    expect(init.output.error("init", new CliError("refused", 5), noStale)).toBe(5);
    expect(JSON.parse(init.writes[1]!.text)).toMatchObject({ error: { code: 5 }, stale: [] });
  });

  test("errors retain code/data/warnings and tolerate a failing stale read", () => {
    for (const [error, code] of [
      [new CliError("refused\u202e", 5, { current: "sha" }), 5],
      [new UsageError("usage"), 2],
      [new VaultError("missing"), 3],
      [new Error("unexpected"), 1],
    ] as const) {
      const { output, writes } = capture(true, true);
      expect(
        output.error("write", error, {
          ...session,
          stale: () => {
            throw Error("state unavailable");
          },
        }),
      ).toBe(code);
      expect(writes).toHaveLength(1);
      expect(writes[0]?.stream).toBe("out");
      expect(JSON.parse(writes[0]!.text)).toEqual({
        schema: 1,
        ok: false,
        command: "write",
        error: { code, message: error.message },
        data: error instanceof CliError ? { current: "sha" } : null,
        warnings: session.allWarnings(),
        stale: [],
      });
    }
    const live = capture(true);
    expect(live.output.error("read", new CliError("missing", 3), session)).toBe(3);
    expect(JSON.parse(live.writes[0]!.text).stale).toEqual(["dirty.md"]);
  });

  test("only unexpected human errors add a debug stack; parse failures always use exit 2", () => {
    for (const error of [
      new CliError("refused", 5),
      new UsageError("usage"),
      new VaultError("missing"),
      new Error("unexpected"),
    ]) {
      const { output, writes } = capture(false, true);
      output.error("read", error, null);
      expect(writes[0]).toEqual({ stream: "err", text: `slipbox: ${error.message}\n` });
      expect(writes.length).toBe(error.constructor === Error ? 2 : 1);
      if (writes[1]) expect(writes[1]).toEqual({ stream: "err", text: `${error.stack}\n` });
    }
    const parsed = capture(true);
    expect(parsed.output.usageError("read", "bad\u202e")).toBe(2);
    expect(JSON.parse(parsed.writes[0]!.text)).toMatchObject({
      command: "read",
      error: { code: 2, message: "bad\u202e" },
      data: null,
    });
  });
});
