import { UNIT_TIMEOUT_MS, TEST_BUDGETS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parseMarkdown } from "../../../../src/core/documents/markdown/parse.ts";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

// typos: off — the spell checker's tests misspell on purpose.
describe("spelling (25.6)", () => {
  const dir = () => mkdtempSync(join(tmpdir(), "slipbox-spell-"));

  test("a note's prose, word by word: not its front matter, code, addresses, wikilinks, tags, abbreviations or identifiers", async () => {
    const { proseWords } = await import("../../../../src/core/documents/diagnostics/spell.ts");
    const src = [
      "---",
      "title: Frontmatter wrods",
      "---",
      "# A headng",
      "",
      "Tehre is `inlnie` code, [a lnik](https://exmaple.com/pth) and <https://autolnik.com>, mail <a@bcdx.co>.",
      "A [[Wikilnik]] and #tagg; API, x86, snake_cse, camelCse, file.tss, src/coer and don't, Ankara'da.",
      "Mail kenjii@exmaple.org, see slipbox://reserch/notte.md and file:///hme/x, ![a pictre](p.png) $mathh$ <b>htmll</b>",
      "",
      "```js",
      "const misspeld = 1;",
      "```",
      "",
      "| Tabel | cell |",
      "| --- | --- |",
      "| celll | $mathh$ |",
      "",
    ].join("\n");
    const words = proseWords(parseMarkdown(src).tree, src);
    expect(words.map((w) => `${w.word}@${w.line}:${w.column}`)).toEqual([
      "headng@4:5",
      "Tehre@6:1",
      "is@6:7",
      "code@6:19",
      "lnik@6:28",
      "and@6:59",
      "mail@6:87",
      "and@7:16",
      "and@7:77",
      "don't@7:81",
      "Ankara'da@7:88",
      "Mail@8:1",
      "see@8:26",
      "and@8:57",
      "htmll@8:106",
      "Tabel@14:3",
      "cell@14:11",
      "celll@16:3",
    ]);
    // Each by its offset too.
    expect(words.every((w) => src.slice(w.from, w.to) === w.word)).toBe(true);
  });

  test("a language's dictionary: yours, else the system's for that very language, else slipbox's, else the system's for its base", async () => {
    const { dictionaryFiles } = await import("../../../../src/core/documents/diagnostics/spell.ts");
    const home = dir();
    const sys = dir();
    for (const n of ["tr_TR", "en_GB", "de_DE", "de_AT"]) {
      writeFileSync(join(sys, `${n}.aff`), "");
      writeFileSync(join(sys, `${n}.dic`), "");
    }
    // An .aff without its .dic is no dictionary.
    writeFileSync(join(sys, "pt_BR.aff"), "");
    mkdirSync(join(home, "d"));
    writeFileSync(join(home, "d", "mine.aff"), "");
    writeFileSync(join(home, "d", "mine.dic"), "");
    const yours = { fr: "~/d/mine.dic", it: join(home, "d", "mine"), es: "~/d/none.dic" };
    const at = (lang: string) => {
      const f = dictionaryFiles(lang, yours, [sys], home);
      return (
        f &&
        `${f.from}:${f.aff.startsWith(sys) ? f.aff.slice(sys.length + 1) : f.from === "slipbox" ? "bundled" : f.aff.slice(home.length + 1)}`
      );
    };
    expect([at("fr"), at("it"), at("fr-FR")]).toEqual(["yours:d/mine.aff", "yours:d/mine.aff", "yours:d/mine.aff"]);
    // tr-TR: the system's own; tr and en: slipbox's; en-GB: the system's; de: the system's first de_*.
    expect([at("tr-TR"), at("tr"), at("en"), at("en-GB"), at("en_US"), at("de")]).toEqual([
      "system:tr_TR.aff",
      "slipbox:bundled",
      "slipbox:bundled",
      "system:en_GB.aff",
      "slipbox:bundled",
      "system:de_AT.aff",
    ]);
    // Yours not there: the rest as before; a language nobody has, none.
    expect([at("es"), at("xx"), at("pt-BR"), at("pt")]).toEqual([null, null, null, null]);
  });

  test("a dictionary in another encoding is read as UTF-8; one in UTF-8 as it is", async () => {
    const { asUtf8, openSpeller } = await import("../../../../src/core/documents/diagnostics/hunspell.ts");
    const latin = (s: string) =>
      Uint8Array.from([...s].map((c) => (c === "ı" ? 0xfd : c === "ş" ? 0xfe : c.charCodeAt(0))));
    const aff = latin("SET ISO8859-9\nTRY abcı\n");
    const dic = latin("2\nkış\nkız\n");
    const out = asUtf8(aff, dic);
    expect(new TextDecoder().decode(out.aff)).toBe("SET UTF-8\nTRY abcı\n");
    expect(new TextDecoder().decode(out.dic)).toBe("2\nkış\nkız\n");
    const utf = new TextEncoder().encode("SET UTF-8\n");
    expect(asUtf8(utf, dic).aff).toBe(utf);
    // Opened, it knows its words as written.
    const d = dir();
    writeFileSync(join(d, "x.aff"), aff);
    writeFileSync(join(d, "x.dic"), dic);
    const s = await openSpeller({ aff: join(d, "x.aff"), dic: join(d, "x.dic"), from: "yours" });
    expect([s.correct("kış"), s.correct("kız"), s.correct("kiz")]).toEqual([true, true, false]);
  });

  test("slipbox's English and Turkish; your words put in as each opens; the languages a note names", async () => {
    const { openSpeller } = await import("../../../../src/core/documents/diagnostics/hunspell.ts");
    const { addOwnWord, dictionaryFiles, noteLanguages, ownWords, ownWordsFile } = await import(
      "../../../../src/core/documents/diagnostics/spell.ts"
    );
    addOwnWord("Zorvexian");
    expect(ownWords()).toContain("Zorvexian");
    expect(ownWordsFile()).toBe(join(process.env.XDG_DATA_HOME!, "slipbox", "spell", "words.txt"));
    const en = await openSpeller(dictionaryFiles("en", {})!);
    expect([en.correct("receive"), en.correct("recieve"), en.correct("Zorvexian"), en.correct("don't")]).toEqual([
      true,
      false,
      true,
      true,
    ]);
    expect(en.suggest("recieve")[0]).toBe("receive");
    const tr = await openSpeller(dictionaryFiles("tr", {})!);
    expect([tr.correct("kitaplarımızdan"), tr.correct("evlerinzde"), tr.correct("Ankara'da")]).toEqual([
      true,
      false,
      true,
    ]);
    expect([
      noteLanguages({ lang: "tr" }, ["en"]),
      noteLanguages({ lang: "tr, en" }, ["en"]),
      noteLanguages({ lang: ["tr-TR", 3] }, ["en"]),
      noteLanguages({}, ["en"]),
      noteLanguages(null, ["de"]),
    ]).toEqual([["tr"], ["tr", "en"], ["tr-TR"], ["en"], ["de"]]);
  });

  test("your words: one a line, comments and blank lines left out; added at the end, a line of its own", async () => {
    const { addOwnWord, ownWords } = await import("../../../../src/core/documents/diagnostics/spell.ts");
    const f = join(dir(), "sub", "words.txt");
    expect(ownWords(f)).toEqual([]);
    addOwnWord("one", f);
    writeFileSync(f, `${readFileSync(f, "utf8")}# a comment\n\n  two  `);
    addOwnWord("three", f);
    expect(readFileSync(f, "utf8")).toBe("one\n# a comment\n\n  two  \nthree\n");
    expect(ownWords(f)).toEqual(["one", "two", "three"]);
  });

  test("a checker: its dictionaries answer later, each word asked once; a word added re-asks the misspelt; suggestions in turn, ten at most", async () => {
    const { Checker } = await import("../../../../src/core/documents/diagnostics/spell.ts");
    let known = ["bir", "don't", "one"];
    const asked: string[][] = [];
    let heard = 0;
    const c = new Checker(
      {
        check: async (words) => (asked.push(words), words.map((x) => known.includes(x))),
        suggest: async () => [
          ["a1", "a2", "x"],
          ["b1", "x", "b2", ...Array.from({ length: 9 }, (_, i) => `c${i}`)],
        ],
      },
      () => heard++,
    );
    const w = (word: string) => ({ word, line: 1, column: 1, from: 0, to: word.length });
    const words = ["bir", "zzz", "one", "don’t", "qqq", "zzz"].map(w);
    // Not answered yet: none marked, and asked once — each word once, a typographic apostrophe as a plain one.
    expect(c.misspelt(words)).toEqual([]);
    expect(c.pending).toBe(true);
    expect(c.misspelt(words)).toEqual([]);
    expect(asked).toEqual([["bir", "zzz", "one", "don't", "qqq"]]);
    await c.settled();
    expect([c.pending, heard]).toEqual([false, 1]);
    expect(c.misspelt(words).map((x) => x.word)).toEqual(["zzz", "qqq", "zzz"]);
    expect([c.correct("bir"), c.correct("zzz"), c.correct("never-asked")]).toEqual([true, false, undefined]);
    expect(asked.length).toBe(1); // answered already
    // A word added: right at once; the other misspelt ones asked again, still marked until their answer comes.
    known = [...known, "zzz", "qqq"];
    c.added("zzz");
    expect(asked.at(-1)).toEqual(["qqq"]);
    expect(c.misspelt(words).map((x) => x.word)).toEqual(["qqq"]);
    await c.settled();
    expect(c.misspelt(words)).toEqual([]);
    expect(await c.suggest("zzz")).toEqual(["a1", "b1", "a2", "x", "b2", "c0", "c1", "c2", "c3", "c4"]);
    // The CLI's: every answer waited for.
    expect((await c.misspeltAll([w("one"), w("www")])).map((x) => x.word)).toEqual(["www"]);
    // No dictionary: nothing is misspelt.
    expect(await new Checker(null).misspeltAll([w("zzz")])).toEqual([]);
    // Dictionaries that fail: why kept, the words unknown — never taken as right — and not asked again at every frame,
    // but once a while has passed; answered then, marked.
    let tries = 0;
    let fail = true;
    let now = 1000;
    const failing = new Checker(
      {
        check: async (words) => (
          tries++, fail ? Promise.reject(new Error("the thread stopped")) : words.map(() => false)
        ),
        suggest: async () => [],
      },
      undefined,
      () => now,
    );
    expect(await failing.misspeltAll([w("zzz")])).toEqual([]);
    expect(failing.misspelt([w("zzz")])).toEqual([]);
    expect([failing.error, tries, failing.correct("zzz"), failing.retryDue()]).toEqual([
      "the thread stopped",
      1,
      undefined,
      false,
    ]);
    now += Checker.RETRY_MS;
    fail = false;
    expect(failing.retryDue()).toBe(true);
    expect((await failing.misspeltAll([w("zzz")])).map((x) => x.word)).toEqual(["zzz"]);
    expect([tries, failing.correct("zzz"), failing.retryDue()]).toEqual([2, false, false]);
  });

  test("the spell checker's thread: dictionaries built there and asked; your word put in; stopped or failed, the next request starts it again", async () => {
    const { addOwnWord, dictionaryFiles } = await import("../../../../src/core/documents/diagnostics/spell.ts");
    const { dictionariesBuilt } = await import("../../../../src/core/documents/diagnostics/hunspell.ts");
    const { addToDictionaries, openDictionary, stopSpellThread, threadDictionaries } = await import(
      "../../../../src/core/documents/diagnostics/spell-thread.ts"
    );
    const built = dictionariesBuilt();
    const en = dictionaryFiles("en", {})!;
    const tr = dictionaryFiles("tr", {})!;
    await openDictionary(en);
    const both = threadDictionaries([en, tr]); // tr's built as it's first asked
    expect(await both.check(["receive", "recieve", "kitaplarımızdan", "Glorbex"])).toEqual([true, false, true, false]);
    expect((await both.suggest("recieve")).map((l) => l[0])).toContain("receive");
    expect(dictionariesBuilt()).toBe(built); // there, not here
    // Your word: in each dictionary built; a request after it knows it.
    addOwnWord("Glorbex");
    addToDictionaries("Glorbex");
    expect(await both.check(["Glorbex"])).toEqual([true]);
    // Stopped: the next request starts another, which builds what it's asked about again — your words from your file.
    stopSpellThread();
    expect(await both.check(["Glorbex", "recieve"])).toEqual([true, false]);
    // A dictionary that can't be built: why, as the request's rejection.
    const gone = { aff: join(dir(), "gone.aff"), dic: join(dir(), "gone.dic"), from: "yours" as const };
    expect(
      await openDictionary(gone).then(
        () => "built",
        (err: Error) => err.message,
      ),
    ).toContain("gone.aff");
    // A thread that fails: what's waiting ends with its error, and the next request starts a real one again.
    const real = globalThis.Worker;
    class Failing {
      onmessage: unknown = null;
      onerror: ((e: unknown) => void) | null = null;
      unref() {}
      ref() {}
      postMessage() {
        setTimeout(() => this.onerror?.({ message: "crashed" }), 1);
      }
      terminate() {}
    }
    stopSpellThread();
    try {
      (globalThis as { Worker: unknown }).Worker = Failing;
      expect(await both.check(["receive"]).then(String, (err: Error) => err.message)).toBe(
        "the spell checker's thread stopped: crashed",
      );
    } finally {
      (globalThis as { Worker: unknown }).Worker = real;
    }
    expect(await both.check(["receive"])).toEqual([true]);
    stopSpellThread();
  });

  test(
    "a test's hold on the spell checker's thread: its dictionary waits before it's built until let go, or until its wait runs out; one already built never waits; stopping the thread ends a wait, unbuilt",
    async () => {
      const { dictionaryFiles } = await import("../../../../src/core/documents/diagnostics/spell.ts");
      const { holdBuild, openDictionary, stopSpellThread } = await import(
        "../../../../src/core/documents/diagnostics/spell-thread.ts"
      );
      const until = async (ok: () => boolean) => {
        for (const t = Date.now(); !ok() && Date.now() - t < 25_000; ) await Bun.sleep(5);
        return ok();
      };
      /** English under a path of its own: built when asked, whatever was built before. */
      const own = () => {
        const en = dictionaryFiles("en", {})!;
        const d = dir();
        cpSync(en.aff, join(d, "en.aff"));
        cpSync(en.dic, join(d, "en.dic"));
        return { aff: join(d, "en.aff"), dic: join(d, "en.dic"), from: "yours" as const };
      };
      stopSpellThread();
      const [a, b, c] = [own(), own(), own()];
      try {
        // Two holds at once, each its own dictionary's: set until that one is asked for.
        const holdA = await holdBuild(a.dic);
        const holdB = await holdBuild(b.dic, 100);
        expect([holdA.state(), holdB.state()]).toEqual(["set", "set"]);
        // A second on the same words, before the first is spent: refused.
        expect(await holdBuild(b.dic).then(String, (err: Error) => err.message)).toBe(
          `a hold is set on ${b.dic} already`,
        );
        let built = false;
        const openA = openDictionary(a).then(
          () => (built = true),
          (err: Error) => err.message,
        );
        expect(await until(() => holdA.state() === "waiting")).toBe(true);
        await Bun.sleep(50);
        expect([built, holdB.state()]).toEqual([false, "set"]);
        holdA.letGo();
        expect(await openA).toBe(true);
        expect(holdA.state()).toBe("let go");
        // Built already: asked for again, it isn't built again, and the hold is spent without waiting — so the same words
        // with another affix file, built, don't wait either.
        const again = await holdBuild(a.dic);
        await openDictionary(a);
        expect(again.state()).toBe("spent");
        cpSync(a.aff, join(dirname(a.aff), "other.aff"));
        await openDictionary({ ...a, aff: join(dirname(a.aff), "other.aff") });
        expect(again.state()).toBe("spent");
        // Its wait run out (100 ms here, 40 s unless said): built all the same, and it says so.
        await openDictionary(b);
        expect(holdB.state()).toBe("ran out");
        // Stopped while it waits: the request ends with the thread, and the wait with it — the hold dropped. Let go after,
        // it stays so: a thread still waiting would wake and say "let go", and go on to build the dictionary.
        const holdC = await holdBuild(c.dic);
        const openC = openDictionary(c).then(
          () => "built",
          (err: Error) => err.message,
        );
        expect(await until(() => holdC.state() === "waiting")).toBe(true);
        stopSpellThread();
        expect(await openC).toBe("worker stopped");
        expect(holdC.state()).toBe("dropped");
        await Bun.sleep(200);
        holdC.letGo();
        await Bun.sleep(200);
        expect(holdC.state()).toBe("dropped");
        // Set and not yet reached, it's dropped with its thread too; a fresh thread builds the dictionary, unheld.
        const holdD = await holdBuild(c.dic);
        stopSpellThread();
        expect(holdD.state()).toBe("dropped");
        await openDictionary(c);
      } finally {
        stopSpellThread();
      }
    },
    TEST_BUDGETS.dictionaryThread,
  );

  test("Hunspell is loaded by the spell checker's thread alone: nothing else imports it (#40)", async () => {
    const { importsOf } = await import("../../../../scripts/check-boundary.ts");
    const root = join(import.meta.dir, "../../../..");
    const importers: string[] = [];
    for (const f of new Bun.Glob("src/**/*.ts").scanSync(root)) {
      if (f.endsWith(".d.ts") || f === "src/core/documents/diagnostics/hunspell.ts") continue;
      for (const spec of importsOf(readFileSync(join(root, f), "utf8")))
        if (/(^|\/)hunspell\.ts$|^hunspell-asm/.test(spec)) importers.push(`${f} ${spec}`);
    }
    expect(importers).toEqual(["src/core/documents/diagnostics/spell-worker.ts ./hunspell.ts"]);
  });

  test("a worker's script: beside its module from the source; in the compiled binary, under core/ from its root, whichever entry point starts it", async () => {
    const { workerUrl } = await import("../../../../src/core/foundation/workers/url.ts");
    expect(workerUrl("documents/diagnostics/spell-worker.ts")).toBe(
      Bun.pathToFileURL(join(import.meta.dir, "../../../../src/core/documents/diagnostics/spell-worker.ts")).href,
    );
    expect(workerUrl("documents/diagnostics/spell-worker.ts", "file:///$bunfs/root/slipbox")).toBe(
      "file:///$bunfs/root/core/documents/diagnostics/spell-worker.ts",
    );
    // From a module bundled into a worker's entry point (the export's, starting the diagrams'): the same place, not
    // core/core/, where Bun finds no module and the worker never starts.
    expect(
      workerUrl(
        "rendering/media/diagrams/diagram-worker.ts",
        "file:///$bunfs/root/core/rendering/export/export-worker.js",
      ),
    ).toBe("file:///$bunfs/root/core/rendering/media/diagrams/diagram-worker.ts");
    expect(
      workerUrl("../tui/shell/terminal/opentui.ts", "file:///$bunfs/root/core/rendering/export/export-worker.js"),
    ).toBe("file:///$bunfs/root/tui/shell/terminal/opentui.ts");
  });
});

