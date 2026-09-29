// The CLI as an agent meets it: the real `slipbox` process, run against a copy of the demo vault
// (examples/vault), with its exit codes, its human output and its --json envelope. Every CLI
// command is run here; the last test fails if one isn't. (tests/vault.test.ts drives runCli in
// process for the finer cases.)

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLI_COMMANDS } from "../src/cli/cli.ts";

// Harnesses copy and index a vault, CLI tests start processes: slow on a loaded machine, not stuck.
setDefaultTimeout(30_000);
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
  SLIPBOX_CLIPBOARD: "file", // never the developer's clipboard
  // The sandbox's own config: an exported SLIPBOX_CONFIG would win over XDG_CONFIG_HOME and could
  // name the developer's real editor (send runs it).
  SLIPBOX_CONFIG: join(sandbox, "config", "slipbox", "config.toml"),
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
  // A timeout, so a hang (a read that never ends) fails the test instead of the run.
  const r = Bun.spawnSync(["bun", MAIN, ...args], { cwd: opts.cwd ?? vault, env, stdin: opts.stdin === undefined ? "ignore" : Buffer.from(opts.stdin), timeout: 20_000 });
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
    // --whole: "aster" in "master" no longer counts.
    const whole = slipbox(["find", "aster", "--whole", "--ignore-case", "--json"]).json.data;
    const any = slipbox(["find", "aster", "--ignore-case", "--json"]).json.data;
    expect(whole.count).toBeGreaterThan(0);
    expect(whole.count).toBeLessThan(any.count);
    expect(whole.matches.every((m: { text: string; match: string }) => new RegExp(`(^|[^\\p{L}\\p{N}_])${m.match}([^\\p{L}\\p{N}_]|$)`, "iu").test(m.text))).toBe(true);
  });
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
  test("review cycle 1: writes never escape or clobber; empty --if-unchanged; refusals are 5", () => {
    const outside = mkdtempSync(join(tmpdir(), "slipbox-cli-out-"));
    symlinkSync(outside, join(vault, "out"));
    expect(slipbox(["write", "out/escaped", "x", "--create"]).code).toBe(5);
    expect(existsSync(join(outside, "escaped.md"))).toBe(false);
    // --create is a path, and never overwrites: not kenji-mori found by name, nor a file already there.
    const kenji = note("people/kenji-mori.md");
    expect(slipbox(["write", "people/kenji-mori", "NEW", "--create"]).code).toBe(5);
    expect(note("people/kenji-mori.md")).toBe(kenji);
    expect(slipbox(["write", "kenji-mori.md", "NEW", "--create", "--json"]).json.data.path).toBe("kenji-mori.md"); // a new note at the root
    expect(note("people/kenji-mori.md")).toBe(kenji);
    expect(slipbox(["write", "home", "x", "--if-unchanged", ""]).code).toBe(2);
    expect(slipbox(["scratch", "clear", "--if-unchanged="]).code).toBe(2);
    writeFileSync(join(outside, "ext.md"), "- [ ] outside\n");
    symlinkSync(join(outside, "ext.md"), join(vault, "ext.md"));
    expect(slipbox(["task", "ext.md", "1", "--json"]).json.error?.code).toBe(5);
    expect(readFileSync(join(outside, "ext.md"), "utf8")).toBe("- [ ] outside\n");
  });
  test("review cycle 1: line anchors, :s without g, CRLF ends; a vault's config can't pick the editor", () => {
    writeFileSync(join(vault, "anchors.md"), "one a a\r\ntwo a\r\n");
    expect(slipbox(["find", "^two", "anchors", "--regex", "--json"]).json.data.count).toBe(1);
    slipbox(["replace", "anchors", "^", "> ", "--regex"]);
    slipbox(["replace", "anchors", "a$", "A", "--regex"]);
    slipbox(["replace", "anchors", "a", "X", "--first-per-line"]);
    expect(readFileSync(join(vault, "anchors.md"), "utf8")).toBe("> one X A\r\n> two X\r\n"); // smart case: a is A too
    mkdirSync(join(vault, ".slipbox"), { recursive: true });
    writeFileSync(join(vault, ".slipbox", "config.toml"), '[editor]\nremote = ["touch /tmp/slipbox-evil-{line}"]\n');
    const r = slipbox(["send", "home", "--json"]);
    expect(r.json.data.commands[0][0]).toBe("true"); // the user's config, not the vault's
    expect(r.json.warnings.some((w: string) => w.includes("only your own config"))).toBe(true);
    rmSync(join(vault, ".slipbox", "config.toml"));
  });
  test("review cycle 1: diagnostics carry no escapes; history lists open tabs; a note outside the walk reads", () => {
    mkdirSync(join(vault, ".slipbox"), { recursive: true });
    writeFileSync(join(vault, ".slipbox", "config.toml"), '[render]\nglyphs = "\\u001b]0;PWNED\\u0007"\n');
    const r = slipbox(["ls"]);
    expect(r.err).not.toContain("\u001b");
    rmSync(join(vault, ".slipbox", "config.toml"));
    const state = slipbox(["info", "--json"]).json.data.state;
    writeFileSync(join(state, "session.json"), JSON.stringify({ version: 1, tabs: [{ panes: [{ path: "home.md", anchor: { heading: null, headingIndex: 0, offset: 0, line: 1 } }], active: 0 }], activeTab: 0, sidebar: true }));
    expect(slipbox(["history", "--json"]).json.data.open).toEqual([["home.md"]]);
    mkdirSync(join(vault, ".hidden"), { recursive: true });
    writeFileSync(join(vault, ".hidden", "note.md"), "hidden text\n");
    expect(slipbox(["read", ".hidden/note.md"]).out).toBe("hidden text\n");
    expect(slipbox(["find", "hidden", ".hidden/note.md", "--json"]).json.data.count).toBe(1);
  });
  test("review cycle 2: writers change only notes in the vault; find survives a bad note; argument checks", () => {
    const outsideDir = mkdtempSync(join(tmpdir(), "slipbox-cli-out2-"));
    writeFileSync(join(outsideDir, "outside.md"), "keep\n");
    // An existing path outside the vault is single-file mode there: never written.
    expect(slipbox(["write", join(outsideDir, "outside.md"), "clobbered"]).code).toBe(5);
    expect(slipbox(["replace", join(outsideDir, "outside.md"), "keep", "X"]).code).toBe(5);
    expect(readFileSync(join(outsideDir, "outside.md"), "utf8")).toBe("keep\n");
    // Files that aren't notes, or where the vault lists none.
    mkdirSync(join(vault, ".slipbox"), { recursive: true });
    writeFileSync(join(vault, ".slipbox", "config.toml"), "# vault config\n");
    expect(slipbox(["write", ".slipbox/config.toml", "x"]).code).toBe(5);
    expect(readFileSync(join(vault, ".slipbox", "config.toml"), "utf8")).toBe("# vault config\n");
    for (const bad of [".slipbox/evil", ".git/hooks/x", "node_modules/x", "odd/"]) expect(slipbox(["write", bad, "x", "--create"]).code).toBe(5);
    // A dry run previews a note that couldn't be written; a bad --lines is a usage error.
    expect(slipbox(["replace", "home", "Halden", "H", "--lines", "999"]).code).toBe(2);
    expect(slipbox(["replace", "home", "", "H"]).code).toBe(2);
    // find: an unreadable note is a warning, the others are still searched; a long line is clipped.
    writeFileSync(join(vault, "locked.md"), "Aster\n");
    chmodSync(join(vault, "locked.md"), 0o000);
    const found = slipbox(["find", "Aster", "--json"]).json;
    chmodSync(join(vault, "locked.md"), 0o644);
    expect(found.ok).toBe(true);
    expect(found.data.count).toBeGreaterThan(5);
    writeFileSync(join(vault, "long-line.md"), `${"QUFB".repeat(5000)}\n`);
    const long = slipbox(["find", "QUFB", "long-line", "--json"]).json.data;
    expect(long.count).toBe(5000);
    expect(long.matches.every((m: { text: string }) => m.text.length <= 170)).toBe(true);
    // Arguments: too many is a usage error; an empty flag value too; -- names a dash note.
    expect(slipbox(["read", "home", "extra"]).code).toBe(2);
    expect(slipbox(["ls", "--root", ""]).code).toBe(2);
    writeFileSync(join(vault, "-dash.md"), "dash\n");
    expect(slipbox(["read", "--", "-dash.md"]).out).toBe("dash\n");
  });
  test("review cycle 2: a symlink out of the vault is never read by path", () => {
    const outside = mkdtempSync(join(tmpdir(), "slipbox-cli-read-"));
    writeFileSync(join(outside, "secret.md"), "SECRET\n");
    symlinkSync(join(outside, "secret.md"), join(vault, "evil.md"));
    const r = slipbox(["read", "evil.md"]);
    expect(r.code).toBe(5);
    expect(r.out).not.toContain("SECRET");
    expect(slipbox(["find", "SECRET", "evil.md"]).out).not.toContain("SECRET");
    rmSync(join(vault, "evil.md"));
  });
  test("review cycle 2: a malformed stale file is ignored; a live one is reported, a dead one pruned", () => {
    const state = slipbox(["info", "--json"]).json.data.state;
    mkdirSync(join(state, "dirty"), { recursive: true });
    writeFileSync(join(state, "dirty", "bad.json"), JSON.stringify({ pid: process.pid }));
    expect(slipbox(["ls"]).code).toBe(0);
    writeFileSync(join(state, "dirty", `${process.pid}.json`), JSON.stringify({ pid: process.pid, paths: ["home.md"] }));
    const r = slipbox(["ls", "--json"]);
    expect(r.json.stale).toEqual(["home.md"]);
    expect(slipbox(["ls"]).err).toContain("unsaved changes in a running slipbox: home.md");
    writeFileSync(join(state, "dirty", "999999.json"), JSON.stringify({ pid: 999999, paths: ["dead.md"] }));
    expect(slipbox(["ls", "--json"]).json.stale).toEqual(["home.md"]);
    expect(existsSync(join(state, "dirty", "999999.json"))).toBe(false);
    rmSync(join(state, "dirty"), { recursive: true, force: true });
  });
  test("review cycle 3: an empty write never empties a note; append a block; previews show lines", () => {
    const before = note("people/kenji-mori.md");
    const empty = slipbox(["write", "kenji-mori", "--stdin"], { stdin: "" });
    expect(empty.code).toBe(2);
    expect(note("people/kenji-mori.md")).toBe(before);
    writeFileSync(join(vault, "table-end.md"), "| a | b |\n| - | - |\n| 1 | 2 |\n");
    slipbox(["write", "table-end", "A new paragraph.", "--append", "--paragraph"]);
    expect(readFileSync(join(vault, "table-end.md"), "utf8")).toBe("| a | b |\n| - | - |\n| 1 | 2 |\n\nA new paragraph.\n");
    writeFileSync(join(vault, "partial.md"), "Asterion and Aster\n");
    const changes = slipbox(["replace", "partial", "Aster", "Vega", "--dry-run", "--json"]).json.data.changes;
    expect(changes[0]).toMatchObject({ line: 1, column: 1, text: "Asterion and Aster", textAfter: "Vegaion and Aster" });
    expect(changes[1]).toMatchObject({ column: 14, textAfter: "Asterion and Vega" });
    const tasks = slipbox(["task", "2026-09-14-weekly", "--json"]).json.data;
    expect(tasks.sha).toMatch(/^[0-9a-f]{16}$/);
    expect(tasks.tasks.some((t: { raw: string }) => t.raw.includes("[["))).toBe(true);
    expect(slipbox(["write", "brand-new-name", "x"]).err).toContain("--create makes a new note");
    // --create is vault-relative from anywhere in it, unless it says ./ or ../
    slipbox(["write", "meetings/from-root", "x", "--create"], { cwd: join(vault, "meetings") });
    expect(existsSync(join(vault, "meetings", "from-root.md"))).toBe(true);
    slipbox(["write", "./here", "x", "--create"], { cwd: join(vault, "meetings") });
    expect(existsSync(join(vault, "meetings", "here.md"))).toBe(true);
  });
  test("review cycle 4: CRLF paragraphs; the vault's extensions; the sha is of the written bytes", () => {
    writeFileSync(join(vault, "crlf-append.md"), "a\r\nb\r\n");
    const w = slipbox(["write", "crlf-append", "c", "--append", "--paragraph", "--json"]).json.data;
    const bytes = readFileSync(join(vault, "crlf-append.md"));
    expect(bytes.toString()).toBe("a\r\nb\r\n\r\nc\r\n");
    expect(w.sha).toBe(new Bun.CryptoHasher("sha256").update(bytes).digest("hex").slice(0, 16));
    const txt = join(sandbox, "txt-vault");
    mkdirSync(join(txt, ".slipbox"), { recursive: true });
    writeFileSync(join(txt, ".slipbox", "config.toml"), 'walk.extensions = ["md", "txt"]\n');
    writeFileSync(join(txt, "plain.txt"), "one\n");
    expect(slipbox(["--root", txt, "write", "plain.txt", "two", "--append"]).code).toBe(0);
    expect(readFileSync(join(txt, "plain.txt"), "utf8")).toBe("one\ntwo\n");
  });
  test("review cycle 4: a hostile vault — device symlinks and FIFOs never hang; JSON and new names stay clean", () => {
    const h = join(sandbox, "hostile");
    mkdirSync(join(h, ".slipbox"), { recursive: true });
    mkdirSync(join(h, "sub"));
    writeFileSync(join(h, "index.md"), "# a\n");
    symlinkSync("/dev/zero", join(h, ".slipbox", "config.toml"));
    symlinkSync("/dev/zero", join(h, ".slipbox", "version"));
    symlinkSync("/dev/zero", join(h, "sub", ".gitignore"));
    Bun.spawnSync(["mkfifo", join(h, "pipe")]);
    symlinkSync("pipe", join(h, "flink.md"));
    for (const args of [["ls"], ["info"], ["find", "a"], ["read", "flink.md"], ["backlinks", "index"]]) {
      const r = slipbox(["--root", h, ...args]);
      expect(r.code).not.toBe(-1); // -1: killed by the timeout
      expect(r.code).not.toBeNull();
    }
    expect(slipbox(["--root", h, "info"]).err).toContain("not a regular file");
    // C1 controls and bidi overrides are escaped in --json; the value is unchanged.
    const odd = "n\u009b31m\u202egnp.md";
    writeFileSync(join(h, odd), "# odd\n");
    const ls = slipbox(["--root", h, "ls", "--json"]);
    expect(ls.out).not.toMatch(/[\u0080-\u009f\u202a-\u202e]/);
    expect(ls.json.data.map((n: { path: string }) => n.path)).toContain(odd);
    expect(slipbox(["--root", h, "write", "sub\u202e/x", "hi", "--create"]).code).toBe(5);
    expect(existsSync(join(h, "sub\u202e"))).toBe(false);
  });
  test("review cycle 5: blank text never empties a note; --from picks among notes sharing a name", () => {
    const before = note("people/kenji-mori.md");
    expect(slipbox(["write", "kenji-mori", ""]).code).toBe(2);
    expect(slipbox(["write", "kenji-mori", "--stdin"], { stdin: " \n\n" }).code).toBe(2);
    expect(slipbox(["write", "kenji-mori", "", "--append"]).code).toBe(2);
    expect(note("people/kenji-mori.md")).toBe(before);
    expect(slipbox(["read", "contacts", "--json"]).code).toBe(4);
    expect(slipbox(["read", "contacts", "--from", "people/kenji-mori.md", "--json"]).json.data.path).toBe("people/contacts.md");
    expect(slipbox(["read", "contacts", "--from", "equipment/instrument-inventory.md", "--json"]).json.data.path).toBe("equipment/contacts.md");
  });
  test("review cycle 5: flags a command doesn't take are refused; dashes after --; strict stdin", () => {
    const before = note("people/kenji-mori.md");
    expect(slipbox(["write", "people/kenji-mori.md", "# gone", "--dry-run"]).code).toBe(2);
    expect(note("people/kenji-mori.md")).toBe(before);
    const weekly = note("meetings/2026-09-14-weekly.md");
    expect(slipbox(["task", "2026-09-14-weekly", "17", "--dry-run"]).code).toBe(2);
    expect(note("meetings/2026-09-14-weekly.md")).toBe(weekly);
    expect(slipbox(["capture", "x", "--if-unchanged", "abc"]).code).toBe(2);
    const dash = slipbox(["write", "people/kenji-mori.md", "- item", "--append"]);
    expect(dash.code).toBe(2);
    expect(dash.err).toContain("after --");
    expect(slipbox(["write", "people/kenji-mori.md", "--append", "--", "- item"]).code).toBe(0);
    expect(note("people/kenji-mori.md").endsWith("- item\n")).toBe(true);
    const r = Bun.spawnSync(["bun", MAIN, "write", "people/kenji-mori.md", "--stdin"], { cwd: vault, env, stdin: Buffer.from([0xff, 0xfe, 0x20, 0x62]) });
    expect(r.exitCode).toBe(5);
    expect(note("people/kenji-mori.md").endsWith("- item\n")).toBe(true);
  });
  test("review cycle 5: replace answers in linear time; resolve reads markdown links; stat; links --all", () => {
    writeFileSync(join(vault, "big-replace.md"), "- [ ] line Aster and Aster\n".repeat(25_000));
    const t0 = Date.now();
    const big = slipbox(["replace", "big-replace", "Aster", "Vega", "--json"]);
    expect(big.json.data.count).toBe(50_000);
    expect(big.json.data.changes[1]).toMatchObject({ line: 1, column: 22, textAfter: "- [ ] line Aster and Vega" });
    expect(Date.now() - t0).toBeLessThan(10_000);
    writeFileSync(join(vault, "people", "probe.md"), "[a](home.md) and [b](../home.md)\n");
    expect(slipbox(["resolve", "[a](home.md)", "--from", "people/probe.md"]).code).toBe(3);
    expect(slipbox(["resolve", "[b](../home.md)", "--from", "people/probe.md", "--json"]).json.data.path).toBe("home.md");
    const st = slipbox(["stat", "partners-and-names", "--json"]).json.data;
    expect(st).toMatchObject({ path: "people/partners-and-names.md", title: "Partners and names", invalidUtf8: false });
    expect(st.unresolved).toBeGreaterThan(0);
    expect(st.backlinks).toBeGreaterThan(0);
    const all = slipbox(["links", "--all", "--json"]).json.data;
    expect(all.some((l: { from: string; status: string }) => l.from === "people/partners-and-names.md" && l.status === "unresolved")).toBe(true);
    const bl = slipbox(["backlinks", "kenji-mori", "--json"]).json.data.backlinks;
    expect(bl[0]).toHaveProperty("kind");
    expect(bl[0]).toHaveProperty("target");
    const created = slipbox(["write", "contacts", "# c", "--create", "--json"]);
    expect(created.json.data.shadows.sort()).toEqual(["equipment/contacts.md", "people/contacts.md"]);
    expect(created.json.warnings.join(" ")).toContain("[[contacts]]");
    rmSync(join(vault, "contacts.md"));
    rmSync(join(vault, "big-replace.md"));
  }, 30_000);
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
  test("review cycle 5: secondary refusals (from mutation testing)", () => {
    expect(slipbox(["write", "brand-new-5", "x", "--create", "--if-unchanged", "abc"]).code).toBe(5);
    expect(existsSync(join(vault, "brand-new-5.md"))).toBe(false);
    const list = slipbox(["task", "2026-09-14-weekly", "--json"]).json.data;
    const done = list.tasks.find((t: { checked: boolean }) => t.checked);
    const before = note("meetings/2026-09-14-weekly.md");
    // A stale sha is refused even when the toggle would change nothing.
    expect(slipbox(["task", "2026-09-14-weekly", String(done.line), "--check", "--if-unchanged", "0000000000000000"]).code).toBe(5);
    expect(slipbox(["task", "2026-09-14-weekly", String(done.line), "--check", "--uncheck"]).code).toBe(2);
    expect(note("meetings/2026-09-14-weekly.md")).toBe(before);
    writeFileSync(join(vault, "emoji-col.md"), "🛰️ x needle\n");
    expect(slipbox(["find", "needle", "emoji-col", "--json"]).json.data.matches[0].column).toBe(6);
    rmSync(join(vault, "emoji-col.md"));
  });
  test("review cycle 5: --allow-empty empties on purpose; render --theme; send --server", () => {
    writeFileSync(join(vault, "to-empty.md"), "text\n");
    expect(slipbox(["write", "to-empty", "", "--allow-empty"]).code).toBe(0);
    expect(readFileSync(join(vault, "to-empty.md"), "utf8").trim()).toBe("");
    rmSync(join(vault, "to-empty.md"));
    const plain = Bun.spawnSync(["bun", MAIN, "render", "home", "--color", "always", "--theme", "nord"], { cwd: vault, env }).stdout.toString();
    const other = Bun.spawnSync(["bun", MAIN, "render", "home", "--color", "always", "--theme", "gruvbox-dark"], { cwd: vault, env }).stdout.toString();
    expect(plain).toContain("\x1b[");
    expect(plain).not.toBe(other); // the theme's colours, not the default's
    // This config's command names no {server}: --server can't apply, and says so.
    const sent = slipbox(["send", "home", "--server", join(sandbox, "no-nvim.sock"), "--json"]);
    expect(sent.code).toBe(0);
    expect(sent.json.warnings.join(" ")).toContain("--server has no effect");
  });
  test("every CLI command is run by this file", () => {
    const missing = [...CLI_COMMANDS].filter((c) => !ran.has(c));
    expect(missing).toEqual([]);
  });
});
