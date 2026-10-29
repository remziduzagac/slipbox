import { expect, test } from "bun:test";
import { join } from "node:path";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";
import type { App, View } from "../../../../src/tui/app/runtime/app.ts";
import { NoteBuffer } from "../../../../src/tui/documents/buffers/buffer.ts";
import { glyphsFor } from "../../../../src/core/rendering/theme/glyphs.ts";
import { prevBoundary, nextBoundary } from "../../../../src/tui/documents/editing/source/text.ts";
import { lineText, lineStart, lineEnd, lineOf } from "../../../../src/tui/documents/editing/source/position.ts";
import { cannotEdit, lensWhat } from "../../../../src/tui/documents/editing/source/policy.ts";
import { outdentLength } from "../../../../src/tui/documents/editing/source/lines.ts";
import { insertKey, selectingMove, wordFrom } from "../../../../src/tui/documents/editing/source/keyboard.ts";

const sandbox = makeCoreSandbox();

test("source text boundaries retain whole graphemes and CRLF pairs", () => {
  const text = "a😀\r\nb";
  expect(prevBoundary(text, 3)).toBe(1);
  expect(nextBoundary(text, 1)).toBe(3);
  expect(prevBoundary(text, 5)).toBe(3);
  expect(nextBoundary(text, 3)).toBe(5);
  expect(prevBoundary("a\u0301", 2)).toBe(0);
  expect(nextBoundary("a\u0301", 0)).toBe(2);
});

test("source line helpers keep UTF-16 offsets while excluding CRLF endings from text", () => {
  const buf = new NoteBuffer("lines.md", join(sandbox, "lines.md"));
  buf.loadText("a😀\r\nb\r\n");
  const view = { buf } as View;
  expect(lineText(view, 1)).toBe("a😀");
  expect(lineText(view, 2)).toBe("b");
  expect(lineStart(view, 6)).toBe(5);
  expect(lineEnd(view, 1)).toBe(3);
  expect(lineOf(view, 5)).toBe(2);
});

test("source edit refusals retain their priority and document labels", () => {
  const buf = new NoteBuffer("data.yaml", join(sandbox, "data.yaml"));
  buf.kind = { group: "data", format: "yaml" };
  const view = { buf } as View;
  buf.readOnly = "read only";
  buf.deleted = true;
  buf.invalidUtf8 = true;
  expect(cannotEdit(view)).toBe("read only");
  buf.readOnly = null;
  expect(cannotEdit(view)).toBe("data.yaml was deleted on disk");
  buf.deleted = false;
  expect(cannotEdit(view)).toContain("isn't valid UTF-8");
  expect(lensWhat(buf)).toBe("YAML");
  buf.kind = { group: "text", format: "typescript" };
  expect(lensWhat(buf)).toBe("code");
});

test("source outdenting consumes one tab or at most the configured number of spaces", () => {
  expect(outdentLength("\t  text", 4)).toBe(1);
  expect(outdentLength("   text", 2)).toBe(2);
  expect(outdentLength(" text", 4)).toBe(1);
  expect(outdentLength("text", 4)).toBe(0);
});

test("typing key classification and word motion keep the existing modifier and boundary rules", () => {
  expect(selectingMove("ctrl+shift+right")).toBe("ctrl+right");
  expect(selectingMove("shift+home")).toBe("home");
  expect(selectingMove("shift+a")).toBeNull();
  expect(wordFrom("one two", 7, -1)).toBe(4);
  expect(wordFrom("one two", 0, 1)).toBe(3);
  expect(wordFrom("one two", 3, 1)).toBe(7);
});

test("pending clipboard insertion applies only to the original active view and unchanged revision", async () => {
  for (const reason of ["active", "quitting", "view", "version"] as const) {
    const buf = new NoteBuffer("paste.md", join(sandbox, "paste.md"));
    buf.loadText("");
    const view = { buf, cur: { row: 0, col: 0 }, goal: 0, sel: null, insert: true } as View;
    const clipboard = Promise.withResolvers<{ text: string; linewise: boolean } | null>();
    const app = {
      quitting: false,
      view,
      pasteText: () => clipboard.promise,
      currentLayout: (v: View) => v.buf.sourceLayout(40, true, glyphsFor("unicode")),
      views: { setCursorAnchor: () => {} },
    };
    const pending = insertKey(app as unknown as App, view, "ctrl+v");
    if (reason === "quitting") app.quitting = true;
    if (reason === "view") app.view = {} as View;
    if (reason === "version") buf.version++;
    clipboard.resolve({ text: "B\r\nC", linewise: false });
    await pending;
    expect(buf.source).toBe(reason === "active" ? "B\nC" : "");
  }
});
