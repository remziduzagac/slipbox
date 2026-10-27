import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { UNIT_TIMEOUT_MS } from "../support/timeouts.ts";

test("package test and documentation runners retain the shared unit fallback", () => {
  const root = join(import.meta.dir, "../..");
  const { scripts } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  for (const name of ["test", "test:docs"]) {
    const configured = /--timeout\s+(\d+)\b/.exec(scripts[name]);
    expect(configured).not.toBeNull();
    expect(Number(configured![1])).toBe(UNIT_TIMEOUT_MS);
  }
});

test("Bun file-local timeout sites stay named; update this map when a file moves", () => {
  const root = join(import.meta.dir, "../..");
  const expected = new Map([
    ["tests/check-docs.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/cli.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/application/commands/keymap.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/application/config/config.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/documents/diagnostics/lint.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/documents/diagnostics/spelling.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/documents/editing/brackets.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/documents/editing/comments.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/documents/editing/indent.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/documents/editing/replace.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/documents/editing/snippets.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/documents/editing/tasks.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/documents/external-editors/editor.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/documents/external-editors/nvim.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/documents/markdown/parse-threads.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/documents/markdown/parse.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/documents/markdown/tags.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/documents/markdown/wikilink.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/documents/model/data.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/documents/model/docformats.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/documents/model/doctypes.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/documents/model/filetypes.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/documents/model/footnotes.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/documents/syntax/documentation.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/documents/syntax/grammar.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/documents/syntax/links.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/foundation/platform/clipboard.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/foundation/platform/lazy.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/foundation/platform/paths.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/foundation/platform/shell.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/foundation/platform/sqlite.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/foundation/platform/writes.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/foundation/platform/wsl.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/foundation/text/width.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/rendering/layout/ansi.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/rendering/layout/code/source.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/rendering/layout/markdown/render.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/rendering/media/images/svg.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/rendering/media/math.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/rendering/theme/glyphs.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/rendering/theme/theme.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/workspace/git/branches/remote.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/workspace/git/history/blame.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/workspace/git/merge/conflicts.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/workspace/git/merge/merge.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/workspace/git/merge/operations.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/workspace/git/merge/stale.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/workspace/git/review/gitreview.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/workspace/git/staging/signs.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/workspace/git/staging/staging.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/workspace/links/hosting.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/workspace/links/resolution.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/workspace/mutations/capture.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/core/workspace/vaults/trust.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/organization/boundary.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/tui/shell/overlays/match.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/distribution.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/export-reads.test.ts", "TEST_BUDGETS.exportReads"],
    ["tests/export.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/servers.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/tui-harness.ts", "UNIT_TIMEOUT_MS"],
    ["tests/upgrade-restart.test.ts", "UNIT_TIMEOUT_MS"],
    ["tests/vault.test.ts", "UNIT_TIMEOUT_MS"],
  ]);
  const actual: [string, string][] = [];
  for (const file of new Bun.Glob("tests/**/*.ts").scanSync(root)) {
    if (file.includes("/fixtures/")) continue;
    for (const call of readFileSync(join(root, file), "utf8").matchAll(/^\s*setDefaultTimeout\(([^)]+)\);/gm))
      actual.push([file, call[1]!.trim()]);
  }
  expect(actual.sort()).toEqual([...expected].sort());
});
