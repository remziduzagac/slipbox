// The CLI as an agent meets it: the real `slipbox` process, run against a copy of the demo vault
// (examples/vault), with its exit codes, its human output and its --json envelope. Every CLI
// command is run here; the last test fails if one isn't. (tests/vault.test.ts drives runCli in
// process for the finer cases.)

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLI_COMMANDS } from "../src/cli/cli.ts";

const MAIN = join(import.meta.dir, "..", "src", "main.ts");
const DEMO = join(import.meta.dir, "..", "examples", "vault");
const sandbox = mkdtempSync(join(tmpdir(), "slipbox-cli-"));
const vault = join(sandbox, "vault");
const env = {
  ...process.env,
  XDG_STATE_HOME: join(sandbox, "state"),
  XDG_CACHE_HOME: join(sandbox, "cache"),
  XDG_CONFIG_HOME: join(sandbox, "config"),
  NO_COLOR: "1",
};
const ran = new Set<string>();

beforeAll(() => {
  cpSync(DEMO, vault, { recursive: true });
  mkdirSync(join(sandbox, "config", "slipbox"), { recursive: true });
  // `send` runs this instead of reaching a real editor.
  writeFileSync(join(sandbox, "config", "slipbox", "config.toml"), '[editor]\nremote = ["true {file} {line}"]\n');
});
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

interface Run {
  code: number;
  out: string;
  err: string;
  /** The --json envelope, when asked for. */
  json: { schema: number; ok: boolean; command: string; data: any; error?: { code: number; message: string }; warnings: string[]; stale: string[] };
}

function slipbox(args: string[], opts: { stdin?: string; cwd?: string } = {}): Run {
  const word = args.find((a) => !a.startsWith("-"));
  if (word && CLI_COMMANDS.has(word)) ran.add(word);
  const r = Bun.spawnSync(["bun", MAIN, ...args], { cwd: opts.cwd ?? vault, env, stdin: opts.stdin === undefined ? "ignore" : Buffer.from(opts.stdin) });
  const out = r.stdout.toString();
  let json = null;
  if (args.includes("--json")) json = JSON.parse(out);
  return { code: r.exitCode ?? -1, out, err: r.stderr.toString(), json: json as Run["json"] };
}

const note = (rel: string) => readFileSync(join(vault, rel), "utf8");

