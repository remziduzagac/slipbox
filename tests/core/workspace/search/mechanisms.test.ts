import { expect, test } from "bun:test";
import type { Graph } from "../../../../src/core/workspace/graph/graph.ts";
import type { SearchIndex } from "../../../../src/core/workspace/search/search-index.ts";
import { parseQuery, ftsMatch } from "../../../../src/core/workspace/search/query/parsing.ts";
import { indexDoc } from "../../../../src/core/workspace/search/model/document.ts";
import { fold, occurrences } from "../../../../src/core/workspace/search/matching/text.ts";
import { locate } from "../../../../src/core/workspace/search/matching/location.ts";
import { search } from "../../../../src/core/workspace/search/execution/search.ts";

function graph(texts: Map<string, string>): Graph {
  return {
    notes: new Map([...texts].map(([rel, text]) => [rel, { size: text.length, mtimeMs: 1 }])),
    config: { walk: { extensions: ["md"] } },
    filePaths: () => [],
    abs: (rel: string) => rel,
  } as unknown as Graph;
}

test("query grammar keeps phrases, exclusions, title prefixes and normalized filters", () => {
  const q = parseQuery('title:one* "two words" -draft #topic path:notes/');
  expect(q.terms.map((t) => [t.text, t.phrase, t.prefix, t.not, t.title])).toEqual([
    ["one", false, true, false, true],
    ["two words", true, false, false, false],
    ["draft", false, false, true, false],
  ]);
  expect(q.tags).toEqual(["topic"]);
  expect(q.paths).toEqual(["notes/"]);
  expect(ftsMatch(q)).toContain("NOT");
  expect(ftsMatch(q, true)).toContain("OR");
});

test("document reading preserves frontmatter and ignores fenced heading syntax", () => {
  const doc = indexDoc("a.md", "---\ntitle: A\ntags: [topic]\n---\n# Heading\n\ntext\n\n```\n# code\n```\n", "note");
  expect(doc.title).toBe("A");
  expect(doc.tags).toEqual(["topic"]);
  expect(doc.headings.map((h) => h.text)).toEqual(["Heading"]);
  expect(doc.sections[0]!.name).toBe("§:file");
});

test("folded occurrences preserve original offsets across accents and astral characters", () => {
  const f = fold("😀 Café");
  expect(f.folded).toBe("😀 cafe");
  const q = parseQuery("cafe");
  const [start, end] = occurrences(f.folded, q.terms[0]!)[0]!;
  expect([f.at[start], f.at[end]]).toEqual([3, 7]);
});

test("hit location chooses the unit with most positive words and retains snippet marks", () => {
  const hit = locate("a.md", "note", "# First\n\none\n\n# Second\n\none two\n", 7, parseQuery("one two"));
  expect([hit.line, hit.column, hit.heading, hit.score]).toEqual([7, 1, "Second", 7]);
  expect(hit.snippet).toBe("one two");
  expect(hit.marks).toEqual([
    [0, 3],
    [4, 7],
  ]);
});

test("scan ranking and relaxed fallback honor unsaved text and a file restriction", () => {
  const texts = new Map([
    ["a.md", "one two"],
    ["b.md", "one"],
    ["c.md", "two"],
  ]);
  const g = graph(texts);
  expect(search(g, null, "one two", { texts }).hits.map((h) => h.path)).toEqual(["a.md"]);
  const relaxed = search(g, null, "one missing", { texts, only: ["b.md"] });
  expect(relaxed.relaxed).toBe(true);
  expect(relaxed.hits.map((h) => h.path)).toEqual(["b.md"]);
  expect(search(g, null, "one missing", { texts, relax: false }).hits).toEqual([]);
});

test("indexed dispatch tries strict then relaxed and keeps the original score sign", () => {
  const calls: string[] = [];
  const idx = {
    query: (query: string) => {
      calls.push(query);
      return calls.length === 1 ? [] : [{ path: "a.md", group: "note", body: "one two", score: -7 }];
    },
  } as unknown as SearchIndex;
  const result = search(graph(new Map()), idx, "one two");
  expect(calls).toHaveLength(2);
  expect(calls[1]).toContain("OR");
  expect([result.engine, result.relaxed, result.hits[0]!.score]).toEqual(["index", true, 7]);
});
