import { expect, test } from "bun:test";
import { NoteBuffer } from "../../../../../src/tui/documents/buffers/buffer.ts";
import type { View } from "../../../../../src/tui/app/runtime/app.ts";
import { newVimState, takeCount } from "../../../../../src/tui/shell/input/vim/state.ts";
import { linesRange, textObject } from "../../../../../src/tui/shell/input/vim/motions.ts";
import { recordVisual, repeat } from "../../../../../src/tui/shell/input/vim/replay.ts";

import { startOperator } from "../../../../../src/tui/shell/input/vim/operators.ts";
import { vimKey } from "../../../../../src/tui/shell/input/vim/grammar.ts";
import { apply } from "../../../../../src/tui/shell/input/vim/edits.ts";

function view(text: string): View {
  const buf = new NoteBuffer(null, "input:", "input:");
  buf.source = text;
  return { buf } as View;
}

test("Vim state instances keep separate registers and consuming a count clears it", () => {
  const vim = newVimState();
  const other = newVimState();
  vim.count = "20000";
  expect(takeCount({ vim } as never)).toBe(10000);
  expect(vim.count).toBe("");
  expect(takeCount({ vim } as never)).toBe(1);
  vim.seq.push("d");
  expect(other.seq).toEqual([]);
});

test("line ranges retain final-newline admission and clamp to the final real line", () => {
  expect(linesRange(view("a\nb\n"), 2, 9)).toEqual({ from: 2, to: 4, linewise: true });
  expect(linesRange(view("a\nb"), 2, 9)).toEqual({ from: 2, to: 3, linewise: true });
});

test("text objects preserve nested bracket contents and counted words", () => {
  const nested = view("a (b (c) d)\n");
  expect(textObject(nested, 6, "i", "(", 2)).toEqual({ from: 3, to: 10, linewise: false });
  expect(textObject(view("one two three"), 0, "a", "w", 2)).toEqual({ from: 0, to: 8, linewise: false });
});

test("an unrecordable visual change clears an older replay instead of repeating it", () => {
  const vim = newVimState();
  vim.lastChange = ["d", "d"];
  recordVisual({ vim } as never, null, false, 0);
  expect(vim.lastChange).toBeNull();
});

test("failed replay restores replay state in finally and replaces a recorded count", async () => {
  const vim = newVimState();
  vim.lastChange = ["2", "d", "d"];
  vim.count = "3";
  const keys: string[] = [];
  const app = {
    vim,
    input: {
      async processKey(key: string) {
        keys.push(key);
        throw new Error("dispatch refused");
      },
    },
  };
  await expect(repeat(app as never)).rejects.toThrow("dispatch refused");
  expect(keys).toEqual(["d"]);
  expect(vim.replaying).toBe(false);
  expect(vim.undoing).toBe(true);
  expect(vim.lastChange).toEqual(["2", "d", "d"]);
});

test("a counted operator is cancelled through grammar without dispatching a command", async () => {
  const vim = newVimState();
  vim.count = "2";
  const app = { vim, pending: [] };
  const current = view("one two");
  startOperator(app as never, "d");
  expect(vim.op).toMatchObject({ op: "d", count: 2, given: true });
  let dispatches = 0;
  await vimKey(app as never, current, "escape", async () => {
    dispatches++;
  });
  expect(vim.op).toBeNull();
  expect(vim.count).toBe("");
  expect(dispatches).toBe(0);
  expect(current.buf.source).toBe("one two");
});

test("operator effects retain invalid-encoding refusal before changing a buffer or register", () => {
  const current = view("keep bytes");
  current.buf.invalidUtf8 = true;
  const vim = newVimState();
  const messages: [string, string][] = [];
  apply({ vim, message: (level: string, text: string) => messages.push([level, text]) } as never, current, "d", {
    from: 0,
    to: 4,
    linewise: false,
  });
  expect(current.buf.source).toBe("keep bytes");
  expect(vim.register).toBeNull();
  expect(messages).toEqual([
    ["warn", "input: isn't valid UTF-8 — editing would change bytes it doesn't show — not editing"],
  ]);
});
