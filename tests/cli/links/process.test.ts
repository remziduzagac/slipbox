import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCliProcessSandbox } from "../../support/cli-process.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { sandbox, slipbox } = makeCliProcessSandbox();

describe("links", () => {
  test("resolve follows names, headings, blocks; unresolved and external links", () => {
    expect(slipbox(["resolve", "writing-guide"]).out.trim()).toEndWith("handbook/writing-guide.md");
    const h = slipbox(["resolve", "operations-handbook#O25: Documentation categories", "--json"]).json;
    expect(h.data).toMatchObject({ status: "resolved", path: "handbook/operations-handbook.md" });
    expect(h.data.line).toBeGreaterThan(1);
    // A wikilink, by its name within the root (21.3).
    expect(slipbox(["resolve", "[[operations-handbook]]", "--json"]).json.data).toMatchObject({
      status: "resolved",
      path: "handbook/operations-handbook.md",
    });
    expect(slipbox(["resolve", "visiting-rota", "--from", "partners-and-names"]).code).toBe(3);
    expect(slipbox(["resolve", "https://example.org/x", "--json"]).json.data.status).toBe("external");
  });
  test("link: a link to a note as slipbox writes one where --from is — the demo's convention, the note's title (21.5)", () => {
    const r = slipbox(["link", "operations-handbook", "--from", "kenji-mori", "--json"]);
    expect(r.code).toBe(0);
    expect(r.json.data).toMatchObject({
      path: "handbook/operations-handbook.md",
      from: "people/kenji-mori.md",
      style: "markdown",
      pathForm: "relative",
    });
    expect(r.json.data.link).toMatch(/^\[[^\]]+\]\(\.\.\/handbook\/operations-handbook\.md\)$/);
    expect(slipbox(["link", "operations-handbook", "--from", "kenji-mori"]).out).toBe(`${r.json.data.link}\n`);
    expect(slipbox(["link", "no-such-note-anywhere"]).code).toBe(3);
  });
  test("folders and name (21.10): the named folders this machine knows; a name changed, dry-run first", () => {
    const f = slipbox(["folders", "--json"]);
    expect(f.code).toBe(0);
    expect(Array.isArray(f.json.data)).toBe(true);
    const n = slipbox(["name", "halden-renamed", "--dry-run", "--json"]);
    expect(n.code).toBe(0);
    expect(n.json.data).toMatchObject({ kind: "root", to: "halden-renamed", dryRun: true });
  });
  test("symlinks (VV-D6): the symlinks answered, none here yet; forgetting one never answered is not found", () => {
    const s = slipbox(["symlinks", "--json"]);
    expect(s.code).toBe(0);
    expect(s.json.data).toEqual([]);
    expect(slipbox(["symlinks"]).out).toContain("no symlink answered yet");
    const f = slipbox(["symlinks", "forget", "no-such-link", "--json"]);
    expect(f.code).toBe(3);
    expect(f.json.error?.message).toContain("nothing said of no-such-link to forget");
  });
  test("links and backlinks, with their status", () => {
    const l = slipbox(["links", "partners-and-names", "--json"]).json.data;
    expect(
      l.some((x: { target: string; status: string }) => x.target === "visiting-rota.md" && x.status === "unresolved"),
    ).toBe(true);
    expect(slipbox(["links", "partners-and-names"]).out).toContain("UNRESOLVED");
    const b = slipbox(["backlinks", "kenji-mori", "--json"]).json.data;
    expect(b.backlinks.map((x: { from: string }) => x.from)).toContain("home.md");
  });
  test("links keeps a web address whole: no file to show, no root; printed as written (DF A7)", () => {
    const web = slipbox(["links", "partners-and-names", "--json"]).json.data.find(
      (x: { target: string }) => x.target === "https://partners.example.invalid/directory",
    );
    expect(web).toMatchObject({
      status: "external",
      path: "https://partners.example.invalid/directory",
      shown: null,
      root: null,
      name: null,
    });
    expect(slipbox(["links", "partners-and-names"]).out).toContain(
      " https://partners.example.invalid/directory -> https://partners.example.invalid/directory\n",
    );
  });
  test("links --json gives each link's end, as backlinks gives the same link's", () => {
    type Pos = { line: number; column: number };
    const l = slipbox(["links", "home", "--json"]).json.data as (Pos & { path: string | null; end: Pos })[];
    for (const x of l) expect(x.end).toEqual({ line: expect.any(Number), column: expect.any(Number) });
    const to = l.find((x) => x.path === "people/kenji-mori.md")!;
    const back = slipbox(["backlinks", "kenji-mori", "--json"]).json.data.backlinks.find(
      (x: Pos & { from: string }) => x.from === "home.md" && x.line === to.line && x.column === to.column,
    );
    expect(to.end).toEqual(back.end);
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
  test("review cycle 2: link --from takes a target in a nested root by its path, and reaches a hidden one", () => {
    const { dir, env } = own("link-from-");
    const root = join(dir, "root");
    mkdirSync(join(root, ".slipbox"), { recursive: true });
    mkdirSync(join(root, "nest", ".slipbox"), { recursive: true });
    mkdirSync(join(root, ".hidden"));
    writeFileSync(join(root, "c.md"), "# C\n");
    writeFileSync(join(root, "nest", "x.md"), "# X\n");
    writeFileSync(join(root, ".hidden", "h.md"), "# H\n");
    expect(slipbox(["link", "nest/x.md", "--from", "c.md"], { cwd: root, env })).toMatchObject({
      code: 0,
      out: "[X](nest/x.md)\n",
    });
    expect(slipbox(["link", join(root, "nest", "x.md"), "--from", "c.md"], { cwd: root, env })).toMatchObject({
      code: 0,
      out: "[X](nest/x.md)\n",
    });
    // Never reached before: --from's note is the one that says which root this is, not the target.
    expect(slipbox(["link", ".hidden/h.md", "--from", "c.md"], { cwd: root, env })).toMatchObject({
      code: 0,
      out: "[H](.hidden/h.md)\n",
    });
  });
  test("review cycle 3: link --from takes a target the walk never takes (node_modules, walk.exclude) by its path", () => {
    const { dir, env } = own("link-excluded-");
    const root = join(dir, "root");
    mkdirSync(join(root, ".slipbox"), { recursive: true });
    writeFileSync(join(root, ".slipbox", "config.toml"), '[walk]\nexclude = ["skip/"]\n');
    mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });
    mkdirSync(join(root, "skip"));
    writeFileSync(join(root, "ok.md"), "# OK\n");
    writeFileSync(join(root, "node_modules", "pkg", "README.md"), "# P\n");
    writeFileSync(join(root, "skip", "s.md"), "# S\n");
    for (const target of ["node_modules/pkg/README.md", "skip/s.md"]) {
      const plain = slipbox(["link", target], { cwd: root, env });
      expect(plain.code).toBe(0);
      expect(slipbox(["link", target, "--from", "ok.md"], { cwd: root, env })).toMatchObject({
        code: 0,
        out: plain.out,
      });
    }
  });
});
