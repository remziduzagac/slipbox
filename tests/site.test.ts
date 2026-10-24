// The docs' site (site/, DS): how its pages are gathered from docs/ — the sidebar from the map, the links rewritten to
// the site's addresses, a page's title and description. The build itself runs in CI's `site` job (`bun run site`).

import { describe, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  copyCard,
  copyLogo,
  llmsText,
  llmsUrl,
  pageUrl,
  readLegacyPages,
  readMap,
  rewriteLinks,
  rewriteTarget,
  splitPage,
} from "../site/scripts/gather.ts";
import { CARD, DESCRIPTION, DOCS_URL, fullTitle, headTags, LINE, SENTENCE } from "../site/scripts/about.ts";
import { headOf, problems, rootProblems } from "../site/scripts/check-meta.ts";
import { type LlmsPage, llmsFull, llmsTxt } from "../site/scripts/llms.ts";
import { rootPage } from "../site/scripts/root.ts";
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

describe("the docs' site: the docs for agents (SEO-D5)", () => {
  const page = (title: string, path: string, text = `About ${title}.`): LlmsPage => ({
    title,
    url: llmsUrl(path),
    source: `https://remziduzagac.github.io${pageUrl(path)}`,
    description: `${title}, described.`,
    text,
  });
  const groups = [
    { label: "Start here", pages: [page("Quick start", "guides/quick-start.md")] },
    { label: "Reference", pages: [page("Keys", "manual/keys.md")] },
    { label: "For agents", pages: [page("Agent guide", "agent-guide.md")] },
  ];

  test("llms.txt: slipbox's name, the description, what it's for, then a line per page; the reference last, as Optional", () => {
    const text = llmsTxt(groups, 700 * 1024);
    expect(text.startsWith(`# slipbox\n\n> ${DESCRIPTION}\n\n`)).toBe(true);
    expect(text).toContain("made for the person working beside a coding agent");
    expect(text).toContain("`slipbox skill`");
    expect(text).toContain(`[llms-full.txt](${DOCS_URL}llms-full.txt) (about 700 KB)`);
    const headings = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(headings).toEqual(["Start here", "For agents", "Optional"]);
    expect(text).toContain(
      "- [Quick start](https://remziduzagac.github.io/slipbox/docs/guides/quick-start/): Quick start, described.",
    );
    // The agent guide's line points to its Markdown, which the site serves as it is.
    expect(text).toContain(`- [Agent guide](${DOCS_URL}agent-guide.md): Agent guide, described.`);
    expect(text.indexOf("## Optional")).toBeLessThan(text.indexOf("[Keys]"));
  });

  test("llms-full.txt: every page in the map's order, each its title, its address and its text", () => {
    const text = llmsFull(groups);
    expect(text.startsWith(`# slipbox documentation\n\n> ${DESCRIPTION}\n\n`)).toBe(true);
    const titles = [...text.matchAll(/^# (.+)$/gm)].map((m) => m[1]);
    expect(titles).toEqual(["slipbox documentation", "Quick start", "Keys", "Agent guide"]);
    expect(text).toContain("# Keys\n\nSource: https://remziduzagac.github.io/slipbox/docs/manual/keys/\n\nAbout Keys.");
    // A page's source is its page, the agent guide's too, though llms.txt links its Markdown.
    expect(text).toContain("Source: https://remziduzagac.github.io/slipbox/docs/agent-guide/\n");
  });

  test("a page's text for agents: every link absolute, its own anchors too; code and compatibility anchors aside", () => {
    const site = [
      '<a id="earlier-title"></a>',
      "",
      "See [keys](/slipbox/docs/manual/keys/#leader), [below](#steps) and ![a shot](/slipbox/docs/images/x.png).",
      "Elsewhere: [GitHub](https://github.com/x) and `[code](#not-a-link)`.",
      "",
      "```sh",
      "slipbox /home/you/notes",
      "```",
    ].join("\n");
    expect(llmsText(site, "guides/install.md")).toBe(
      [
        "",
        "See [keys](https://remziduzagac.github.io/slipbox/docs/manual/keys/#leader), " +
          "[below](https://remziduzagac.github.io/slipbox/docs/guides/install/#steps) and " +
          "![a shot](https://remziduzagac.github.io/slipbox/docs/images/x.png).",
        "Elsewhere: [GitHub](https://github.com/x) and `[code](#not-a-link)`.",
        "",
        "```sh",
        "slipbox /home/you/notes",
        "```",
      ].join("\n"),
    );
  });

  test("where llms.txt sends an agent: a page's address, the agent guide's Markdown", () => {
    expect(llmsUrl("manual/keys.md")).toBe("https://remziduzagac.github.io/slipbox/docs/manual/keys/");
    expect(llmsUrl("agent-guide.md")).toBe("https://remziduzagac.github.io/slipbox/docs/agent-guide.md");
  });
});

describe("the docs' site: the build's check of what it tells search engines and agents (SEO-D6)", () => {
  const ROOT = rootPage("https://remziduzagac.github.io/slipbox", "https://github.com/remziduzagac/slipbox");
  const MAP = "## Start here\n\n- [Quick start](guides/quick-start.md): fast.\n";
  const page = (title: string, home = false) =>
    [
      `<html><head><title>${fullTitle(title, home)}</title>`,
      `<meta property="og:title" content="${title}"/>`,
      `<meta name="description" content="${home ? DESCRIPTION : "A page."}"/>`,
      ...headTags(DOCS_URL).map(
        (t) =>
          `<${t.tag} ${Object.entries(t.attrs)
            .map(([k, v]) => `${k}="${v.replaceAll('"', "&quot;")}"`)
            .join(" ")}/>`,
      ),
      "</head></html>",
    ].join("\n");
  /** A built site with everything in it, which `spoil` then breaks. */
  const site = (spoil: (dist: string) => void = () => {}) => {
    const dist = mkdtempSync(join(tmpdir(), "slipbox-meta-"));
    mkdirSync(join(dist, "guides", "quick-start"), { recursive: true });
    writeFileSync(join(dist, "index.html"), page("slipbox documentation", true));
    writeFileSync(join(dist, "guides", "quick-start", "index.html"), page("Quick start"));
    copyFileSync(join(import.meta.dir, "..", "assets", "share-card.png"), join(dist, CARD.file));
    writeFileSync(join(dist, "llms.txt"), `# slipbox\n\n- [Quick start](${DOCS_URL}guides/quick-start/): fast.\n`);
    writeFileSync(join(dist, "llms-full.txt"), `# slipbox documentation\n\n# Quick start\nSource: ${DOCS_URL}guides/quick-start/\n`);
    spoil(dist);
    try {
      return problems(dist, MAP, ROOT);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  };

  test("a site with everything: nothing to say", () => {
    expect(site()).toEqual([]);
    expect(rootProblems(ROOT)).toEqual([]);
  });

  test("each part missing is named: a page's tag or title, the card, either llms file, a page left out", () => {
    const quick = (dist: string) => join(dist, "guides", "quick-start", "index.html");
    const edit = (dist: string, from: RegExp, to: string) =>
      writeFileSync(quick(dist), readFileSync(quick(dist), "utf8").replace(from, to));
    expect(site((d) => edit(d, /<meta property="og:image" [^>]*>/, ""))).toEqual([
      "guides/quick-start/index.html: no og:image",
    ]);
    expect(site((d) => edit(d, /<link rel="describedby"[^>]*>/, ""))).toEqual([
      "guides/quick-start/index.html: no describedby",
    ]);
    expect(site((d) => edit(d, /<title>[^<]*<\/title>/, "<title>Quick start | slipbox</title>"))[0]).toContain(
      'its title is "Quick start | slipbox"',
    );
    expect(site((d) => edit(d, /<meta name="description"[^>]*>/, ""))).toEqual([
      "guides/quick-start/index.html: no description",
    ]);
    expect(site((d) => rmSync(join(d, CARD.file)))).toEqual(["no share-card.png: the share card every page names"]);
    expect(site((d) => writeFileSync(join(d, CARD.file), "not a png"))[0]).toContain("share-card.png is no PNG");
    expect(site((d) => rmSync(join(d, "llms.txt")))).toEqual(["no llms.txt"]);
    expect(site((d) => rmSync(join(d, "llms-full.txt")))).toEqual(["no llms-full.txt"]);
    expect(site((d) => writeFileSync(join(d, "llms.txt"), "# slipbox\n"))).toEqual([
      "llms.txt leaves out guides/quick-start.md",
    ]);
    expect(site((d) => writeFileSync(join(d, "llms-full.txt"), "# slipbox documentation\n"))).toEqual([
      "llms-full.txt leaves out guides/quick-start.md",
    ]);
  });

  test("the root's page: its title, description, canonical link, refresh and card, each named when missing", () => {
    expect(rootProblems(ROOT.replace(/<meta name="description"[^>]*>/, ""))).toEqual([
      "the root's page: its description isn't the site's",
    ]);
    expect(rootProblems(ROOT.replace(/<link rel="canonical"[^>]*>/, ""))[0]).toContain("no canonical link");
    expect(rootProblems(ROOT.replace(/<meta http-equiv="refresh"[^>]*>/, ""))).toEqual([
      "the root's page: no refresh to docs/",
    ]);
    expect(rootProblems("")).toContain("the root's page: no og:image");
  });

  test("a head read back: its title and tags, entities decoded", () => {
    const head = headOf('<title>A &amp; B</title><meta property="og:image:alt" content="say &quot;hi&quot;"/>');
    expect(head.title).toBe("A & B");
    expect(head.tags).toEqual([{ tag: "meta", attrs: { property: "og:image:alt", content: 'say "hi"' } }]);
  });
});
