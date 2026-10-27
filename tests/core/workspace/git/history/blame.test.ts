import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeCoreSandbox } from "../../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("blame and a file's history (26.4, 22.1)", () => {
  const git = (cwd: string, ...args: string[]) =>
    new TextDecoder().decode(
      Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=Ann", "-C", cwd, ...args]).stdout,
    );

  test("a line now, in the last commit: shifted by the changes before it; null where it's changed", async () => {
    const { lineInHead } = await import("../../../../../src/core/workspace/git/history/gitlog.ts");
    const head = "a\nb\nc\nd\n";
    const now = "new\na\nB\nc\nd\n";
    expect([1, 2, 3, 4, 5].map((n) => lineInHead(head, now, n))).toEqual([null, 1, null, 3, 4]);
    expect(lineInHead("a\nb\nc\n", "a\nc\n", 2)).toBe(3);
    // Line endings aren't changes.
    expect(lineInHead("a\r\nb\r\n", "a\nb\n", 2)).toBe(2);
  });

  test("blame of the last commit, the log followed through a rename, each commit's path then", async () => {
    const { blameLine, fileLog, messageOf } = await import("../../../../../src/core/workspace/git/history/gitlog.ts");
    const root = mkdtempSync(join(tmpdir(), "slipbox-log-"));
    git(root, "init", "-q", "-b", "main");
    writeFileSync(join(root, "old.md"), "one\ntwo\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "First", "-m", "The body.");
    git(root, "mv", "old.md", "new.md");
    git(root, "commit", "-q", "-m", "Renamed");
    writeFileSync(join(root, "new.md"), "one\nTWO\n");
    git(root, "commit", "-q", "-am", "Second line");
    const c = { root };
    const b1 = blameLine(c, "new.md", 1)!;
    expect([b1.author, b1.subject]).toEqual(["Ann", "First"]);
    expect(b1.time).toBeGreaterThan(1_700_000_000);
    expect(blameLine(c, "new.md", 2)!.subject).toBe("Second line");
    expect(messageOf(c, b1.hash)).toBe("First\n\nThe body.");
    const log = fileLog(c, "new.md")!;
    expect(log.map((x) => [x.subject, x.path])).toEqual([
      ["Second line", "new.md"],
      ["Renamed", "new.md"],
      ["First", "old.md"],
    ]);
    expect(blameLine(c, "nope.md", 1)).toBeNull();
    // Of the last commit, not the file on disk: a line put in at its top there moves nothing.
    writeFileSync(join(root, "new.md"), "uncommitted\none\nTWO\n");
    expect(blameLine(c, "new.md", 1)!.subject).toBe("First");
  });
});
