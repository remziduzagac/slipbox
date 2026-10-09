// The CLI as an agent meets it: the real `slipbox` process, run against a copy of the demo vault
// (examples/vault), with its exit codes, its human output and its --json envelope. Every CLI
// command is run here; the last test fails if one isn't. (tests/vault.test.ts drives runCli in
// process for the finer cases.)

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { CLI_COMMANDS, FLAGS } from "../src/cli/cli.ts";

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
  XDG_DATA_HOME: join(sandbox, "data"), // the home vault (17.2)
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

function slipbox(args: string[], opts: { stdin?: string; cwd?: string; env?: Record<string, string> } = {}): Run {
  const word = args.find((a) => !a.startsWith("-"));
  if (word && CLI_COMMANDS.has(word)) ran.add(word);
  // A timeout, so a hang (a read that never ends) fails the test instead of the run.
  const r = Bun.spawnSync(["bun", MAIN, ...args], { cwd: opts.cwd ?? vault, env: { ...env, ...opts.env }, stdin: opts.stdin === undefined ? "ignore" : Buffer.from(opts.stdin), timeout: 20_000 });
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
  test("render draws a Mermaid diagram in box drawing (12.10): its library waited for, as a process starting cold", () => {
    const dir = join(sandbox, "diagrams");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "d.md"), "# D\n\n```mermaid\ngraph TD\n  A[Write] --> B[Disk]\n```\n");
    const r = slipbox(["render", join(dir, "d.md"), "--width", "80", "--plain"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/│\s+Write\s+│/);
    expect(r.out).not.toContain("A[Write]");
  });
  // util-linux's script: a terminal for the TUI's start (a pipe never gets one).
  test.skipIf(!Bun.spawnSync(["script", "--version"]).stdout.toString().includes("util-linux"))(
    "the TUI on a path that isn't there, or a --root that isn't a root: a line and exit 3, never a stack trace",
    () => {
      for (const args of [["/nope/missing.md"], ["--root", sandbox, "x.md"]]) {
        const cmd = ["bun", MAIN, ...args].map((a) => `'${a}'`).join(" ");
        const r = Bun.spawnSync(["script", "-qec", cmd, "/dev/null"], { cwd: vault, env, stdin: "ignore", timeout: 20_000 });
        const out = r.stdout.toString();
        expect(out).toMatch(/^slipbox: (no such file or directory|.* isn't a root)/m);
        expect(out).not.toContain("    at ");
        expect(r.exitCode).toBe(3);
      }
    },
  );
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
    const h = slipbox(["resolve", "operations-handbook#O25: Documentation categories", "--json"]).json;
    expect(h.data).toMatchObject({ status: "resolved", path: "handbook/operations-handbook.md" });
    expect(h.data.line).toBeGreaterThan(1);
    // A wikilink, by its name within the root (21.3).
    expect(slipbox(["resolve", "[[operations-handbook]]", "--json"]).json.data).toMatchObject({ status: "resolved", path: "handbook/operations-handbook.md" });
    expect(slipbox(["resolve", "visiting-rota", "--from", "partners-and-names"]).code).toBe(3);
    expect(slipbox(["resolve", "https://example.org/x", "--json"]).json.data.status).toBe("external");
  });
  test("link: a link to a note as slipbox writes one where --from is — the demo's convention, the note's title (21.5)", () => {
    const r = slipbox(["link", "operations-handbook", "--from", "kenji-mori", "--json"]);
    expect(r.code).toBe(0);
    expect(r.json.data).toMatchObject({ path: "handbook/operations-handbook.md", from: "people/kenji-mori.md", style: "markdown", pathForm: "relative" });
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
    expect(n.json.data).toMatchObject({ kind: "vault", to: "halden-renamed", dryRun: true });
  });
  test("links and backlinks, with their status", () => {
    const l = slipbox(["links", "partners-and-names", "--json"]).json.data;
    expect(l.some((x: { target: string; status: string }) => x.target === "visiting-rota.md" && x.status === "unresolved")).toBe(true);
    expect(slipbox(["links", "partners-and-names"]).out).toContain("UNRESOLVED");
    const b = slipbox(["backlinks", "kenji-mori", "--json"]).json.data;
    expect(b.backlinks.map((x: { from: string }) => x.from)).toContain("home.md");
  });
  test("links --json gives each link's end, as backlinks gives the same link's", () => {
    type Pos = { line: number; column: number };
    const l = slipbox(["links", "home", "--json"]).json.data as (Pos & { path: string | null; end: Pos })[];
    for (const x of l) expect(x.end).toEqual({ line: expect.any(Number), column: expect.any(Number) });
    const to = l.find((x) => x.path === "people/kenji-mori.md")!;
    const back = slipbox(["backlinks", "kenji-mori", "--json"]).json.data.backlinks.find((x: Pos & { from: string }) => x.from === "home.md" && x.line === to.line && x.column === to.column);
    expect(to.end).toEqual(back.end);
  });
});

