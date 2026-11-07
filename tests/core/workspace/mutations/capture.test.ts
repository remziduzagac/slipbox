import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendScratch,
  dropEmptyAsks,
  formatEntry,
  formatRef,
  formatWhen,
  parseRef,
  readScratch,
  scratchLocation,
} from "../../../../src/core/workspace/mutations/capture.ts";
import { loadConfig } from "../../../../src/core/application/config/config.ts";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

/** An entry's time, fixed; its `When:` line as written. */
const when = new Date(2026, 10, 8, 14, 5);
const W = `**When:** ${formatWhen(when)}`;

describe("capture format (8.3, 8.4)", () => {
  test("refs round-trip in prompt-buffer.lua's four shapes", () => {
    for (const s of ["a.ts:42", "a.ts:42-50", "a.ts:42:10-30", "a.ts:42:10-50:30"]) {
      expect(formatRef(parseRef(s)!)).toBe(`\`${s}\``);
    }
    expect(parseRef("nope")).toBeNull();
  });
  test("snippet is fenced with the file's language and read from disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-cap-"));
    writeFileSync(join(dir, "f.ts"), "one\ntwo\nthree\n");
    const entry = formatEntry({ ref: parseRef("f.ts:2-3")!, snippet: true, when, cwd: dir }, dir);
    expect(entry).toBe(`${W}\\\n**At:** \`f.ts:2-3\`\n\n\`\`\`typescript\ntwo\nthree\n\`\`\``);
  });
  test("a name that merely starts with dots (`..notes/`) is in the project: its path from there, not its absolute one", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-cap-"));
    mkdirSync(join(dir, "..notes"));
    writeFileSync(join(dir, "..notes", "a.md"), "one\n");
    expect(formatEntry({ ref: parseRef("..notes/a.md:1")!, when, cwd: dir }, dir)).toBe(
      `${W}\\\n**At:** \`..notes/a.md:1\``,
    );
  });
  test("an entry says where it's at, and a note on it; a rule between entries, never under a line; empty notes dropped (D229)", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-cap-"));
    const ref = parseRef("a.md:5")!;
    // The text with a reference is the note on it; the TUI's capture, with none, ends on the note to type after.
    const at = `${W}\\\n**At:** \`a.md:5\``;
    expect(formatEntry({ ref, text: "check it\n", when, cwd: dir }, dir)).toBe(`${at}\\\n**Note:** check it`);
    expect(formatEntry({ ref, ask: true, when, cwd: dir }, dir)).toBe(`${at}\\\n**Note:** `);
    expect(formatEntry({ ref, when, cwd: dir }, dir)).toBe(at);
    expect(formatEntry({ text: "a thought", ask: true, when, cwd: dir }, dir)).toBe(`${W}\\\na thought`); // no labels
    const loc = { path: join(dir, "scratch.md"), project: dir };
    expect(appendScratch(loc, "one")).toBe("one\n"); // the first: nothing to divide it from
    // Typed right under the last line, the rule still comes after a blank line: not `one` made a heading.
    writeFileSync(loc.path, "one");
    expect(appendScratch(loc, "two")).toBe("one\n\n---\n\ntwo\n");
    // Ending on a rule already (typed, or the user's own), no second one.
    writeFileSync(loc.path, "one\n\n***\n");
    expect(appendScratch(loc, "two")).toBe("one\n\n***\n\ntwo\n");
    // Only blank lines: nothing to divide.
    writeFileSync(loc.path, "\n\n");
    expect(appendScratch(loc, "two")).toBe("\n\ntwo\n");
    // A note left empty goes, with the blank line before it, when the TUI adds the next (tidy); another program
    // keeps it, a cursor maybe on it. A said one stays, and so does Note: in the middle of a line.
    const asked = "**At:** `a.md:5`\n\n**Note:** \n\n---\n\n**At:** `b.md:1`\n\n**Note:** that\n\nnot **Note:**\n";
    writeFileSync(loc.path, asked);
    expect(appendScratch(loc, "x")).toBe(`${asked}\n---\n\nx\n`);
    writeFileSync(loc.path, asked);
    expect(appendScratch(loc, "x", true)).toBe(
      "**At:** `a.md:5`\n\n---\n\n**At:** `b.md:1`\n\n**Note:** that\n\nnot **Note:**\n\n---\n\nx\n",
    );
    expect(readScratch(loc)).toContain("**Note:** that");
    expect(dropEmptyAsks("**Note:**\nrest\n**At:** `a.md:1`\n\n**Note:**\t")).toBe("\nrest\n**At:** `a.md:1`");
  });
});

