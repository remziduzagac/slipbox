import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("a component in the TUI (16.22)", () => {
  test("a Vue file: its template, script and style in the outline, each part's definitions under it; each line coloured in its part's language", async () => {
    const root = makeVault();
    writeFileSync(
      join(root, "Card.vue"),
      '<template>\n  <h2 id="card">const</h2>\n</template>\n<script setup lang="ts">\nconst n = 1;\nfunction go(): void {}\n</script>\n<style>\n.a { color: red; }\n</style>\n',
    );
    const h = await harness({ root, open: "Card.vue", width: 100 });
    const v = h.app.view!;
    // Its grammar and its parts' (TypeScript, CSS) load first: until then, markup throughout.
    for (let i = 0; i < 200 && v.buf.syntax?.version !== v.buf.version; i++) {
      h.frame();
      await Bun.sleep(10);
    }
    expect(h.app.outlineView.rows().map((r) => `${r.level}:${r.text}`)).toEqual([
      "1:template",
      "2:const",
      '1:script setup lang="ts"',
      "2:go",
      "1:style",
      "2:.a",
    ]);
    expect([...v.buf.syntax!.languages]).toEqual([
      [5, "typescript"],
      [6, "typescript"],
      [9, "css"],
    ]);
    const role = (line: number, word: string) =>
      h.app
        .currentLayout(v)
        .lines.find((l) => l.src === line)!
        .spans.find((sp) => sp.text.includes(word))?.role;
    expect(role(5, "const")).toBe("syn_keyword"); // the script's line, as TypeScript
    expect(role(2, "const")).not.toBe("syn_keyword"); // the template's text, as markup
  });
});
