import { expect, test } from "bun:test";
import {
  collectBacklinks,
  collectProblems,
  collectTags,
  findNote,
  namesakeLinks,
} from "../../../../../src/core/workspace/graph/queries/indexes.ts";
import { stub } from "../../../../../src/core/workspace/graph/index/storage.ts";
import { LinkIndex } from "../../../../../src/core/workspace/links/links.ts";
import type { LinkRef, ResolvedLink } from "../../../../../src/core/workspace/graph/graph-types.ts";

const ref = (target: string): LinkRef => ({
  kind: "markdown",
  target,
  line: 1,
  column: 1,
  end: { line: 1, column: 3 },
  text: target,
  heading: null,
  block: null,
  alias: null,
});
const entry = (rel: string) => stub({ rel, abs: `/vault/${rel}`, size: 1, mtimeMs: 0 });

test("tag and note lookups retain hierarchy, first spelling, ordering and path-before-name precedence", () => {
  const notes = new Map([
    ["z.md", { ...entry("z.md"), tags: ["Plan/Next", "plan", "Plan/Next"] }],
    ["a.md", { ...entry("a.md"), tags: ["PLAN"] }],
  ]);
  expect([...collectTags(notes)]).toEqual([
    ["plan", { tag: "PLAN", notes: ["a.md", "z.md"] }],
    ["plan/next", { tag: "Plan/Next", notes: ["z.md"] }],
  ]);
  const context = { root: "/vault", notes, index: new LinkIndex(notes.keys()) };
  expect(findNote(context, "[[a.md]]", "/elsewhere").path).toBe("a.md");
  expect(findNote(context, "/vault/z.md", "/elsewhere").path).toBe("z.md");
  expect(findNote(context, "a", "/elsewhere").path).toBe("a.md");
});

test("backlink materialization preserves source order and reads inbound links after local resolution", () => {
  const notes = new Map([["a.md", { ...entry("a.md"), links: [ref("self"), ref("local"), ref("outside")] }]]);
  const resolved: string[] = [];
  const context = {
    notes,
    linkingFiles: () => ["settings.json"],
    fileLinksOf: () => [ref("local")],
    resolveLink: (link: Pick<LinkRef, "kind" | "target">) => {
      resolved.push(link.target);
      return {
        resolvedKind: "note" as const,
        path: link.target === "self" ? "a.md" : link.target === "outside" ? "/another/root.md" : "b.md",
        candidates: [],
      };
    },
  };
  const map = collectBacklinks(context, () => {
    expect(resolved).toEqual(["self", "local", "outside", "local"]);
    return new Map([["b.md", [{ ...ref("external"), from: "/another/note.md" }]]]);
  });
  expect([...map.keys()]).toEqual(["b.md"]);
  expect(map.get("b.md")?.map((b) => b.from)).toEqual(["a.md", "settings.json", "/another/note.md"]);
});

test("problem and namesake queries preserve fragile fixes, moved evidence and lazy-parse ordering", () => {
  const fragile: ResolvedLink = {
    ...ref("near"),
    resolvedKind: "note",
    path: "near/note.md",
    candidates: ["near/note.md"],
    how: "deepest-shared",
  };
  const broken: ResolvedLink = { ...ref("old.md"), resolvedKind: "unresolved", path: null, candidates: [] };
  const notes = new Map([
    ["a.md", { ...entry("a.md"), links: [ref("note")] }],
    ["note.md", entry("note.md")],
  ]);
  const problems = collectProblems({
    notes,
    linksOf: () => [fragile, broken],
    backlinks: () => [],
    movedTarget: () => "new.md",
  });
  expect(problems.fragile[0]).toMatchObject({ from: "a.md", fix: "near/note" });
  expect(problems.broken[0]).toMatchObject({ moved: "new.md", reason: "moved to new.md — relink fixes it" });
  expect(problems.orphans).toEqual(["a.md", "note.md"]);
  const order: string[] = [];
  const context = {
    notes,
    index: new LinkIndex(notes.keys()),
    thorough: true,
    pendingCount: 1,
    ensureAll: () => void order.push("parse"),
    resolveLink: () => ({ resolvedKind: "note" as const, path: "note.md", candidates: [] }),
  };
  expect(namesakeLinks(context, "elsewhere/note.md", () => (order.push("aliases"), new Map()))).toBeNull();
  // Bare Markdown path links are not name-based wiki links, so no retarget watch is fabricated.
  expect(order).toEqual(["parse"]);
});