describe("find and replace", () => {
  test("spell (25.6): a note's misspelt words, from a process of its own — Hunspell's WebAssembly loaded there too", () => {
    const r = slipbox(["spell", "kenji-mori", "--json"]);
    expect(r.code).toBe(0);
    expect(r.json.data).toMatchObject({ path: "people/kenji-mori.md", languages: ["en"], missing: [] });
    for (const w of r.json.data.words) expect(w).toEqual({ line: expect.any(Number), column: expect.any(Number), word: expect.any(String) });
    expect(slipbox(["spell", "kenji-mori"]).out).toMatch(/^(people\/kenji-mori\.md:\d+:\d+: \S+\n)*$/);
  });
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
  test("export: a Word document beside the note, its name; several notes one; --to, -o (a folder: its name in it), never over a note", () => {
    const r = slipbox(["export", "dome-refit"]);
    expect(r.code).toBe(0);
    expect(r.out).toBe("exported projects/dome-refit.md to projects/dome-refit.docx (Word (.docx))\n");
    expect(readFileSync(join(vault, "projects", "dome-refit.docx")).subarray(0, 4).toString("latin1")).toBe("PK\x03\x04");
    const j = slipbox(["export", "dome-refit", "pipeline-cookbook", "--to", "word", "-o", "exports/both.docx", "--json"]).json;
    expect(j.data).toMatchObject({ path: "exports/both.docx", format: "docx", notes: ["projects/dome-refit.md", "software/pipeline-cookbook.md"] });
    expect(j.data.bytes).toBe(readFileSync(join(vault, "exports", "both.docx")).length);
    // -o's extension says the format; a folder gets the note's name in it.
    expect(slipbox(["export", "dome-refit", "-o", "exports/upper.DOCX"]).code).toBe(0);
    expect(slipbox(["export", "dome-refit", "-o", "exports", "--json"]).json.data.path).toBe("exports/dome-refit.docx");
    const over = slipbox(["export", "dome-refit", "-o", "home.md", "--to", "docx"]);
    expect([over.code, over.err]).toEqual([5, "slipbox: home.md is a note — an export doesn't write over it\n"]);
    expect(note("home.md")).toStartWith("# Halden Ridge Observatory\n");
    const bad = slipbox(["export", "dome-refit", "--to", "odt"]);
    expect([bad.code, bad.err]).toEqual([2, "slipbox: --to must be one of: docx, pdf, html, epub, md\n"]);
    expect(slipbox(["export", "dome-refit", "-o", "exports/x.odt"]).code).toBe(2);
    expect(existsSync(join(vault, "exports", "x.odt"))).toBe(false);
    expect(slipbox(["export"]).code).toBe(2);
  });
  test("export to PDF, a web page, an e-book; Markdown beside it apart from the note, its pictures in a folder, an earlier one replaced", () => {
    for (const [to, magic] of [["pdf", "%PDF-"], ["html", "<!doctype html>"], ["epub", "PK\x03\x04"]] as const) {
      const r = slipbox(["export", "dome-refit", "--to", to, "--json"]);
      expect([r.code, r.json.data.path]).toEqual([0, `projects/dome-refit.${to}`]);
      expect(readFileSync(join(vault, "projects", `dome-refit.${to}`)).subarray(0, magic.length).toString("latin1")).toBe(magic);
    }
    const md = slipbox(["export", "dome-refit", "--to", "markdown"]);
    expect(md.out).toBe("exported projects/dome-refit.md to projects/dome-refit.export.md (Markdown (.md)), 1 file beside it\n");
    expect(note("projects/dome-refit.export.md")).toContain("![dome-shutter.png](dome-refit.export.assets/dome-shutter.png)");
    expect(existsSync(join(vault, "projects", "dome-refit.export.assets", "dome-shutter.png"))).toBe(true);
    // Indexed now, a note — and still replaced, being an export.
    const again = slipbox(["export", "dome-refit", "--to", "md", "--json"]);
    expect([again.code, again.json.data.files]).toEqual([0, ["projects/dome-refit.export.assets/dome-shutter.png"]]);
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
  test("slipbox lsp is gone: said why on stderr (an editor's log), exit 2", () => {
    const r = slipbox(["lsp"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("slipbox lsp was removed");
  });
  test("no terminal (9.3): slipbox [path] and slipbox open [path] refuse the TUI, a hint and exit 2; --help, --version, --json run the CLI", () => {
    for (const args of [[], ["home.md"], ["open"], ["open", "home.md"], ["home.md", "--theme", "nord"]]) {
      const r = slipbox(args);
      expect([args.join(" "), r.code, r.out]).toEqual([args.join(" "), 2, ""]); // nothing painted into the pipe
      expect(r.err).toStartWith("slipbox: not starting the TUI — stdin/stdout is not a terminal.\n");
      expect(r.err).toContain("`slipbox render <note>`");
    }
    // An unknown flag is a usage error, said as one.
    expect(slipbox(["home.md", "--bogus"])).toMatchObject({ code: 2, err: expect.stringContaining("unknown option: --bogus") });
    // These run the CLI instead, whatever the path.
    expect(slipbox(["home.md", "--help"])).toMatchObject({ code: 0, out: expect.stringContaining("slipbox find <query>") });
    expect(slipbox(["home.md", "--version"]).out).toMatch(/^slipbox \d+\.\d+\.\d+\n$/);
    expect(slipbox(["--json"]).json).toMatchObject({ ok: true, command: "help" });
  });
  // The agents' skill (skills/slipbox/SKILL.md) is what they type: every example in it runs, its
  // placeholders filled, with no usage error (exit 2) — a flag renamed or a command reshaped shows.
  test("every command in the skill runs as written", () => {
    const skill = readFileSync(join(import.meta.dir, "..", "skills", "slipbox", "SKILL.md"), "utf8");
    const lines = skill
      .split(/^```.*$/m)
      .filter((_, i) => i % 2 === 1)
      .flatMap((block) => block.split("\n"))
      .filter((l) => l.startsWith("slipbox "))
      .map((l) => l.replace(/\s{2,}#.*$/, ""));
    expect(lines.length).toBeGreaterThan(30);
    const fill: Record<string, string> = { "<note>": "operations-handbook", "[<note>]": "operations-handbook", "<text>": "Aster", "'<text>'": "Aster", "<old>": "Brill", "<new>": "BRILL", "<line>": "1", "<n>": "1", "<sha>": "0123456789abcdef", "<path>": "scratch/skill-example.md" };
    // A copy of its own, known only to its own state: another halden in the sandbox's state would
    // make the demo's name ambiguous for the tests after.
    const dir = mkdtempSync(join(sandbox, "skill-"));
    cpSync(DEMO, join(dir, "vault"), { recursive: true });
    const own = { XDG_STATE_HOME: join(dir, "state"), XDG_CACHE_HOME: join(dir, "cache"), XDG_DATA_HOME: join(dir, "data") };
    for (const line of lines) {
      // Its words as sh would split them: quotes kept together.
      const words = [...line.matchAll(/'([^']*)'|"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]!).slice(1);
      const args = words.map((w) => fill[w] ?? w);
      expect(args.join(" ")).not.toMatch(/<\w+>/); // every placeholder known
      const r = slipbox(args, { cwd: join(dir, "vault"), env: own, stdin: args.includes("--stdin") ? "x\n" : undefined });
      if (r.code === 2) throw new Error(`${line}: a usage error\n${r.err || r.out}`);
    }
  });
  test("info, themes, commands, init, help, version", () => {
    const i = slipbox(["info", "--json"]).json.data;
    expect(i.root).toBe(vault);
    expect(i.notes).toBeGreaterThan(10);
    expect(slipbox(["themes"]).out).toContain("tokyo-night");
    const c = slipbox(["commands", "--json"]).json.data;
    expect(c.find((x: { id: string }) => x.id === "task.toggle").cli).toStartWith("slipbox task");
    const fresh = join(sandbox, "fresh");
    mkdirSync(fresh);
    // init: settings only — a name (and an id) when one is given (21.10).
    const made = slipbox(["init", fresh, "--json"]).json.data;
    expect(made).toMatchObject({ created: true, name: null, id: null });
    expect(existsSync(join(fresh, ".slipbox"))).toBe(true);
    expect(slipbox(["info", "--json"], { cwd: fresh }).json.data).toMatchObject({ root: fresh, name: null, folder: null });
    const named = slipbox(["init", fresh, "--name", "clifresh", "--json"]).json.data;
    expect(named).toMatchObject({ created: false, identified: true, name: "clifresh", id: expect.stringMatching(/^[0-9a-f]{16}$/) });
    expect(slipbox(["info"], { cwd: fresh }).out).toContain("name      clifresh");
    // The vault words are gone (21.12): `folders` lists the named ones.
    expect(slipbox(["vaults"]).code).toBe(2);
    expect(slipbox(["vault-moved"]).code).toBe(2);
    expect(slipbox(["folders", "--json"]).json.data.some((f: { name: string; default: string }) => f.name === "clifresh" && f.default === fresh)).toBe(true);
    // Plans waiting to be applied (20.18): a list, maybe empty; one that isn't there, not found.
    expect(Array.isArray(slipbox(["apply", "--json"]).json.data)).toBe(true);
    expect(slipbox(["apply", "00000000", "--json"]).code).toBe(3);
    expect(slipbox(["help"]).out).toContain("slipbox find <query>");
    expect(slipbox(["--version"]).out).toMatch(/^slipbox \d+\.\d+\.\d+/);
  });
  test("mv, name, relink: a preview, then the change (17.15, 21.10)", () => {
    const dir = join(sandbox, "renames");
    mkdirSync(join(dir, "notes"), { recursive: true });
    writeFileSync(join(dir, "notes", "plan.md"), "# Plan\n");
    writeFileSync(join(dir, "index.md"), "[plan](notes/plan.md) and [p](notes/plan.md)\n");
    expect(slipbox(["init", dir, "--name", "cliren"]).code).toBe(0);
    const dry = slipbox(["mv", "plan", "roadmap", "--dry-run"], { cwd: dir });
    expect(dry.out).toContain("would rename notes/plan.md → roadmap.md: 1 change in 1 file"); // no old name written into it (21.12)
    expect(dry.out).toContain("- [plan](notes/plan.md) and [p](notes/plan.md)");
    expect(dry.out).toContain("+ [plan](roadmap.md) and [p](roadmap.md)");
    expect(existsSync(join(dir, "notes", "plan.md"))).toBe(true);
    const done = slipbox(["mv", "plan", "roadmap", "--json"], { cwd: dir }).json;
    expect(done.data).toMatchObject({ kind: "note", from: "notes/plan.md", to: "roadmap.md", dryRun: false });
    expect(readFileSync(join(dir, "index.md"), "utf8")).toBe("[plan](roadmap.md) and [p](roadmap.md)\n");
    expect(slipbox(["mv", "roadmap", "index"], { cwd: dir }).code).toBe(5); // index.md is there
    const vr = slipbox(["name", "cliren2", "--json"], { cwd: dir }).json;
    expect(vr.data).toMatchObject({ kind: "vault", from: "cliren", to: "cliren2" });
    expect(slipbox(["info", "--json"], { cwd: dir }).json.data.name).toBe("cliren2");
    writeFileSync(join(dir, "late.md"), "[plan](notes/plan.md)\n");
    const rl = slipbox(["relink", "late", "--json"], { cwd: dir }).json;
    expect(rl.data.files[0].edits[0]).toMatchObject({ before: "[plan](notes/plan.md)", after: "[plan](roadmap.md)" });
    // undo (7.4): the newest first — the relink, the vault's name, then the move.
    expect(slipbox(["undo", "--dry-run"], { cwd: dir }).out).toStartWith("would undo the relink of late.md: 1 change in 1 file\n");
    expect(slipbox(["undo"], { cwd: dir }).out).toStartWith("undid the relink of late.md: 1 change in 1 file\n");
    expect(readFileSync(join(dir, "late.md"), "utf8")).toBe("[plan](notes/plan.md)\n");
    expect(slipbox(["undo"], { cwd: dir }).out).toStartWith("renamed folder cliren2 back to cliren: ");
    expect(slipbox(["undo", "--json"], { cwd: dir }).json.data).toMatchObject({ kind: "note", from: "roadmap.md", to: "notes/plan.md", undo: { at: expect.any(String) } });
    expect(readFileSync(join(dir, "index.md"), "utf8")).toBe("[plan](notes/plan.md) and [p](notes/plan.md)\n");
    expect(slipbox(["undo"], { cwd: dir }).code).toBe(3); // nothing more
  });
  test("rename-heading: a preview, then the heading and its links (11.9)", () => {
    const dir = join(sandbox, "headings");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "plan.md"), "# Plan\n\n## Goals\n");
    writeFileSync(join(dir, "index.md"), "[the goals](plan.md#goals) and [g](plan.md#goals)\n");
    expect(slipbox(["init", dir, "--name", "cliheads"]).code).toBe(0);
    const dry = slipbox(["rename-heading", "plan", "Goals", "Aims", "--dry-run"], { cwd: dir });
    expect(dry.out).toContain("would rename heading plan.md#Goals → plan.md#Aims: 2 changes in 2 files");
    expect(dry.out).toContain("+ [the goals](plan.md#aims) and [g](plan.md#aims)");
    expect(slipbox(["rename-heading", "plan", "Goals", "Aims", "--json"], { cwd: dir }).json.data).toMatchObject({ kind: "heading", dryRun: false });
    expect(readFileSync(join(dir, "plan.md"), "utf8")).toBe("# Plan\n\n## Aims\n");
    expect(readFileSync(join(dir, "index.md"), "utf8")).toBe("[the goals](plan.md#aims) and [g](plan.md#aims)\n");
    expect(slipbox(["rename-heading", "plan", "Nope", "X"], { cwd: dir }).code).toBe(5);
    expect(slipbox(["rename-heading", "plan", "Aims"], { cwd: dir }).code).toBe(2);
  });
  test("doctor: each language's servers and where each is; a file's, in its project (19.7)", () => {
    const groups = slipbox(["doctor", "--json"]).json.data as { languages: string[]; servers: { name: string; role: string; package: string | null; hint: string | null }[] }[];
    const ts = groups.find((g) => g.languages.includes("typescript"))!;
    expect(ts.languages).toEqual(["typescript", "tsx", "javascript", "jsx"]);
    expect(ts.servers.map((x) => [x.name, x.role])).toEqual([
      ["typescript", "main"],
      ["vtsls", "main"],
      ["eslint", "add-on"],
      ["biome", "add-on"],
    ]);
    expect(ts.servers[0]!.package).toBe("typescript@7.0.2");
    expect(groups.find((g) => g.languages.includes("rust"))!.servers[0]!.hint).toBe("rustup component add rust-analyzer");
    expect(slipbox(["doctor"]).out).toMatch(/^rust\n {2}rust-analyzer +/m);
    writeFileSync(join(vault, "tool.ts"), "export const x = 1;\n");
    const file = slipbox(["doctor", "tool.ts", "--json"]).json.data;
    expect(file).toMatchObject({ language: "typescript", languageId: "typescript" });
    expect(file.run[0].name).toBe("typescript");
    expect(slipbox(["doctor", "home.md"]).code).toBe(3); // a note: slipbox itself serves it
    // Linters without a server (19.19): a language's, and for a file whether its project asks for one.
    const yaml = groups.find((g) => g.languages.includes("yaml")) as unknown as { linters: { name: string; required: boolean; markers: string[] }[] };
    expect(yaml.linters).toMatchObject([{ name: "yamllint", required: true, markers: [".yamllint", ".yamllint.yaml", ".yamllint.yml"] }]);
    expect(slipbox(["doctor"]).out).toMatch(/^ {2}yamllint \(linter\) +.*\(where the project has \.yamllint or \.yamllint\.yaml…\)$/m);
    mkdirSync(join(vault, "ops"), { recursive: true });
    writeFileSync(join(vault, "ops", "Dockerfile"), "FROM x\n");
    expect(slipbox(["doctor", "ops/Dockerfile", "--json"]).json.data.linters).toMatchObject([{ name: "hadolint", root: null }]);
    writeFileSync(join(vault, "ops", ".hadolint.yaml"), "ignored: []\n");
    expect(slipbox(["doctor", "ops/Dockerfile", "--json"]).json.data.linters).toMatchObject([{ name: "hadolint", root: join(vault, "ops") }]);
    expect(slipbox(["doctor", "ops/Dockerfile"]).out).toMatch(/hadolint \(linter\) .*\(runs in .*ops\)/);
  });
  test("diagnostics: a server still at its work when it first answers (rust-analyzer loading) is waited for until it says it's done", () => {
    const dir = join(sandbox, "diag-loading");
    mkdirSync(join(dir, ".git"), { recursive: true });
    const launcher = join(dir, "fake-ls");
    writeFileSync(launcher, `#!/usr/bin/env node\nawait import(${JSON.stringify(join(import.meta.dir, "fixtures", "fake-lsp.ts"))});\n`);
    chmodSync(launcher, 0o755);
    const cfg = join(dir, "config.toml");
    writeFileSync(cfg, `[language-server.fake]\ncommand = ${JSON.stringify(launcher)}\nargs = ["--stdio"]\nenvironment = { FAKE_PULL = "1" }\n\n[[language]]\nname = "fake"\nfile-types = ["fk"]\nlanguage-servers = ["fake"]\n`);
    // Asked at once, it has nothing; its loading, begun at once, ends after more than a pause in what it says.
    writeFileSync(join(dir, "a.fk"), "LOADING\nBAD here\n");
    const r = slipbox(["diagnostics", "a.fk", "--config", cfg, "--json"], { cwd: dir });
    expect(r.json.data.problems.map((p: { line: number }) => p.line)).toEqual([2]);
  });

  test("diagnostics: a file's problems from its servers (waited for) and linters; a note's links and lint; exit 1 on an error (19.22)", () => {
    const dir = join(sandbox, "diag");
    mkdirSync(join(dir, ".git"), { recursive: true });
    const launcher = join(dir, "fake-ls");
    writeFileSync(launcher, `#!/usr/bin/env node\nawait import(${JSON.stringify(join(import.meta.dir, "fixtures", "fake-lsp.ts"))});\n`);
    chmodSync(launcher, 0o755);
    const cfg = join(dir, "config.toml");
    writeFileSync(
      cfg,
      [
        `[language-server.fake]\ncommand = ${JSON.stringify(launcher)}\nargs = ["--stdio"]\n`,
        `[linter.todo]\nlint-command = "grep -n TODO | sed 's/^\\\\([0-9]*\\\\):.*/stdin:\\\\1:1: [error] a TODO/'; exit 1"\nlint-formats = ["%f:%l:%c: [%trror] %m"]\n`,
        `[[language]]\nname = "fake"\nfile-types = ["fk"]\nlanguage-servers = ["fake"]\nlinters = ["todo"]\n`,
        `[lint]\nenabled = "on"\ncommand = ["sh", "-c", "for f; do printf '%s:2 error MD041/first-line-heading First line\\\\n' \\"$f\\"; done; exit 1", "lint"]\n`,
      ].join("\n"),
    );
    writeFileSync(join(dir, "a.fk"), "fine\nBAD here\nTODO later\n");
    const r = slipbox(["diagnostics", "a.fk", "--config", cfg, "--json"], { cwd: dir });
    expect(r.code).toBe(1); // the linter's error
    expect(r.json.ok).toBe(true); // it ran: the exit says what it found
    expect(r.json.data.problems.map((p: { line: number; severity: string; source: string; message: string }) => [p.line, p.severity, p.source, p.message.split(",")[0]])).toEqual([
      [2, "warning", "fake", "bad"],
      [3, "error", "todo", "a TODO"],
    ]);
    expect(r.json.data.sources).toEqual([
      { name: "fake", kind: "server", status: "answered" },
      { name: "todo", kind: "linter", status: "ran" },
    ]);
    expect(slipbox(["diagnostics", "a.fk", "--config", cfg], { cwd: dir }).out).toMatch(/^a\.fk:2:1: warning fake: bad.*\na\.fk:3:1: error todo: a TODO\n$/);
    // The least severity shown; a clean file is exit 0, nothing printed.
    expect(slipbox(["diagnostics", "a.fk", "--config", cfg, "--severity", "error", "--json"], { cwd: dir }).json.data.problems).toHaveLength(1);
    writeFileSync(join(dir, "b.fk"), "fine\n");
    expect(slipbox(["diagnostics", "b.fk", "--config", cfg], { cwd: dir })).toMatchObject({ code: 0, out: "" });
    expect(slipbox(["diagnostics", "a.fk", "--severity", "bad"], { cwd: dir }).code).toBe(2);
    expect(slipbox(["diagnostics", "nope.fk"], { cwd: dir }).code).toBe(3);
    // A vault note: its links, and the lint surface's findings.
    writeFileSync(join(vault, "diag-note.md"), "# Diag\n\nSee [the note](no-such-note-anywhere.md).\n");
    const n = slipbox(["diagnostics", "diag-note.md", "--config", cfg, "--severity", "info", "--json"]);
    expect(n.json.data.problems.map((p: { line: number; source: string }) => [p.line, p.source])).toEqual([
      [2, "markdownlint"],
      [3, "slipbox"],
    ]);
    expect(n.code).toBe(0); // warnings: no error among them
  });
  test("convert-links (20.1): a vault's wikilinks as paths, previewed with --dry-run; an ambiguous one said", () => {
    // The demo vault is converted already: a vault written as it was before (as the demo's home.md was).
    const dir = join(sandbox, "convert");
    mkdirSync(join(dir, "people"), { recursive: true });
    mkdirSync(join(dir, "equipment"), { recursive: true });
    writeFileSync(join(dir, "about-this-vault.md"), "# About\n");
    writeFileSync(join(dir, "people", "contacts.md"), "# People\n");
    writeFileSync(join(dir, "equipment", "contacts.md"), "# Suppliers\n");
    writeFileSync(join(dir, "home.md"), "# Home\n\n- [[about-this-vault]]\n- [[contacts]]\n");
    expect(slipbox(["init", dir, "--name", "convert"]).code).toBe(0);
    const r = slipbox(["convert-links", "--dry-run", "--json"], { cwd: dir });
    expect(r.code).toBe(0);
    expect(r.json.data).toMatchObject({ kind: "convert", dryRun: true });
    expect(r.json.data.files.find((f: { path: string }) => f.path === "home.md").edits[0]).toMatchObject({ before: expect.stringContaining("[[about-this-vault]]"), after: expect.stringContaining("[about-this-vault](about-this-vault.md)") });
    expect(r.json.data.ambiguous).toMatchObject([{ shown: "home.md", written: "[[contacts]]", candidates: ["equipment/contacts.md", "people/contacts.md"] }]);
    expect(readFileSync(join(dir, "home.md"), "utf8")).toContain("[[about-this-vault]]"); // nothing written
  });
  test("cp, rm, trash, and mv of a folder (18.x)", () => {
    const dir = join(sandbox, "fileops");
    mkdirSync(join(dir, "projects", "deep"), { recursive: true });
    writeFileSync(join(dir, "projects", "plan.md"), "# Plan\n\n[deeper](deep/detail.md)\n");
    writeFileSync(join(dir, "projects", "deep", "detail.md"), "# Detail\n\n[up](../plan.md)\n");
    writeFileSync(join(dir, "index.md"), "[plan](projects/plan.md) and [d](projects/deep/detail.md)\n");
    expect(slipbox(["init", dir, "--name", "fileops"]).code).toBe(0);
    // A folder moves whole: links into it fixed, links inside it left as they are.
    const mv = slipbox(["mv", "projects", "work", "--json"], { cwd: dir }).json;
    expect(mv.data).toMatchObject({ kind: "folder", from: "projects", to: "work", dryRun: false });
    expect(readFileSync(join(dir, "index.md"), "utf8")).toBe("[plan](work/plan.md) and [d](work/deep/detail.md)\n");
    expect(readFileSync(join(dir, "work", "plan.md"), "utf8")).toBe("# Plan\n\n[deeper](deep/detail.md)\n");
    expect(existsSync(join(dir, "projects"))).toBe(false);
    // cp: beside it as name-copy, or where told.
    expect(slipbox(["cp", "work/plan.md", "--json"], { cwd: dir }).json.data).toMatchObject({ from: "work/plan.md", to: "work/plan-copy.md" });
    expect(slipbox(["cp", "work/plan.md", "elsewhere", "--json"], { cwd: dir }).json.data.to).toBe("elsewhere.md");
    expect(slipbox(["cp", "work/plan.md", "elsewhere"], { cwd: dir }).code).toBe(5); // there now
    // rm: to the trash, the links it breaks said; trash lists it; restore puts it back.
    const rm = slipbox(["rm", "work/plan.md", "--json"], { cwd: dir }).json;
    expect(rm.data.breaking).toBe(2);
    expect(rm.warnings.join()).toContain("2 links from other notes to work/plan.md will break");
    expect(existsSync(join(dir, "work", "plan.md"))).toBe(false);
    const listed = slipbox(["trash", "--json"], { cwd: dir }).json.data;
    expect(listed[0]).toMatchObject({ shown: "work/plan.md", dir: false });
    expect(slipbox(["trash", "restore", "work/plan.md"], { cwd: dir }).code).toBe(0);
    expect(readFileSync(join(dir, "work", "plan.md"), "utf8")).toContain("# Plan");
    expect(slipbox(["trash", "--json"], { cwd: dir }).json.data).toEqual([]);
    // A folder to the trash and back; restoring over something is refused.
    slipbox(["rm", "work/deep"], { cwd: dir });
    expect(existsSync(join(dir, "work", "deep"))).toBe(false);
    mkdirSync(join(dir, "work", "deep"));
    expect(slipbox(["trash", "restore", "work/deep"], { cwd: dir }).code).toBe(5);
    rmSync(join(dir, "work", "deep"), { recursive: true });
    expect(slipbox(["trash", "restore", "work/deep"], { cwd: dir }).code).toBe(0);
    expect(existsSync(join(dir, "work", "deep", "detail.md"))).toBe(true);
    expect(slipbox(["rm", ".slipbox"], { cwd: dir }).code).not.toBe(0);
    // A vault nested in it: the links into it are what break (18.7).
    mkdirSync(join(dir, "inner"));
    writeFileSync(join(dir, "inner", "note.md"), "# Inner\n");
    expect(slipbox(["init", join(dir, "inner"), "--name", "fileops-inner"]).code).toBe(0);
    writeFileSync(join(dir, "to-inner.md"), "[i](inner/note.md)\n");
    const vrm = slipbox(["rm", "inner", "--dry-run", "--json"], { cwd: dir }).json;
    expect(vrm.data).toMatchObject({ path: "inner", dryRun: true, breaking: 1 });
    // …and moved as a folder of this vault: the path link fixed.
    expect(slipbox(["mv", "inner", "box", "--json"], { cwd: dir }).json.data).toMatchObject({ kind: "folder", from: "inner", to: "box" });
    expect(readFileSync(join(dir, "to-inner.md"), "utf8")).toBe("[i](box/note.md)\n");
    // deinit: a plain folder of this vault again (18.11); the path link means the same.
    expect(slipbox(["deinit", "box", "--json"], { cwd: dir }).json.data).toMatchObject({ kind: "unmake-vault", from: "box", to: "fileops" });
    expect(existsSync(join(dir, "box", ".slipbox"))).toBe(false);
    expect(readFileSync(join(dir, "to-inner.md"), "utf8")).toBe("[i](box/note.md)\n");
  });
  test("tags: the vault's, with counts; a tag's notes (1.6)", () => {
    // The demo's: frontmatter tags, and #tags in the text, nested (#dome/shutter under #dome).
    const all = slipbox(["tags", "--json"], { cwd: DEMO }).json.data as { tag: string; count: number }[];
    expect(all).toContainEqual({ tag: "dome", count: 2 });
    expect(all).toContainEqual({ tag: "dome/shutter", count: 2 });
    const notes = ["projects/dome-refit.md", "projects/variable-star-survey.md"];
    expect(slipbox(["tags", "#dome/shutter", "--json"], { cwd: DEMO }).json.data).toEqual({ tag: "dome/shutter", notes });
    expect(slipbox(["tags", "dome/shutter"], { cwd: DEMO }).out).toBe(notes.map((n) => `${n}\n`).join(""));
  });
  test("footnotes: each one's label, text and line, and where it's referred to (3.17)", () => {
    const r = slipbox(["footnotes", "people/partners-and-names.md", "--json"], { cwd: DEMO }).json.data as { path: string; footnotes: { label: string; line: number; references: { line: number }[] }[] };
    expect(r.path).toBe("people/partners-and-names.md");
    expect(r.footnotes.map((f) => f.label)).toEqual(["1", "charter"]);
    expect(r.footnotes[0]).toMatchObject({ line: 97, text: "Counted at the Visitor Pavilion door, not from ticket sales.", references: [{ line: 95, column: 42 }] });
    expect(slipbox(["footnotes", "people/partners-and-names.md"], { cwd: DEMO }).out).toContain("[charter]  L101");
    expect(slipbox(["footnotes", "software/halley/halley.toml"], { cwd: DEMO }).code).toBe(5); // not a note
  });
  test("footnotes add, edit, rename, rm: the note's text changed as the TUI's keys change it (3.18)", () => {
    const note = join(vault, "fn-cli.md");
    writeFileSync(note, "# F\r\n\r\nA claim here.\r\n");
    const add = slipbox(["footnotes", "fn-cli.md", "add", "3:8", "The source", "--json"], { cwd: vault }).json;
    expect(add.data.footnotes).toMatchObject([{ label: "1", text: "The source" }]);
    expect(readFileSync(note, "utf8")).toBe("# F\r\n\r\nA claim[^1] here.\r\n\r\n[^1]: The source\r\n"); // CRLF kept
    slipbox(["footnotes", "fn-cli.md", "add", "3", "Second"], { cwd: vault }); // no column: the line's end
    expect(readFileSync(note, "utf8")).toContain("A claim[^1] here.[^2]");
    slipbox(["footnotes", "fn-cli.md", "edit", "1", "Better source"], { cwd: vault });
    slipbox(["footnotes", "fn-cli.md", "rename", "2", "later"], { cwd: vault });
    expect(readFileSync(note, "utf8")).toBe("# F\r\n\r\nA claim[^1] here.[^later]\r\n\r\n[^1]: Better source\r\n[^later]: Second\r\n");
    expect(slipbox(["footnotes", "fn-cli.md", "rename", "later", "1"], { cwd: vault }).code).toBe(5); // taken
    expect(slipbox(["footnotes", "fn-cli.md", "rm", "nope"], { cwd: vault }).code).toBe(3);
    expect(slipbox(["footnotes", "fn-cli.md", "rm", "1", "--if-unchanged", "0000000000000000"], { cwd: vault }).code).toBe(5);
    slipbox(["footnotes", "fn-cli.md", "rm", "1"], { cwd: vault });
    expect(readFileSync(note, "utf8")).toBe("# F\r\n\r\nA claim here.[^later]\r\n\r\n[^later]: Second\r\n");
  });
  test("stat: which root a note is in, and its properties — the frontmatter, as the Info view shows it (3.19, 21.10)", () => {
    const r = slipbox(["stat", "people/kenji-mori.md", "--json"], { cwd: DEMO }).json.data;
    expect(r).toMatchObject({ root: DEMO, name: "halden" }); // its path, and the name pointers give it
    expect(r.vault).toBeUndefined();
    expect(r.properties).toMatchObject({ title: "Kenji Mori", office: { building: "Workshop", desk: 2 } });
    expect(slipbox(["stat", "people/kenji-mori.md"], { cwd: DEMO }).out).toMatch(/root\s+halden\n/);
  });
  test("problems: the demo's broken links; a path is never ambiguous (1.7)", () => {
    const p = slipbox(["problems", "--json"], { cwd: DEMO }).json.data;
    expect(p.broken.length).toBeGreaterThan(5);
    expect(p.ambiguous).toEqual([]); // home.md's contacts link names people/contacts.md, of the two
    expect(slipbox(["problems"], { cwd: DEMO }).out).toMatch(/^broken links \(\d+\)\n/);
  });
  test("problems --lint: your linter's findings on every note (3.21); a vault's config never picks the linter", () => {
    const cfg = join(sandbox, "lint.toml");
    const fake = `for f; do case "$f" in *home.md) printf '%s:4:2 error MD013/line-length Line length\\n' "$f";; esac; done; exit 1`;
    writeFileSync(cfg, `[lint]\nenabled = "on"\ncommand = ["sh", "-c", ${JSON.stringify(fake)}, "lint"]\n`);
    const r = slipbox(["problems", "--lint", "--json", "--config", cfg]).json;
    expect(r.data.lint).toEqual([{ file: "home.md", line: 4, column: 2, rule: "MD013", name: "line-length", description: "Line length" }]);
    expect(slipbox(["problems", "--lint", "--config", cfg]).out).toContain("lint (1)\n  home.md:4:2  MD013 line-length  Line length\n");
    expect(slipbox(["problems", "--json", "--config", cfg]).json.data.lint).toBeUndefined(); // only when asked
    writeFileSync(cfg, `[lint]\nenabled = "on"\ncommand = ["no-such-linter-slipbox-test"]\n`);
    expect(slipbox(["problems", "--lint", "--json", "--config", cfg]).json.warnings).toContain("lint: [lint] command couldn't run");
    writeFileSync(cfg, `[lint]\nenabled = "off"\n`);
    expect(slipbox(["problems", "--lint", "--json", "--config", cfg]).json.warnings).toContain('lint is off: [lint] enabled = "off"');
    // A vault's committed config can't name the program: its [lint] command is dropped, said so.
    mkdirSync(join(vault, ".slipbox"), { recursive: true });
    writeFileSync(join(vault, ".slipbox", "config.toml"), '[lint]\nenabled = "on"\ncommand = ["touch", "/tmp/slipbox-evil-lint"]\n');
    writeFileSync(cfg, "");
    const v = slipbox(["problems", "--json", "--config", cfg]).json;
    expect(v.warnings.some((w: string) => w.includes("lint.command") && w.includes("only your own config"))).toBe(true);
    rmSync(join(vault, ".slipbox", "config.toml"));
    rmSync(cfg);
  });
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
    expect(one).toStartWith("# Context: people/kenji-mori.md\n\nThe note: each with its path and lines, fenced as it is on disk.\n\n## people/kenji-mori.md\n\n`people/kenji-mori.md:1-21` — asked for\n\n```markdown\n---\ntitle: Kenji Mori\n");
    expect(one.match(/^## /gm)).toHaveLength(1);
    expect(slipbox(["context", "home", "--depth", "9"], { cwd: DEMO }).code).toBe(2);
    expect(slipbox(["context"], { cwd: DEMO }).code).toBe(2);
    // [context] in the config; --copy puts it on the clipboard (here, its file).
    const cfg = join(sandbox, "context.toml");
    writeFileSync(cfg, "[context]\ndepth = 0\nbacklinks = false\n");
    const c = slipbox(["context", "home", "--copy", "--json", "--config", cfg], { cwd: DEMO }).json.data;
    expect(c.files.map((f: { path: string }) => f.path)).toEqual(["home.md"]);
    expect(readFileSync(c.copied.file, "utf8")).toBe(c.text);
    expect(slipbox(["context", "home", "--copy", "--config", cfg], { cwd: DEMO }).out).toMatch(/^wrote .*clipboard\.txt: 1 file, \d+ chars\n$/);
    rmSync(cfg);
  });
  test("search: ranked by the words, scanned until `index` builds the index (6.x)", () => {
    const dir = join(sandbox, "search");
    cpSync(DEMO, dir, { recursive: true });
    const scan = slipbox(["search", "dome", "shutter", "--json"], { cwd: dir }).json;
    expect(scan.data.engine).toBe("scan");
    expect(scan.warnings.join()).toContain("slipbox index builds it");
    expect(slipbox(["index"], { cwd: dir }).out).toMatch(/^search index: \d+ files — \d+ indexed, 0 removed \(\d+ ms\)\n$/);
    const r = slipbox(["search", "dome", "shutter", "--json"], { cwd: dir }).json.data;
    expect(r.engine).toBe("index");
    const files = (x: { hits: { path: string }[] }) => x.hits.map((h) => h.path).sort();
    expect(files(r)).toEqual(files(scan.data)); // the same notes, either way
    expect(r.hits[0]).toMatchObject({ path: "projects/dome-refit.md", line: expect.any(Number), column: expect.any(Number), heading: expect.any(String) });
    // Human output: path:line:column, the section, the line with its words marked.
    expect(slipbox(["search", "木曽原"], { cwd: dir }).out).toBe("people/partners-and-names.md:84:35  Contacts — - Kiso-Hara Astronomical Society ([木曽原])\n");
    expect(slipbox(["info"], { cwd: dir }).out).toMatch(/\nsearch {4}auto — index: \d+ files\n/);
  });
  test("search's human output: words that meet or overlap marked once", () => {
    const dir = join(sandbox, "search-marks");
    mkdirSync(join(dir, ".slipbox"), { recursive: true });
    writeFileSync(join(dir, "ny.md"), "new york is new\n");
    expect(slipbox(["search", "new", '"new york"'], { cwd: dir }).out).toBe("ny.md:1:1  [new york] is [new]\n");
  });
  test("changed, diff, worktrees: this branch against main (5.13, 5.14)", () => {
    const dir = join(sandbox, "gitcli");
    mkdirSync(dir, { recursive: true });
    const git = (...args: string[]) => Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", dir, ...args]);
    writeFileSync(join(dir, "plan.md"), "# Plan\n\nfirst\n");
    expect(slipbox(["init", dir, "--name", "gitcli"]).code).toBe(0);
    if (git("init", "-q", "-b", "main").exitCode !== 0) return;
    git("add", "-A");
    git("commit", "-q", "-m", "start");
    git("checkout", "-q", "-b", "feat");
    writeFileSync(join(dir, "plan.md"), "# Plan\n\nsecond\n");
    expect(slipbox(["changed"], { cwd: dir }).out).toBe("M plan.md\n");
    expect(slipbox(["diff", "plan.md"], { cwd: dir }).out).toBe("@@ line 3\n  # Plan\n  \n- first\n+ second\n");
    expect(slipbox(["worktrees", "--json"], { cwd: dir }).json.data).toMatchObject([{ path: dir, branch: "feat", main: true, current: true }]);
    expect(slipbox(["changed", "--base", "nope"], { cwd: dir }).code).toBe(3);
    // Before a merge (20.21): what merging feat into main would break — committed work only.
    git("commit", "-q", "-am", "second");
    expect(slipbox(["merge-review", "feat", "--into", "main"], { cwd: dir }).out).toBe("merging feat into main: no link would break\n");
    // Histories with nothing in common: said so, not as an old git.
    git("checkout", "-q", "--orphan", "lone");
    git("commit", "-q", "-am", "lone");
    const lone = slipbox(["merge-review", "lone", "--into", "main"], { cwd: dir });
    expect(lone.code).not.toBe(0);
    expect(lone.err).toContain("lone and main have no commit in common: git won't merge them");
    expect(lone.err).not.toContain("2.38");
  });
  test("worktrees of a bare repository: none of them the main checkout (5.14)", () => {
    const top = join(sandbox, "gitbare");
    const src = join(top, "src");
    mkdirSync(src, { recursive: true });
    const git = (cwd: string, ...args: string[]) => Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]);
    writeFileSync(join(src, "plan.md"), "# Plan\n");
    if (git(src, "init", "-q", "-b", "main").exitCode !== 0) return;
    git(src, "add", "-A");
    git(src, "commit", "-q", "-m", "start");
    git(top, "clone", "-q", "--bare", src, "repo.git");
    const bare = join(top, "repo.git");
    git(bare, "worktree", "add", "-q", join(top, "w-main"), "main");
    git(bare, "worktree", "add", "-q", "-b", "feat", join(top, "w-feat"));
    const list = slipbox(["worktrees", "--json"], { cwd: join(top, "w-feat") }).json.data as { path: string; main: boolean }[];
    expect(list.map((w) => basename(w.path)).sort()).toEqual(["w-feat", "w-main"]);
    expect(list.map((w) => w.main)).toEqual([false, false]);
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
    mkdirSync(state, { recursive: true }); // keyed by path now the config (and its id) is gone
    writeFileSync(join(state, "session.json"), JSON.stringify({ version: 1, tabs: [{ panes: [{ path: "home.md", anchor: { heading: null, headingIndex: 0, offset: 0, line: 1 } }], active: 0 }], activeTab: 0, sidebar: true }));
    expect(slipbox(["history", "--json"]).json.data.open).toEqual([["home.md"]]);
    mkdirSync(join(vault, ".hidden"), { recursive: true });
    writeFileSync(join(vault, ".hidden", "note.md"), "hidden text\n");
    expect(slipbox(["read", ".hidden/note.md"]).out).toBe("hidden text\n");
    expect(slipbox(["find", "hidden", ".hidden/note.md", "--json"]).json.data.count).toBe(1);
  });
  test("review cycle 2: writers change only notes in the note's root; find survives a bad note; argument checks", () => {
    const outsideDir = mkdtempSync(join(tmpdir(), "slipbox-cli-out2-"));
    writeFileSync(join(outsideDir, "outside.md"), "keep\n");
    // With --root naming the vault, a path outside it is refused: never written.
    expect(slipbox(["write", "--root", vault, join(outsideDir, "outside.md"), "clobbered"]).code).not.toBe(0);
    expect(slipbox(["replace", "--root", vault, join(outsideDir, "outside.md"), "keep", "X"]).code).not.toBe(0);
    expect(readFileSync(join(outsideDir, "outside.md"), "utf8")).toBe("keep\n");
    // Named by its path alone, a loose file is the home vault's, its folder the root (17.2).
    expect(slipbox(["replace", join(outsideDir, "outside.md"), "keep", "kept"]).code).toBe(0);
    expect(readFileSync(join(outsideDir, "outside.md"), "utf8")).toBe("kept\n");
    // Files that aren't notes, or where the vault lists none.
    mkdirSync(join(vault, ".slipbox"), { recursive: true });
    // (With its identity: a vault without one gets it written on the next open, 17.18.)
    const cfg = '# vault config\n[vault]\nid = "4a1d3e5c7b9f0261"\nname = "halden"\n';
    writeFileSync(join(vault, ".slipbox", "config.toml"), cfg);
    expect(slipbox(["write", ".slipbox/config.toml", "x"]).code).toBe(5);
    expect(readFileSync(join(vault, ".slipbox", "config.toml"), "utf8")).toBe(cfg);
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
    expect(tasks.tasks.some((t: { raw: string }) => t.raw.includes("](../software/pipeline-cookbook.md)"))).toBe(true);
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
    const bl = slipbox(["backlinks", "people/kenji-mori.md", "--json"]).json.data.backlinks;
    expect(bl[0]).toHaveProperty("kind");
    expect(bl[0]).toHaveProperty("target");
    const created = slipbox(["write", "contacts", "# c", "--create", "--json"]);
    expect(created.json.data.shadows.sort()).toEqual(["equipment/contacts.md", "people/contacts.md"]);
    expect(created.json.warnings.join(" ")).toContain("naming it in a command takes a path");
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
    expect(ls.find((f: { path: string }) => f.path === "cfg/site.toml")).toMatchObject({ group: "data", format: "toml" });
    expect(ls.find((f: { path: string }) => f.path === "tool.py")).toMatchObject({ group: "text", format: "python" });
    expect(ls.some((f: { path: string }) => f.path === "pic.png")).toBe(false);
    expect(slipbox(["ls", "--json"]).json.data.some((f: { path: string }) => f.path === "tool.py")).toBe(false);
    expect(slipbox(["write", "pic.png", "x"]).code).toBe(5);
    expect(slipbox(["read", "cfg/site"]).code).toBe(3); // a file needs its extension
    // A data file renders and has an outline (16.11); a text file has neither, nor tasks.
    const r = slipbox(["render", "cfg/site.toml", "--plain"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/name\s+Halden Ridge\s+# the observatory/);
    expect(slipbox(["outline", "cfg/site.toml", "--json"]).json.data.headings.map((h: { text: string }) => h.text)).toEqual(["site"]);
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
    expect(slipbox(["backlinks", "home", "--json"]).json.data.backlinks.some((b: { from: string }) => b.from === "shape.py")).toBe(true);
    rmSync(join(vault, "shape.py"));
    expect(slipbox(["task", "tool.py"]).code).toBe(2);
    // Its links (16.15): a path that resolves, and it shows among the target's backlinks.
    writeFileSync(join(vault, "cfg", "links.yaml"), "docs: ../home.md\nnope: home.md\nname: not-a-link\n"); // relative to the file
    expect(slipbox(["links", "cfg/links.yaml", "--json"]).json.data.map((l: { target: string; status: string }) => [l.target, l.status])).toEqual([["../home.md", "note"]]);
    expect(slipbox(["backlinks", "home", "--json"]).json.data.backlinks.some((b: { from: string }) => b.from === "cfg/links.yaml")).toBe(true);
    rmSync(join(vault, "cfg", "links.yaml"));
    writeFileSync(join(vault, "cfg", "bad.json"), '{"a": }');
    expect(slipbox(["render", "cfg/bad.json"]).err).toContain("doesn't parse");
    for (const f of ["cfg/site.toml", "cfg/new.json", "cfg/bad.json", "tool.py", "pic.png"]) rmSync(join(vault, f));
  });
  test("mkdir: a folder in the vault, parents too; never over one, never outside", () => {
    const r = slipbox(["mkdir", "made/deeper", "--json"]);
    expect(r.code).toBe(0);
    expect(r.json.data).toEqual({ path: "made/deeper", created: true });
    expect(existsSync(join(vault, "made", "deeper"))).toBe(true);
    expect(slipbox(["mkdir", "made"]).code).toBe(5);
    expect(slipbox(["mkdir", "../outside"]).code).toBe(5);
    rmSync(join(vault, "made"), { recursive: true });
  });
  test("every CLI command is run by this file", () => {
    const missing = [...CLI_COMMANDS].filter((c) => !ran.has(c));
    expect(missing).toEqual([]);
  });
});

test("a move from a fresh process rewrites a code comment's path too: the grammar loaded before planning (20.19)", () => {
  const dir = mkdtempSync(join(tmpdir(), "slipbox-mvcode-"));
  mkdirSync(join(dir, ".slipbox"));
  writeFileSync(join(dir, "a.md"), "# A\n");
  writeFileSync(join(dir, "run.py"), "# see a.md\nprint(1)\n");
  const r = slipbox(["mv", "a", "docs/a", "--json"], { cwd: dir });
  expect(r.code).toBe(0);
  expect(readFileSync(join(dir, "run.py"), "utf8")).toBe("# see docs/a.md\nprint(1)\n");
});

describe("review cycle 6 (cli)", () => {
  /** A folder of its own and a state only it knows: what one test names, no other sees. */
  function own(prefix: string): { dir: string; env: Record<string, string> } {
    const dir = mkdtempSync(join(sandbox, prefix));
    return { dir, env: { XDG_STATE_HOME: join(dir, "state"), XDG_CACHE_HOME: join(dir, "cache"), XDG_DATA_HOME: join(dir, "data") } };
  }
  test("--plan where no .slipbox/ is made a plan of: init on a plain folder, name on a repository — exit 2, nothing written", () => {
    const { dir, env } = own("plan-");
    const repo = join(dir, "repo");
    mkdirSync(join(repo, ".git"), { recursive: true });
    writeFileSync(join(repo, "a.md"), "# A\n");
    const named = slipbox(["name", "planned", "--plan"], { cwd: repo, env });
    expect(named.code).toBe(2);
    expect(existsSync(join(repo, ".slipbox"))).toBe(false);
    const plain = join(dir, "plain");
    mkdirSync(plain);
    expect(slipbox(["init", "--plan"], { cwd: plain, env }).code).toBe(2);
    expect(existsSync(join(plain, ".slipbox"))).toBe(false);
    expect(slipbox(["apply", "--json"], { cwd: plain, env }).json.data).toEqual([]);
  });
  test("apply of a saved name: the machine's list learns the new name; undo with an argument is refused, nothing undone", () => {
    const { dir, env } = own("apply-name-");
    const root = join(dir, "root");
    mkdirSync(root);
    writeFileSync(join(root, "a.md"), "# A\n");
    const old = `fo${Date.now().toString(36)}`;
    const now = `ba${Date.now().toString(36)}`;
    expect(slipbox(["init", root, "--name", old], { env }).code).toBe(0);
    const planned = slipbox(["name", now, "--plan", "--json"], { cwd: root, env }).json.data.plan.id as string;
    expect(slipbox(["apply", planned], { cwd: root, env }).code).toBe(0);
    const elsewhere = join(dir, "elsewhere");
    mkdirSync(elsewhere);
    const names = slipbox(["folders", "--json"], { cwd: elsewhere, env }).json.data.map((f: { name: string }) => f.name);
    expect(names).toContain(now);
    expect(names).not.toContain(old);
    expect(slipbox(["resolve", `slipbox://${now}/a.md`], { cwd: elsewhere, env }).code).toBe(0);
    // More than undo takes (none): a usage error before anything is taken back.
    expect(slipbox(["undo", "x"], { cwd: root, env }).code).toBe(2);
    expect(slipbox(["info", "--json"], { cwd: root, env }).json.data.name).toBe(now);
  });
  test("extra arguments are refused, not dropped: changed, worktrees, diff; index takes a path only with --refresh", () => {
    expect(slipbox(["changed", "some-branch"]).code).toBe(2);
    expect(slipbox(["worktrees", "x"]).code).toBe(2);
    expect(slipbox(["diff", "home.md", "extra.md"]).code).toBe(2);
    const r = slipbox(["index", "handbook"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("only with --refresh");
  });
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
  test("review cycle 2: diagnostics takes the root from its file — from above it, by --root, nested, hidden", () => {
    const { dir, env } = own("diag-root-");
    // Neither servers nor the lint surface: slipbox's own checks only.
    const cfg = join(dir, "quiet.toml");
    writeFileSync(cfg, '[lsp]\nenabled = false\n\n[lint]\nenabled = "off"\n');
    const root = join(dir, "root");
    mkdirSync(join(root, ".slipbox"), { recursive: true });
    mkdirSync(join(root, "nest", ".slipbox"), { recursive: true });
    mkdirSync(join(root, ".hidden"));
    writeFileSync(join(root, "d.md"), "[b](sub/nothere.md)\n");
    writeFileSync(join(root, "nest", "n.md"), "[c](gone.md)\n");
    writeFileSync(join(root, ".hidden", "h.md"), "[e](elsewhere.md)\n");
    const run = (args: string[], cwd: string) => slipbox(["diagnostics", ...args, "--severity", "hint", "--config", cfg, "--json"], { cwd, env });
    const said = (r: Run, target: string) => {
      expect(r.code).toBe(0);
      expect(r.json.data.sources).toContainEqual({ name: "slipbox", kind: "slipbox", status: "ran" });
      expect(r.json.data.problems.some((p: { source: string; message: string }) => p.source === "slipbox" && p.message.includes(target))).toBe(true);
    };
    said(run(["root/d.md"], dir), "sub/nothere.md");
    said(run(["d.md", "--root", "root"], dir), "sub/nothere.md");
    said(run(["nest/n.md"], root), "gone.md");
    said(run([".hidden/h.md"], root), "elsewhere.md");
  });
  test("review cycle 2: link --from takes a target in a nested root by its path, and reaches a hidden one", () => {
    const { dir, env } = own("link-from-");
    const root = join(dir, "root");
    mkdirSync(join(root, ".slipbox"), { recursive: true });
    mkdirSync(join(root, "nest", ".slipbox"), { recursive: true });
    mkdirSync(join(root, ".hidden"));
    writeFileSync(join(root, "c.md"), "# C\n");
    writeFileSync(join(root, "nest", "x.md"), "# X\n");
    writeFileSync(join(root, ".hidden", "h.md"), "# H\n");
    expect(slipbox(["link", "nest/x.md", "--from", "c.md"], { cwd: root, env })).toMatchObject({ code: 0, out: "[X](nest/x.md)\n" });
    expect(slipbox(["link", join(root, "nest", "x.md"), "--from", "c.md"], { cwd: root, env })).toMatchObject({ code: 0, out: "[X](nest/x.md)\n" });
    // Never reached before: --from's note is the one that says which root this is, not the target.
    expect(slipbox(["link", ".hidden/h.md", "--from", "c.md"], { cwd: root, env })).toMatchObject({ code: 0, out: "[H](.hidden/h.md)\n" });
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
      expect(slipbox(["link", target, "--from", "ok.md"], { cwd: root, env })).toMatchObject({ code: 0, out: plain.out });
    }
  });
  test("review cycle 3: diagnostics runs slipbox's checks on a root note whose name starts with ..", () => {
    const { dir, env } = own("diag-dots-");
    const cfg = join(dir, "quiet.toml");
    writeFileSync(cfg, '[lsp]\nenabled = false\n\n[lint]\nenabled = "off"\n');
    const root = join(dir, "root");
    mkdirSync(join(root, ".slipbox"), { recursive: true });
    writeFileSync(join(root, "..draft.md"), "[x](missing.md)\n");
    const r = slipbox(["diagnostics", "..draft.md", "--severity", "hint", "--config", cfg, "--json"], { cwd: root, env });
    expect(r.code).toBe(0);
    expect(r.json.data.sources).toContainEqual({ name: "slipbox", kind: "slipbox", status: "ran" });
    expect(r.json.data.problems.some((p: { source: string; message: string }) => p.source === "slipbox" && p.message.includes("missing.md"))).toBe(true);
  });
  test("review cycle 3: --not, vault-moved's, is no option any more", () => {
    const r = slipbox(["ls", "--not"], { cwd: DEMO });
    expect(r.code).toBe(2);
    expect(r.err).toContain("unknown option: --not");
  });
  test("review cycle 3: mv and cp take the new path from the root, the current folder (./, ../), or absolute", () => {
    const { dir, env } = own("dest-");
    const root = join(dir, "root");
    mkdirSync(join(root, ".slipbox"), { recursive: true });
    mkdirSync(join(root, "sub"));
    writeFileSync(join(root, "ok.md"), "# OK\n");
    writeFileSync(join(root, "sub", "x.md"), "# X\n");
    writeFileSync(join(root, "sub", "z.md"), "# Z\n");
    // Absolute, inside the root: where it says, not a tree of its folders under the root.
    expect(slipbox(["cp", "ok.md", join(root, "copy.md"), "--json"], { cwd: root, env }).json.data.to).toBe("copy.md");
    expect(existsSync(join(root, "copy.md"))).toBe(true);
    // Absolute, outside: refused, nothing written.
    expect(slipbox(["mv", "ok.md", "/etc/x.md"], { cwd: root, env }).code).toBe(5);
    expect(slipbox(["cp", "ok.md", "/etc/x.md"], { cwd: root, env }).code).toBe(5);
    expect(existsSync(join(root, "etc"))).toBe(false);
    expect(existsSync(join(root, "ok.md"))).toBe(true);
    // From the current folder when it says so.
    const sub = join(root, "sub");
    expect(slipbox(["mv", "x.md", "./y.md"], { cwd: sub, env }).code).toBe(0);
    expect(existsSync(join(sub, "y.md"))).toBe(true);
    expect(slipbox(["mv", "z.md", "../z.md"], { cwd: sub, env }).code).toBe(0);
    expect(existsSync(join(root, "z.md"))).toBe(true);
  });
  test("help lists every flag each command takes, on the command's own lines", () => {
    const text = new Map<string, string>();
    let at: string | null = null;
    for (const line of slipbox(["help"]).out.split("\n")) {
      const m = /^ {2}slipbox (\S+)/.exec(line);
      if (m) at = m[1]!;
      else if (!/^ {20,}\S/.test(line)) at = null;
      if (at) text.set(at, `${text.get(at) ?? ""}${line}\n`);
    }
    for (const [command, flags] of Object.entries(FLAGS)) {
      for (const f of flags) expect(`${command}: ${text.get(command) ?? ""}`).toContain(`--${f}`);
    }
  });
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

describe("review cycle 3 (core, cli)", () => {
  test("name on a folder never named, its [vault] table one the edit can't follow: refused, the file as it was", () => {
    const dir = mkdtempSync(join(sandbox, "name-dotted-"));
    const xdg = { XDG_STATE_HOME: join(dir, "state"), XDG_CACHE_HOME: join(dir, "cache"), XDG_DATA_HOME: join(dir, "data") };
    const root = join(dir, "root");
    mkdirSync(join(root, ".slipbox"), { recursive: true });
    writeFileSync(join(root, "a.md"), "# A\n");
    for (const text of ['vault.aliases = ["n"]\n\n[render]\ninset = 2\n', '[ vault ]\naliases = ["n"]\n']) {
      writeFileSync(join(root, ".slipbox", "config.toml"), text);
      const r = slipbox(["name", "dotted"], { cwd: root, env: xdg });
      expect(r.code).not.toBe(0);
      expect(r.err).toContain("edit it by hand");
      expect(readFileSync(join(root, ".slipbox", "config.toml"), "utf8")).toBe(text);
    }
  });
});

describe("the CLI's edges: help flags, error paths, empty states", () => {
  /** A root of its own, with a state, cache and config only it knows. */
  function fresh(prefix: string): { root: string; dir: string; env: Record<string, string> } {
    const dir = mkdtempSync(join(sandbox, prefix));
    const root = join(dir, "root");
    mkdirSync(join(root, ".slipbox"), { recursive: true });
    const env = { XDG_STATE_HOME: join(dir, "state"), XDG_CACHE_HOME: join(dir, "cache"), XDG_DATA_HOME: join(dir, "data"), XDG_CONFIG_HOME: join(dir, "config"), SLIPBOX_CONFIG: join(dir, "config", "slipbox", "config.toml") };
    return { root, dir, env };
  }
  test("-h after any command is the help, -V the version; --json wraps each", () => {
    const h = slipbox(["read", "home", "-h"]);
    expect(h.code).toBe(0);
    expect(h.out).toStartWith("slipbox ");
    expect(h.out).toContain("Exit codes: 0 ok, 1 error, 2 usage, 3 not found");
    expect(slipbox(["read", "-h", "--json"]).json).toMatchObject({ ok: true, command: "help", data: { text: h.out } });
    const v = slipbox(["ls", "-V"]);
    expect(v.code).toBe(0);
    expect(v.out).toMatch(/^slipbox \d+\.\d+\.\d+\n$/);
    expect(slipbox(["-V", "--json"]).json).toMatchObject({ ok: true, command: "version", data: { version: v.out.trim().slice("slipbox ".length) } });
  });
  test("footnotes: an unknown subcommand, a missing label, text or position, a line not there — usage errors, nothing written", () => {
    const { root, env } = fresh("fn-usage-");
    const text = "# F\n\nA claim[^1] here.\n\n[^1]: The source\n";
    writeFileSync(join(root, "fn.md"), text);
    const cases: [string[], string][] = [
      [["frob"], "footnotes: unknown subcommand frob (add, edit, rm, rename)"],
      [["add"], "footnotes <note> add <line[:col]> <text>"],
      [["add", "3"], "footnotes <note> add <line[:col]> <text>"],
      [["add", "x3", "a note"], "footnotes <note> add <line[:col]> <text>"],
      [["add", "9", "a note"], "fn.md has no line 9"],
      [["add", "0", "a note"], "fn.md has no line 0"],
      [["edit"], "footnotes edit needs the footnote's label"],
      [["edit", "1"], "footnotes <note> edit <label> <text>"],
      [["rename", "1"], "footnotes <note> rename <label> <new-label>"],
      [["rm"], "footnotes rm needs the footnote's label"],
    ];
    for (const [args, message] of cases) {
      const r = slipbox(["footnotes", "fn.md", ...args], { cwd: root, env });
      expect(`${args.join(" ")}: ${r.code} ${r.err}`).toBe(`${args.join(" ")}: 2 slipbox: ${message}\n`);
    }
    expect(slipbox(["footnotes", "fn.md", "frob", "--json"], { cwd: root, env }).json).toMatchObject({ ok: false, error: { code: 2 } });
    expect(readFileSync(join(root, "fn.md"), "utf8")).toBe(text);
  });
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
    expect(dry.out).toBe("would replace 2 in p.md\n1:1: Asterion and Aster\n    → Vegaion and Aster\n1:14: Asterion and Aster\n     → Asterion and Vega\n");
    expect(readFileSync(join(root, "p.md"), "utf8")).toBe("Asterion and Aster\nnone here\n");
    expect(slipbox(["replace", "p.md", "Aster", "Vega"], { cwd: root, env }).out).toBe("replaced 2 in p.md\n");
  });
  test("task: a line that isn't a whole number from 1 is a usage error, nothing ticked", () => {
    const { root, env } = fresh("task-usage-");
    writeFileSync(join(root, "t.md"), "- [ ] one\n");
    for (const line of ["0", "abc", "1.5", "-1"]) {
      const r = slipbox(["task", "t.md", "--", line], { cwd: root, env });
      expect(r.code).toBe(2);
      expect(r.err).toBe("slipbox: the task's line must be a whole number from 1\n");
    }
    expect(readFileSync(join(root, "t.md"), "utf8")).toBe("- [ ] one\n");
  });
  test("send: no remote editor set, one that won't start, one that fails — exit 1, said; --server where no nvim answers — exit 3", () => {
    const { root, dir, env } = fresh("send-errors-");
    writeFileSync(join(root, "n.md"), "# N\n");
    const cfg = (name: string, remote: string) => {
      const p = join(dir, `${name}.toml`);
      writeFileSync(p, `[editor]\nremote = ${remote}\n`);
      return p;
    };
    const none = slipbox(["send", "n.md", "--config", cfg("none", "[]")], { cwd: root, env });
    expect(none).toMatchObject({ code: 1, err: "slipbox: set [editor] remote in the config to send notes to a running editor\n" });
    const gone = slipbox(["send", "n.md", "--config", cfg("gone", '["slipbox-no-such-editor {file}"]')], { cwd: root, env });
    expect(gone.code).toBe(1);
    expect(gone.err).toStartWith("slipbox: couldn't start slipbox-no-such-editor");
    const fails = slipbox(["send", "n.md", "--line", "3", "--config", cfg("fail", '["false {file} {line}"]')], { cwd: root, env });
    expect(fails).toMatchObject({ code: 1, err: `slipbox: false ${join(root, "n.md")} exited with 1\n` });
    // The nvim preset names a {server}: --server must name one that answers.
    const sock = join(dir, "no-nvim.sock");
    const r = slipbox(["send", "n.md", "--server", sock, "--config", cfg("nvim", '["nvim"]'), "--json"], { cwd: root, env });
    expect(r.code).toBe(3);
    expect(r.json).toMatchObject({ ok: false, error: { code: 3, message: `no nvim answers at ${sock}` } });
  });
  test("history: nothing read yet, said; a read note since deleted marked; the active tab's active window is current", () => {
    const { root, env } = fresh("history-");
    writeFileSync(join(root, "a.md"), "# A\n");
    writeFileSync(join(root, "b.md"), "# B\n");
    expect(slipbox(["history"], { cwd: root, env })).toMatchObject({ code: 0, out: "nothing read in the TUI yet\n" });
    expect(slipbox(["history", "--json"], { cwd: root, env }).json.data).toEqual({ read: [], open: [], activeTab: null, current: null });
    const state = slipbox(["info", "--json"], { cwd: root, env }).json.data.state as string;
    mkdirSync(state, { recursive: true });
    writeFileSync(
      join(state, "positions.json"),
      JSON.stringify({
        "a.md": { heading: null, headingIndex: 0, offset: 0, line: 2, at: "2026-09-01T10:00:00.000Z" },
        "gone.md": { heading: null, headingIndex: 0, offset: 0, line: 7, at: "2026-09-02T10:00:00.000Z" },
      }),
    );
    const anchor = { heading: null, headingIndex: 0, offset: 0, line: 1 };
    writeFileSync(
      join(state, "session.json"),
      JSON.stringify({ version: 1, tabs: [{ panes: [{ path: "a.md", anchor }], active: 0 }, { panes: [{ path: "a.md", anchor }, { path: "b.md", anchor }], active: 1 }], activeTab: 1, sidebar: true }),
    );
    expect(slipbox(["history"], { cwd: root, env }).out).toBe("2026-09-02 10:00  gone.md:7  (deleted)\n2026-09-01 10:00  a.md:2\n");
    const h = slipbox(["history", "--json"], { cwd: root, env }).json.data;
    expect(h.read.map((r: { path: string; exists: boolean }) => [r.path, r.exists])).toEqual([
      ["gone.md", false],
      ["a.md", true],
    ]);
    expect(h).toMatchObject({ open: [["a.md"], ["a.md", "b.md"]], activeTab: 1, current: "b.md" });
  });
  test("commands: the human list gives each command's CLI equivalent, or (interaction)", () => {
    const out = slipbox(["commands"]).out;
    expect(out).toMatch(/^task\.toggle +Toggle task +slipbox task <note> <line>$/m);
    expect(out).toMatch(/^cursor\.left +Cursor left +\(interaction\)$/m);
    expect(out.split("\n").filter(Boolean)).toHaveLength(slipbox(["commands", "--json"]).json.data.length);
  });
  test("themes: the configured one marked current; a user theme listed with its file", () => {
    const { root, dir, env } = fresh("themes-");
    const themes = join(dir, "config", "slipbox", "themes");
    mkdirSync(themes, { recursive: true });
    writeFileSync(join(themes, "mine.yaml"), 'scheme: "mine"\n');
    writeFileSync(join(dir, "config", "slipbox", "config.toml"), 'theme = "nord"\n');
    const out = slipbox(["themes"], { cwd: root, env }).out;
    expect(out).toContain("* nord\n");
    expect(out).toContain("  tokyo-night\n");
    expect(out).toContain(`  mine  (${join(themes, "mine.yaml")})\n`);
    const list = slipbox(["themes", "--json"], { cwd: root, env }).json.data as { name: string; source: string; current: boolean; path?: string }[];
    expect(list.filter((t) => t.current).map((t) => t.name)).toEqual(["nord"]);
    expect(list.find((t) => t.name === "mine")).toEqual({ name: "mine", source: "user", path: join(themes, "mine.yaml"), current: false });
  });
  test("doctor in a root you don't trust (23.8): what it leaves out, said; in one your config trusts, nothing to say", () => {
    const { root, dir, env } = fresh("doctor-trust-");
    writeFileSync(join(root, "Gemfile"), "source 'https://rubygems.org'\n");
    writeFileSync(join(root, "app.rb"), "puts 1\n");
    const j = slipbox(["doctor", "app.rb", "--json"], { cwd: root, env }).json;
    expect(j.data).toMatchObject({ trusted: false, skipped: [{ name: "ruby-lsp", why: "it runs the project's Gemfile (Bundler)" }] });
    expect(j.warnings.some((w: string) => w.includes("isn't a root you trust") && w.includes("ruby-lsp not run (it runs the project's Gemfile (Bundler))"))).toBe(true);
    const human = slipbox(["doctor", "app.rb"], { cwd: root, env });
    expect(human.out).toContain(`  ${"ruby-lsp".padEnd(28)} not run here: it runs the project's Gemfile (Bundler)\n`);
    // Trusted in your config: run as anywhere, nothing said.
    const cfg = join(dir, "trusting.toml");
    writeFileSync(cfg, `[trust]\nroots = [${JSON.stringify(root)}]\n`);
    const t = slipbox(["doctor", "app.rb", "--config", cfg, "--json"], { cwd: root, env }).json;
    expect(t.data).toMatchObject({ trusted: true, skipped: [], limits: [] });
    expect(t.warnings.filter((w: string) => w.includes("isn't a root you trust"))).toEqual([]);
  });

  test("doctor: language servers off is a warning; with installing off, a server not found says so, never 'installs when needed'", () => {
    const { root, dir, env } = fresh("doctor-off-");
    const cfg = join(dir, "off.toml");
    writeFileSync(cfg, "[lsp]\nenabled = false\nauto_install = false\n");
    const j = slipbox(["doctor", "--config", cfg, "--json"], { cwd: root, env }).json;
    expect(j.warnings).toContain("language servers are off: [lsp] enabled = false");
    type Server = { name: string; status: string; package: string | null };
    const servers = (j.data as { servers: Server[] }[]).flatMap((g) => g.servers);
    expect(servers.some((s) => s.status === "installable")).toBe(false);
    const off = servers.filter((s) => s.status !== "found" && s.package);
    expect(off.length).toBeGreaterThan(0);
    const r = slipbox(["doctor", "--config", cfg], { cwd: root, env });
    expect(r.err).toContain("slipbox: warning: language servers are off: [lsp] enabled = false\n");
    expect(r.out).not.toContain("slipbox installs");
    for (const s of off) expect(r.out).toContain(`  ${s.name.padEnd(28)} not found, and installing is off ([lsp] auto_install): ${s.package}`);
    // On, nothing to warn of here but the root's trust (said for every root you don't trust, 23.8).
    expect(slipbox(["doctor", "--json"], { cwd: root, env }).json.warnings.filter((w: string) => !w.includes("isn't a root you trust"))).toEqual([]);
  });
  test("mkdir: no path is a usage error; an absolute path in the root is made, one outside refused", () => {
    const { root, dir, env } = fresh("mkdir-");
    expect(slipbox(["mkdir"], { cwd: root, env })).toMatchObject({ code: 2, err: "slipbox: missing path\n" });
    expect(slipbox(["mkdir", join(root, "abs", "deep"), "--json"], { cwd: root, env }).json.data).toEqual({ path: "abs/deep", created: true });
    expect(existsSync(join(root, "abs", "deep"))).toBe(true);
    const out = slipbox(["mkdir", join(dir, "beside"), "--json"], { cwd: root, env });
    expect(out.code).toBe(5);
    expect(out.json.error!.message).toBe(`${join(dir, "beside")} is outside the root (${root})`);
    expect(existsSync(join(dir, "beside"))).toBe(false);
  });
  test("cp, rm and trash restore of a namesake: each link by name it sends elsewhere is warned (21.3)", () => {
    const { root, env } = fresh("namesake-");
    mkdirSync(join(root, "Recipes", "Baking"), { recursive: true });
    mkdirSync(join(root, "Archive", "Old", "Older"), { recursive: true });
    writeFileSync(join(root, "Home.md"), "# Home\n\nSee [[Pie]] now.\n");
    writeFileSync(join(root, "Recipes", "Baking", "Pie.md"), "# P\n");
    writeFileSync(join(root, "Archive", "Old", "Older", "Pie.md"), "# P2\n");
    // A nearer Pie made: [[Pie]] reaches it now, the shortest path.
    const cp = slipbox(["cp", "Recipes/Baking/Pie.md", "Pie.md", "--json"], { cwd: root, env }).json;
    expect(cp.ok).toBe(true);
    expect(cp.warnings).toContain("Home.md:3: [[Pie]] reached Recipes/Baking/Pie.md; it reaches Pie.md now");
    const rm = slipbox(["rm", "Pie.md"], { cwd: root, env });
    expect(rm.code).toBe(0);
    expect(rm.err).toContain("slipbox: warning: Home.md:3: [[Pie]] reached Pie.md; it reaches Recipes/Baking/Pie.md now\n");
    const back = slipbox(["trash", "restore", "Pie.md", "--json"], { cwd: root, env }).json;
    expect(back.warnings).toContain("Home.md:3: [[Pie]] reached Recipes/Baking/Pie.md; it reaches Pie.md now");
    // A name no other note has sends nothing elsewhere: nothing said.
    expect(slipbox(["cp", "Home.md", "Other.md", "--json"], { cwd: root, env }).json.warnings).toEqual([]);
  });
});

describe("the launcher (scripts/install-local.sh)", () => {
  test("run inside a repository, it never runs the repository's bunfig.toml preload, nor reads its .env", () => {
    const bin = mkdtempSync(join(sandbox, "bin-"));
    const made = Bun.spawnSync(["bash", join(import.meta.dir, "..", "scripts", "install-local.sh")], { env: { ...process.env, SLIPBOX_BIN_DIR: bin } });
    expect(made.exitCode).toBe(0);
    // A cloned repository: Bun, started in it, would run its preload first and load its .env.
    const repo = mkdtempSync(join(sandbox, "hostile-"));
    const ran = join(repo, "preload-ran");
    writeFileSync(join(repo, "evil.ts"), `require("node:fs").writeFileSync(${JSON.stringify(ran)}, process.env.SLIPBOX_CONFIG ?? "");\n`);
    writeFileSync(join(repo, "bunfig.toml"), 'preload = ["./evil.ts"]\n');
    writeFileSync(join(repo, ".env"), `SLIPBOX_CONFIG=${join(repo, "planted.toml")}\n`);
    writeFileSync(join(repo, "planted.toml"), "[ui]\ntheme = 7\n"); // a warning, if it were read
    writeFileSync(join(repo, "a.md"), "# A\n");
    const { SLIPBOX_CONFIG: _, ...clean } = { ...process.env, ...env };
    const r = Bun.spawnSync([join(bin, "slipbox"), "ls", "--json"], { cwd: repo, env: clean });
    expect(r.exitCode).toBe(0);
    expect(existsSync(ran)).toBe(false);
    expect(JSON.parse(r.stdout.toString()).warnings ?? []).toEqual([]);
  });
});
