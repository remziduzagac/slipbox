import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCliProcessSandbox } from "../../support/cli-process.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { sandbox, slipbox } = makeCliProcessSandbox();

describe("reading", () => {
  test("render draws a note at a width, plain or as JSON lines; never a TUI when piped", () => {
    const r = slipbox(["render", "telescope-comparison", "--width", "80", "--plain"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("┌");
    for (const line of r.out.split("\n")) expect([...line].length).toBeLessThanOrEqual(80);
    const j = slipbox(["render", "partners-and-names", "--width", "60", "--json"]).json;
    expect(j.data.lines.join("\n")).toContain("木曽原天文同好会");
    expect(slipbox(["render", "home", "--glyphs", "ascii", "--plain"]).code).toBe(0);
    expect(slipbox(["render", "home", "--width", "5"]).code).toBe(2);
    expect(slipbox(["render", "no-such-note"]).code).toBe(3);
  });
  test("render draws a Mermaid diagram in box drawing (12.10): its library waited for, as a process starting cold", () => {
    const dir = join(sandbox, "diagrams");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "d.md"), "# D\n\n```mermaid\ngraph TD\n  A[Write] --> B[Disk]\n```\n");
    const r = slipbox(["render", join(dir, "d.md"), "--width", "80", "--plain"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/│\s+Write\s+│/);
    expect(r.out).not.toContain("A[Write]");
  });
  test("render draws forty distinct diagrams across queue and cache boundaries", () => {
    const dir = join(sandbox, "many-diagrams");
    mkdirSync(dir, { recursive: true });
    const source = Array.from(
      { length: 40 },
      (_, n) => `\`\`\`mermaid\ngraph TD\n  A[Diagram ${n}] --> B[Done]\n\`\`\`\n`,
    ).join("\n");
    writeFileSync(join(dir, "many.md"), source);
    const r = slipbox(["render", join(dir, "many.md"), "--width", "80", "--plain"]);
    expect(r.code).toBe(0);
    expect(r.out).not.toContain("graph TD");
    for (let n = 0; n < 40; n++) expect(r.out).toMatch(new RegExp(`│\\s+Diagram ${n}\\s+│`));
  });
  test("render gives up on a diagram the library never finishes: its source, saying why, within its limit (#164)", () => {
    const dir = join(sandbox, "never-finishes");
    mkdirSync(dir, { recursive: true });
    const diagram = readFileSync(join(import.meta.dir, "../../fixtures", "diagram", "never-finishes.mmd"), "utf8");
    writeFileSync(join(dir, "hangs.md"), `${"```"}mermaid\n${diagram}${"```"}\n`);
    const started = performance.now();
    const r = slipbox(["render", join(dir, "hangs.md"), "--width", "100", "--plain"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("took too long to draw");
    expect(r.out).toContain("Workspace owner");
    // One attempt of five seconds, not one per redraw, nor a retry.
    expect(performance.now() - started).toBeLessThan(20_000);
  });
  // util-linux's script: a terminal for the TUI's start (a pipe never gets one).
});
