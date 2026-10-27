import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { runCli } from "../../../src/cli/cli.ts";
import { cli } from "../../support/vault-cli.ts";
import { makeVaultSandbox } from "../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("what cli.md and the skill promise a caller (9.2)", () => {
  /** A copy of the demo vault, unnamed (its name would be one more copy of halden on this machine). */
  const demo = () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-promise-"));
    cpSync(join(import.meta.dir, "../../..", "examples", "vault"), dir, { recursive: true });
    writeFileSync(join(dir, ".slipbox", "config.toml"), '[walk]\nexclude = ["scratch/trash/"]\n');
    return dir;
  };
  const run = async (
    args: string[],
    cwd: string,
    o: { isTTY?: boolean; env?: Record<string, string | undefined> } = {},
  ) => {
    let out = "";
    let err = "";
    const code = await runCli(args, {
      out: (s) => (out += s),
      err: (s) => (err += s),
      stdin: async () => "",
      isTTY: o.isTTY ?? false,
      columns: 80,
      cwd,
      env: { ...process.env, NO_COLOR: "1", ...o.env },
    });
    return { code, out, err, json: args.includes("--json") ? JSON.parse(out) : null };
  };

  test("each command's --json data has the fields cli.md's tables name", async () => {
    const dir = demo();
    const data = async (...args: string[]) => {
      const r = await run([...args, "--json"], dir);
      expect([args.join(" "), r.code]).toEqual([args.join(" "), 0]);
      return r.json.data;
    };
    // [what, the object, the fields cli.md names for it]
    const shapes: [string, Record<string, unknown>, string[]][] = [];
    const want = (what: string, o: Record<string, unknown>, fields: string[]) => shapes.push([what, o, fields]);
    const render = await data("render", "home");
    want("render", render, ["path", "width", "lines", "headings"]);
    want("render headings[]", render.headings[0], ["level", "text", "slug", "line"]);
    want("capture", await data("capture", "a thought"), ["scratch", "project", "entry"]);
    want("scratch show", await data("scratch", "show"), ["path", "content", "sha"]);
    want("scratch", await data("scratch"), ["path", "content", "sha"]);
    want("scratch path", await data("scratch", "path"), ["path", "exists"]);
    want("scratch copy", await data("scratch", "copy"), ["path", "chars", "methods", "file", "confirmed"]);
    want("scratch clear", await data("scratch", "clear"), ["path", "cleared", "previousSha"]);
    want("resolve", await data("resolve", "home"), [
      "link",
      "status",
      "path",
      "abs",
      "shown",
      "href",
      "heading",
      "line",
      "candidates",
      "root",
      "name",
      "reason",
      "how",
    ]);
    want("links[]", (await data("links", "home"))[0], [
      "kind",
      "target",
      "heading",
      "text",
      "line",
      "column",
      "end",
      "status",
      "path",
      "shown",
      "how",
      "certainty",
    ]);
    const problems = await data("problems");
    want("problems", problems, ["broken", "ambiguous", "fragile", "orphans"]);
    want("problems broken[]", problems.broken[0], ["from", "line", "column", "end", "kind", "target"]);
    want("tags[]", (await data("tags"))[0], ["tag", "count"]);
    want("tags <tag>", await data("tags", (await data("tags"))[0].tag), ["tag", "notes"]);
    const backlinks = await data("backlinks", "home");
    want("backlinks", backlinks, ["path", "backlinks"]);
    want("backlinks[]", backlinks.backlinks[0], [
      "from",
      "root",
      "name",
      "shown",
      "line",
      "column",
      "end",
      "text",
      "kind",
      "target",
    ]);
    want("ls[]", (await data("ls"))[0], ["path", "title", "size", "mtime", "tags", "links"]);
    want(
      "ls --files, a file",
      (await data("ls", "--files")).find((f: { group?: string }) => f.group),
      ["path", "group", "format", "size", "mtime"],
    );
    const outline = await data("outline", "home");
    want("outline", outline, ["path", "headings"]);
    want("outline headings[]", outline.headings[0], ["depth", "text", "slug", "line"]);
    const context = await data("context", "home");
    want("context", context, ["start", "depth", "backlinks", "limit", "files", "left", "text"]);
    want("context files[]", context.files[0], ["path", "why", "depth", "from", "lines"]);
    const footnotes = await data("footnotes", "partners-and-names");
    want("footnotes", footnotes, ["path", "sha", "footnotes"]);
    want("footnotes[]", footnotes.footnotes[0], ["label", "id", "text", "line", "def", "references"]);
    want("footnotes references[]", footnotes.footnotes[0].references[0], ["line", "column", "start", "end"]);
    want("themes[]", (await data("themes"))[0], ["name", "source", "current"]);
    want("commands[]", (await data("commands"))[0], ["id", "title", "cli", "desc"]);
    const find = await data("find", "dome");
    want("find", find, ["query", "regex", "whole", "count", "matches"]);
    want("find matches[]", find.matches[0], ["path", "line", "column", "match", "text"]);
    want("index", await data("index"), ["path", "rebuilt", "indexed", "removed", "files", "ms"]);
    want("index --refresh", await data("index", "--refresh"), [
      "root",
      "notes",
      "changed",
      "unchanged",
      "gone",
      "reached",
      "indexed",
      "ms",
    ]);
    const search = await data("search", "dome");
    want("search", search, ["query", "engine", "relaxed", "hits"]);
    want("search hits[]", search.hits[0], ["path", "line", "column", "heading", "section", "score", "snippet"]);
    const replace = await data("replace", "home", "Halden", "HALDEN", "--dry-run");
    want("replace", replace, ["path", "count", "dryRun", "sha", "newSha", "changes"]);
    want("replace changes[]", replace.changes[0], ["line", "column", "before", "after", "text", "textAfter"]);
    const tasks = await data("task", "2026-09-14-weekly");
    want("task <note>", tasks, ["path", "sha", "tasks"]);
    want("task <note> tasks[]", tasks.tasks[0], ["line", "checked", "text", "raw"]);
    want("task <note> <line>", await data("task", "2026-09-14-weekly", String(tasks.tasks[0].line)), [
      "path",
      "line",
      "text",
      "checked",
      "changed",
      "sha",
    ]);
    want("read", await data("read", "home"), ["path", "abs", "sha", "bom", "crlf", "invalidUtf8", "content"]);
    want("stat", await data("stat", "home"), [
      "path",
      "abs",
      "root",
      "name",
      "properties",
      "size",
      "mtime",
      "title",
      "tags",
      "headings",
      "links",
      "unresolved",
    ]);
    want("write --create", await data("write", "logs/promised", "# Promised", "--create"), [
      "path",
      "created",
      "shadows",
      "appended",
      "previousSha",
      "sha",
    ]);
    want("write", await data("write", "logs/promised", "more", "--append"), [
      "path",
      "created",
      "appended",
      "previousSha",
      "sha",
    ]);
    want("mkdir", await data("mkdir", "promised-folder"), ["path", "created"]);
    want("history", await data("history"), ["read", "open", "activeTab", "current"]);
    want("link", await data("link", "home"), ["link", "path", "from", "style", "pathForm", "extension"]);
    want("mv --dry-run", await data("mv", "logs/promised.md", "logs/kept.md", "--dry-run"), [
      "kind",
      "from",
      "to",
      "dryRun",
      "move",
      "files",
      "warnings",
      "skipped",
    ]);
    want("cp", await data("cp", "logs/promised.md", "logs/copied.md"), ["from", "to", "dir"]);
    const rm = await data("rm", "logs/copied.md");
    want("rm", rm, ["path", "dryRun", "breaking", "trashed"]);
    want("rm trashed", rm.trashed, ["id", "abs", "shown", "dir", "at"]);
    want("info", await data("info"), ["root", "mode", "name", "key", "folder", "links", "index"]);
    const missing = shapes
      .map(([what, o, fields]) => [what, fields.filter((f) => !Object.hasOwn(o ?? {}, f))])
      .filter(([, gone]) => gone!.length);
    expect(missing).toEqual([]);
  });

  test("--width takes a whole number from 20 to 1000, written in digits", async () => {
    const dir = demo();
    expect((await run(["render", "home", "--width", "20"], dir)).code).toBe(0);
    expect((await run(["render", "home", "--width", "1000"], dir)).code).toBe(0);
    for (const bad of ["19", "1001", "1e2", "+30", "40.5"]) {
      const r = await run(["render", "home", "--width", bad], dir);
      expect([bad, r.code, r.err]).toEqual([bad, 2, "slipbox: --width must be a whole number from 20 to 1000\n"]);
    }
  });

  test("render colours only a terminal without NO_COLOR; --plain, --color never and a pipe print no escapes", async () => {
    const dir = demo();
    const term = { NO_COLOR: undefined, TERM: "xterm-256color", COLORTERM: "truecolor" };
    expect((await run(["render", "home"], dir, { isTTY: true, env: term })).out).toContain("\x1b[");
    for (const [args, o] of [
      [["render", "home"], { isTTY: true, env: { ...term, NO_COLOR: "1" } }],
      [["render", "home", "--plain"], { isTTY: true, env: term }],
      [["render", "home", "--color", "never"], { isTTY: true, env: term }],
      [["render", "home"], { isTTY: false, env: term }],
    ] as const) {
      const r = await run([...args], dir, o);
      expect([args.join(" "), o.env.NO_COLOR ?? "", o.isTTY, r.code, r.out.includes("\x1b")]).toEqual([
        args.join(" "),
        o.env.NO_COLOR ?? "",
        o.isTTY,
        0,
        false,
      ]);
    }
  });

  test("a name several notes share: exit 4 and data.candidates, whichever command names the note", async () => {
    const dir = demo();
    for (const args of [
      ["read", "contacts"],
      ["stat", "contacts"],
      ["write", "contacts", "x"],
      ["links", "contacts"],
      ["outline", "contacts"],
    ]) {
      const r = await run([...args, "--json"], dir);
      expect([args[0], r.code, r.json.data?.candidates]).toEqual([
        args[0],
        4,
        ["equipment/contacts.md", "people/contacts.md"],
      ]);
    }
    expect(readFileSync(join(dir, "people", "contacts.md"), "utf8")).not.toBe("x\n");
  });

  test("search gives 20 hits unless --limit says (up to 500); context's --limit is 1–500", async () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-limit-"));
    mkdirSync(join(dir, ".slipbox"));
    for (let i = 0; i < 30; i++) writeFileSync(join(dir, `n${i}.md`), `# N${i}\n\ncomet ${i}\n`);
    expect((await run(["search", "comet", "--json"], dir)).json.data.hits).toHaveLength(20);
    expect((await run(["search", "comet", "--limit", "25", "--json"], dir)).json.data.hits).toHaveLength(25);
    expect((await run(["search", "comet", "--limit", "500", "--json"], dir)).json.data.hits).toHaveLength(30);
    expect((await run(["search", "comet", "--limit", "501"], dir)).code).toBe(2);
    expect((await run(["context", "n1", "--limit", "500"], dir)).code).toBe(0);
    for (const bad of ["0", "501"])
      expect([bad, (await run(["context", "n1", "--limit", bad], dir)).code]).toEqual([bad, 2]);
  });

  test('[search] engine = "index" builds the index before the first search; never a scan', async () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-engine-"));
    mkdirSync(join(dir, ".slipbox"));
    writeFileSync(join(dir, ".slipbox", "config.toml"), '[search]\nengine = "index"\n');
    writeFileSync(join(dir, "a.md"), "# A\n\nthe comet's tail\n");
    const r = await run(["search", "comet", "--json"], dir);
    expect(r.json.data).toMatchObject({ engine: "index", hits: [{ path: "a.md", line: 3 }] });
    expect(r.json.warnings).toEqual([]);
    expect((await run(["info", "--json"], dir)).json.data.search).toEqual({
      engine: "index",
      index: { files: 1, complete: true },
    });
  });

  test("[context] sets the bundle's defaults; the flags win over it", async () => {
    const dir = demo();
    writeFileSync(join(dir, ".slipbox", "config.toml"), "[context]\ndepth = 0\nbacklinks = false\nlimit = 2\n");
    const paths = async (...flags: string[]) =>
      (await run(["context", "people/kenji-mori.md", ...flags, "--json"], dir)).json.data;
    const byConfig = await paths();
    expect(byConfig).toMatchObject({ depth: 0, backlinks: false, limit: 2 });
    expect(byConfig.files.map((f: { why: string }) => f.why)).toEqual(["start"]);
    const byFlags = await paths("--depth", "1", "--limit", "3");
    expect(byFlags).toMatchObject({ depth: 1, backlinks: false, limit: 3 });
    expect(byFlags.files.map((f: { why: string }) => f.why)).toEqual(["start", "link", "link"]);
    expect(byFlags.left.length).toBeGreaterThan(0); // past the limit: named, not included
  });

  test("scratch path says whether it exists yet; scratch copy says how it copied, and how much", async () => {
    const dir = demo();
    const before = (await run(["scratch", "path", "--json"], dir)).json.data;
    expect(before.exists).toBe(false);
    expect(existsSync(before.path)).toBe(false);
    expect((await run(["scratch", "copy"], dir)).code).toBe(3); // nothing to copy
    await run(["capture", "the dew heater"], dir);
    expect((await run(["scratch", "path", "--json"], dir)).json.data).toEqual({ path: before.path, exists: true });
    const content = readFileSync(before.path, "utf8");
    const copy = (await run(["scratch", "copy", "--json"], dir)).json.data;
    expect(copy).toMatchObject({ path: before.path, chars: content.length, methods: ["file"], confirmed: false });
    expect(readFileSync(copy.file, "utf8")).toBe(content);
    expect((await run(["scratch", "copy"], dir)).out).toBe(`wrote ${copy.file} (${content.length} chars)\n`);
  });

  test("--root names a root: a folder that isn't there, or holds no root marker, is exit 3 with how to make one", async () => {
    const dir = demo();
    const missing = await run(["ls", "--root", join(dir, "no-such-folder"), "--json"], dir);
    expect(missing.json).toMatchObject({ ok: false, error: { code: 3 } });
    expect(missing.code).toBe(3);
    const plain = mkdtempSync(join(tmpdir(), "slipbox-plain-root-"));
    const notRoot = await run(["ls", "--root", plain], dir);
    expect(notRoot.code).toBe(3);
    expect(notRoot.err).toContain(
      `isn't a vault (none of .git, .slipbox, .obsidian, .zk in it): slipbox init ${plain} makes it one`,
    );
    expect((await run(["ls", "--root", join(dir, "people")], dir)).code).toBe(3); // a folder of a root isn't one
    expect((await run(["ls", "--root", dir], join(dir, "people"))).code).toBe(0);
  });

  test("the scratch's project is the root, from any folder in it; else the folder you're in — whose scratch stays in its state", async () => {
    const dir = demo();
    const fromSub = (await run(["capture", "--ref", "kenji-mori.md:3", "--json"], join(dir, "people"))).json.data;
    expect(fromSub).toMatchObject({ project: dir, entry: "**At:** `people/kenji-mori.md:3`" });
    expect((await run(["capture", "a thought", "--json"], dir)).json.data.scratch).toBe(fromSub.scratch); // one scratch per project
    const plain = mkdtempSync(join(tmpdir(), "slipbox-plain-scratch-"));
    writeFileSync(join(plain, "loose.md"), "# Loose\n");
    const cfg = join(plain, "..", `${basename(plain)}.toml`);
    writeFileSync(cfg, '[capture]\nlocation = "vault"\n');
    const loose = (await run(["capture", "--ref", "loose.md:1", "--json", "--config", cfg], plain)).json.data;
    expect(loose).toMatchObject({ project: plain, entry: "**At:** `loose.md:1`" });
    expect(loose.scratch.startsWith(plain)).toBe(false); // nothing written into a plain folder
    expect(existsSync(join(plain, "scratch.md"))).toBe(false);
    // A vault takes location = "vault": its scratch is in it.
    expect((await run(["capture", "x", "--json", "--config", cfg], dir)).json.data.scratch).toBe(
      join(dir, "scratch.md"),
    );
  });

  test("an unexpected error is exit 1 and one line; SLIPBOX_DEBUG adds its stack trace (manual/configuration.md, Environment)", async () => {
    const dir = demo();
    const failing = async (env: Record<string, string>) => {
      let err = "";
      const code = await runCli(["write", "home", "--stdin"], {
        out: () => {},
        err: (s) => (err += s),
        stdin: async () => Promise.reject(new Error("the pipe broke")),
        isTTY: false,
        columns: 80,
        cwd: dir,
        env: { ...process.env, ...env },
      });
      return { code, err };
    };
    const { SLIPBOX_DEBUG: _, ...quiet } = process.env as Record<string, string>;
    expect(await failing(quiet)).toEqual({ code: 1, err: "slipbox: the pipe broke\n" });
    const debug = await failing({ SLIPBOX_DEBUG: "1" });
    expect(debug.code).toBe(1);
    expect(debug.err).toStartWith("slipbox: the pipe broke\nError: the pipe broke\n    at ");
    // A refusal is no surprise: never a stack trace.
    expect((await run(["read", "no-such-note"], dir, { env: { SLIPBOX_DEBUG: "1" } })).err).toBe(
      `slipbox: no note or file "no-such-note" in ${dir}\n`,
    );
  });
});

describe("review round 2 (CLI)", () => {
  test("shared flags are checked for every command", async () => {
    expect((await cli(["ls", "--color", "bogus"])).code).toBe(2);
    expect((await cli(["render", "notes/alpha.md", "--width", "0x20"])).code).toBe(2);
  });
});

describe("review round 3 (CLI)", () => {
  test("a bad --color is a usage error before anything else can fail", async () => {
    expect((await cli(["ls", "--root", "/nonexistent-dir", "--color", "bad"])).code).toBe(2);
  });
});
