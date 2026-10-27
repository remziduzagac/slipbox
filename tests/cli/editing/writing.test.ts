import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeCliProcessSandbox } from "../../support/cli-process.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { MAIN, sandbox, vault, env, slipbox, note } = makeCliProcessSandbox();

describe("writing", () => {
  test("task: lists the note's tasks, toggles one, --check and --uncheck set it", () => {
    const list = slipbox(["task", "2026-09-14-weekly", "--json"]).json.data.tasks;
    const open = list.find((t: { checked: boolean }) => !t.checked);
    expect(open).toBeDefined();
    const r = slipbox(["task", "2026-09-14-weekly", String(open.line), "--json"]).json.data;
    expect(r).toMatchObject({ checked: true, changed: true });
    expect(note("meetings/2026-09-14-weekly.md").split("\n")[open.line - 1]).toContain("[x]");
    expect(slipbox(["task", "2026-09-14-weekly", String(open.line), "--check", "--json"]).json.data.changed).toBe(
      false,
    );
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
});

describe("the vault and the tool", () => {
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
    for (const bad of [".slipbox/evil", ".git/hooks/x", "node_modules/pkg/x", "odd/"])
      expect(slipbox(["write", bad, "x", "--create"]).code).toBe(5);
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
  test("review cycle 3: an empty write never empties a note; append a block; previews show lines", () => {
    const before = note("people/kenji-mori.md");
    const empty = slipbox(["write", "kenji-mori", "--stdin"], { stdin: "" });
    expect(empty.code).toBe(2);
    expect(note("people/kenji-mori.md")).toBe(before);
    writeFileSync(join(vault, "table-end.md"), "| a | b |\n| - | - |\n| 1 | 2 |\n");
    slipbox(["write", "table-end", "A new paragraph.", "--append", "--paragraph"]);
    expect(readFileSync(join(vault, "table-end.md"), "utf8")).toBe(
      "| a | b |\n| - | - |\n| 1 | 2 |\n\nA new paragraph.\n",
    );
    writeFileSync(join(vault, "partial.md"), "Asterion and Aster\n");
    const changes = slipbox(["replace", "partial", "Aster", "Vega", "--dry-run", "--json"]).json.data.changes;
    expect(changes[0]).toMatchObject({
      line: 1,
      column: 1,
      text: "Asterion and Aster",
      textAfter: "Vegaion and Aster",
    });
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
  test("review cycle 5: blank text never empties a note; --from picks among notes sharing a name", () => {
    const before = note("people/kenji-mori.md");
    expect(slipbox(["write", "kenji-mori", ""]).code).toBe(2);
    expect(slipbox(["write", "kenji-mori", "--stdin"], { stdin: " \n\n" }).code).toBe(2);
    expect(slipbox(["write", "kenji-mori", "", "--append"]).code).toBe(2);
    expect(note("people/kenji-mori.md")).toBe(before);
    expect(slipbox(["read", "contacts", "--json"]).code).toBe(4);
    expect(slipbox(["read", "contacts", "--from", "people/kenji-mori.md", "--json"]).json.data.path).toBe(
      "people/contacts.md",
    );
    expect(slipbox(["read", "contacts", "--from", "equipment/instrument-inventory.md", "--json"]).json.data.path).toBe(
      "equipment/contacts.md",
    );
  });
  test("review cycle 5: secondary refusals (from mutation testing)", () => {
    expect(slipbox(["write", "brand-new-5", "x", "--create", "--if-unchanged", "abc"]).code).toBe(5);
    expect(existsSync(join(vault, "brand-new-5.md"))).toBe(false);
    const list = slipbox(["task", "2026-09-14-weekly", "--json"]).json.data;
    const done = list.tasks.find((t: { checked: boolean }) => t.checked);
    const before = note("meetings/2026-09-14-weekly.md");
    // A stale sha is refused even when the toggle would change nothing.
    expect(
      slipbox(["task", "2026-09-14-weekly", String(done.line), "--check", "--if-unchanged", "0000000000000000"]).code,
    ).toBe(5);
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
    const plain = Bun.spawnSync(["bun", MAIN, "render", "home", "--color", "always", "--theme", "nord"], {
      cwd: vault,
      env,
    }).stdout.toString();
    const other = Bun.spawnSync(["bun", MAIN, "render", "home", "--color", "always", "--theme", "gruvbox-dark"], {
      cwd: vault,
      env,
    }).stdout.toString();
    expect(plain).toContain("\x1b[");
    expect(plain).not.toBe(other); // the theme's colours, not the default's
    // This config's command names no {server}: --server can't apply, and says so.
    const sent = slipbox(["send", "home", "--server", join(sandbox, "no-nvim.sock"), "--json"]);
    expect(sent.code).toBe(0);
    expect(sent.json.warnings.join(" ")).toContain("--server has no effect");
  });
  test("write --create --allow-empty with no text makes an empty note; no text is refused otherwise, as before (DF-D16)", () => {
    const made = slipbox(["write", "later/empty-note", "--create", "--allow-empty", "--json"]);
    expect(made.code).toBe(0);
    expect(made.json.data).toMatchObject({ path: "later/empty-note.md", created: true, previousSha: null });
    expect(readFileSync(join(vault, "later", "empty-note.md"), "utf8")).toBe("");
    // Without --allow-empty, nothing made; on a note that's there, nothing emptied.
    const bare = slipbox(["write", "later/other", "--create"]);
    expect(bare.code).toBe(2);
    expect(bare.err).toContain("--create --allow-empty makes an empty note");
    expect(existsSync(join(vault, "later", "other.md"))).toBe(false);
    writeFileSync(join(vault, "later", "kept.md"), "text\n");
    expect(slipbox(["write", "later/kept", "--allow-empty"]).code).toBe(2);
    expect(readFileSync(join(vault, "later", "kept.md"), "utf8")).toBe("text\n");
    rmSync(join(vault, "later"), { recursive: true });
  });
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
});