describe("an entry's lines (D268)", () => {
  test("when, where and the note sit on consecutive lines after hard breaks; lines fenced apart, a blank line each side", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-cap-"));
    const ref = parseRef("a.md:5")!;
    expect(formatEntry({ ref, text: "check it", when, cwd: dir }, dir)).toBe(
      `${W}\\\n**At:** \`a.md:5\`\\\n**Note:** check it`,
    );
    expect(formatEntry({ ref, ask: true, when, cwd: dir }, dir)).toBe(`${W}\\\n**At:** \`a.md:5\`\\\n**Note:** `);
    expect(formatEntry({ ref, when, cwd: dir }, dir)).toBe(`${W}\\\n**At:** \`a.md:5\``);
    expect(formatEntry({ ref, snippetText: "x", lang: "", ask: true, when, cwd: dir }, dir)).toBe(
      `${W}\\\n**At:** \`a.md:5\`\n\n\`\`\`\nx\n\`\`\`\n\n**Note:** `,
    );
    // Text alone: on the next line when it opens with a paragraph; after a blank line when a hard break would be a
    // stray `\` before it (a list, a heading, a fence, a setext heading).
    expect(formatEntry({ text: "a thought\nmore", when }, dir)).toBe(`${W}\\\na thought\nmore`);
    for (const text of ["- a list", "# heading", "Title\n===", "---\nx: 1\n---\nbody"])
      expect(formatEntry({ text, when }, dir)).toBe(`${W}\n\n${text}`);
    expect(formatEntry({ snippetText: "x", lang: "ts", when }, dir)).toBe(`${W}\n\n\`\`\`ts\nx\n\`\`\``);
  });
  test("an empty note goes with the hard break before it", () => {
    const entry = `${W}\\\n**At:** \`a.md:5\`\\\n**Note:** \n`;
    expect(dropEmptyAsks(entry)).toBe(`${W}\\\n**At:** \`a.md:5\`\n`);
    expect(dropEmptyAsks(`${W}\\\n**At:** \`a.md:5\`\\\n**Note:** said\n`)).toContain("**Note:** said");
  });
  test("the time: local, to the minute, its offset from UTC named — east, west, a half hour, UTC itself", () => {
    const at = (offset: number) => Object.assign(new Date(2026, 10, 8, 14, 5), { getTimezoneOffset: () => offset });
    expect(formatWhen(at(-180))).toBe("2026-11-08 14:05 UTC+03:00");
    expect(formatWhen(at(210))).toBe("2026-11-08 14:05 UTC-03:30");
    expect(formatWhen(at(0))).toBe("2026-11-08 14:05 UTC+00:00");
    expect(formatWhen(new Date(2026, 0, 2, 3, 4))).toMatch(/^2026-01-02 03:04 UTC[+-]\d\d:\d\d$/);
  });
  test("a note's lines from disk, unlabelled; a code file's in its language", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-cap-"));
    writeFileSync(join(dir, "n.md"), "- one\n- two\n");
    writeFileSync(join(dir, "f.py"), "x = 1\n");
    expect(formatEntry({ ref: parseRef("n.md:1-2")!, snippet: true, when, cwd: dir }, dir)).toContain(
      "\n\n```\n- one\n- two\n```",
    );
    expect(formatEntry({ ref: parseRef("f.py:1")!, snippet: true, when, cwd: dir }, dir)).toContain("```python\nx = 1");
  });
});

describe("folders that travel together (21.7)", () => {
  test("two folders outside git, one in the other's `..archive/`: they travel together (21.7)", async () => {
    const { travelTogether } = await import("../../../../src/core/workspace/vaults/folders.ts");
    const x = mkdtempSync(join(tmpdir(), "slipbox-travel-"));
    mkdirSync(join(x, "..archive"));
    expect([travelTogether(x, join(x, "..archive")), travelTogether(join(x, "..archive"), x)]).toEqual([true, true]);
  });
});

describe("review cycle 1 (core)", () => {
  const tmp = (name: string) => mkdtempSync(join(tmpdir(), `slipbox-${name}-`));
  test("the scratch in the vault refuses a symlink: it lives in the state dir then", () => {
    const root = tmp("scr");
    writeFileSync(join(root, "secret.txt"), "SECRET");
    symlinkSync(join(root, "secret.txt"), join(root, "scratch.md"));
    const cfg = structuredClone(loadConfig({ vaultRoot: null }).config);
    cfg.capture.location = "root";
    const owner = { root, key: "scr", mode: "vault" };
    expect(scratchLocation(owner, cfg).path).not.toBe(join(root, "scratch.md"));
    rmSync(join(root, "scratch.md"));
    expect(scratchLocation(owner, cfg).path).toBe(join(root, "scratch.md"));
    // A plain folder's is always in its state: nothing is written into one (20.22).
    expect(scratchLocation({ ...owner, mode: "folder" }, cfg).path).not.toBe(join(root, "scratch.md"));
  });
});
