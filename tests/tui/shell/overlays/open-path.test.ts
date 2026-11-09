// A file opened by its path (#104): `space f e` asks for one, completing its folders and files as it's typed, and the
// switcher takes one (`/`, `~/`, `./`); either opens the file as `:e` does, another vault's asked first (D270).

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { untildePath } from "../../../../src/core/foundation/platform/paths.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { initVault, locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { isPath, pathPick, typedPath } from "../../../../src/tui/shell/overlays/open-path.ts";
import { answerSwitch, harness, type Harness, makeSandbox } from "../../../tui-harness.ts";

const sandbox = makeSandbox();

let made = 0;
/** Side by side in what the app takes for home: the vault `pnotesN` (opened) and the vault `pappN`. */
function place() {
  const n = ++made;
  const base = mkdtempSync(join(sandbox, "place-"));
  const notes = join(base, "notes");
  const app = join(base, "app");
  const files: Record<string, string> = {
    "notes/index.md": "# Index\n",
    "notes/todo.md": "# Todo\n",
    "notes/.secret.md": "# Secret\n",
    "notes/sub/a.md": "# A\n",
    "app/design.md": "# Design\n\nShip.\n",
  };
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(base, rel)), { recursive: true });
    writeFileSync(join(base, rel), text);
  }
  initVault(notes, `pnotes${n}`);
  initVault(app, `papp${n}`);
  openGraph(locateVault({ root: app }), DEFAULT_CONFIG, true);
  return { base, notes, app, n };
}

async function opened(): Promise<{ h: Harness; base: string; notes: string; app: string; n: number }> {
  const p = place();
  const h = await harness({ root: p.notes, open: "index.md" });
  h.app.home = p.base;
  return { h, ...p };
}

const list = (h: Harness) => h.app.overlay as ListOverlay;
/** The list's rows as drawn: its entries' labels, a line it says in brackets. */
const rows = (h: Harness) => list(h).filtered.map((e) => (e.item.informational ? `[${e.item.label}]` : e.item.label));
const type = async (h: Harness, text: string) => {
  for (const ch of text) await h.keys(ch === " " ? "space" : /[A-Z]/.test(ch) ? `shift+${ch.toLowerCase()}` : ch);
};

describe("a path, typed", () => {
  test("is the folder before its last slash, ~ home, a relative one from the vault's top, and the name begun", () => {
    expect(typedPath("~/notes/to", "/v", "/h")).toEqual({ dir: "/h/notes", typedDir: "~/notes/", name: "to" });
    expect(typedPath("sub/a", "/v", "/h")).toEqual({ dir: "/v/sub", typedDir: "sub/", name: "a" });
    expect(typedPath("in", "/v", "/h")).toEqual({ dir: "/v", typedDir: "", name: "in" });
    expect(typedPath("../x", "/v/w", "/h")).toEqual({ dir: "/v", typedDir: "../", name: "x" });
    expect(typedPath("/", "/v", "/h")).toEqual({ dir: "/", typedDir: "/", name: "" });
    expect(untildePath("~", "/h")).toBe("/h");
    expect(untildePath("~/a/b.md", "/h")).toBe("/h/a/b.md");
    expect(untildePath("a/~/b", "/h")).toBe("a/~/b");
  });

  test("in the switcher, only what starts /, ~/, ./ or ../", () => {
    expect(["/etc/hosts", "~/notes", "./sub", "../x"].every(isPath)).toBe(true);
    expect(["notes/x", "~", "#heading", ".hidden", "a/b"].some(isPath)).toBe(false);
  });
});

