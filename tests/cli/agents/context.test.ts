import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCliProcessSandbox } from "../../support/cli-process.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { DEMO, sandbox, slipbox } = makeCliProcessSandbox();

describe("the vault and the tool", () => {
  test("context: a note, what it links to and what links to it, as one document for an agent (9.7)", () => {
    const r = slipbox(["context", "people/kenji-mori.md", "--json"], { cwd: DEMO }).json.data;
    expect(r.files.slice(0, 4).map((f: { path: string; why: string }) => `${f.why}:${f.path}`)).toEqual([
      "start:people/kenji-mori.md",
      "link:projects/variable-star-survey.md",
      "link:equipment/telescope-comparison.md",
      "link:people/partners-and-names.md",
    ]);
    expect(r.files.some((f: { why: string }) => f.why === "backlink")).toBe(true);
    expect(r.files[0]).not.toHaveProperty("text"); // the text is the bundle's
    expect(r).toMatchObject({ depth: 1, backlinks: true, limit: 25, chars: r.text.length });
    // Human output is the bundle itself, to pipe to an agent.
    const one = slipbox(["context", "people/kenji-mori.md", "--depth", "0", "--no-backlinks"], { cwd: DEMO }).out;
    expect(one).toStartWith(
      "# Context: people/kenji-mori.md\n\nThe note: each with its path and lines, fenced as it is on disk.\n\n## people/kenji-mori.md\n\n`people/kenji-mori.md:1-21` — asked for\n\n```markdown\n---\ntitle: Kenji Mori\n",
    );
    expect(one.match(/^## /gm)).toHaveLength(1);
    expect(slipbox(["context", "home", "--depth", "9"], { cwd: DEMO }).code).toBe(2);
    expect(slipbox(["context"], { cwd: DEMO }).code).toBe(2);
    // [context] in the config; --copy puts it on the clipboard (here, its file).
    const cfg = join(sandbox, "context.toml");
    writeFileSync(cfg, "[context]\ndepth = 0\nbacklinks = false\n");
    const c = slipbox(["context", "home", "--copy", "--json", "--config", cfg], { cwd: DEMO }).json.data;
    expect(c.files.map((f: { path: string }) => f.path)).toEqual(["home.md"]);
    expect(readFileSync(c.copied.file, "utf8")).toBe(c.text);
    expect(slipbox(["context", "home", "--copy", "--config", cfg], { cwd: DEMO }).out).toMatch(
      /^wrote .*clipboard\.txt: 1 file, \d+ chars\n$/,
    );
    rmSync(cfg);
  });
});
