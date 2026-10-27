import { TEST_BUDGETS } from "../../../support/timeouts.ts";
import { describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { offsetOf } from "../../../../src/tui/documents/editing/editing.ts";
import { makeSandbox, makeVault, harness, onlyRootsUnder, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
const sandbox = makeSandbox();

// typos: off
describe("spelling (25.6)", () => {
  const vault = (files: Record<string, string>) => {
    const root = makeVault();
    for (const [rel, text] of Object.entries(files)) writeFileSync(join(root, rel), text);
    return root;
  };
  const until = async (ok: () => boolean, ms = 25_000) => {
    for (const t = Date.now(); !ok() && Date.now() - t < ms; ) await Bun.sleep(20);
    return ok();
  };
  /**
   * The window's note checked: its dictionaries loaded, and every word of it answered by the spell checker's thread.
   */
  const checked = (h: Harness) =>
    until(() => (h.frame(), h.app.speller.misspelt(h.app.view!) !== null && !h.app.speller.pending(h.app.view!)));
  /** Spelling turned on, its dictionaries loaded: the window's misspelt words. */
  const on = async (h: Harness) => {
    await h.keys("space", "u", "s");
    expect(await checked(h)).toBe(true);
    return h.app.speller.misspelt(h.app.view!)!.map((w) => w.word);
  };
  /** The style of the first cell of `word` on the row showing `row`'s text. */
  const styleAt = (h: Harness, row: string, word: string) => {
    const c = h.canvas();
    const y = c.rows.findIndex((r) => r.join("").includes(row));
    return c.styles[y]![c.rows[y]!.join("").indexOf(word, c.rows[y]!.join("").indexOf(row))]!;
  };

  test("a diff isn't checked: its rows aren't a note's prose, and marks found in them would land on the wrong rows", async () => {
    const root = vault({ "s0.md": "# Spelling\n\nThis has a recieve.\n" });
    const h = await harness({ root, open: "s0.md", width: 120, height: 30 });
    expect(await on(h)).toEqual(["recieve"]);
    h.app.git.showLineDiff("one line\n", "one recieve line\n", "s0.md", "s0.md: a diff");
    expect(h.app.floating?.kind).toBe("diff");
    expect(h.app.speller.misspelt(h.app.floating!.view)).toBeNull();
  });

  test("off by default; space u s turns it on: misspelt words marked in the render and in source, not in code; ] s and [ s go to them", async () => {
    const root = vault({
      "s1.md": "# Spelling\n\nThis has a recieve and a\nseccond word here.\n\n`recieve` is code; this recieve isn't.\n",
    });
    const h = await harness({ root, open: "s1.md", width: 120, height: 30 });
    expect(h.app.speller.misspelt(h.app.view!)).toBeNull();
    expect(await on(h)).toEqual(["recieve", "seccond", "recieve"]);
    expect(h.app.messages.some((m) => m.text === "Spelling: on")).toBe(true);
    const spell = h.app.theme.roles.spell;
    // Rendered: the paragraph's row, both its words; the code span's, not.
    expect(styleAt(h, "This has a recieve", "recieve")).toMatchObject({ fg: spell.fg, underline: true });
    expect(styleAt(h, "This has a recieve", "seccond")).toMatchObject({ fg: spell.fg, underline: true });
    // On the line with the code, the code's not, the prose's is.
    expect(styleAt(h, "recieve is code; this recieve", "recieve").fg).not.toBe(spell.fg);
    expect(styleAt(h, "this recieve isn't", "recieve")).toMatchObject({ fg: spell.fg, underline: true });
    // ] s from the top: each in turn, around the end; [ s back.
    const v = h.app.view!;
    const at = () =>
      h.app
        .currentLayout(v)
        .lines[v.cur.row]!.spans.map((s) => s.text)
        .join("")
        .slice(v.cur.col, v.cur.col + 7);
    const spot = () => `${at()}@${v.cur.row}`;
    await h.keys("]", "s");
    const first = spot();
    await h.keys("]", "s");
    const second = spot();
    await h.keys("]", "s");
    const third = spot();
    expect([first, second, third].map((x) => x.split("@")[0])).toEqual(["recieve", "seccond", "recieve"]);
    // The paragraph's two on one row; the code's line's on another.
    expect(first.split("@")[1]).toBe(second.split("@")[1]);
    expect(third.split("@")[1]).not.toBe(first.split("@")[1]);
    await h.keys("]", "s");
    expect(spot()).toBe(first); // around the end
    await h.keys("[", "s");
    expect(spot()).toBe(third); // around the start
    await h.keys("[", "s", "[", "s");
    expect(spot()).toBe(first); // the one before seccond, on its row
    // Source mode: by their offsets.
    await h.keys("ctrl+k");
    expect(styleAt(h, "seccond word here", "seccond")).toMatchObject({ fg: spell.fg, underline: true });
    expect(styleAt(h, "`recieve` is code", "recieve").fg).not.toBe(spell.fg);
    expect(styleAt(h, "this recieve isn't", "recieve")).toMatchObject({ fg: spell.fg, underline: true });
    await h.keys("g", "g", "]", "s");
    expect(h.app.view!.buf.source.slice(offsetOf(h.app, h.app.view!), offsetOf(h.app, h.app.view!) + 7)).toBe(
      "recieve",
    );
    // A link's address with the misspelt word in it isn't marked, its text is; nor a word that only holds it. Typed
    // with no other vault known: a link's target offers every vault this machine knows, read again at each key that
    // matches none, and this file's tests leave hundreds.
    await onlyRootsUnder(root, () =>
      h.keys(
        "shift+g",
        "o",
        "enter",
        ...[..."[recieve](recieve.md) and likely lik"].map((k) => (k === " " ? "space" : k)),
        "escape",
      ),
    );
    expect(await until(() => (h.frame(), (h.app.speller.misspelt(h.app.view!) ?? []).length === 5))).toBe(true);
    expect(
      h.app.speller
        .misspelt(h.app.view!)!
        .slice(3)
        .map((w) => w.word),
    ).toEqual(["recieve", "lik"]);
    expect(styleAt(h, "[recieve](recieve.md)", "recieve")).toMatchObject({ fg: spell.fg, underline: true });
    expect(styleAt(h, "(recieve.md)", "recieve").fg).not.toBe(spell.fg);
    expect(styleAt(h, "likely lik", "likely").fg).not.toBe(spell.fg);
    expect(styleAt(h, "y lik", "lik")).toMatchObject({ fg: spell.fg, underline: true });
    await h.keys("ctrl+k");
    expect(styleAt(h, "recieve and likely", "recieve")).toMatchObject({ fg: spell.fg, underline: true });
    expect(styleAt(h, "and likely lik", "likely").fg).not.toBe(spell.fg);
    expect(styleAt(h, "y lik", "lik")).toMatchObject({ fg: spell.fg, underline: true });
    await h.keys("ctrl+k");
    // A find's match over one shows as the match.
    await h.keys("/", ...[..."seccond"], "enter");
    expect(styleAt(h, "seccond word here", "seccond").fg).not.toBe(spell.fg);
    // Off again: no marks, ] s says why.
    await h.keys("escape", "space", "u", "s");
    expect(h.app.speller.misspelt(h.app.view!)).toBeNull();
    await h.keys("]", "s");
    expect(h.app.messages.at(-1)?.text).toBe("spelling is off — space u s turns it on");
  });

  test("z = suggests: enter puts one in its place, one undo step; its last row adds the word; z g too — another note's mark goes", async () => {
    const root = vault({ "s1.md": "A recieve and Zorvexium.\n", "s2.md": "Zorvexium again, and Quorblet.\n" });
    const h = await harness({ root, open: "s2.md", width: 120, height: 30 });
    h.app.openInNewTab("s1.md");
    expect(await on(h)).toEqual(["recieve", "Zorvexium"]);
    await h.keys("]", "s", "z", "=");
    const list = h.app.overlay as ListOverlay;
    expect(list.items[0]!.label).toBe("receive");
    expect(list.items.at(-1)!.label).toBe('add "recieve" to your words');
    await h.keys("enter");
    expect(h.app.view!.buf.source).toBe("A receive and Zorvexium.\n");
    expect(h.app.view!.buf.dirty).toBe(true);
    await h.keys("ctrl+z");
    expect(h.app.view!.buf.source).toBe("A recieve and Zorvexium.\n");
    // The text changed under the list (a reload): the word isn't replaced where it no longer is.
    await h.keys("g", "g", "]", "s", "z", "=");
    h.app.view!.buf.edit(0, 0, "So ");
    await h.keys("enter");
    expect(h.app.messages.at(-1)?.text).toBe('"recieve" changed meanwhile — not replaced');
    expect(h.app.view!.buf.source).toBe("So A recieve and Zorvexium.\n");
    // z g on the other: added, marked nowhere — here, nor in the other note.
    await h.keys("g", "g", "]", "s", "]", "s");
    await h.keys("z", "g");
    expect(h.app.messages.at(-1)?.text).toStartWith('"Zorvexium" added to your words');
    expect(h.app.speller.misspelt(h.app.view!)!.map((w) => w.word)).toEqual(["recieve"]);
    h.app.openInNewTab("s2.md");
    expect(await checked(h)).toBe(true);
    expect(h.app.speller.misspelt(h.app.view!)!.map((w) => w.word)).toEqual(["Quorblet"]);
    // The add row does as z g.
    await h.keys("]", "s", "z", "=");
    await h.keys(...Array((h.app.overlay as ListOverlay).items.length - 1).fill("down"), "enter");
    expect(h.app.messages.at(-1)?.text).toStartWith('"Quorblet" added to your words');
    // Off a misspelt word: said.
    await h.keys("g", "g", "z", "=");
    expect(h.app.messages.at(-1)?.text).toBe("no misspelt word under the cursor");
  });

  test("a note's lang: picks its dictionaries; a language with none is said once; not a note, no spelling", async () => {
    const root = vault({
      "s3.md": "---\nlang: tr\n---\nBugün evlerinzde kitap okuyorum.\n",
      "s4.md": "---\nlang: [xx, tr]\n---\nzzq kitap\n",
      "s5.ts": "const recieve = 1;\n",
    });
    // First the one with no dictionary for xx: said once, though tr's is loading meanwhile, frame after frame.
    const h = await harness({ root, open: "s4.md", width: 120, height: 30 });
    expect(await on(h)).toEqual(["zzq"]);
    h.frame();
    expect(
      h.app.messages.filter((m) => m.text === "spelling: no dictionary for xx — [spell] dictionaries can name yours")
        .length,
    ).toBe(1);
    h.app.openInNewTab("s3.md");
    expect(await checked(h)).toBe(true);
    expect(h.app.speller.misspelt(h.app.view!)!.map((w) => w.word)).toEqual(["evlerinzde"]);
    h.app.openInNewTab("s5.ts");
    expect(h.app.speller.misspelt(h.app.view!)).toBeNull();
    await h.keys("]", "s");
    expect(h.app.messages.at(-1)?.text).toBe("spelling is a note's");
  });

  /** A Turkish dictionary (9 MB) under a path of the test's own, so it's built now whatever was built before, and a
   *  note in its language open: the harness, and the dictionary's words (`dic`). */
  const turkish = async () => {
    const { dictionaryFiles } = await import("../../../../src/core/documents/diagnostics/spell.ts");
    const tr = dictionaryFiles("tr", {})!;
    const dict = mkdtempSync(join(sandbox, "dict-"));
    const dic = join(dict, "zz.dic");
    cpSync(tr.aff, join(dict, "zz.aff"));
    cpSync(tr.dic, dic);
    const root = vault({ "s6.md": "---\nlang: zz\n---\nBugün evlerinzde kitap okuyorum.\n" });
    const h = await harness({
      root,
      open: "s6.md",
      width: 120,
      height: 30,
      config: (c) => {
        c.spell.dictionaries = { zz: dic };
      },
    });
    return { h, dic };
  };

  test("a dictionary is built on the spell checker's thread, never here: counted; typing keeps the marks (#40)", async () => {
    const { dictionariesBuilt } = await import("../../../../src/core/documents/diagnostics/hunspell.ts");
    const { stopSpellThread } = await import("../../../../src/core/documents/diagnostics/spell-thread.ts");
    const { h } = await turkish();
    try {
      const built = dictionariesBuilt();
      await h.keys("space", "u", "s");
      expect(await until(() => (h.frame(), h.app.speller.misspelt(h.app.view!) !== null))).toBe(true);
      expect(dictionariesBuilt()).toBe(built); // none here: the thread built it
      expect(await checked(h)).toBe(true);
      expect(h.app.speller.misspelt(h.app.view!)!.map((w) => w.word)).toEqual(["evlerinzde"]);
      // Typing a word the thread hasn't answered: the marks it has answered stay, at every key.
      await h.keys("shift+g", "shift+a");
      for (const k of ["space", ..."kitpa"]) {
        await h.keys(k);
        expect(h.app.speller.misspelt(h.app.view!)!.map((w) => w.word)).toContain("evlerinzde");
      }
      expect(await checked(h)).toBe(true);
      expect(h.app.speller.misspelt(h.app.view!)!.map((w) => w.word)).toEqual(["evlerinzde", "kitpa"]);
    } finally {
      stopSpellThread(); // a fresh thread for the tests after: this test's 9 MB dictionary isn't kept for them
    }
  });

  // Counted, not timed. The main thread's longest gap against the load's time measured the runner and the test process
  // as much as slipbox: on CI the main thread went without a turn for most of a load the thread built (716 ms of 946;
  // 605 of 632 on a release's runner), and here for 200 ms just after a thousand harnesses were made. So the thread is
  // held inside the dictionary's opening, before Hunspell builds it, until the main thread has taken its turns: a main
  // thread held while the dictionary loads takes none before it's there.
  test(
    "while the thread loads a dictionary, the main thread keeps its turns: counted, the thread held before it builds (#40)",
    async () => {
      const { holdBuild, stopSpellThread } = await import("../../../../src/core/documents/diagnostics/spell-thread.ts");
      const { h, dic } = await turkish();
      // The hold's own bounds are a stuck test's, never a passing one's (let go milliseconds after it's waiting): its
      // wait runs out after 40 s on the thread's clock, inside the test's 60 s, so a main thread held until the
      // dictionary is there is let go and fails here rather than hanging the run. The request's 20 s deadline, on the
      // main thread, ends the hold first if the main thread is merely starved that long.
      const hold = await holdBuild(dic);
      try {
        await h.keys("space", "u", "s");
        // The thread has the request and waits before building — unless the dictionary is there already, built here.
        expect(await until(() => hold.state() !== "set" || h.app.speller.misspelt(h.app.view!) !== null)).toBe(true);
        expect(hold.state()).toBe("waiting");
        // The main thread's turns meanwhile: a timer's, and keys answered and drawn, the dictionary not there at any.
        expect(h.app.speller.misspelt(h.app.view!)).toBeNull();
        await new Promise((turn) => setTimeout(turn, 0));
        expect([hold.state(), h.app.speller.misspelt(h.app.view!)]).toEqual(["waiting", null]);
        await h.keys("]", "s");
        expect(h.app.messages.at(-1)?.text).toBe("spelling: its dictionaries are loading");
        await h.keys("shift+g", "shift+a");
        for (const k of ["space", ..."kitpa"]) {
          await h.keys(k);
          expect(h.app.speller.misspelt(h.app.view!)).toBeNull();
        }
        expect(h.app.view!.buf.source).toEndWith("okuyorum. kitpa\n");
        // Held until now: let go by the test, not by its wait running out.
        hold.letGo();
        expect(await until(() => hold.state() !== "waiting")).toBe(true);
        expect(hold.state()).toBe("let go");
        expect(await checked(h)).toBe(true);
        expect(h.app.speller.misspelt(h.app.view!)!.map((w) => w.word)).toEqual(["evlerinzde", "kitpa"]);
      } finally {
        // A fresh thread for the tests after, nothing of this test's kept; a thread still held ends there, unbuilt.
        stopSpellThread();
      }
    },
    TEST_BUDGETS.dictionaryThread,
  );

  test(
    "a dictionary the thread can't build is said once; the note's other languages still check it",
    async () => {
      const { dictionaryFiles } = await import("../../../../src/core/documents/diagnostics/spell.ts");
      const { holdBuild, stopSpellThread } = await import("../../../../src/core/documents/diagnostics/spell-thread.ts");
      const dict = mkdtempSync(join(sandbox, "dict-"));
      writeFileSync(join(dict, "zz.aff"), "SET UTF-8\n");
      mkdirSync(join(dict, "zz.dic")); // a folder: there, but no words to read
      // English under a path of the test's own, held before it's built: frames drawn after zz failed, while English
      // still loads, each ask about zz again, whatever was built before. Its wait's 40 s are inside the test's 60.
      const en = dictionaryFiles("en", {})!;
      cpSync(en.aff, join(dict, "en.aff"));
      cpSync(en.dic, join(dict, "en.dic"));
      const h = await harness({
        root: vault({ "s7.md": "---\nlang: [zz, en]\n---\nThis has a recieve.\n" }),
        open: "s7.md",
        width: 120,
        height: 30,
        config: (c) => {
          c.spell.dictionaries = { zz: join(dict, "zz.dic"), en: join(dict, "en.dic") };
        },
      });
      const hold = await holdBuild(join(dict, "en.dic"));
      const said = () => h.app.messages.filter((m) => m.text.startsWith("spelling: zz's dictionary didn't load ("));
      try {
        await h.keys("space", "u", "s");
        // zz is asked first and fails before English is asked for.
        expect(await until(() => hold.state() === "waiting")).toBe(true);
        for (let i = 0; i < 3; i++) h.frame();
        expect(said().map((m) => m.level)).toEqual(["warn"]);
        hold.letGo();
        expect(await checked(h)).toBe(true);
        expect(h.app.speller.misspelt(h.app.view!)!.map((w) => w.word)).toEqual(["recieve"]);
        h.frame();
        expect(said()).toHaveLength(1);
      } finally {
        stopSpellThread();
      }
    },
    TEST_BUDGETS.dictionaryThread,
  );
});
// typos: on
