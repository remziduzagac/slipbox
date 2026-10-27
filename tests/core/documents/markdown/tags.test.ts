import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { parseMarkdown, visit } from "../../../../src/core/documents/markdown/parse.ts";
import { renderMarkdown } from "../../../../src/core/rendering/layout/markdown/render.ts";
import { glyphsFor } from "../../../../src/core/rendering/theme/glyphs.ts";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("tags (1.6)", () => {
  const tagsOf = (source: string) => {
    const out: string[] = [];
    visit(parseMarkdown(source).tree, (n) => {
      if ((n.type as string) === "hashtag") out.push((n as unknown as { value: string }).value);
    });
    return out;
  };

  test("#tag as Obsidian writes it: after a space or a line's start; not in code, a URL, a wikilink or a heading marker", () => {
    expect(tagsOf("#start and #mid-dle, #under_score. #nested/deep/er #ünïcode #1a")).toEqual([
      "start",
      "mid-dle",
      "under_score",
      "nested/deep/er",
      "ünïcode",
      "1a",
    ]);
    expect(tagsOf("a#glued https://x.com/page#frag [[note#heading]] #123 #/")).toEqual([]);
    expect(tagsOf("`#code` and\n\n```\n#fenced\n```\n")).toEqual([]);
    expect(tagsOf("# Heading\n\n## Heading #inheading\n")).toEqual(["inheading"]);
    expect(tagsOf("line one\n#second-line\n")).toEqual(["second-line"]);
    expect(tagsOf("#trailing/ slash")).toEqual(["trailing"]);
  });

  test("a tag renders as #name in its role, and follows (a link of its own kind)", () => {
    const layout = renderMarkdown("See #project/alpha here.\n", {
      width: 60,
      glyphs: glyphsFor("unicode"),
      showUrls: false,
    });
    const span = layout.lines.flatMap((l) => l.spans).find((s) => s.text === "#project/alpha")!;
    expect(span.role).toBe("tag");
    expect(layout.links[span.link!]).toMatchObject({ kind: "tag", target: "project/alpha" });
  });
});
