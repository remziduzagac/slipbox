import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCliProcessSandbox } from "../../support/cli-process.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { sandbox, slipbox } = makeCliProcessSandbox();

describe("find and replace", () => {
  test("spell (25.6): a note's misspelt words, from a process of its own — Hunspell's WebAssembly loaded there too", () => {
    const r = slipbox(["spell", "kenji-mori", "--json"]);
    expect(r.code).toBe(0);
    expect(r.json.data).toMatchObject({ path: "people/kenji-mori.md", languages: ["en"], missing: [] });
    for (const w of r.json.data.words)
      expect(w).toEqual({ line: expect.any(Number), column: expect.any(Number), word: expect.any(String) });
    expect(slipbox(["spell", "kenji-mori"]).out).toMatch(/^(people\/kenji-mori\.md:\d+:\d+: \S+\n)*$/);
  });
  test("spell --suggest: a dozen misspelt words, each one's suggestions asked at once — every one answered", () => {
    // A vault of its own: the demo's notes stay as the other tests count them.
    const root = join(sandbox, "typos");
    mkdirSync(join(root, ".slipbox"), { recursive: true });
    // typos: off
    const typos =
      "teh recieve seperate occured definately untill wierd acommodate neccessary goverment beleive tommorow";
    // typos: on
    writeFileSync(join(root, "typos.md"), `# Typos\n\n${typos}.\n`);
    const r = slipbox(["spell", "typos", "--suggest", "--lang", "en", "--json"], { cwd: root });
    expect([r.code, r.err]).toEqual([0, ""]);
    const words = r.json.data.words as { word: string; suggestions: string[] }[];
    expect(words.map((x) => x.word)).toEqual(typos.split(" "));
    expect(words.find((x) => x.word === typos.split(" ")[1])!.suggestions).toContain("receive");
    for (const x of words) expect(x.suggestions).toEqual(expect.any(Array));
  });
});
