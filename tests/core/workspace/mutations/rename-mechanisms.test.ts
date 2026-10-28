import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { Collector } from "../../../../src/core/workspace/mutations/rename/collecting/collector.ts";
import { RenameError } from "../../../../src/core/workspace/mutations/rename/collecting/contracts.ts";
import {
  cleanTarget,
  fileInTheWay,
  moveTarget,
} from "../../../../src/core/workspace/mutations/rename/planning/targets.ts";
import { planNoteRename } from "../../../../src/core/workspace/mutations/rename/planning/files.ts";
import { applyPlan } from "../../../../src/core/workspace/mutations/rename/rename-apply.ts";

const sandbox = makeCoreSandbox();
function fixture(files: Record<string, string | Uint8Array>) {
  const root = mkdtempSync(join(sandbox, "rename-"));
  mkdirSync(join(root, ".slipbox"));
  for (const [rel, data] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), data);
  }
  const loc = locateVault({ root });
  return { root, g: openGraph(loc, structuredClone(DEFAULT_CONFIG), false) };
}

test("target admission keeps folder intent, blockers and outside/hidden refusals", () => {
  const { root, g } = fixture({ "a.md": "# A\n" });
  expect(moveTarget(g, "a.md", "notes/")).toBe("notes/a.md");
  expect(moveTarget(g, "notes/a.md", "/")).toBe("a.md");
  expect(fileInTheWay(root, "a.md/b.md")).toBe("a.md");
  expect(() => cleanTarget(g, "../b.md", "file")).toThrow(RenameError);
  expect(() => cleanTarget(g, ".git/b.md", "file")).toThrow("hidden");
});

test("the collector retains one original text and edits CRLF lines without rereading", () => {
  const { root, g } = fixture({ "a.md": "# A\r\n" });
  const abs = join(root, "a.md");
  const c = new Collector(g);
  const original = c.file(abs, null)!;
  writeFileSync(abs, "# external\n");
  expect(c.file(abs, null)).toBe(original);
  c.line(abs, null, 1, () => "# B", "stale");
  expect(original.text).toBe("# A\r\n");
  expect(original.next).toBe("# B\r\n");
  expect(original.edits).toEqual([{ line: 1, before: "# A", after: "# B" }]);
  expect(c.result()).toEqual([original]);
  expect(readFileSync(abs, "utf8")).toBe("# external\n");
});

test("a collection refusal is cached and remains the skipped-row reason", () => {
  const { root, g } = fixture({ "a.md": "# A\n" });
  const c = new Collector(g);
  const abs = join(root, "a.md");
  c.leave = () => "left by collection policy";
  expect(c.file(abs, null)).toBeNull();
  c.leave = null;
  expect(c.file(abs, null)).toBeNull();
  c.line(abs, null, 1, () => "# B", "stale");
  expect(c.skipped[0]!.reason).toBe("left by collection policy");
  expect(c.files.size).toBe(0);
  expect(readFileSync(abs, "utf8")).toBe("# A\n");
});

test("invalid UTF-8 is retained byte-for-byte and refused by collection", () => {
  const { root, g } = fixture({ "bad.md": new Uint8Array([0xff]) });
  const c = new Collector(g);
  const abs = join(root, "bad.md");
  c.line(abs, null, 1, () => "replacement", "stale");
  expect(c.skipped[0]!.reason).toBe("not valid UTF-8: not rewritten");
  expect([...readFileSync(abs)]).toEqual([0xff]);
  expect(c.result()).toEqual([]);
});

test("a self-contained rename plan preserves BOM, Unicode, CRLF and unrelated text when applied", () => {
  const before = "\uFEFF😀 [a](a.md)\r\n<!-- keep exactly -->\r\n";
  const { root, g } = fixture({ "a.md": "# A\n", "index.md": before });
  const plan = planNoteRename(g, "a.md", "b.md");
  expect(readFileSync(join(root, "index.md"), "utf8")).toBe(before);
  expect(existsSync(join(root, "b.md"))).toBe(false);
  applyPlan(g, JSON.parse(JSON.stringify(plan)));
  expect(readFileSync(join(root, "index.md"), "utf8")).toBe("\uFEFF😀 [a](b.md)\r\n<!-- keep exactly -->\r\n");
  expect(existsSync(join(root, "a.md"))).toBe(false);
  expect(readFileSync(join(root, "b.md"), "utf8")).toBe("# A\n");
});

test("a changed source refuses the complete plan before either a link edit or a move", () => {
  const { root, g } = fixture({ "a.md": "# A\n", "index.md": "[a](a.md)\n" });
  const plan = planNoteRename(g, "a.md", "b.md");
  const changed = "[a](a.md)\nexternal\n";
  writeFileSync(join(root, "index.md"), changed);
  expect(() => applyPlan(g, plan)).toThrow("changed since the preview");
  expect(readFileSync(join(root, "index.md"), "utf8")).toBe(changed);
  expect(readFileSync(join(root, "a.md"), "utf8")).toBe("# A\n");
  expect(existsSync(join(root, "b.md"))).toBe(false);
});
