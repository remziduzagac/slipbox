import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCliProcessSandbox } from "../../support/cli-process.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { DEMO, sandbox, slipbox } = makeCliProcessSandbox();

describe("the vault and the tool", () => {
  test("search: ranked by the words, scanned until `index` builds the index (6.x)", () => {
    const dir = join(sandbox, "search");
    cpSync(DEMO, dir, { recursive: true });
    const scan = slipbox(["search", "dome", "shutter", "--json"], { cwd: dir }).json;
    expect(scan.data.engine).toBe("scan");
    expect(scan.warnings.join()).toContain("slipbox index builds it");
    expect(slipbox(["index"], { cwd: dir }).out).toMatch(
      /^search index: \d+ files — \d+ indexed, 0 removed \(\d+ ms\)\n$/,
    );
    const r = slipbox(["search", "dome", "shutter", "--json"], { cwd: dir }).json.data;
    expect(r.engine).toBe("index");
    const files = (x: { hits: { path: string }[] }) => x.hits.map((h) => h.path).sort();
    expect(files(r)).toEqual(files(scan.data)); // the same notes, either way
    expect(r.hits[0]).toMatchObject({
      path: "projects/dome-refit.md",
      line: expect.any(Number),
      column: expect.any(Number),
      heading: expect.any(String),
    });
    // Human output: path:line:column, the section, the line with its words marked.
    expect(slipbox(["search", "木曽原"], { cwd: dir }).out).toBe(
      "people/partners-and-names.md:84:35  Contacts — - Kiso-Hara Astronomical Society ([木曽原])\n",
    );
    expect(slipbox(["info"], { cwd: dir }).out).toMatch(/\nsearch {4}auto — index: \d+ files\n/);
  });
  test("search's human output: words that meet or overlap marked once", () => {
    const dir = join(sandbox, "search-marks");
    mkdirSync(join(dir, ".slipbox"), { recursive: true });
    writeFileSync(join(dir, "ny.md"), "new york is new\n");
    expect(slipbox(["search", "new", '"new york"'], { cwd: dir }).out).toBe("ny.md:1:1  [new york] is [new]\n");
  });
});

describe("review cycle 6 (cli)", () => {
  /** A folder of its own and a state only it knows: what one test names, no other sees. */
  function own(prefix: string): { dir: string; env: Record<string, string> } {
    const dir = mkdtempSync(join(sandbox, prefix));
    return {
      dir,
      env: { XDG_STATE_HOME: join(dir, "state"), XDG_CACHE_HOME: join(dir, "cache"), XDG_DATA_HOME: join(dir, "data") },
    };
  }
  test("index --refresh walks by --config's walk, as every other command does", () => {
    const { dir, env } = own("refresh-cfg-");
    const root = join(dir, "root");
    mkdirSync(join(root, ".slipbox"), { recursive: true });
    mkdirSync(join(root, "skip"));
    writeFileSync(join(root, "a.md"), "# A\n");
    writeFileSync(join(root, "skip", "b.md"), "# B\n");
    const alt = join(dir, "alt.toml");
    writeFileSync(alt, '[walk]\nexclude = ["skip/"]\n');
    expect(slipbox(["ls", "--config", alt, "--json"], { cwd: root, env }).json.data).toHaveLength(1);
    expect(slipbox(["index", "--refresh", "--config", alt, "--json"], { cwd: root, env }).json.data.notes).toBe(1);
  });
});