describe("spelling, bundled (25.6)", () => {
  test(
    "Hunspell from a bundle, as the compiled binary has it: its runtime called, a dictionary opened",
    () => {
      const dir = mkdtempSync(join(tmpdir(), "slipbox-bundle-"));
      const entry = join(dir, "entry.ts");
      writeFileSync(
        entry,
        `import { dictionaryFiles } from ${JSON.stringify(join(import.meta.dir, "../../../..", "src", "core", "documents", "diagnostics", "spell.ts"))};\n` +
          `import { openSpeller } from ${JSON.stringify(join(import.meta.dir, "../../../..", "src", "core", "documents", "diagnostics", "hunspell.ts"))};\n` +
          `const s = await openSpeller(dictionaryFiles("en", {})!);\nconsole.log(s.correct("receive"), s.correct("recieve"));\n`,
      );
      const built = Bun.spawnSync([process.execPath, "build", entry, "--target", "bun", "--outdir", join(dir, "out")], {
        stderr: "pipe",
      });
      expect(built.exitCode).toBe(0);
      // Run where its files are: a bundle names them from there (a compiled binary has them inside it).
      const ran = Bun.spawnSync([process.execPath, join(dir, "out", "entry.js")], {
        cwd: join(dir, "out"),
        stderr: "pipe",
        env: { ...process.env },
      });
      expect(new TextDecoder().decode(ran.stderr)).toBe("");
      expect(new TextDecoder().decode(ran.stdout)).toBe("true false\n");
    },
    TEST_BUDGETS.dictionaryBundle,
  );
});
// typos: on
