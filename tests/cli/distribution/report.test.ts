import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { VERSION } from "../../../src/version.ts";
import { makeCliProcessSandbox } from "../../support/cli-process.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { sandbox, slipbox } = makeCliProcessSandbox();

describe("the vault and the tool", () => {
  test("report: the facts and the bug form's address, anywhere, before any vault is looked for (RPT-D5)", () => {
    const dir = mkdtempSync(join(sandbox, "report-"));
    const state = join(dir, "state");
    // What this machine's own terminal would add, emptied: only what the test sets is there.
    const blank = Object.fromEntries(
      [
        "TERM_PROGRAM",
        "TERM_PROGRAM_VERSION",
        "ZELLIJ",
        "STY",
        "HERDSMAN_ENV",
        "HERDR_ENV",
        "SSH_CONNECTION",
        "SSH_CLIENT",
      ].map((k) => [k, ""]),
    );
    const at = (cwd: string, args: string[] = []) =>
      slipbox(["report", ...args], {
        cwd,
        env: {
          ...blank,
          XDG_STATE_HOME: state,
          TERM: "xterm-256color",
          TMUX: "/tmp/tmux-1/default,1,0",
          SSH_TTY: "/dev/pts/9",
        },
      });
    const r = at(dir);
    expect(r.code).toBe(0);
    expect(r.out).toContain(`Version         ${VERSION} (`);
    expect(r.out).toMatch(/^Terminal {8}TERM xterm-256color, inside tmux, over SSH$/m);
    expect(r.out).not.toContain("/dev/pts/9");
    expect(r.out).toContain("https://github.com/remziduzagac/slipbox/issues/new?template=bug_report.yml&version=");
    // Piped: no size, since the columns would be the pipe's reader's.
    expect(r.out).not.toMatch(/\d+×\d+/);
    const j = at(dir, ["--json"]).json;
    expect(j).toMatchObject({ ok: true, command: "report" });
    expect(Object.keys(j.data)).toEqual(["facts", "fields", "body", "url"]);
    expect(j.data.facts).toMatchObject({ version: VERSION, installedBy: "source", channel: null, release: null });
    expect(Object.keys(j.data.fields)).toEqual(["version", "install", "platform", "terminal"]);
    expect(j.data.body).toStartWith(`### Version\n\n${VERSION} (`);
    expect(new URL(j.data.url).searchParams.get("terminal")).toBe(j.data.fields.terminal);
    // In a vault whose config is broken, it says the same, warns of nothing, and writes no state.
    const broken = join(dir, "broken");
    mkdirSync(join(broken, ".slipbox"), { recursive: true });
    writeFileSync(join(broken, ".slipbox", "config.toml"), "[links\nstyle = = \n");
    const there = at(broken, ["--json"]);
    expect(there.code).toBe(0);
    expect(there.json.warnings).toEqual([]);
    expect(there.json.data.fields).toEqual(j.data.fields);
    expect(existsSync(state)).toBe(false);
    // An argument, or a flag it doesn't take: refused.
    expect(at(dir, ["screen"]).code).toBe(2);
    expect(at(dir, ["--dry-run"]).err).toContain("--dry-run isn't an option of report");
  });
});
