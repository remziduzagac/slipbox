import { describe, expect, test } from "bun:test";
import { Clipboard, type ClipboardText } from "../../../../src/tui/app/clipboard/clipboard.ts";
import type { CopyResult } from "../../../../src/core/foundation/platform/clipboard.ts";
import { stateDir } from "../../../../src/core/foundation/platform/paths.ts";

type Tools = NonNullable<ConstructorParameters<typeof Clipboard>[1]>;
const fixture = (tools: Partial<Tools> = {}) => {
  const messages: string[] = [];
  const terminal: string[] = [];
  const context = {
    loc: { key: "clipboard-first" },
    vim: { register: null as ClipboardText | null },
    quitting: false,
    renders: 0,
    host: {
      osc52: (text: string) => (terminal.push(text), true),
      requestRender: () => void context.renders++,
    },
    message: (_level: "info" | "warn", text: string) => void messages.push(text),
  };
  const clipboard = new Clipboard(context, {
    copyTextAsync: async () => ({ file: null, confirmed: true, methods: [] }),
    readClipboardAsync: async () => null,
    ...tools,
  });
  return { context, clipboard, messages, terminal };
};

describe("clipboard serialization without App", () => {
  test("terminal delivery is immediate; helpers and paste wait in copy order and read the live vault", async () => {
    const first = Promise.withResolvers<CopyResult>();
    const calls: string[] = [];
    const dirs: string[] = [];
    const { context, clipboard, terminal } = fixture({
      copyTextAsync: async (text, opts) => {
        calls.push(text);
        dirs.push(opts.fallbackDir);
        return text === "first" ? first.promise : { file: null, confirmed: true, methods: [] };
      },
      readClipboardAsync: async (dir) => (calls.push("read"), dirs.push(dir), "external"),
    });
    const one = clipboard.copy("first", false);
    const two = clipboard.copy("second", false);
    const paste = clipboard.pasteText();
    expect(terminal).toEqual(["first", "second"]);
    await Promise.resolve();
    expect(calls).toEqual(["first"]);
    context.loc = { key: "clipboard-next" };
    first.resolve({ file: null, confirmed: true, methods: [] });
    expect(await one).toBe(true);
    expect(await two).toBe(true);
    expect(await paste).toEqual({ text: "external", linewise: false });
    expect(calls).toEqual(["first", "second", "read"]);
    expect(dirs).toEqual([stateDir({ key: "clipboard-first" }), stateDir(context.loc), stateDir(context.loc)]);
  });

  test("eight pending copies admit no ninth; completion frees the same queue", async () => {
    const held = Promise.withResolvers<CopyResult>();
    const { clipboard, messages, terminal } = fixture({ copyTextAsync: () => held.promise });
    const pending = Array.from({ length: 8 }, (_, i) => clipboard.copy(`${i}`, false));
    expect(await clipboard.copy("ninth", false)).toBe(false);
    expect(terminal).toHaveLength(8);
    expect(messages).toEqual(["clipboard busy — copy again after it finishes"]);
    held.resolve({ file: null, confirmed: true, methods: [] });
    expect(await Promise.all(pending)).toEqual(Array(8).fill(true));
    expect(await clipboard.copy("again", false)).toBe(true);
  });

  test("quit aborts the running helper, skips queued helpers and ignores its late reply", async () => {
    const held = Promise.withResolvers<CopyResult>();
    let signal: AbortSignal | undefined;
    const calls: string[] = [];
    const { context, clipboard, messages } = fixture({
      copyTextAsync: (text, opts) => (calls.push(text), (signal = opts.signal), held.promise),
    });
    const one = clipboard.copy("running");
    const two = clipboard.copy("waiting");
    await Promise.resolve();
    context.quitting = true;
    clipboard.abort();
    expect(signal?.aborted).toBe(true);
    held.resolve({ file: null, confirmed: true, methods: [] });
    expect(await one).toBe(false);
    expect(await two).toBe(false);
    expect(calls).toEqual(["running"]);
    expect(messages).toEqual([]);
    expect(context.renders).toBe(0);
  });

  test("failure reports once and does not poison later copies", async () => {
    const { context, clipboard, messages } = fixture({
      copyTextAsync: async (text) => {
        if (text === "bad") throw new Error("helper failed");
        return { file: null, confirmed: true, methods: [] };
      },
    });
    expect(await clipboard.copy("bad")).toBe(false);
    expect(await clipboard.copy("good", false)).toBe(true);
    expect(messages).toEqual(["clipboard: helper failed"]);
    expect(context.renders).toBe(1);
  });

  test("paste keeps the register's identity and linewise flag for absent, empty or equal clipboard text", async () => {
    let text: string | null = null;
    const { context, clipboard } = fixture({ readClipboardAsync: async () => text });
    expect(await clipboard.pasteText()).toBeNull();
    const register = { text: "row\n", linewise: true };
    context.vim.register = register;
    for (text of [null, "", register.text]) expect(await clipboard.pasteText()).toBe(register);
    text = "from another app";
    expect(await clipboard.pasteText()).toEqual({ text, linewise: false });
  });

  test("paste snapshots the register before its read, sharing the cancellation signal", async () => {
    const held = Promise.withResolvers<string | null>();
    let signal: AbortSignal | undefined;
    const { context, clipboard } = fixture({
      readClipboardAsync: (_dir, stop) => ((signal = stop), held.promise),
    });
    const register = { text: "before", linewise: true };
    context.vim.register = register;
    const paste = clipboard.pasteText();
    await Promise.resolve();
    context.vim.register = { text: "after", linewise: false };
    clipboard.abort();
    expect(signal?.aborted).toBe(true);
    held.resolve(null);
    expect(await paste).toBe(register);
  });

  test("fallback announcements distinguish an intentional file, unavailable clipboard and silent copies", async () => {
    const previous = process.env.SLIPBOX_CLIPBOARD;
    try {
      const { clipboard, messages, context } = fixture({
        copyTextAsync: async () => ({ file: "/clipboard.txt", confirmed: false, methods: [] }),
      });
      process.env.SLIPBOX_CLIPBOARD = "file";
      expect(await clipboard.copy("value", true, "a reference")).toBe(false);
      delete process.env.SLIPBOX_CLIPBOARD;
      expect(await clipboard.copy("value", true, "a reference")).toBe(false);
      expect(await clipboard.copy("value", false)).toBe(false);
      expect(messages).toEqual([
        "copied a reference to /clipboard.txt",
        "clipboard unavailable — wrote /clipboard.txt (a reference)",
      ]);
      expect(context.renders).toBe(2);
    } finally {
      if (previous === undefined) delete process.env.SLIPBOX_CLIPBOARD;
      else process.env.SLIPBOX_CLIPBOARD = previous;
    }
  });
});
