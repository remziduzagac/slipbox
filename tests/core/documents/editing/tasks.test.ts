import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseMarkdown } from "../../../../src/core/documents/markdown/parse.ts";
import { WriteRefused, writeNote } from "../../../../src/core/foundation/platform/fsutil.ts";
import { listTasks, toggleTask } from "../../../../src/core/documents/editing/tasks.ts";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const sandbox = makeCoreSandbox();

describe("task toggle (4.11) and note writes (4.6, 7.5)", () => {
  const enc = (t: string) => new TextEncoder().encode(t);
  const dec = (b: Uint8Array) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(b);
  test("flips one byte: [ ] to [x] and back, on the line asked for", () => {
    const src = "# T\n\n- [ ] one\n- [x] two\n";
    const a = toggleTask(enc(src), 3)!;
    expect(a.checked).toBe(true);
    expect(dec(a.bytes)).toBe("# T\n\n- [x] one\n- [x] two\n");
    const b = toggleTask(enc(src), 4)!;
    expect(b.checked).toBe(false);
    expect(dec(b.bytes)).toBe("# T\n\n- [ ] one\n- [ ] two\n");
    expect(toggleTask(enc(src), 1)).toBeNull(); // a heading
    expect(toggleTask(enc(src), 99)).toBeNull();
  });
  test("any bullet, numbers, quotes, indentation, [X]; CRLF, a BOM and bad bytes are kept", () => {
    for (const line of [
      "* [ ] a",
      "+ [ ] a",
      "1. [ ] a",
      "12) [ ] a",
      "> - [ ] a",
      ">  > * [ ] a",
      "    - [ ] a",
      "\t- [ ] a",
    ]) {
      expect(toggleTask(enc(line), 1)?.checked).toBe(true);
    }
    expect(toggleTask(enc("- [X] a"), 1)?.checked).toBe(false);
    expect(toggleTask(enc("-[ ] a"), 1)).toBeNull();
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...enc("- [ ] a\r\n- [ ] b\r\n"), 0xff]);
    const r = toggleTask(bom, 2)!;
    expect([...r.bytes]).toEqual([0xef, 0xbb, 0xbf, ...enc("- [ ] a\r\n- [x] b\r\n"), 0xff]);
    expect(toggleTask(bom, 1)?.checked).toBe(true); // the BOM isn't part of line 1
  });
  test("a write whose rename fails leaves no temp file behind, and what was there as it was (4.6)", async () => {
    const { atomicWrite } = await import("../../../../src/core/foundation/platform/fsutil.ts");
    const { readdirSync } = await import("node:fs");
    const dir = mkdtempSync(join(sandbox, "atomic-"));
    mkdirSync(join(dir, "taken"));
    writeFileSync(join(dir, "taken", "inside.md"), "# Inside\n");
    expect(() => atomicWrite(join(dir, "taken"), "# Note\n")).toThrow();
    expect(readdirSync(dir)).toEqual(["taken"]);
    expect(readFileSync(join(dir, "taken", "inside.md"), "utf8")).toBe("# Inside\n");
    // The same write where it can land: done, no temp file either.
    atomicWrite(join(dir, "note.md"), "# Note\n");
    expect(readdirSync(dir).sort()).toEqual(["note.md", "taken"]);
  });

  test("writeNote keeps the mode, writes through a symlink, and refuses one out of the vault", () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-write-"));
    const outside = mkdtempSync(join(tmpdir(), "slipbox-out-"));
    try {
      writeFileSync(join(root, "a.md"), "old");
      chmodSync(join(root, "a.md"), 0o600);
      writeNote(root, join(root, "a.md"), "new");
      expect(readFileSync(join(root, "a.md"), "utf8")).toBe("new");
      expect(statSync(join(root, "a.md")).mode & 0o777).toBe(0o600);
      // A link inside the vault: the target changes, the link stays a link.
      mkdirSync(join(root, "real"));
      writeFileSync(join(root, "real", "b.md"), "b");
      symlinkSync(join(root, "real", "b.md"), join(root, "link.md"));
      writeNote(root, join(root, "link.md"), "b2");
      expect(readFileSync(join(root, "real", "b.md"), "utf8")).toBe("b2");
      // A link out of the vault: refused, nothing written.
      writeFileSync(join(outside, "c.md"), "c");
      symlinkSync(join(outside, "c.md"), join(root, "out.md"));
      expect(() => writeNote(root, join(root, "out.md"), "x")).toThrow(WriteRefused);
      expect(readFileSync(join(outside, "c.md"), "utf8")).toBe("c");
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe("review cycle 1 (core)", () => {
  test("listTasks: from the parsed note, so a code block's - [ ] isn't a task", () => {
    const tasks = listTasks(parseMarkdown("- [ ] one\n- [x] two\n\n```\n- [ ] not a task\n```\n").tree);
    expect(tasks).toEqual([
      { line: 1, checked: false, text: "one" },
      { line: 2, checked: true, text: "two" },
    ]);
  });
});
