import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../../../src/core/application/config/config.ts";
import { editorArgv, splitCommand } from "../../../../src/core/documents/external-editors/editor.ts";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("editor hand-off argv (4.1, 4.2, 4.12)", () => {
  test("[editor] remote: a list of commands, or one string as one command", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-cfg-"));
    try {
      const one = join(dir, "one.toml");
      writeFileSync(one, '[editor]\nremote = "code -g {file}:{line}"\n');
      expect(loadConfig({ vaultRoot: null, configFile: one }).config.editor.remote).toEqual(["code -g {file}:{line}"]);
      const two = join(dir, "two.toml");
      writeFileSync(
        two,
        '[editor]\nremote = ["nvim --server S --remote {file}", "nvim --server S --remote-send <C-\\\\><C-N>:{line}<CR>"]\n',
      );
      const r = loadConfig({ vaultRoot: null, configFile: two });
      expect(r.warnings).toEqual([]);
      expect(r.config.editor.remote).toEqual([
        "nvim --server S --remote {file}",
        "nvim --server S --remote-send <C-\\><C-N>:{line}<CR>",
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test("a template is split without a shell; {file} and {line} fill in inside arguments", () => {
    expect(splitCommand(`nvim --server '/tmp/my sock' --remote "+{line}" {file}`)).toEqual([
      "nvim",
      "--server",
      "/tmp/my sock",
      "--remote",
      "+{line}",
      "{file}",
    ]);
    expect(editorArgv("nvim --server /tmp/s --remote +{line} {file}", "/v/a b.md", 12)).toEqual([
      "nvim",
      "--server",
      "/tmp/s",
      "--remote",
      "+12",
      "/v/a b.md",
    ]);
    expect(editorArgv("code -g {file}:{line}", "/v/a.md", 3)).toEqual(["code", "-g", "/v/a.md:3"]);
    // A file name is data, never a command: no shell sees it.
    expect(editorArgv("vi {file}", "/v/$(rm -rf ~).md", 1)).toEqual(["vi", "/v/$(rm -rf ~).md"]);
    expect(editorArgv("myeditor --wait", "/v/a.md", 1)).toEqual(["myeditor", "--wait", "/v/a.md"]); // no {file}: last
  });
  test("no template: $VISUAL, $EDITOR, vi — the line passed the way the editor takes it", () => {
    expect(editorArgv("", "/v/a.md", 7, { VISUAL: "nvim", EDITOR: "nano" })).toEqual(["nvim", "+7", "/v/a.md"]);
    expect(editorArgv("", "/v/a.md", 7, { EDITOR: "/usr/bin/hx" })).toEqual(["/usr/bin/hx", "/v/a.md:7"]);
    expect(editorArgv("", "/v/a.md", 7, { EDITOR: "code --wait" })).toEqual(["code", "--wait", "/v/a.md"]);
    expect(editorArgv("", "/v/a.md", 7, {})).toEqual(["vi", "+7", "/v/a.md"]);
  });
});

describe("review cycle 2 (core)", () => {
  test("editor templates fill {file} {line} {server} in one pass: a path with braces stays itself", () => {
    expect(
      editorArgv("nvim --server {server} --remote {file}", "/v/{line}-{server}.md", 7, {}, false, "/run/n.sock"),
    ).toEqual(["nvim", "--server", "/run/n.sock", "--remote", "/v/{line}-{server}.md"]);
  });
});
