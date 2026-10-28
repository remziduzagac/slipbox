import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/defaults.ts";
import { loadConfig } from "../../../../src/core/application/config/loading.ts";
import { dropUserOnly } from "../../../../src/core/application/config/trust.ts";
import { SERVER_FIELDS, checkFields } from "../../../../src/core/application/config/validation/fields.ts";
import { merge } from "../../../../src/core/application/config/validation/merge.ts";
import { isPlainObject, isSafeRelative } from "../../../../src/core/application/config/validation/predicates.ts";

const sandbox = makeCoreSandbox();

test("loading clones defaults and retains the last good file after a syntax refusal", () => {
  const file = join(sandbox, "config.toml");
  const lastGood = new Map<string, Record<string, unknown>>();
  writeFileSync(file, "[ui]\nsidebar_width = 31\n");
  const first = loadConfig({ configFile: file, lastGood });
  expect(first.warnings).toEqual([]);
  expect(first.config.ui.sidebar_width).toBe(31);
  writeFileSync(file, "[ui\n");
  const second = loadConfig({ configFile: file, lastGood });
  expect(second.config.ui.sidebar_width).toBe(31);
  expect(second.warnings).toHaveLength(1);
  expect(second.warnings[0]).toEndWith(" — keeping what it said before");
  second.config.ui.sidebar_width = 47;
  expect(DEFAULT_CONFIG.ui.sidebar_width).not.toBe(47);
});

test("vault capability removal retains ordinary display settings and warns for executable configuration", () => {
  const data = { editor: { command: "untrusted-editor", tab_width: 3 }, update: { check: false } };
  const warnings: string[] = [];
  dropUserOnly(data, "vault.toml", warnings);
  expect(data).not.toHaveProperty("editor.command");
  expect(data.editor.tab_width).toBe(3);
  expect(warnings.join("\n")).toContain("editor.command");
  expect(warnings.join("\n")).toContain("update.check");
});

test("field validation drops a bad known field, preserves an unknown extension and keeps its warning", () => {
  const warnings: string[] = [];
  expect(
    checkFields(
      { command: 42, args: ["ok"], future: true },
      SERVER_FIELDS,
      "language-server.demo",
      "user.toml",
      warnings,
    ),
  ).toEqual({ args: ["ok"], future: true });
  expect(warnings).toEqual(["config: user.toml: language-server.demo.command must be a string; ignored"]);
});

test("merge warning order and fallback remain distinct from safe-path and object admission", () => {
  const warnings: string[] = [];
  const config = merge(DEFAULT_CONFIG, { unknown: true, ui: { sidebar_width: "wide" } }, "user.toml", "", warnings);
  expect(config.ui.sidebar_width).toBe(DEFAULT_CONFIG.ui.sidebar_width);
  expect(warnings).toHaveLength(2);
  expect(warnings[0]).toContain("unknown");
  expect(warnings[1]).toContain("ui.sidebar_width");
  expect(isSafeRelative("notes/a.md")).toBe(true);
  expect(isSafeRelative("notes/../a.md")).toBe(false);
  expect(isSafeRelative(".git/a.md")).toBe(false);
  expect(isPlainObject(new Date(0))).toBe(false);
});
