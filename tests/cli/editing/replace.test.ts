import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCliProcessSandbox } from "../../support/cli-process.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { sandbox, vault, slipbox, note } = makeCliProcessSandbox();

describe("find and replace", () => {
  test("replace: dry run, all, first, a line range, groups; --if-unchanged refuses a stale sha", () => {
    const before = note("people/kenji-mori.md");
    const dry = slipbox(["replace", "kenji-mori", "Aster", "ASTER", "--dry-run", "--json"]).json.data;
    expect(dry.count).toBe(2); // the frontmatter's bio, and the body
    expect(note("people/kenji-mori.md")).toBe(before);
    const stale = slipbox(["replace", "kenji-mori", "Aster", "ASTER", "--if-unchanged", "0000000000000000"]);
    expect(stale.code).toBe(5);
    const done = slipbox(["replace", "kenji-mori", "Aster", "ASTER", "--if-unchanged", dry.sha, "--json"]).json.data;
    expect(done.count).toBe(2);
    expect(note("people/kenji-mori.md")).toContain("Observes on ASTER");
    const first = slipbox(["replace", "home", "—", "-", "--first", "--json"]).json.data;
    expect(first.count).toBe(1);
    const ranged = slipbox(["replace", "home", "^- ", "* ", "--regex", "--lines", "7-9", "--json"]).json.data;
    expect(ranged.changes.every((c: { line: number }) => c.line >= 7 && c.line <= 9)).toBe(true);
    slipbox(["replace", "2026-09-14-weekly", "(\\w+): book", "$1 will book", "--regex"]);
    expect(note("meetings/2026-09-14-weekly.md")).toContain("Tomasz will book");
    expect(slipbox(["replace", "home", "x"]).code).toBe(2);
  });
});

describe("the vault and the tool", () => {
  test(
    "review cycle 5: replace answers in linear time; resolve reads markdown links; stat; links --all",
    () => {
      writeFileSync(join(vault, "big-replace.md"), "- [ ] line Aster and Aster\n".repeat(25_000));
      const t0 = Date.now();
      const big = slipbox(["replace", "big-replace", "Aster", "Vega", "--json"]);
      expect(big.json.data.count).toBe(50_000);
      expect(big.json.data.changes[1]).toMatchObject({ line: 1, column: 22, textAfter: "- [ ] line Aster and Vega" });
      expect(Date.now() - t0).toBeLessThan(10_000);
      writeFileSync(join(vault, "people", "probe.md"), "[a](home.md) and [b](../home.md)\n");
      expect(slipbox(["resolve", "[a](home.md)", "--from", "people/probe.md"]).code).toBe(3);
      expect(slipbox(["resolve", "[b](../home.md)", "--from", "people/probe.md", "--json"]).json.data.path).toBe(
        "home.md",
      );
      const st = slipbox(["stat", "partners-and-names", "--json"]).json.data;
      expect(st).toMatchObject({
        path: "people/partners-and-names.md",
        title: "Partners and names",
        invalidUtf8: false,
      });
      expect(st.unresolved).toBeGreaterThan(0);
      expect(st.backlinks).toBeGreaterThan(0);
      const all = slipbox(["links", "--all", "--json"]).json.data;
      expect(
        all.some(
          (l: { from: string; status: string }) =>
            l.from === "people/partners-and-names.md" && l.status === "unresolved",
        ),
      ).toBe(true);
      const bl = slipbox(["backlinks", "people/kenji-mori.md", "--json"]).json.data.backlinks;
      expect(bl[0]).toHaveProperty("kind");
      expect(bl[0]).toHaveProperty("target");
      const created = slipbox(["write", "contacts", "# c", "--create", "--json"]);
      expect(created.json.data.shadows.sort()).toEqual(["equipment/contacts.md", "people/contacts.md"]);
      expect(created.json.warnings.join(" ")).toContain("naming it in a command takes a path");
      rmSync(join(vault, "contacts.md"));
      rmSync(join(vault, "big-replace.md"));
    },
    UNIT_TIMEOUT_MS,
  );
});

describe("the CLI's edges: help flags, error paths, empty states", () => {
  /** A root of its own, with a state, cache and config only it knows. */
  function fresh(prefix: string): { root: string; dir: string; env: Record<string, string> } {
    const dir = mkdtempSync(join(sandbox, prefix));
    const root = join(dir, "root");
    mkdirSync(join(root, ".slipbox"), { recursive: true });
    const env = {
      XDG_STATE_HOME: join(dir, "state"),
      XDG_CACHE_HOME: join(dir, "cache"),
      XDG_DATA_HOME: join(dir, "data"),
      XDG_CONFIG_HOME: join(dir, "config"),
      SLIPBOX_CONFIG: join(dir, "config", "slipbox", "config.toml"),
    };
    return { root, dir, env };
  }
  test("replace: --lines out of order, --first with --first-per-line — usage errors; a dry run shows each line before and after", () => {
    const { root, env } = fresh("replace-usage-");
    writeFileSync(join(root, "p.md"), "Asterion and Aster\nnone here\n");
    for (const [args, message] of [
      [["--lines", "2-1"], "--lines must look like 12 or 12-40, from 1 and in order"],
      [["--lines", "0"], "--lines must look like 12 or 12-40, from 1 and in order"],
      [["--lines", "1-x"], "--lines must look like 12 or 12-40, from 1 and in order"],
      [["--first", "--first-per-line"], "--first or --first-per-line, not both"],
    ] as [string[], string][]) {
      const r = slipbox(["replace", "p.md", "Aster", "Vega", ...args], { cwd: root, env });
      expect(r.code).toBe(2);
      expect(r.err).toBe(`slipbox: ${message}\n`);
    }
    expect(readFileSync(join(root, "p.md"), "utf8")).toBe("Asterion and Aster\nnone here\n");
    const dry = slipbox(["replace", "p.md", "Aster", "Vega", "--dry-run"], { cwd: root, env });
    expect(dry.code).toBe(0);
    expect(dry.out).toBe(
      "would replace 2 in p.md\n1:1: Asterion and Aster\n    → Vegaion and Aster\n1:14: Asterion and Aster\n     → Asterion and Vega\n",
    );
    expect(readFileSync(join(root, "p.md"), "utf8")).toBe("Asterion and Aster\nnone here\n");
    expect(slipbox(["replace", "p.md", "Aster", "Vega"], { cwd: root, env }).out).toBe("replaced 2 in p.md\n");
  });
});
