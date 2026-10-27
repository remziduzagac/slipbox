import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCliProcessSandbox } from "../../support/cli-process.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { sandbox, slipbox } = makeCliProcessSandbox();

describe("writing", () => {
  test("a busy name is busy when it looks generated: a new note, a move or a copy there refused, exit 5; a notes build/ written", () => {
    const dir = mkdtempSync(join(sandbox, "busy-"));
    const own = {
      XDG_STATE_HOME: join(dir, "state"),
      XDG_CACHE_HOME: join(dir, "cache"),
      XDG_DATA_HOME: join(dir, "d"),
    };
    const root = join(dir, "root");
    const w = (rel: string, text: string) => {
      mkdirSync(join(root, rel, ".."), { recursive: true });
      writeFileSync(join(root, rel), text);
    };
    mkdirSync(join(root, ".slipbox"), { recursive: true });
    w(".gitignore", "dist/\n");
    w("a.md", "# A\n");
    w("b.md", "# B\n\nSee [[a]].\n");
    w("docs/d.md", "# D\n");
    w("deep/sub/s.md", "# S\n"); // no note at its top
    w("build/old.md", "# Old\n"); // a notes folder called build, not ignored
    w("dist/d.md", "# D\n"); // ignored
    w("target/debug/out.json", "{}\n"); // only folders at its top
    w("node_modules/pkg/README.md", "# Pkg\n");
    const run = (args: string[]) => slipbox(args, { cwd: root, env: own });
    const ls = () => run(["ls"]).out;
    // A notes build/: walked, indexed, written into, moved into.
    expect(ls()).toContain("build/old.md");
    expect(run(["write", "build/x.md", "text", "--create"]).code).toBe(0);
    expect(run(["mv", "a.md", "build/a.md"]).code).toBe(0);
    expect(ls()).toContain("build/a.md");
    expect(run(["problems"]).out).toContain("broken links (0)");
    // Ignored, or no note at its top: refused, said why, nothing written.
    const ignored = run(["write", "dist/new.md", "text", "--create"]);
    expect([ignored.code, ignored.err]).toEqual([
      5,
      "slipbox: dist/new.md: dist/ is a busy folder (git ignores it), which the vault doesn't index; not writing it\n",
    ]);
    const generated = run(["write", "target/debug/x.md", "text", "--create"]);
    expect([generated.code, generated.err]).toEqual([
      5,
      "slipbox: target/debug/x.md: target/ is a busy folder (no note at its top), which the vault doesn't index; not writing it\n",
    ]);
    expect(run(["mv", "b.md", "target/debug/b.md"]).code).toBe(5);
    expect(run(["mv", "deep", "vendor"]).code).toBe(5); // it would hold no note at its top
    expect(run(["cp", "b.md", "node_modules/pkg/b.md"]).code).toBe(5);
    expect(run(["cp", "b.md", "dist/b.md"]).code).toBe(5);
    expect(run(["cp", "deep", "pip-cache"]).code).toBe(5); // it would hold no note at its top
    expect(existsSync(join(root, "b.md"))).toBe(true);
    for (const rel of ["dist/new.md", "target/debug/x.md", "node_modules/pkg/b.md", "dist/b.md", "vendor", "pip-cache"])
      expect(existsSync(join(root, rel))).toBe(false);
    // A note it puts at a busy name's top, not ignored, makes a folder like any: written, indexed.
    expect(run(["write", "vendor/plan.md", "text", "--create"]).code).toBe(0);
    expect(run(["mv", "docs", "cache"]).code).toBe(0);
    expect(run(["mv", "b.md", "Caches/b"]).code).toBe(0);
    expect(ls()).toContain("vendor/plan.md");
    expect(ls()).toContain("cache/d.md");
    expect(ls()).toContain("Caches/b.md");
    // A note already in a busy folder is edited.
    expect(run(["write", "dist/d.md", "# D\n\nmore"]).code).toBe(0);
    expect(readFileSync(join(root, "dist", "d.md"), "utf8")).toBe("# D\n\nmore\n");
  });
});
