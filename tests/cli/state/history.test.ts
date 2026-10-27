import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCliProcessSandbox } from "../../support/cli-process.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { sandbox, vault, slipbox } = makeCliProcessSandbox();

describe("editors and state", () => {
  test("send runs the configured remote editor with the note and line", () => {
    const r = slipbox(["send", "operations-handbook", "--line", "42", "--json"]).json.data;
    expect(r.commands[0]).toEqual(["true", join(vault, "handbook", "operations-handbook.md"), "42"]);
    expect(slipbox(["send", "home", "--line", "0"]).code).toBe(2);
  });
  test("history lists what the TUI read, newest first", () => {
    // The vault's state folder, as the TUI makes it: whether a test before this one made it or not.
    const r = slipbox(["info", "--json"]).json.data;
    mkdirSync(r.state, { recursive: true });
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
  test("review cycle 1: diagnostics carry no escapes; history lists open tabs; a note outside the walk reads", () => {
    mkdirSync(join(vault, ".slipbox"), { recursive: true });
    writeFileSync(join(vault, ".slipbox", "config.toml"), '[render]\nglyphs = "\\u001b]0;PWNED\\u0007"\n');
    const r = slipbox(["ls"]);
    expect(r.err).not.toContain("\u001b");
    rmSync(join(vault, ".slipbox", "config.toml"));
    const state = slipbox(["info", "--json"]).json.data.state;
    mkdirSync(state, { recursive: true }); // keyed by path now the config (and its id) is gone
    writeFileSync(
      join(state, "session.json"),
      JSON.stringify({
        version: 1,
        tabs: [
          { panes: [{ path: "home.md", anchor: { heading: null, headingIndex: 0, offset: 0, line: 1 } }], active: 0 },
        ],
        activeTab: 0,
        sidebar: true,
      }),
    );
    expect(slipbox(["history", "--json"]).json.data.open).toEqual([["home.md"]]);
    mkdirSync(join(vault, ".hidden"), { recursive: true });
    writeFileSync(join(vault, ".hidden", "note.md"), "hidden text\n");
    expect(slipbox(["read", ".hidden/note.md"]).out).toBe("hidden text\n");
    expect(slipbox(["find", "hidden", ".hidden/note.md", "--json"]).json.data.count).toBe(1);
  });
  test("review cycle 2: a malformed stale file is ignored; a live one is reported, a dead one pruned", () => {
    const state = slipbox(["info", "--json"]).json.data.state;
    mkdirSync(join(state, "dirty"), { recursive: true });
    writeFileSync(join(state, "dirty", "bad.json"), JSON.stringify({ pid: process.pid }));
    expect(slipbox(["ls"]).code).toBe(0);
    writeFileSync(
      join(state, "dirty", `${process.pid}.json`),
      JSON.stringify({ pid: process.pid, paths: ["home.md"] }),
    );
    const r = slipbox(["ls", "--json"]);
    expect(r.json.stale).toEqual(["home.md"]);
    expect(slipbox(["ls"]).err).toContain("unsaved changes in a running slipbox: home.md");
    writeFileSync(join(state, "dirty", "999999.json"), JSON.stringify({ pid: 999999, paths: ["dead.md"] }));
    expect(slipbox(["ls", "--json"]).json.stale).toEqual(["home.md"]);
    expect(existsSync(join(state, "dirty", "999999.json"))).toBe(false);
    rmSync(join(state, "dirty"), { recursive: true, force: true });
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
  test("history: nothing read yet, said; a read note since deleted marked; the active tab's active window is current", () => {
    const { root, env } = fresh("history-");
    writeFileSync(join(root, "a.md"), "# A\n");
    writeFileSync(join(root, "b.md"), "# B\n");
    expect(slipbox(["history"], { cwd: root, env })).toMatchObject({ code: 0, out: "nothing read in the TUI yet\n" });
    expect(slipbox(["history", "--json"], { cwd: root, env }).json.data).toEqual({
      read: [],
      open: [],
      activeTab: null,
      current: null,
    });
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
      JSON.stringify({
        version: 1,
        tabs: [
          { panes: [{ path: "a.md", anchor }], active: 0 },
          {
            panes: [
              { path: "a.md", anchor },
              { path: "b.md", anchor },
            ],
            active: 1,
          },
        ],
        activeTab: 1,
        sidebar: true,
      }),
    );
    expect(slipbox(["history"], { cwd: root, env }).out).toBe(
      "2026-09-02 10:00  gone.md:7  (deleted)\n2026-09-01 10:00  a.md:2\n",
    );
    const h = slipbox(["history", "--json"], { cwd: root, env }).json.data;
    expect(h.read.map((r: { path: string; exists: boolean }) => [r.path, r.exists])).toEqual([
      ["gone.md", false],
      ["a.md", true],
    ]);
    expect(h).toMatchObject({ open: [["a.md"], ["a.md", "b.md"]], activeTab: 1, current: "b.md" });
  });
});