describe("space f e: a file by its path", () => {
  test("its folder's entries as typed: tab completes, enter goes into a folder, ctrl+w back; a file opens", async () => {
    const { h } = await opened();
    await h.keys("space", "f", "e");
    expect(list(h).title).toBe("Open by path — tab completes, ~ is home");
    // Nothing typed: the vault's top, its folders first, the hidden names too (as the explorer lists them).
    expect(rows(h)).toEqual([".slipbox/", "sub/", ".secret.md", "index.md", "todo.md"]);
    await type(h, "su");
    expect(rows(h)).toEqual(["sub/"]);
    await h.keys("tab");
    expect(list(h).input).toBe("sub/");
    expect(rows(h)).toEqual(["a.md"]);
    await h.keys("ctrl+w");
    expect(list(h).input).toBe("");
    await type(h, "sub");
    await h.keys("enter");
    expect(list(h).input).toBe("sub/");
    await h.keys("enter");
    expect(h.app.overlay).toBeNull();
    expect(h.app.view!.buf.rel).toBe("sub/a.md");
  });

  test("~ is home: another vault's file, chosen, asks first (D270), then goes", async () => {
    const { h, app, n } = await opened();
    await h.keys("space", "f", "e");
    await type(h, "~");
    expect(rows(h)).toEqual(["~/"]);
    await h.keys("tab");
    expect(list(h).input).toBe("~/");
    expect(rows(h)).toEqual(["app/", "notes/"]);
    await type(h, "ap");
    await h.keys("enter");
    expect(list(h).input).toBe("~/app/");
    expect(rows(h)).toEqual([".slipbox/", "design.md"]);
    await type(h, "de");
    expect(rows(h)).toEqual(["design.md"]);
    expect(pathPick(list(h).filtered[0]!.item)?.abs).toBe(join(app, "design.md"));
    await h.keys("enter");
    expect(list(h).title).toBe(`Go into papp${n}? Your tabs there replace these`);
    await answerSwitch(h, "g");
    expect(h.app.loc.root).toBe(app);
    expect(h.app.view!.buf.rel).toBe("design.md");
  });

  test("hidden names not listed (files.hidden off), a dot typed lists them; a folder not there says so", async () => {
    const { h } = await opened();
    h.app.ui.hidden_files = false;
    await h.keys("space", "f", "e");
    expect(rows(h)).toEqual(["sub/", "index.md", "todo.md"]);
    await type(h, ".s");
    expect(rows(h)).toEqual([".slipbox/", ".secret.md"]);
    await h.keys("ctrl+w");
    expect(list(h).input).toBe("");
    await type(h, "nope/x");
    expect(rows(h)).toEqual(["[~/notes/nope: it isn't there]"]);
    await h.keys("enter");
    expect(h.app.overlay).toBeNull();
    expect(h.app.messages.at(-1)?.text).toContain("no note or file");
    expect(h.app.view!.buf.rel).toBe("index.md");
  });

  test("a whole path typed with no entry to pick opens as typed; :e reads ~ as home too", async () => {
    const { h, base, n } = await opened();
    await h.app.run("note.open ~/app/design.md");
    expect(list(h).title).toBe(`Go into papp${n}? Your tabs there replace these`);
    await answerSwitch(h, "c");
    expect(h.app.view!.buf.rel).toBe("index.md");
    // Typed whole, enter while its folder is still read (off the main thread, in the TUI): opened as typed.
    await h.keys("space", "f", "e");
    await type(h, `${base}/notes/todo.md`);
    list(h).filtered = [{ item: { label: "reading…", header: true, informational: true, data: null }, positions: [] }];
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("todo.md");
  });
});

describe("the switcher, given a path", () => {
  test("./ lists the vault's top, completed and opened as space f e does; a name is matched as ever", async () => {
    const { h } = await opened();
    await h.keys("ctrl+p");
    await type(h, "./su");
    expect(rows(h)).toEqual(["sub/"]);
    await h.keys("tab");
    expect(list(h).input).toBe("./sub/");
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("sub/a.md");
    // Not a path: the notes, by their names.
    await h.keys("ctrl+p");
    await type(h, "todo");
    expect(list(h).filtered[0]!.item.data).toBe("todo.md");
    expect(pathPick(list(h).filtered[0]!.item)).toBeNull();
    // tab moves, as in every list, once it isn't a path.
    await h.keys("escape", "ctrl+p");
    const before = list(h).selected;
    await h.keys("tab");
    expect(list(h).selected).toBe(before + 1);
  });

  test("/ and ~/ offer another vault's file, its place previewed; enter asks before going", async () => {
    const { h, base, app, n } = await opened();
    await h.keys("ctrl+p");
    await type(h, `${base}/app/des`);
    expect(rows(h)).toEqual(["design.md"]);
    expect(list(h).filtered[0]!.item.place).toEqual({ abs: join(app, "design.md"), line: 0 });
    await h.keys("enter");
    expect(list(h).title).toBe(`Go into papp${n}? Your tabs there replace these`);
    await answerSwitch(h, "c");
    expect(h.app.loc.root).not.toBe(app);
    await h.keys("ctrl+p");
    await type(h, "~/app/d");
    expect(rows(h)).toEqual(["design.md"]);
    await h.keys("enter");
    await answerSwitch(h, "g");
    expect(h.app.view!.buf.rel).toBe("design.md");
  });
});