describe("reading", () => {
  test("ls lists every note; --json has titles and link counts", () => {
    const r = slipbox(["ls"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("handbook/operations-handbook.md");
    const j = slipbox(["ls", "--json"]).json;
    expect(j).toMatchObject({ schema: 1, ok: true, command: "ls" });
    const home = j.data.find((n: { path: string }) => n.path === "home.md");
    expect(home.title).toBe("Halden Ridge Observatory");
    expect(home.links).toBeGreaterThan(5);
  });
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
  test("outline lists headings with their lines", () => {
    const r = slipbox(["outline", "operations-handbook", "--json"]);
    expect(r.json.data.headings.some((h: { text: string }) => h.text === "O25: Documentation categories")).toBe(true);
    expect(slipbox(["outline", "operations-handbook"]).out).toMatch(/^\s+\d+\s+# Halden Ridge/m);
  });
  test("read gives the raw text and its sha", () => {
    const r = slipbox(["read", "kenji-mori", "--json"]);
    expect(r.json.data.content).toBe(note("people/kenji-mori.md"));
    expect(r.json.data.sha).toMatch(/^[0-9a-f]{16}$/);
    expect(slipbox(["read", "kenji-mori"]).out).toBe(note("people/kenji-mori.md"));
  });
});

describe("links", () => {
  test("resolve follows names, headings, blocks; unresolved and external links", () => {
    expect(slipbox(["resolve", "writing-guide"]).out.trim()).toEndWith("handbook/writing-guide.md");
    const h = slipbox(["resolve", "[[operations-handbook#O25: Documentation categories]]", "--json"]).json;
    expect(h.data).toMatchObject({ status: "resolved", path: "handbook/operations-handbook.md" });
    expect(h.data.line).toBeGreaterThan(1);
    expect(slipbox(["resolve", "visiting-rota", "--from", "partners-and-names"]).code).toBe(3);
    expect(slipbox(["resolve", "https://example.org/x", "--json"]).json.data.status).toBe("external");
  });
  test("links and backlinks, with their status", () => {
    const l = slipbox(["links", "partners-and-names", "--json"]).json.data;
    expect(l.some((x: { target: string; status: string }) => x.target === "visiting-rota" && x.status === "unresolved")).toBe(true);
    expect(slipbox(["links", "partners-and-names"]).out).toContain("UNRESOLVED");
    const b = slipbox(["backlinks", "kenji-mori", "--json"]).json.data;
    expect(b.backlinks.map((x: { from: string }) => x.from)).toContain("home.md");
  });
});

describe("find and replace", () => {
  test("find: the vault or one note; plain by default; regex, whole words, smart case", () => {
    const all = slipbox(["find", "Aster", "--json"]).json.data;
    expect(all.count).toBeGreaterThan(10);
    expect(new Set(all.matches.map((m: { path: string }) => m.path)).size).toBeGreaterThan(3);
    const one = slipbox(["find", "O2[0-9]:", "operations-handbook", "--regex", "--json"]).json.data;
    expect(one.matches.every((m: { path: string; match: string }) => m.path === "handbook/operations-handbook.md" && /^O2\d:$/.test(m.match))).toBe(true);
    expect(slipbox(["find", "a.b", "--json"]).json.data.matches.every((m: { match: string }) => m.match === "a.b")).toBe(true); // a literal dot
    expect(slipbox(["find", "ASTER", "--json"]).json.data.count).toBe(0); // a capital: case-sensitive
    expect(slipbox(["find", "ASTER", "--ignore-case", "--json"]).json.data.count).toBeGreaterThan(all.count); // "master" too
    expect(slipbox(["find", "Aster"]).out).toMatch(/^[\w/.-]+\.md:\d+:\d+: /m);
    expect(slipbox(["find", "(", "--regex"]).code).toBe(2);
  });
  test("replace: dry run, all, first, a line range, groups; --if-unchanged refuses a stale sha", () => {
    const before = note("people/kenji-mori.md");
    const dry = slipbox(["replace", "kenji-mori", "Aster", "ASTER", "--dry-run", "--json"]).json.data;
    expect(dry.count).toBe(1);
    expect(note("people/kenji-mori.md")).toBe(before);
    const stale = slipbox(["replace", "kenji-mori", "Aster", "ASTER", "--if-unchanged", "0000000000000000"]);
    expect(stale.code).toBe(5);
    const done = slipbox(["replace", "kenji-mori", "Aster", "ASTER", "--if-unchanged", dry.sha, "--json"]).json.data;
    expect(done.count).toBe(1);
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

describe("writing", () => {
  test("task: lists the note's tasks, toggles one, --check and --uncheck set it", () => {
    const list = slipbox(["task", "2026-09-14-weekly", "--json"]).json.data.tasks;
    const open = list.find((t: { checked: boolean }) => !t.checked);
    expect(open).toBeDefined();
    const r = slipbox(["task", "2026-09-14-weekly", String(open.line), "--json"]).json.data;
    expect(r).toMatchObject({ checked: true, changed: true });
    expect(note("meetings/2026-09-14-weekly.md").split("\n")[open.line - 1]).toContain("[x]");
    expect(slipbox(["task", "2026-09-14-weekly", String(open.line), "--check", "--json"]).json.data.changed).toBe(false);
    slipbox(["task", "2026-09-14-weekly", String(open.line), "--uncheck"]);
    expect(note("meetings/2026-09-14-weekly.md").split("\n")[open.line - 1]).toContain("[ ]");
    expect(slipbox(["task", "2026-09-14-weekly", "1"]).code).toBe(3); // no task there
    expect(slipbox(["task", "home", "--json"]).json.data.tasks).toEqual([]);
  });
  test("write: replace, append, create; never outside the vault; stdin", () => {
    const w = slipbox(["write", "scratch/wrap-probe", "# Probe\n\nrewritten", "--json"]).json.data;
    expect(w.created).toBe(false);
    expect(note("scratch/wrap-probe.md")).toBe("# Probe\n\nrewritten\n");
    slipbox(["write", "wrap-probe", "more", "--append"]);
    expect(note("scratch/wrap-probe.md")).toBe("# Probe\n\nrewritten\nmore\n");
    const c = slipbox(["write", "logs/2026-10-01", "# 1 October", "--create", "--json"]).json.data;
    expect(c).toMatchObject({ created: true, path: "logs/2026-10-01.md" });
    expect(existsSync(join(vault, "logs", "2026-10-01.md"))).toBe(true);
    expect(slipbox(["write", "no-such-note", "x"]).code).toBe(3); // without --create
    expect(slipbox(["write", "../escape", "x", "--create"]).code).toBe(5);
    slipbox(["write", "2026-10-01", "--stdin"], { stdin: "from stdin\n" });
    expect(note("logs/2026-10-01.md")).toBe("from stdin\n");
    const sha = slipbox(["read", "2026-10-01", "--json"]).json.data.sha;
    expect(slipbox(["write", "2026-10-01", "y", "--if-unchanged", "ffffffffffffffff"]).code).toBe(5);
    expect(slipbox(["write", "2026-10-01", "y", "--if-unchanged", sha]).code).toBe(0);
  });
  test("a CRLF note with a BOM keeps both through replace and write", () => {
    writeFileSync(join(vault, "crlf-note.md"), "﻿# CRLF\r\n\r\nfirst line\r\n");
    slipbox(["replace", "crlf-note", "first", "second"]);
    slipbox(["write", "crlf-note", "third line", "--append"]);
    expect(readFileSync(join(vault, "crlf-note.md"), "utf8")).toBe("﻿# CRLF\r\n\r\nsecond line\r\nthird line\r\n");
  });
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

describe("editors and state", () => {
  test("send runs the configured remote editor with the note and line", () => {
    const r = slipbox(["send", "operations-handbook", "--line", "42", "--json"]).json.data;
    expect(r.commands[0]).toEqual(["true", join(vault, "handbook", "operations-handbook.md"), "42"]);
    expect(slipbox(["send", "home", "--line", "0"]).code).toBe(2);
  });
  test("history lists what the TUI read, newest first", () => {
    mkdirSync(join(sandbox, "state"), { recursive: true });
    const r = slipbox(["info", "--json"]).json.data;
    writeFileSync(
      join(r.state, "positions.json"),
      JSON.stringify({
        "home.md": { heading: null, headingIndex: 0, offset: 0, line: 1, at: "2026-09-01T10:00:00.000Z" },
        "people/kenji-mori.md": { heading: null, headingIndex: 0, offset: 0, line: 3, at: "2026-09-02T10:00:00.000Z" },
      }),
    );
    const h = slipbox(["history", "--json"]).json.data;
    expect(h.read.map((x: { path: string }) => x.path)).toEqual(["people/kenji-mori.md", "home.md"]);
    expect(slipbox(["history"]).out).toContain("people/kenji-mori.md:3");
  });
});

describe("the vault and the tool", () => {
  test("info, themes, commands, init, help, version", () => {
    const i = slipbox(["info", "--json"]).json.data;
    expect(i.root).toBe(vault);
    expect(i.notes).toBeGreaterThan(10);
    expect(slipbox(["themes"]).out).toContain("tokyo-night");
    const c = slipbox(["commands", "--json"]).json.data;
    expect(c.find((x: { id: string }) => x.id === "task.toggle").cli).toStartWith("slipbox task");
    const fresh = join(sandbox, "fresh");
    mkdirSync(fresh);
    expect(slipbox(["init", fresh, "--json"]).json.data.created).toBe(true);
    expect(existsSync(join(fresh, ".slipbox"))).toBe(true);
    expect(slipbox(["help"]).out).toContain("slipbox find <query>");
    expect(slipbox(["--version"]).out).toMatch(/^slipbox \d+\.\d+\.\d+/);
  });
  test("errors: usage 2, not found 3, --json always one object", () => {
    const bad = slipbox(["frobnicate", "--json"]);
    expect(bad.code).toBe(2);
    expect(bad.json).toMatchObject({ ok: false, command: "frobnicate", error: { code: 2 } });
    expect(slipbox(["ls", "--bogus"]).code).toBe(2);
    const missing = slipbox(["render", "nothing-here", "--json"]);
    expect(missing.code).toBe(3);
    expect(missing.json.ok).toBe(false);
  });
  test("every CLI command is run by this file", () => {
    const missing = [...CLI_COMMANDS].filter((c) => !ran.has(c));
    expect(missing).toEqual([]);
  });
});
