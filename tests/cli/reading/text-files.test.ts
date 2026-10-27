import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCliProcessSandbox } from "../../support/cli-process.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { sandbox, vault, slipbox } = makeCliProcessSandbox();

describe("the vault and the tool", () => {
  test("files beyond notes (16.4): read, replace, write and find them; ls --files; binary refused", () => {
    mkdirSync(join(vault, "cfg"), { recursive: true });
    writeFileSync(join(vault, "cfg", "site.toml"), '[site]\nname = "Halden" # the observatory\n');
    writeFileSync(join(vault, "tool.py"), 'print("needle-py")\n');
    writeFileSync(join(vault, "pic.png"), "\u0000png");
    expect(slipbox(["read", "cfg/site.toml", "--json"]).json.data.content).toContain("the observatory");
    expect(slipbox(["replace", "cfg/site.toml", '"Halden"', '"Halden Ridge"']).code).toBe(0);
    expect(readFileSync(join(vault, "cfg", "site.toml"), "utf8")).toContain('name = "Halden Ridge"');
    expect(slipbox(["write", "tool.py", "--append", "--", "# done"]).code).toBe(0);
    expect(readFileSync(join(vault, "tool.py"), "utf8")).toBe('print("needle-py")\n# done\n');
    expect(slipbox(["write", "cfg/new.json", "{}", "--create"]).code).toBe(0);
    expect(existsSync(join(vault, "cfg", "new.json"))).toBe(true); // the extension kept, no .md added
    expect(slipbox(["find", "needle-py", "--json"]).json.data.count).toBe(0); // notes only…
    expect(slipbox(["find", "needle-py", "--files", "--json"]).json.data.matches[0].path).toBe("tool.py"); // …files with --files
    const ls = slipbox(["ls", "--files", "--json"]).json.data;
    expect(ls.find((f: { path: string }) => f.path === "cfg/site.toml")).toMatchObject({
      group: "data",
      format: "toml",
    });
    expect(ls.find((f: { path: string }) => f.path === "tool.py")).toMatchObject({ group: "text", format: "python" });
    expect(ls.some((f: { path: string }) => f.path === "pic.png")).toBe(false);
    expect(slipbox(["ls", "--json"]).json.data.some((f: { path: string }) => f.path === "tool.py")).toBe(false);
    expect(slipbox(["write", "pic.png", "x"]).code).toBe(5);
    expect(slipbox(["read", "cfg/site"]).code).toBe(3); // a file needs its extension
    // A data file renders and has an outline (16.11); a text file has neither, nor tasks.
    const r = slipbox(["render", "cfg/site.toml", "--plain"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/name\s+Halden Ridge\s+# the observatory/);
    expect(
      slipbox(["outline", "cfg/site.toml", "--json"]).json.data.headings.map((h: { text: string }) => h.text),
    ).toEqual(["site"]);
    expect(slipbox(["render", "tool.py"]).code).toBe(2);
    // Source code's outline is its definitions, from its grammar (16.8).
    writeFileSync(join(vault, "shape.py"), "class Shape:\n    def area(self):\n        return 0\n");
    expect(slipbox(["outline", "shape.py", "--json"]).json.data.headings).toEqual([
      { depth: 1, text: "Shape", kind: "class", line: 1 },
      { depth: 2, text: "area", kind: "method", line: 2 },
    ]);
    // A name that says its kind already isn't printed twice (Rust's impl: "impl Show for Point").
    writeFileSync(join(vault, "shape.rs"), "struct Point;\ntrait Show {}\nimpl Show for Point {}\n");
    const rs = slipbox(["outline", "shape.rs"]).out;
    expect(rs).toContain("impl Show for Point");
    expect(rs).not.toContain("impl impl");
    rmSync(join(vault, "shape.rs"));
    // Its comments' links count as backlinks (16.10).
    writeFileSync(join(vault, "shape.py"), "# the home note: home.md\nx = 1\n");
    expect(
      slipbox(["backlinks", "home", "--json"]).json.data.backlinks.some((b: { from: string }) => b.from === "shape.py"),
    ).toBe(true);
    rmSync(join(vault, "shape.py"));
    expect(slipbox(["task", "tool.py"]).code).toBe(2);
    // Its links (16.15): a path that resolves, and it shows among the target's backlinks.
    writeFileSync(join(vault, "cfg", "links.yaml"), "docs: ../home.md\nnope: home.md\nname: not-a-link\n"); // relative to the file
    expect(
      slipbox(["links", "cfg/links.yaml", "--json"]).json.data.map((l: { target: string; status: string }) => [
        l.target,
        l.status,
      ]),
    ).toEqual([["../home.md", "note"]]);
    expect(
      slipbox(["backlinks", "home", "--json"]).json.data.backlinks.some(
        (b: { from: string }) => b.from === "cfg/links.yaml",
      ),
    ).toBe(true);
    rmSync(join(vault, "cfg", "links.yaml"));
    writeFileSync(join(vault, "cfg", "bad.json"), '{"a": }');
    expect(slipbox(["render", "cfg/bad.json"]).err).toContain("doesn't parse");
    for (const f of ["cfg/site.toml", "cfg/new.json", "cfg/bad.json", "tool.py", "pic.png"]) rmSync(join(vault, f));
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
  test("a git-ignored file named from --root, from outside the root, is read and stat'd (20.8)", () => {
    const { dir, env } = own("ignored-");
    const repo = join(dir, "repo");
    mkdirSync(join(repo, ".git"), { recursive: true });
    mkdirSync(join(repo, "private"));
    writeFileSync(join(repo, ".gitignore"), "private/\n");
    writeFileSync(join(repo, "a.md"), "# A\n");
    writeFileSync(join(repo, "private", "y.md"), "# Hidden away\n");
    const plain = join(dir, "plain");
    mkdirSync(plain);
    const r = slipbox(["read", "--root", "../repo", "private/y.md"], { cwd: plain, env });
    expect(r.code).toBe(0);
    expect(r.out).toContain("# Hidden away");
    expect(slipbox(["stat", "--root", "../repo", "private/y.md"], { cwd: plain, env }).code).toBe(0);
  });
});
