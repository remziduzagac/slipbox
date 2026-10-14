// The docs' site (site/, DS): how its pages are gathered from docs/ — the sidebar from the map, the links rewritten to
// the site's addresses, a page's title and description. The build itself runs in CI's `site` job (`bun run site`).

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pageUrl, readMap, rewriteLinks, rewriteTarget, splitPage } from "../site/scripts/gather.ts";

const DOCS = join(import.meta.dir, "..", "docs");
const noDirs = () => false;

describe("the docs' site: its pages gathered from docs/ (DS-D2)", () => {
  test("the map's sections are the sidebar's groups, their lists its pages, in order; an address isn't a page", () => {
    const map = [
      "# Docs",
      "",
      "## Start here",
      "",
      "- [Install](guides/install.md): how.",
      "- [Quick](guides/quick-start.md#top): fast.",
      "",
      "## Elsewhere",
      "",
      "- [Site](https://example.com/a.md): not ours.",
      "",
      "## Manual",
      "",
      "Some prose with [a link](manual/keys.md) that isn't an item.",
      "",
      "- [Keys](manual/keys.md): every key.",
    ].join("\n");
    expect(readMap(map)).toEqual([
      { label: "Start here", pages: ["guides/install.md", "guides/quick-start.md"] },
      { label: "Manual", pages: ["manual/keys.md"] },
    ]);
  });

  test("every page of docs/ is in the map, so in the sidebar: none left out of the site", () => {
    const pages = readMap(readFileSync(join(DOCS, "README.md"), "utf8")).flatMap((g) => g.pages);
    const files = [
      ...["guides", "manual"].flatMap((d) =>
        readdirSync(join(DOCS, d))
          .filter((f) => f.endsWith(".md"))
          .map((f) => `${d}/${f}`),
      ),
      "agent-guide.md",
    ];
    expect([...pages].sort()).toEqual(files.sort());
  });

  test("a page's address: its path without .md, under the site's base; the map is the home", () => {
    expect(pageUrl("guides/install.md")).toBe("/slipbox/docs/guides/install/");
    expect(pageUrl("manual/keys.md", "#leader")).toBe("/slipbox/docs/manual/keys/#leader");
    expect(pageUrl("README.md")).toBe("/slipbox/docs/");
  });

  test("a link's target: another page's address, a picture in the site, a repository file on GitHub; the rest as it is", () => {
    const at = (t: string, from = "guides/agents.md", isDir = noDirs) => rewriteTarget(t, from, isDir);
    expect(at("../manual/keys.md#leader")).toBe("/slipbox/docs/manual/keys/#leader");
    expect(at("install.md")).toBe("/slipbox/docs/guides/install/");
    expect(at("../README.md")).toBe("/slipbox/docs/");
    expect(at("../images/agents-conflict.png")).toBe("/slipbox/docs/images/agents-conflict.png");
    expect(at("../../CHANGELOG.md")).toBe("https://github.com/remziduzagac/slipbox/blob/main/CHANGELOG.md");
    expect(at("../../examples", "guides/agents.md", () => true)).toBe(
      "https://github.com/remziduzagac/slipbox/tree/main/examples",
    );
    expect(at("#a-heading")).toBe("#a-heading");
    expect(at("https://example.com/x.md")).toBe("https://example.com/x.md");
    expect(at("mailto:a@example.com")).toBe("mailto:a@example.com");
  });

  test("links and pictures rewritten, a reference's definition too; code, fenced or inline, left as it is", () => {
    const text = [
      'See [keys](../manual/keys.md) and ![a shot](../images/x.png "its title").',
      "Inline `[not a link](keys.md)` stays, and so does [a page](install.md#steps).",
      "",
      "```markdown",
      "[in a fence](keys.md)",
      "```",
      "",
      "[ref]: ../manual/cli.md#flags",
    ].join("\n");
    expect(rewriteLinks(text, (t) => rewriteTarget(t, "guides/agents.md", noDirs))).toBe(
      [
        'See [keys](/slipbox/docs/manual/keys/) and ![a shot](/slipbox/docs/images/x.png "its title").',
        "Inline `[not a link](keys.md)` stays, and so does [a page](/slipbox/docs/guides/install/#steps).",
        "",
        "```markdown",
        "[in a fence](keys.md)",
        "```",
        "",
        "[ref]: /slipbox/docs/manual/cli/#flags",
      ].join("\n"),
    );
  });

  test("a page's title is its H1, its description its first paragraph as plain text; the H1 leaves the body", () => {
    const page = splitPage(
      "# Quick start\n\nInstall [slipbox](install.md), open a `folder`.\nIt takes two minutes.\n\n## Install\n\nText.\n",
    );
    expect(page.title).toBe("Quick start");
    expect(page.description).toBe("Install slipbox, open a folder. It takes two minutes.");
    expect(page.body.startsWith("Install [slipbox](install.md)")).toBe(true);
    expect(page.body).not.toContain("# Quick start");
    // A long first paragraph is cut at a word, marked.
    const long = splitPage(`# T\n\n${"word ".repeat(80)}\n`).description;
    expect(long.length).toBeLessThanOrEqual(221);
    expect(long.endsWith("…")).toBe(true);
    expect(() => splitPage("no heading\n")).toThrow("a page without an H1");
  });

  test("every page of docs/ gathers: an H1 each, a description each", () => {
    for (const page of readMap(readFileSync(join(DOCS, "README.md"), "utf8")).flatMap((g) => g.pages)) {
      const { title, description } = splitPage(readFileSync(join(DOCS, page), "utf8"));
      expect(title, page).not.toBe("");
      expect(description, page).not.toBe("");
    }
  });
});
