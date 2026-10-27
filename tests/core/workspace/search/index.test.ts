import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { runCli } from "../../../../src/cli/cli.ts";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";

import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";

import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("search: the index and the scan (6.x)", () => {
  const setup = () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-search-"));
    mkdirSync(join(dir, ".slipbox"));
    const files: Record<string, string> = {
      "dome.md":
        "---\ntitle: Dome refit\naliases: [Shutter work]\ntags: [dome/shutter, budget]\n---\n# Dome refit\n\nThe summer shutdown.\n\n## Parts\n\nNew rollers for the shutter belt.\n\n```\n# not a heading\nshutter in code\n```\n",
      "log.md":
        "# Night log\n\nOpened the dome at 21:10.\nThe shutter stuck once.\n\nCalibration\n===========\n\nFlats at dusk. #calibration\n",
      "notes/café.md": "# Café\n\nThe naïve résumé was at the café.\n",
      "notes/plan.md":
        '+++\ntitle = "Plan"\ntags = ["planning"]\n+++\n\nPhotometry pipeline plans; calibrating everything.\n',
      "data.toml": 'name = "observatory"\nshutter_speed = 3\n',
    };
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(join(dir, rel, ".."), { recursive: true });
      writeFileSync(join(dir, rel), text);
    }
    return { dir, g: openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true) };
  };

  test("what a note gives the index: sections at headings (not in code), its frontmatter's title, aliases and tags, inline tags", async () => {
    const { indexDoc } = await import("../../../../src/core/workspace/search/search.ts");
    const d = indexDoc("dome.md", readFileSync(join(setup().dir, "dome.md"), "utf8"), "note");
    expect(d).toMatchObject({ title: "Dome refit", aliases: ["Shutter work"], tags: ["dome/shutter", "budget"] });
    expect(d.headings).toEqual([
      { line: 6, text: "Dome refit" },
      { line: 10, text: "Parts" },
    ]); // `# not a heading` is in a fence
    // A short note: every section under the band, merged up into the root (19.x, scout's Stage 4).
    expect(d.sections.map((x) => [x.name, x.line, x.end])).toEqual([["§:file", 1, 17]]);
    expect(d.sections[0]!.lines.map((l) => l.text)).toContain("shutter in code");
    const log = indexDoc(
      "log.md",
      "# Night log\n\ntext\n\nCalibration\n===========\n\nFlats. #calibration #dome/flat\n",
      "note",
    );
    expect(log.headings).toEqual([
      { line: 1, text: "Night log" },
      { line: 5, text: "Calibration" },
    ]);
    expect(log.tags).toEqual(["calibration", "dome/flat"]);
    expect(indexDoc("x/untitled.md", "just text\n", "note").title).toBe("untitled");
    expect(indexDoc("plan.md", '+++\ntitle = "Plan"\n+++\n', "note").title).toBe("Plan");
    // A data file with no blank lines: one unit, one section (under the band's top).
    expect(
      indexDoc("big.csv", Array.from({ length: 200 }, (_, i) => `row ${i}`).join("\n"), "data").sections.map((x) => [
        x.name,
        x.line,
        x.end,
      ]),
    ).toEqual([["§:file", 1, 200]]);
  });

  test("the query: words, phrases, prefix*, -not, title:, #tag, tag:, path: — nothing passed on as FTS5 syntax", async () => {
    const { ftsMatch, parseQuery } = await import("../../../../src/core/workspace/search/search.ts");
    const q = parseQuery('dome "shutter belt" roll* -summer title:refit #budget tag:dome path:notes/ " AND ( NEAR');
    expect(q.tags).toEqual(["budget", "dome"]);
    expect(q.paths).toEqual(["notes/"]);
    expect(q.terms.map((t) => [t.text, t.phrase, t.prefix, t.not, t.title])).toEqual([
      ["dome", false, false, false, false],
      ["shutter belt", true, false, false, false],
      ["roll", false, true, false, false],
      ["summer", false, false, true, false],
      ["refit", false, false, false, true],
      [" AND ( NEAR", true, false, false, false],
    ]);
    expect(ftsMatch(q)).toBe(
      '("dome" AND "shutter belt" AND "roll"* AND {title aliases} : "refit" AND " AND ( NEAR") NOT "summer"',
    );
    expect(ftsMatch(parseQuery("a b"), true)).toBe('("a" OR "b")');
    expect(ftsMatch(parseQuery("-only")), "nothing to look for").toBeNull();
    expect(parseQuery('say "hi" again').terms.map((t) => t.text)).toEqual(["say", "hi", "again"]);
  });

  test("ranked by the index: the title first; every word, else some of them; -not, #tag, path:, prefix, accents folded", async () => {
    const { catchUp, search, SearchIndex } = await import("../../../../src/core/workspace/search/search.ts");
    const { g } = setup();
    const idx = SearchIndex.open(g.loc)!;
    expect(idx.complete).toBe(false);
    expect(catchUp(g, idx)).toEqual({ indexed: 5, removed: 0 });
    expect(idx.complete).toBe(true);
    const paths = (q: string) => search(g, idx, q).hits.map((h) => h.path);
    expect(paths("shutter")[0]).toBe("dome.md"); // its aliases and tags say it, and its text
    expect(paths("shutter").sort()).toEqual(["data.toml", "dome.md", "log.md"]);
    const hit = search(g, idx, "shutter stuck").hits[0]!;
    expect(hit).toMatchObject({ path: "log.md", line: 4, column: 5, heading: "Night log" });
    expect(hit.snippet.slice(hit.marks[0]![0], hit.marks[0]![1])).toBe("shutter");
    // Every word in the note, wherever: log.md has them in two sections. It opens at the first.
    expect(search(g, idx, "shutter dusk")).toMatchObject({
      relaxed: false,
      hits: [{ path: "log.md", line: 4, more: 1 }],
    });
    expect(search(g, idx, "belt stuck")).toMatchObject({ relaxed: true });
    expect(paths("shutter -stuck")).toEqual(["dome.md", "data.toml"]);
    expect(paths("shutter #budget")).toEqual(["dome.md"]);
    expect(paths("#dome")).toEqual(["dome.md"]); // a nested tag counts for its parent
    expect(paths("path:notes/")).toEqual(["notes/café.md", "notes/plan.md"]);
    expect(paths("calibrat*")).toEqual(expect.arrayContaining(["log.md", "notes/plan.md"]));
    expect(paths("naive resume")).toEqual(["notes/café.md"]);
    expect(search(g, idx, "naive resume").hits[0]).toMatchObject({ line: 3, column: 5 });
    expect(paths("title:refit")).toEqual(["dome.md"]);
    expect(paths("zzz")).toEqual([]);
    idx.close();
  });

  test("index and scan agree: -word with filters only, a phrase across a line break, path: in any case; marks merged", async () => {
    const { catchUp, search, SearchIndex } = await import("../../../../src/core/workspace/search/search.ts");
    const dir = mkdtempSync(join(tmpdir(), "slipbox-search-agree-"));
    mkdirSync(join(dir, ".slipbox"));
    mkdirSync(join(dir, "A"));
    const files: Record<string, string> = {
      "a.md": "#project draft here\n",
      "b.md": "#project final\n",
      "w.md": "the quick brown\nfox jumps\n",
      "c.md": "brown, fox\n",
      "A/up.md": "upper\n",
      "ny.md": "new york is new\n",
    };
    for (const [rel, text] of Object.entries(files)) writeFileSync(join(dir, rel), text);
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    const idx = SearchIndex.open(g.loc)!;
    catchUp(g, idx);
    const both = (q: string) =>
      [idx, null].map((x) =>
        search(g, x, q)
          .hits.map((h) => h.path)
          .sort(),
      );
    expect(both("#project -draft")).toEqual([["b.md"], ["b.md"]]);
    expect(both('"brown fox"')).toEqual([
      ["c.md", "w.md"],
      ["c.md", "w.md"],
    ]);
    expect(both("path:a/")).toEqual([["A/up.md"], ["A/up.md"]]);
    for (const x of [idx, null]) {
      const hit = search(g, x, 'new "new york"').hits[0]!;
      expect(hit.marks).toEqual([
        [0, 8],
        [12, 15],
      ]);
    }
    idx.close();
  });

  test("the scan answers the same query the same way, before there's an index", async () => {
    const { catchUp, search, SearchIndex } = await import("../../../../src/core/workspace/search/search.ts");
    const { g } = setup();
    const idx = SearchIndex.open(g.loc)!;
    catchUp(g, idx);
    for (const q of [
      "shutter",
      "shutter stuck",
      "belt stuck",
      "shutter -stuck",
      "shutter #budget",
      "#dome",
      "path:notes/",
      "calibrat*",
      "naive resume",
      "title:refit",
      "zzz",
    ]) {
      const a = search(g, idx, q);
      const b = search(g, null, q);
      expect(b.engine).toBe("scan");
      expect([...b.hits.map((h) => h.path)].sort()).toEqual([...a.hits.map((h) => h.path)].sort());
      expect(b.relaxed).toBe(a.relaxed);
    }
    // Where one section alone has the words, both land on its line.
    expect(search(g, null, "shutter stuck").hits[0]).toMatchObject({ path: "log.md", line: 4, column: 5 });
    expect(search(g, null, "naive resume").hits[0]).toMatchObject({ path: "notes/café.md", line: 3, column: 5 });
    // Unsaved text (the TUI's) is what the scan reads, when given.
    expect(
      search(g, null, "zebra", { texts: new Map([["log.md", "# Night log\n\na zebra\n"]]) }).hits.map((h) => h.path),
    ).toEqual(["log.md"]);
    idx.close();
  });

  test("kept up to date: a change, a new file, one gone, a move — at the next catch-up, or as the vault's feed says", async () => {
    const { catchUp, indexFile, search, SearchIndex } = await import("../../../../src/core/workspace/search/search.ts");
    const { dir, g } = setup();
    const idx = SearchIndex.open(g.loc)!;
    catchUp(g, idx);
    const paths = (q: string) => search(g, idx, q).hits.map((h) => h.path);
    // Changed on disk while nothing listened (an agent, git): the next catch-up, by size and mtime.
    writeFileSync(join(dir, "log.md"), "# Night log\n\nA zebra crossed.\n");
    writeFileSync(join(dir, "new.md"), "# New\n\nanother zebra\n");
    rmSync(join(dir, "notes", "plan.md"));
    const again = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    expect(catchUp(again, idx)).toEqual({ indexed: 2, removed: 1 });
    expect(
      search(again, idx, "zebra")
        .hits.map((h) => h.path)
        .sort(),
    ).toEqual(["log.md", "new.md"]);
    expect(search(again, idx, "photometry").hits).toEqual([]);
    // The feed: every change the graph hears of, said once — here, a rename's.
    const heard: unknown[] = [];
    const stop = again.onChange((c) => {
      heard.push(c);
      if (c.kind !== "moved") indexFile(again, idx, c.path);
    });
    const { applyPlan, planNoteRename } = await import("../../../../src/core/workspace/mutations/rename/rename.ts");
    applyPlan(again, planNoteRename(again, "new.md", "fresh"));
    stop();
    expect(heard).toEqual(
      expect.arrayContaining([
        { kind: "moved", from: "new.md", to: "fresh.md" },
        { kind: "removed", path: "new.md" },
        { kind: "changed", path: "fresh.md" },
      ]),
    );
    expect(search(again, idx, "another zebra").hits.map((h) => h.path)).toEqual(["fresh.md"]);
    expect(paths("zebra").sort()).toEqual(["fresh.md", "log.md"]);
    idx.close();
  });

  test("words are whole words (a prefix* aside), both engines; a hit opens at the section with most of them", async () => {
    const { catchUp, search, SearchIndex } = await import("../../../../src/core/workspace/search/search.ts");
    const { dir, g: first } = setup();
    writeFileSync(join(dir, "words.md"), "# Words\n\nThe catalogue, and blogging.\n");
    writeFileSync(join(dir, "two.md"), "# Two\n\nalpha only\n\n## Both\n\nalpha and beta here\n");
    const g = openGraph(first.loc, DEFAULT_CONFIG, true);
    const idx = SearchIndex.open(g.loc)!;
    catchUp(g, idx);
    for (const engine of [idx, null]) {
      const paths = (q: string) => search(g, engine, q).hits.map((h) => h.path);
      expect(paths("cat")).toEqual([]); // not inside "catalogue"
      expect(paths("logging")).toEqual([]); // nor "blogging"
      expect(paths("cat*")).toEqual(["words.md"]);
      expect(search(g, engine, "alpha beta").hits[0]).toMatchObject({
        path: "two.md",
        line: 7,
        heading: "Both",
        more: 1,
      });
    }
    idx.close();
  });

  test("an index of another version, or one SQLite can't read, is made again; a new one is built before it's used", async () => {
    const { SearchIndex } = await import("../../../../src/core/workspace/search/search.ts");
    const { cacheDir } = await import("../../../../src/core/foundation/platform/paths.ts");
    const { g } = setup();
    mkdirSync(cacheDir(g.loc), { recursive: true });
    writeFileSync(join(cacheDir(g.loc), "search.db"), "not a database, just bytes ".repeat(100));
    const idx = SearchIndex.open(g.loc)!;
    expect(idx).not.toBeNull();
    expect(idx.stats()).toEqual({ files: 0 });
    expect(idx.complete).toBe(false);
    idx.db.pragma("user_version = 99");
    idx.close();
    const fresh = SearchIndex.open(g.loc)!;
    expect(fresh.db.pragma("user_version")).toBe(3);
    // The runtime's own SQLite (node:sqlite): FTS5 in it, a version new enough for what the index asks.
    const v = (fresh.db.prepare("select sqlite_version() as v").get() as { v: string }).v.split(".").map(Number);
    expect(v[0] === 3 && v[1]! >= 43).toBe(true);
    fresh.close();
  });

  test("filters alone with `only` (the TUI's unsaved notes): just those files read", async () => {
    const { search } = await import("../../../../src/core/workspace/search/search.ts");
    const dir = mkdtempSync(join(tmpdir(), "slipbox-search-only-"));
    mkdirSync(join(dir, ".slipbox"));
    for (const f of ["a.md", "b.md"]) writeFileSync(join(dir, f), `# ${f}\n`);
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    expect(search(g, null, "path:a", { only: ["b.md"] }).hits).toEqual([]);
    expect(search(g, null, "path:a", { only: ["a.md"] }).hits.map((h) => h.path)).toEqual(["a.md"]);
  });

  test("a phrase wrapped across a line break, or starting inside a word turned down: found and placed, by the scan and the index", async () => {
    const { catchUp, search, SearchIndex } = await import("../../../../src/core/workspace/search/search.ts");
    const dir = mkdtempSync(join(tmpdir(), "slipbox-search-phrase-"));
    mkdirSync(join(dir, ".slipbox"));
    writeFileSync(join(dir, "a.md"), "uno no no\n");
    writeFileSync(join(dir, "b.md"), "# b\n\n## Trip\n\nWe went to New\nYork last week.\n");
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, true);
    const idx = SearchIndex.open(g.loc)!;
    catchUp(g, idx);
    for (const i of [null, idx]) {
      expect(search(g, i, '"new york"').hits).toMatchObject([
        { path: "b.md", line: 5, column: 12, heading: "Trip", snippet: "We went to New" },
      ]);
      const [no] = search(g, i, '"no no"').hits;
      expect(no).toMatchObject({ path: "a.md", line: 1, column: 5, snippet: "uno no no" });
      expect(no!.snippet.slice(no!.marks[0]![0], no!.marks[0]![1])).toBe("no no");
    }
    idx.close();
  });

  test('the CLI: a scan until `slipbox index`, then the index, kept current; [search] engine = "scan" never uses one', async () => {
    const { dir } = setup();
    const out = async (args: string[]) => {
      const o: string[] = [];
      const code = await runCli([...args, "--json"], {
        out: (x: string) => o.push(x),
        err: () => {},
        stdin: async () => "",
        isTTY: false,
        columns: 80,
        cwd: dir,
        env: process.env,
      });
      return { code, json: JSON.parse(o.join("")) };
    };
    const first = await out(["search", "shutter", "stuck"]);
    expect(first.json.data).toMatchObject({ engine: "scan", relaxed: false, hits: [{ path: "log.md", line: 4 }] });
    expect(first.json.warnings.join()).toContain("no search index yet");
    expect((await out(["index"])).json.data).toMatchObject({ indexed: 5, removed: 0, files: 5, rebuilt: false });
    expect((await out(["search", "shutter", "stuck"])).json.data).toMatchObject({
      engine: "index",
      hits: [{ path: "log.md", line: 4 }],
    });
    writeFileSync(join(dir, "log.md"), "# Night log\n\nno more\n");
    expect((await out(["search", "stuck"])).json.data.hits).toEqual([]); // caught up first
    expect((await out(["index", "--rebuild"])).json.data).toMatchObject({ indexed: 5, rebuilt: true });
    expect((await out(["info"])).json.data.search).toEqual({ engine: "auto", index: { files: 5, complete: true } });
    expect((await out(["search"])).code).toBe(2);
    expect((await out(["search", "x", "--limit", "0"])).code).toBe(2);
    const cfg = join(dir, "..", `${basename(dir)}-scan.toml`);
    writeFileSync(cfg, '[search]\nengine = "scan"\n');
    expect((await out(["search", "shutter", "--config", cfg])).json.data.engine).toBe("scan");
  });
});
