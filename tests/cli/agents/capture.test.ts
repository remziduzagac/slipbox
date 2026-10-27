import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCliProcessSandbox } from "../../support/cli-process.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { sandbox, slipbox } = makeCliProcessSandbox();

describe("writing", () => {
  test("capture and the scratch: add, show, copy, clear with --if-unchanged", () => {
    slipbox(["scratch", "clear"]);
    expect(slipbox(["capture", "remember the dew heater"]).code).toBe(0);
    slipbox(["capture", "--ref", "handbook/operations-handbook.md:6-8", "--snippet"]);
    slipbox(["capture", "--stdin", "--lang", "sh"], { stdin: "nightjar stop --drain\n" });
    const shown = slipbox(["scratch", "show", "--json"]).json.data;
    expect(shown.content).toContain("remember the dew heater");
    expect(shown.content).toContain("```sh");
    expect(slipbox(["scratch", "path"]).out.trim()).toEndWith(".md");
    expect(slipbox(["scratch", "copy", "--json"]).code).toBe(0);
    expect(slipbox(["scratch", "clear", "--if-unchanged", "0"]).code).toBe(5);
    expect(slipbox(["scratch", "clear", "--if-unchanged", shown.sha]).code).toBe(0);
    expect(slipbox(["scratch", "show"]).out).toBe("");
    expect(slipbox(["capture"]).code).toBe(2);
  });
});

describe("the vault and the tool", () => {
  test("review cycle 5: capture warns on dead references and refuses empty stdin; find names skipped notes", () => {
    const dead = slipbox(["capture", "--ref", "nonexist.md:15", "--json"]);
    expect(dead.json.warnings.join(" ")).toContain("no such file");
    const past = slipbox(["capture", "--ref", "people/kenji-mori.md:999", "--json"]);
    expect(past.json.warnings.join(" ")).toContain("past the end");
    expect(slipbox(["capture", "--ref", "people/kenji-mori.md:1", "--stdin"], { stdin: "" }).code).toBe(2);
    const small = join(sandbox, "small-vault");
    mkdirSync(join(small, ".slipbox"), { recursive: true });
    writeFileSync(join(small, ".slipbox", "config.toml"), "walk.max_file_size = 100\n");
    writeFileSync(join(small, "big.md"), `needle\n${"x".repeat(200)}\n`);
    const f = slipbox(["--root", small, "find", "needle", "--json"]);
    expect(f.json.data.count).toBe(0);
    expect(f.json.warnings.join(" ")).toContain("big.md: not searched");
    const miss = slipbox(["task", "2026-09-14-weekly", "1", "--json"]);
    expect(miss.code).toBe(3);
    expect(miss.json.data.tasks[0]).toHaveProperty("raw");
  });
});
