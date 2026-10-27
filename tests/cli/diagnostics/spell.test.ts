import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../../src/cli/cli.ts";

import { makeVaultSandbox } from "../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

// typos: off — the spell checker's tests misspell on purpose.
describe("slipbox spell (25.6)", () => {
  const cli = async (args: string[], cwd: string) => {
    const out: string[] = [];
    const code = await runCli([...args, "--json"], {
      out: (s: string) => out.push(s),
      err: () => {},
      stdin: async () => "",
      isTTY: false,
      columns: 80,
      cwd,
      env: process.env,
    });
    return { code, json: JSON.parse(out.join("")) };
  };
  let made = 0;
  const vault = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), `slipbox-spell-${++made}-`));
    mkdirSync(join(dir, ".slipbox"));
    for (const [rel, text] of Object.entries(files)) writeFileSync(join(dir, rel), text);
    return dir;
  };

  test("a note's misspelt words by line and column, in its lang: or [spell] languages; --suggest, --lang", async () => {
    const dir = vault({
      "en.md": "# Nte\n\nA 🔭 recieve, `kodd`.\n",
      "tr.md": "---\nlang: tr\n---\nevlerinzde kitap\n",
      "x.md": "---\nlang: xx\n---\nzzq\n",
    });
    const en = await cli(["spell", "en"], dir);
    expect(en.code).toBe(0);
    // Columns in code points, as find's: the telescope is one.
    expect(en.json.data).toEqual({
      path: "en.md",
      languages: ["en"],
      missing: [],
      words: [
        { line: 1, column: 3, word: "Nte" },
        { line: 3, column: 5, word: "recieve" },
      ],
    });
    const sugg = await cli(["spell", "en", "--suggest"], dir);
    expect(sugg.json.data.words[1].suggestions[0]).toBe("receive");
    expect((await cli(["spell", "tr"], dir)).json.data.words.map((w: { word: string }) => w.word)).toEqual([
      "evlerinzde",
    ]);
    // --lang over the note's own: English doesn't know Turkish.
    expect((await cli(["spell", "tr", "--lang", "en,tr"], dir)).json.data).toMatchObject({
      languages: ["en", "tr"],
      words: [{ word: "evlerinzde" }],
    });
    expect(
      (await cli(["spell", "tr", "--lang", "en"], dir)).json.data.words.map((w: { word: string }) => w.word),
    ).toEqual(["evlerinzde", "kitap"]);
    // A language with no dictionary: said, nothing marked for it.
    const x = await cli(["spell", "x"], dir);
    expect(x.json.data).toMatchObject({ missing: ["xx"], words: [] });
    expect(x.json.warnings).toContain("no dictionary for xx — [spell] dictionaries can name yours");
  });

  test("--add puts a word in your own list: marked no more; usage: --add alone, one word; a note, not another file", async () => {
    const dir = vault({ "a.md": "Zorvexion here\n", "b.txt": "text\n" });
    expect((await cli(["spell", "a"], dir)).json.data.words.map((w: { word: string }) => w.word)).toEqual([
      "Zorvexion",
    ]);
    const added = await cli(["spell", "--add", "Zorvexion"], dir);
    expect(added.code).toBe(0);
    expect(added.json.data.added).toBe("Zorvexion");
    expect(readFileSync(added.json.data.file, "utf8").split("\n")).toContain("Zorvexion");
    expect((await cli(["spell", "a"], dir)).json.data.words).toEqual([]);
    for (const args of [
      ["spell", "a", "--add", "w"],
      ["spell", "--add", "two words"],
      ["spell", "--add", "w", "--suggest"],
      ["spell", "b.txt"],
      ["spell"],
    ]) {
      expect([args, (await cli(args, dir)).code]).toEqual([args, 2]);
    }
  });
});
// typos: on
