import { describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import {
  dateText,
  listFolder,
  placeOf,
  type SaveAsOverlay,
  sizeText,
} from "../../../../src/tui/documents/saving/saveas.ts";
import { makeSandbox, makeVault, harness, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
const sandbox = makeSandbox();

describe("vaults in the TUI (17.x)", () => {
  /** Until `ok`, or `ms` have passed: an export is written after its key returns. */
  const until = async (ok: () => boolean, ms = 25_000) => {
    for (const t = Date.now(); !ok() && Date.now() - t < ms; ) await Bun.sleep(20);
    return ok();
  };
  const isDocx = (file: string) => readFileSync(file).subarray(0, 4).toString("latin1") === "PK\x03\x04";

  /** The Save As window, open. */
  const saveAs = (h: Harness) => {
    expect(h.app.overlay?.kind).toBe("saveas");
    return h.app.overlay as SaveAsOverlay;
  };
  /** What its folder lists: each entry's name, a folder's with its `/`. */
  const listed = (o: SaveAsOverlay) => o.entries.map((e) => (e.up ? "‥" : e.dir ? `${e.name}/` : e.name));

  test("space n o exports the note: its format picked, then the Save As window, beside it by its name; unsaved notes saved first (10.x)", async () => {
    const root = makeVault();
    writeFileSync(join(root, "rep.md"), "# Rep\n\nText.\n");
    const h = await harness({ root, open: "rep.md" });
    await h.keys("shift+g", "shift+a", "!", "escape");
    expect(h.app.view!.buf.dirty).toBe(true);
    await h.keys("space", "n", "o");
    expect(h.app.overlay).toMatchObject({ kind: "list", title: "Export rep.md as" });
    expect((h.app.overlay as ListOverlay).items.map((i) => i.label)).toEqual([
      "Word (.docx)",
      "PDF (.pdf)",
      "Web page (.html)",
      "E-book (.epub)",
      "Markdown (.md)",
    ]);
    await h.keys("enter");
    // Then where: the window, beside the note, its name filled in and its focus.
    const o = saveAs(h);
    expect([o.title, o.dir, o.name, o.focus]).toEqual(["Export rep.md as Word (.docx)", root, "rep.docx", "name"]);
    expect(o.places.map((p) => p.label)).toEqual(["Beside the note", "This vault"]);
    const frame = h.frame();
    for (const words of [
      "Export rep.md as Word (.docx)",
      "./",
      "Beside the note",
      "Name: rep.docx",
      "Export  enter",
      "ctrl+n: new folder",
    ])
      expect(frame).toContain(words);
    await h.keys("enter");
    expect(await until(() => h.app.messages.at(-1)!.text.startsWith("exported"))).toBe(true);
    expect(h.app.messages.at(-1)).toMatchObject({ level: "info", text: "exported rep.md to rep.docx (Word (.docx))" });
    // Saved first: the document holds what was on screen.
    expect(h.app.view!.buf.dirty).toBe(false);
    expect(readFileSync(join(root, "rep.md"), "utf8")).toBe("# Rep\n\nText.!\n");
    expect(isDocx(join(root, "rep.docx"))).toBe(true);
  });

  test("an export replaces an earlier one at once, any other file only once you say so (no: the window back), never a note; a folder named goes into it", async () => {
    const root = makeVault();
    writeFileSync(join(root, "rep.md"), "# Rep\n");
    writeFileSync(join(root, "rep.docx"), "an older one");
    mkdirSync(join(root, "out"));
    const h = await harness({ root, open: "rep.md" });
    await h.keys("space", "n", "o", "enter", "enter");
    expect(h.app.overlay).toMatchObject({
      kind: "prompt",
      confirm: true,
      label: "Replace rep.docx? It isn't an export.",
    });
    await h.keys("n");
    expect(saveAs(h).name).toBe("rep.docx");
    await Bun.sleep(50);
    expect(readFileSync(join(root, "rep.docx"), "utf8")).toBe("an older one");
    await h.keys("enter", "y");
    expect(await until(() => isDocx(join(root, "rep.docx")))).toBe(true);
    expect(await until(() => h.app.messages.at(-1)!.text.startsWith("exported"))).toBe(true);
    // Now an earlier export: replaced without a question.
    const first = statSync(join(root, "rep.docx")).mtimeMs;
    await h.app.run("note.export docx");
    await h.keys("enter");
    expect(h.app.overlay).toBeNull();
    expect(await until(() => statSync(join(root, "rep.docx")).mtimeMs !== first)).toBe(true);
    expect(await until(() => h.app.messages.at(-1)!.text.startsWith("exported"))).toBe(true);
    // A note: refused, whatever its name says; the window stays.
    await h.app.run("note.export docx");
    saveAs(h).name = "index.md";
    await h.keys("enter");
    expect(h.app.messages.at(-1)).toMatchObject({
      level: "warn",
      text: "export: index.md is a note — an export doesn't write over it",
    });
    expect(saveAs(h).name).toBe("index.md");
    expect(readFileSync(join(root, "index.md"), "utf8")).not.toStartWith("PK");
    // A folder named: into it, the name given back.
    saveAs(h).name = "out";
    await h.keys("enter");
    expect([saveAs(h).dir, saveAs(h).name]).toEqual([join(root, "out"), "rep.docx"]);
    await h.keys("enter");
    expect(await until(() => existsSync(join(root, "out", "rep.docx")))).toBe(true);
  });

  test("a name ending in / is a folder, made where it isn't there and gone into; another root's note refused as this one's are", async () => {
    const root = makeVault();
    writeFileSync(join(root, "rep.md"), "# Rep\n");
    const other = mkdtempSync(join(sandbox, "other-"));
    mkdirSync(join(other, ".slipbox"));
    writeFileSync(join(other, "theirs.md"), "# Theirs\n");
    const h = await harness({ root, open: "rep.md" });
    await h.keys("space", "n", "o", "enter");
    saveAs(h).name = "made/v1/";
    await h.keys("enter");
    expect([saveAs(h).dir, saveAs(h).name, saveAs(h).error]).toEqual([join(root, "made", "v1"), "rep.docx", null]);
    // Another root's note: refused, the window kept.
    saveAs(h).name = join(other, "theirs.md");
    await h.keys("enter");
    expect(h.app.messages.at(-1)).toMatchObject({
      level: "warn",
      text: `export: ${join(other, "theirs.md")} is a note — an export doesn't write over it`,
    });
    expect(saveAs(h).name).toBe(join(other, "theirs.md"));
    expect(readFileSync(join(other, "theirs.md"), "utf8")).toBe("# Theirs\n");
    saveAs(h).name = "rep.docx";
    await h.keys("enter");
    expect(await until(() => existsSync(join(root, "made", "v1", "rep.docx")))).toBe(true);
  });

  test(":export docx skips the format list; a format it doesn't know, or a file that isn't a note, said", async () => {
    const root = makeVault();
    writeFileSync(join(root, "rep.md"), "# Rep\n");
    writeFileSync(join(root, "data.json"), "{}\n");
    const h = await harness({ root, open: "rep.md" });
    await h.app.run("note.export word");
    expect(saveAs(h)).toMatchObject({ title: "Export rep.md as Word (.docx)", name: "rep.docx" });
    await h.keys("escape");
    expect(h.app.overlay).toBeNull();
    await h.app.run("note.export odt");
    expect(h.app.overlay).toBeNull();
    expect(h.app.messages.at(-1)).toMatchObject({
      level: "warn",
      text: "export: no format odt — docx, pdf, html, epub, md",
    });
    h.app.open("data.json");
    await h.app.run("note.export");
    expect(h.app.overlay).toBeNull();
    expect(h.app.messages.at(-1)!.text).toBe("export: data.json isn't a note — a note is exported");
  });

  test("space n shift+o exports notes as one document: picked in order, this one first, a pick again out; then the format and where (10.9)", async () => {
    const root = makeVault();
    writeFileSync(join(root, "one.md"), "# One\n\nFirst.\n");
    writeFileSync(join(root, "two.md"), "# Two\n\nSecond.\n");
    writeFileSync(join(root, "three.md"), "# Three\n\nThird.\n");
    const h = await harness({ root, open: "one.md" });
    await h.keys("space", "n", "shift+o");
    const list = () => h.app.overlay as ListOverlay;
    const row = (label: string) => list().filtered.find((e) => e.item.label === label)!.item;
    expect(list().title).toBe("Notes to export, in order — 1 picked");
    expect(list().filtered[0]!.item.label).toBe("Export one.md…");
    expect(row("one.md").hint).toBe("1");
    // Typed: the notes filtered, "Export…" still first; enter picks the note.
    for (const k of ["t", "h", "r"]) await h.keys(k);
    expect(list().filtered.map((e) => e.item.label)).toEqual(["Export one.md…", "three.md"]);
    await h.keys("down", "enter");
    expect(list().title).toBe("Notes to export, in order — 2 picked");
    expect(list().input).toBe("thr"); // typos: ignore-line
    expect(list().filtered[list().selected]!.item.label).toBe("three.md");
    expect(row("three.md").hint).toBe("2");
    // two picked, then taken out again, then in: third.
    for (const k of ["backspace", "backspace", "backspace", "t", "w", "o"]) await h.keys(k);
    await h.keys("down", "enter");
    expect(row("two.md").hint).toBe("3");
    await h.keys("enter");
    expect(list().title).toBe("Notes to export, in order — 2 picked");
    expect(list().filtered.find((e) => e.item.label === "two.md")!.item.hint).toBe("");
    await h.keys("enter");
    expect(row("two.md").hint).toBe("3");
    // Export: the format, then where — beside the first, by its name.
    await h.keys("up", "enter");
    expect(list().title).toBe("Export 3 notes as");
    for (const k of ["m", "a", "r", "k"]) await h.keys(k);
    await h.keys("enter");
    expect(saveAs(h)).toMatchObject({ title: "Export 3 notes as Markdown (.md)", name: "one.export.md" });
    await h.keys("enter");
    // Said once publishing is done, which ends with the file renamed into place: the message is what's waited for.
    expect(await until(() => h.app.messages.at(-1)?.text.startsWith("exported") ?? false)).toBe(true);
    expect(h.app.messages.at(-1)!.text).toBe("exported 3 notes to one.export.md (Markdown (.md))");
    const md = readFileSync(join(root, "one.export.md"), "utf8");
    expect(
      [md.indexOf("# One"), md.indexOf("# Three"), md.indexOf("# Two")].every(
        (at, i, all) => at > 0 && (i === 0 || at > all[i - 1]!),
      ),
    ).toBe(true);
  });

  test("the window's places: beside the note, the last export, your folders there are, this root; it opens at the last (10.14)", async () => {
    const root = makeVault();
    writeFileSync(join(root, "rep.md"), "# Rep\n");
    const home = mkdtempSync(join(sandbox, "home-"));
    for (const d of ["Downloads", "Documents"]) mkdirSync(join(home, d));
    const h = await harness({ root, open: "rep.md" });
    h.app.home = home;
    await h.keys("space", "n", "o", "enter");
    expect(saveAs(h).places.map((p) => [p.label, p.path])).toEqual([
      ["Beside the note", root],
      ["Downloads", join(home, "Downloads")],
      ["Documents", join(home, "Documents")],
      ["Home", home],
      ["This vault", root],
    ]);
    // A place: tab to the places (from the name, round), down to Downloads, enter goes there (the folder gets the
    // focus).
    await h.keys("tab", "down", "enter");
    expect([saveAs(h).dir, saveAs(h).focus]).toEqual([join(home, "Downloads"), "files"]);
    expect(h.frame()).toContain("~/Downloads/");
    await h.keys("tab", "enter");
    // The export ended, not only its file there: the file is there a moment before its folder is remembered.
    expect(await until(() => h.app.messages.at(-1)?.text.startsWith("exported") ?? false)).toBe(true);
    expect(existsSync(join(home, "Downloads", "rep.docx"))).toBe(true);
    // Next time: it opens there, "Last export" second.
    await h.keys("space", "n", "o", "enter");
    expect(saveAs(h).dir).toBe(join(home, "Downloads"));
    expect(saveAs(h).places.map((p) => p.label)).toEqual([
      "Beside the note",
      "Last export",
      "Downloads",
      "Documents",
      "Home",
      "This vault",
    ]);
    await h.keys("escape");
    // Remembered for the root, not the session: a new app has it too; a folder gone since, not.
    const again = await harness({ root, open: "rep.md" });
    again.app.home = home;
    expect(again.app.exporter.lastDir()).toBe(join(home, "Downloads"));
    rmSync(join(home, "Downloads"), { recursive: true });
    expect(again.app.exporter.lastDir()).toBeNull();
  });

  test("the window's folder: folders then files; enter or → in, ← or ‥ up (back on the folder left); a file's name taken; typing jumps", async () => {
    const root = makeVault();
    writeFileSync(join(root, "rep.md"), "# Rep\n");
    const home = mkdtempSync(join(sandbox, "home-"));
    mkdirSync(join(home, "Shared", "Reports"), { recursive: true });
    mkdirSync(join(home, "alpha"));
    mkdirSync(join(home, ".hidden"));
    writeFileSync(join(home, "notes.txt"), "x".repeat(2048));
    writeFileSync(join(home, "Shared", "Q3 summary.docx"), "");
    const h = await harness({ root, open: "rep.md" });
    h.app.home = home;
    await h.keys("space", "n", "o", "enter");
    const o = saveAs(h);
    // ~ goes home (in the folder); hidden ones left out.
    await h.keys("down");
    expect(o.focus).toBe("files");
    await h.keys("~");
    expect(o.dir).toBe(home);
    expect(listed(o)).toEqual(["‥", "alpha/", "Shared/", "notes.txt"]);
    expect(h.frame()).toMatch(/notes\.txt\s+2 KB/);
    // Typing jumps: s to Shared; enter goes in.
    await h.keys("s");
    expect(o.entries[o.selected]!.name).toBe("Shared");
    await h.keys("enter");
    expect(o.dir).toBe(join(home, "Shared"));
    expect(listed(o)).toEqual(["‥", "Reports/", "Q3 summary.docx"]);
    // A file: its name taken, the name gets the focus.
    await h.keys("down", "down", "enter");
    expect([o.name, o.focus]).toEqual(["Q3 summary.docx", "name"]);
    // ← up: back on the folder left.
    await h.keys("down", "left");
    expect([o.dir, o.entries[o.selected]!.name]).toEqual([home, "Shared"]);
    await h.keys("right", "right");
    expect(o.dir).toBe(join(home, "Shared", "Reports"));
    // ‥ (the first row) goes up too.
    await h.keys("home", "enter");
    expect(o.dir).toBe(join(home, "Shared"));
    // A . first shows the hidden ones.
    await h.keys("left", ".");
    expect(listed(o)).toContain(".hidden/");
    expect(o.entries[o.selected]!.name).toBe(".hidden");
    // The same letter again (typed alone): the next that starts so.
    mkdirSync(join(home, "apple"));
    await h.keys("~");
    let now = 5_000_000;
    (h.app as unknown as { now: () => number }).now = () => now;
    await h.keys("home", "a");
    expect(o.entries[o.selected]!.name).toBe("alpha");
    now += 2000;
    await h.keys("a");
    expect(o.entries[o.selected]!.name).toBe("apple");
    // Back and forth between the three: shift+tab the other way.
    expect(o.focus).toBe("files");
    await h.keys("shift+tab");
    expect(o.focus).toBe("places");
    await h.keys("shift+tab");
    expect(o.focus).toBe("name");
    // A paste goes into the name.
    o.name = "";
    await h.keys("tab", "tab");
    h.app.input.paste("final.docx");
    expect([o.name, o.focus]).toEqual(["final.docx", "name"]);
    // ~/ in the name: from home, wherever the window is.
    o.name = "~/alpha/out.docx";
    await h.keys("enter");
    expect(await until(() => existsSync(join(home, "alpha", "out.docx")))).toBe(true);
  });

  test("the window's place marked: the one the folder is, else the nearest holding it; sizes and dates as a list shows them", () => {
    const places = [
      { label: "Beside the note", path: "/v/notes" },
      { label: "Downloads", path: "/h/Downloads" },
      { label: "Home", path: "/h" },
      { label: "This vault", path: "/v" },
    ];
    expect([
      placeOf(places, "/h/Downloads"),
      placeOf(places, "/h/Downloads/x/y"),
      placeOf(places, "/h/Shared"),
      placeOf(places, "/v/other"),
      placeOf(places, "/v/notes"),
      placeOf(places, "/hx"),
      placeOf(places, "/"),
    ]).toEqual([1, 1, 2, 3, 0, -1, -1]);
    expect(placeOf([{ label: "/", path: "/" }], "/etc")).toBe(0);
    // The nearest, whatever the order.
    expect(
      placeOf(
        [
          { label: "Home", path: "/h" },
          { label: "Downloads", path: "/h/Downloads" },
        ],
        "/h/Downloads/x",
      ),
    ).toBe(1);
    // At the filesystem's root, nothing to go up to.
    expect(listFolder("/", false).entries[0]?.up).toBeUndefined();
    expect(listFolder("/tmp", false).entries[0]).toMatchObject({ up: true, name: "‥" });
    expect([sizeText(812), sizeText(2048), sizeText(3.25 * 1024 * 1024), sizeText(42 * 1024 * 1024)]).toEqual([
      "812 B",
      "2 KB",
      "3.3 MB",
      "42 MB",
    ]);
    const now = new Date(2026, 9, 9).getTime();
    expect([dateText(new Date(2026, 8, 3).getTime(), now), dateText(new Date(2025, 11, 31).getTime(), now)]).toEqual([
      "Sep  3",
      "2025-12-31",
    ]);
  });

  test("ctrl+n makes a folder where you are and goes into it; one that can't be made, said", async () => {
    const root = makeVault();
    writeFileSync(join(root, "rep.md"), "# Rep\n");
    const home = mkdtempSync(join(sandbox, "home-"));
    const h = await harness({ root, open: "rep.md" });
    h.app.home = home;
    await h.keys("space", "n", "o", "enter", "down", "~", "ctrl+n");
    const o = saveAs(h);
    expect(o.creating).toBe("");
    expect(h.frame()).toContain("New folder:");
    for (const k of ["r", "e", "p", "o", "r", "t", "s"]) await h.keys(k);
    await h.keys("enter");
    expect([o.creating, o.dir]).toEqual([null, join(home, "reports")]);
    expect(existsSync(join(home, "reports"))).toBe(true);
    // Escape leaves the new folder's row, not the window.
    await h.keys("ctrl+n", "x", "escape");
    expect([o.creating, h.app.overlay?.kind]).toEqual([null, "saveas"]);
    chmodSync(join(home, "reports"), 0o555);
    try {
      await h.keys("ctrl+n", "n", "o", "enter");
      expect(o.error).toStartWith("no can't be made");
      expect(h.frame()).toContain("no can't be made");
    } finally {
      chmodSync(join(home, "reports"), 0o755);
    }
    await h.keys("tab", "enter");
    expect(await until(() => existsSync(join(home, "reports", "rep.docx")))).toBe(true);
  });

  test("the window with the mouse: a place clicked goes there, an entry clicked picks and again opens, the buttons, a click outside cancels", async () => {
    const root = makeVault();
    writeFileSync(join(root, "rep.md"), "# Rep\n");
    const home = mkdtempSync(join(sandbox, "home-"));
    mkdirSync(join(home, "Documents"));
    mkdirSync(join(home, "Documents", "Inner"));
    const h = await harness({ root, open: "rep.md" });
    h.app.home = home;
    let now = 1_000_000;
    (h.app as unknown as { now: () => number }).now = () => now;
    await h.keys("space", "n", "o", "enter");
    const o = saveAs(h);
    h.frame();
    const g = h.app.geometry!.saveas!;
    const click = (x: number, y: number) => h.app.mouse.handle({ type: "down", x, y, button: 0 });
    // Documents is the second place.
    click(g.places.x + 2, g.places.y + 1);
    expect(o.dir).toBe(join(home, "Documents"));
    h.frame();
    // Inner: picked, then (soon after) opened; later clicks only pick.
    const inner = o.entries.findIndex((e) => e.name === "Inner") - o.scroll;
    click(g.files.x + 4, g.files.y + inner);
    expect([o.dir, o.entries[o.selected]!.name, o.focus]).toEqual([join(home, "Documents"), "Inner", "files"]);
    now += 200;
    click(g.files.x + 4, g.files.y + inner);
    expect(o.dir).toBe(join(home, "Documents", "Inner"));
    // The name clicked: its focus.
    click(g.name.x + 3, g.name.y);
    expect(o.focus).toBe("name");
    // The Export button.
    h.frame();
    const ok = h.app.geometry!.hot.find((x) => x.id === "sav:ok")!;
    click(ok.x, ok.y);
    expect(await until(() => existsSync(join(home, "Documents", "Inner", "rep.docx")))).toBe(true);
    // A click outside: cancelled.
    await h.keys("space", "n", "o", "enter");
    h.frame();
    click(0, 0);
    expect(h.app.overlay).toBeNull();
  });

  test("an export that can't be written says why; an unsaved note that can't be saved stops it", async () => {
    const root = makeVault();
    writeFileSync(join(root, "rep.md"), "# Rep\n");
    mkdirSync(join(root, "ro"));
    const h = await harness({ root, open: "rep.md" });
    chmodSync(join(root, "ro"), 0o555);
    try {
      await h.app.run("note.export docx");
      saveAs(h).name = "ro/rep.docx";
      await h.keys("enter");
      expect(await until(() => h.app.messages.at(-1)!.level === "error")).toBe(true);
      expect(h.app.messages.at(-1)!.text).toStartWith("export: ro/rep.docx not written — ");
      expect(readdirSync(join(root, "ro"))).toEqual([]);
    } finally {
      chmodSync(join(root, "ro"), 0o755);
    }
    await h.keys("shift+g", "shift+a", "!", "escape");
    writeFileSync(join(root, "rep.md"), "# Rep, rewritten by an agent\n");
    await h.app.run("note.export docx");
    await h.keys("enter");
    expect(h.app.messages.at(-1)).toMatchObject({
      level: "warn",
      text: "export: rep.md changed on disk while unsaved — ␣ n c resolves it first",
    });
    expect(existsSync(join(root, "rep.docx"))).toBe(false);
  });
});
