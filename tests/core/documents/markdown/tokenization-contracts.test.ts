import { expect, test } from "bun:test";
import { wikiLinkFromMarkdown } from "../../../../src/core/documents/markdown/wikilink.ts";
import { hashtagFromMarkdown } from "../../../../src/core/documents/markdown/tags.ts";
import { obsidianFromMarkdown } from "../../../../src/core/documents/markdown/obsidian.ts";
import { parseLegacy } from "../../../../src/core/documents/markdown/parse/engine.ts";
import type { LiteralCompileContext } from "../../../../src/core/documents/markdown/tokenization/contracts.ts";

test("Markdown compiler adapters preserve their source slice, token identity and callback order", () => {
  const token = { source: "original token" };
  const calls: unknown[] = [];
  const context: LiteralCompileContext & { stack: unknown[] } = {
    stack: [],
    sliceSerialize(t) {
      expect(t).toBe(token);
      return "[[note#heading|shown]]";
    },
    enter(node, t) {
      calls.push(["enter", node, t]);
    },
    exit(t) {
      calls.push(["exit", t]);
    },
  };
  wikiLinkFromMarkdown.enter.wikiLink.call(context, token);
  wikiLinkFromMarkdown.exit.wikiLink.call(context, token);
  expect(calls).toEqual([
    [
      "enter",
      {
        type: "wikiLink",
        value: "note#heading|shown",
        embed: false,
        target: "note",
        heading: "heading",
        block: null,
        alias: "shown",
      },
      token,
    ],
    ["exit", token],
  ]);
  calls.length = 0;
  context.sliceSerialize = () => "#Project/";
  hashtagFromMarkdown.enter.hashtag.call(context, token);
  hashtagFromMarkdown.exit.hashtag.call(context, token);
  obsidianFromMarkdown.enter.highlight.call(context, token);
  obsidianFromMarkdown.exit.highlight.call(context, token);
  obsidianFromMarkdown.enter.comment.call(context, token);
  obsidianFromMarkdown.exit.comment.call(context, token);
  expect(calls).toEqual([
    ["enter", { type: "hashtag", value: "Project" }, token],
    ["exit", token],
    ["enter", { type: "highlight", children: [] }, token],
    ["exit", token],
    ["enter", { type: "comment", children: [] }, token],
    ["exit", token],
  ]);
  expect(calls.filter((c): c is unknown[] => Array.isArray(c) && c[0] === "exit").every((c) => c[1] === token)).toBe(
    true,
  );
});

test("Markdown adapters propagate the original compiler refusal without calling exit", () => {
  const refusal = new Error("compiler refused");
  let exits = 0;
  const context = {
    stack: [],
    sliceSerialize: () => "[[note]]",
    enter: () => {
      throw refusal;
    },
    exit: () => {
      exits++;
    },
  };
  for (const enter of [
    wikiLinkFromMarkdown.enter.wikiLink,
    hashtagFromMarkdown.enter.hashtag,
    obsidianFromMarkdown.enter.highlight,
    obsidianFromMarkdown.enter.comment,
  ]) {
    let caught: unknown;
    try {
      enter.call(context, {});
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(refusal);
  }
  expect(exits).toBe(0);
});

test("malformed Markdown markers remain text and code fences bypass extension tokenizers", () => {
  const malformed = "[[unfinished\n\n== unclosed\n\n#123\n\n";
  const tree = parseLegacy(`${malformed}\`\`\`text\n[[note]] #Project ==marked== %%hidden%%\n\`\`\`\n`);
  const nodes = tree.children;
  expect(nodes.map((node) => node.type)).toEqual(["paragraph", "paragraph", "paragraph", "code"]);
  expect(nodes.slice(0, 3).map((node) => ("children" in node ? node.children : []))).toEqual([
    [{ type: "text", value: "[[unfinished", position: expect.anything() }],
    [{ type: "text", value: "== unclosed", position: expect.anything() }],
    [{ type: "text", value: "#123", position: expect.anything() }],
  ]);
  const code = nodes[3];
  expect(code?.type === "code" && code.value).toBe("[[note]] #Project ==marked== %%hidden%%");
});
