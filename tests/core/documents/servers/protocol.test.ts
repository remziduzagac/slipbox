import { expect, test } from "bun:test";
import { CLIENT_CAPABILITIES, settingAt } from "../../../../src/core/documents/servers/client/protocol.ts";

test("server configuration with no section keeps the original settings object", () => {
  const settings = { enabled: true };
  expect(settingAt(settings, undefined)).toBe(settings);
  expect(settingAt(settings, "")).toBe(settings);
  expect(settingAt(undefined, undefined)).toBeNull();
});

test("server dotted sections keep falsy values and refuse missing or primitive parents", () => {
  const settings = { language: { count: 0, enabled: false, word: "", absent: null } };
  expect(settingAt(settings, "language.count")).toBe(0);
  expect(settingAt(settings, "language.enabled")).toBe(false);
  expect(settingAt(settings, "language.word")).toBe("");
  expect(settingAt(settings, "language.absent")).toBeNull();
  expect(settingAt(settings, "language.missing.child")).toBeNull();
  expect(settingAt(settings, "language.count.child")).toBeNull();
});

test("server capabilities retain UTF-16 snippets versioned diagnostics and workspace edits", () => {
  expect(CLIENT_CAPABILITIES.general?.positionEncodings).toEqual(["utf-16"]);
  expect(CLIENT_CAPABILITIES.textDocument?.completion?.completionItem?.snippetSupport).toBe(true);
  expect(CLIENT_CAPABILITIES.textDocument?.publishDiagnostics?.versionSupport).toBe(true);
  expect(CLIENT_CAPABILITIES.workspace?.workspaceEdit?.documentChanges).toBe(true);
});
