// The docs' site (site/, DS): how its pages are gathered from docs/ — the sidebar from the map, the links rewritten to
// the site's addresses, a page's title and description. The build itself runs in CI's `site` job (`bun run site`).

import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  copyCard,
  copyLogo,
  pageUrl,
  readLegacyPages,
  readMap,
  rewriteLinks,
  rewriteTarget,
  splitPage,
} from "../site/scripts/gather.ts";
import { CARD, DESCRIPTION, DOCS_URL, fullTitle, headTags, LINE, SENTENCE } from "../site/scripts/about.ts";
import { pngSize } from "../scripts/screenshot.ts";
import { CARD_FILE, cardSvg, madeFrom, madeFromNow, textOf, withText, wrap } from "../scripts/share-card.ts";

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
    const legacy = readLegacyPages(readFileSync(join(DOCS, "README.md"), "utf8"));
    expect([...pages, ...legacy].sort()).toEqual(files.sort());
    expect(legacy.every((page) => !pages.includes(page))).toBe(true);
  });

  test("earlier page addresses are explicit in the map without becoming extra sidebar entries", () => {
    const text = "## Guides\n- [Tour](guides/getting-started.md)\n\n<!-- legacy-page: guides/keys-you-know.md -->\n";
    expect(readMap(text)).toEqual([{ label: "Guides", pages: ["guides/getting-started.md"] }]);
    expect(readLegacyPages(text)).toEqual(["guides/keys-you-know.md"]);
    expect(readLegacyPages("<!-- legacy-page: ../private.md -->\n")).toEqual([]);
  });

  test("the learning path and guide sequence follow the documentation map", () => {
    const map = readMap(readFileSync(join(DOCS, "README.md"), "utf8"));
    expect(map.map((group) => group.label)).toEqual([
      "Start here",
      "Guides",
      "Using slipbox",
      "Reference",
      "Help and project information",
      "For agents",
    ]);
    expect(map[0]!.pages).toEqual(["manual/introduction.md", "guides/install.md", "guides/quick-start.md"]);
    expect(map[1]!.pages).toEqual([
      "guides/getting-started.md",
      "guides/lens.md",
      "guides/vaults.md",
      "guides/from-obsidian-or-zk.md",
      "guides/code-and-git.md",
      "guides/exporting.md",
      "guides/agents.md",
      "guides/making-it-yours.md",
    ]);
  });

  test("a page's address: its path without .md, under the site's base; the map is the home", () => {
    expect(pageUrl("guides/install.md")).toBe("/slipbox/docs/guides/install/");
    expect(pageUrl("manual/keys.md", "#leader")).toBe("/slipbox/docs/manual/keys/#leader");
    expect(pageUrl("README.md")).toBe("/slipbox/docs/");
  });

  test("compatibility anchors stay published without becoming the page description", () => {
    const page = splitPage('# New title\n\n<a id="earlier-title"></a>\n\nA useful introduction.\n\n## Details\n');
    expect(page.title).toBe("New title");
    expect(page.description).toBe("A useful introduction.");
    expect(page.body).toContain('<a id="earlier-title"></a>');
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

describe("the docs' site: its logo", () => {
  test("the README's: the gathering copies the logo the README shows, and the site's header and favicon use it", () => {
    const top = join(import.meta.dir, "..");
    const shown = /<img src="([^"]+\.svg)"/.exec(readFileSync(join(top, "README.md"), "utf8"))?.[1];
    expect(shown).toBeDefined();
    const dir = mkdtempSync(join(tmpdir(), "slipbox-site-"));
    try {
      copyLogo(dir);
      expect(readFileSync(join(dir, "logo.svg"), "utf8")).toBe(readFileSync(join(top, shown!), "utf8"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    const config = readFileSync(join(top, "site", "astro.config.mjs"), "utf8");
    expect(config).toContain('logo: { src: "./public/logo.svg" }');
    expect(config).toContain('favicon: "/logo.svg"');
  });
});

describe("the docs' site: what it says slipbox is (SEO-D1, SEO-D2)", () => {
  test("a page's title is its own, then slipbox and the line; the home's slipbox and the line alone", () => {
    expect(fullTitle("Quick start")).toBe(`Quick start | slipbox: ${LINE}`);
    expect(fullTitle("slipbox documentation", true)).toBe(`slipbox: ${LINE}`);
    expect(LINE).toBe("read, review and edit what your coding agent writes, in your terminal");
  });

  test("the description fits a search result and says what slipbox is", () => {
    expect(DESCRIPTION.length).toBeLessThanOrEqual(160);
    expect(DESCRIPTION).toContain("read, review and edit what your coding agent writes");
  });

  test("every page's head: the card at an absolute address, its type, size and alt, and the link to llms.txt", () => {
    const tags = headTags(DOCS_URL);
    const meta = (key: string) => tags.find((t) => t.attrs.property === key || t.attrs.name === key)?.attrs.content;
    expect(meta("og:image")).toBe("https://remziduzagac.github.io/slipbox/docs/share-card.png");
    expect(meta("og:image:type")).toBe("image/png");
    expect(meta("og:image:width")).toBe(String(CARD.width));
    expect(meta("og:image:height")).toBe(String(CARD.height));
    expect(meta("og:image:alt")).toBe(CARD.alt);
    expect(meta("twitter:image:alt")).toBe(CARD.alt);
    expect(tags.find((t) => t.attrs.rel === "describedby")?.attrs.href).toBe(
      "https://remziduzagac.github.io/slipbox/docs/llms.txt",
    );
    // The root's page passes its own address: the same tags, its addresses.
    expect(headTags("https://example.github.io/x/docs/")[0]!.attrs.content).toBe(
      "https://example.github.io/x/docs/share-card.png",
    );
  });

  test("the config takes the description and the tags from about.ts, and the middleware sets the titles", () => {
    const config = readFileSync(join(import.meta.dir, "..", "site", "astro.config.mjs"), "utf8");
    expect(config).toContain("description: DESCRIPTION,");
    expect(config).toContain("head: headTags(DOCS_URL),");
    expect(config).toContain('routeMiddleware: "./src/route-data.ts"');
    const middleware = readFileSync(join(import.meta.dir, "..", "site", "src", "route-data.ts"), "utf8");
    expect(middleware).toContain('fullTitle(route.entry.data.title, home)');
  });

  test("the home has no description of its own, so it takes the site's", () => {
    const home = readFileSync(join(import.meta.dir, "..", "site", "src", "content", "docs", "index.mdx"), "utf8");
    const front = home.slice(0, home.indexOf("\n---", 4));
    expect(front).not.toMatch(/^description:/m);
  });
});

describe("the docs' site: the share card (SEO-D4)", () => {
  const card = new Uint8Array(readFileSync(CARD_FILE));

  test("the card is a PNG of 1,200 by 630, as its tags say, and small enough for a link preview", () => {
    expect(pngSize(card)).toEqual({ width: CARD.width, height: CARD.height });
    expect(card.byteLength).toBeLessThanOrEqual(1024 * 1024);
  });

  test("the committed card was made from the line, the logo and the screenshot as they are now", () => {
    const made = madeFrom(card);
    const now = madeFromNow();
    for (const what of ["line", "logo", "screenshot"] as const)
      expect(made[what], `the card's ${what} has changed: run \`bun run share-card\` and look at the card`).toBe(now[what]);
  });

  test("what a card was made from: text chunks after its header, read back; a key written again replaces its chunk", () => {
    const marked = withText(card, { "slipbox:line": "a line", other: "x" });
    expect(textOf(marked)).toEqual({ ...textOf(card), "slipbox:line": "a line", other: "x" });
    expect(new TextDecoder("latin1").decode(marked).split("slipbox:line").length).toBe(2);
    expect(pngSize(marked)).toEqual(pngSize(card));
    expect(madeFrom(marked).line).toBe("a line");
  });

  test("the card's SVG: the name, the line in lines of words, the screenshot embedded", () => {
    expect(wrap("Read, review and edit what your coding agent writes, in your terminal.", 25)).toEqual([
      "Read, review and edit",
      "what your coding agent",
      "writes, in your terminal.",
    ]);
    const svg = cardSvg('<svg width="512" height="512" viewBox="0 0 512 512"></svg>', card, "A <line> & more");
    expect(svg).toContain(`width="${CARD.width}" height="${CARD.height}"`);
    expect(svg).toContain(">slipbox</text>");
    expect(svg).toContain("A &lt;line&gt; &amp; more");
    expect(svg).toContain('<svg x="64" y="112" width="104" height="104"');
    expect(svg).toContain('href="data:image/png;base64,');
  });

  test("the gathering copies the card to the docs' root, where the tags point", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-site-"));
    try {
      copyCard(dir);
      expect(readFileSync(join(dir, CARD.file))).toEqual(Buffer.from(card));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(SENTENCE).toBe("Read, review and edit what your coding agent writes, in your terminal.");
  });
});
