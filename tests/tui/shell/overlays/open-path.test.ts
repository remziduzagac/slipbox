// A file opened by its path (#104): `space f e` asks for one, completing its folders and files as it's typed, and the
// switcher takes one (`/`, `~/`, `./`); either opens the file as `:e` does, another vault's asked first (D270).

import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { untildePath } from "../../../../src/core/foundation/platform/paths.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { initVault, locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import { diskThreads, setWalkWorker } from "../../../../src/core/workspace/walk/walk-thread.ts";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { isPath, pathPick, typedPath } from "../../../../src/tui/shell/overlays/open-path.ts";
import { Listings } from "../../../../src/tui/workspace/explorer/listings.ts";
import { STUCK_MS } from "../../../fixtures/walk/slow.ts";
import { answerSwitch, harness, type Harness, makeSandbox } from "../../../tui-harness.ts";

const sandbox = makeSandbox();

afterEach(() => setWalkWorker(null));

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

/** The listings' threads held up on a folder named `stuck` (STUCK_MS), as a share or a disk asleep would. */
const slowWorker = () => new Worker(new URL("../../../fixtures/walk/slow-worker.ts", import.meta.url).href);

/** A place of folders, one that doesn't answer and one that does; the listing threads made and started. */
async function besideStuck(deadline?: number): Promise<string> {
  setWalkWorker(slowWorker, deadline ? { step: deadline, whole: deadline } : undefined);
  const top = mkdtempSync(join(sandbox, "far-"));
  for (const rel of ["stuck/stuck/s.md", "quick/q.md"]) {
    mkdirSync(dirname(join(top, rel)), { recursive: true });
    writeFileSync(join(top, rel), "# X\n");
  }
  await Promise.all([0, 1].map(() => diskThreads().list(top, DEFAULT_CONFIG.walk, false)));
  return top;
}

/** Once the list's rows are `want`, or its time is up. */
async function until(h: Harness, want: string[], ms = STUCK_MS * 2): Promise<void> {
  const end = performance.now() + ms;
  while (performance.now() < end && JSON.stringify(rows(h)) !== JSON.stringify(want)) await Bun.sleep(10);
  expect(rows(h)).toEqual(want);
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

describe("a folder a link not followed leads to (VV-D6)", () => {
  /** The vault's `data` a link to `out` beside it, and home's `link` one too. */
  async function linked() {
    const p = await opened();
    const base = realpathSync(p.base);
    const out = join(base, "out");
    mkdirSync(out);
    writeFileSync(join(out, "secret-plan.md"), "# Plan\n");
    symlinkSync(out, join(p.notes, "data"));
    symlinkSync(out, join(base, "link"));
    return { ...p, out };
  }

  test("isn't listed until you say so: one row, enter asks; no keeps it unlisted, just look lists it", async () => {
    const { h } = await linked();
    const gate = ["→ ~/out  not followed"];
    // The switcher, given it: the link's row, never what's behind it.
    await h.keys("ctrl+p");
    await type(h, "./data/");
    expect(rows(h)).toEqual(gate);
    expect(list(h).filtered[0]!.item.hint).toBe("enter asks");
    await h.keys("tab");
    expect(list(h).input).toBe("./data/");
    await h.keys("escape", "space", "f", "e");
    await type(h, "data/");
    expect(rows(h)).toEqual(gate);
    // Asked; no: not listed, the next time either.
    await h.keys("enter");
    expect(list(h).title).toContain("leads out of");
    await h.keys("n");
    expect(h.app.overlay).toBeNull();
    await h.keys("space", "f", "e");
    await type(h, "data/");
    expect(rows(h)).toEqual(gate);
    // Asked again; just look: the list back, the folder listed.
    await h.keys("enter", "l");
    expect(list(h).title).toBe("Open by path — tab completes, ~ is home");
    expect(rows(h)).toEqual(["secret-plan.md"]);
    await h.keys("enter");
    expect(h.app.view!.buf.abs).toBe(join(h.app.loc.root, "data", "secret-plan.md"));
    expect(h.app.view!.buf.readOnly).toContain("just looking");
  });

  test("home's own link is asked about too", async () => {
    const { h } = await linked();
    await h.keys("space", "f", "e");
    await type(h, "~/link/");
    expect(rows(h)).toEqual(["→ ~/out  not followed"]);
    await h.keys("enter");
    expect(list(h).title).toContain("follow it?");
  });
});

describe("folders read on the listing threads (T12)", () => {
  test("one at a time: a folder that doesn't answer never takes both threads; the explorer's go on", async () => {
    const top = await besideStuck();
    const { h } = await opened();
    h.app.explorer.listings = new Listings(h.app, true);
    await h.keys("space", "f", "e");
    await type(h, `${top}/stuck/`);
    await until(h, [`[reading ${top}/stuck…]`], STUCK_MS / 3);
    // A folder below it, typed before it answers: asked for once it does, not now.
    await type(h, "stuck/");
    expect(rows(h)).toEqual([`[reading ${top}/stuck/stuck… once ${top}/stuck answers]`]);
    // Nor by another list, opened meanwhile.
    await h.keys("escape", "ctrl+p");
    await type(h, `${top}/stuck/`);
    expect(rows(h)).toEqual([`[reading ${top}/stuck…]`]);
    // The explorer's listing, asked meanwhile: on the thread left free, at once.
    const ex = h.app.explorer;
    const at = performance.now();
    ex.listings.get(join(top, "quick"));
    while (ex.listings.reading) await Bun.sleep(5);
    expect(performance.now() - at).toBeLessThan(STUCK_MS / 3);
    expect(ex.listings.get(join(top, "quick"))?.entries.map((e) => e.name)).toEqual(["q.md"]);
    // Once it answers: the list open, filled.
    await until(h, ["stuck/"]);
  });

  test("a folder that gives no answer in time says so in words", async () => {
    const top = await besideStuck(STUCK_MS / 3);
    const { h } = await opened();
    h.app.explorer.listings = new Listings(h.app, true);
    await h.keys("space", "f", "e");
    await type(h, `${top}/stuck/`);
    await until(h, [`[${top}/stuck: no answer in time]`]);
  });
});
