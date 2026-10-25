// What the docs' site says slipbox is (SEO-D1), kept once: the site's config and its route middleware, the gathering,
// the root's page (root.ts, for scripts/release.ts site) and the share card (scripts/share-card.ts) take their words
// from here. It imports nothing: release.ts runs before any package is installed (pages.yml).

/** slipbox's line, as it ends a title: lower case, no full stop. The README, package.json, `slipbox help`, the
 *  Homebrew formula, the docs map, "What is slipbox?" and the skill say the same (tests/docs.test.ts). */
export const LINE = "read, review and edit what your coding agent writes, in your terminal";

/** The line as a sentence: the README's first line, the card's. */
export const SENTENCE = `${LINE[0]!.toUpperCase()}${LINE.slice(1)}.`;

/** What a search result shows under the title: at most 160 characters. */
export const DESCRIPTION =
  "slipbox is a terminal app to read, review and edit what your coding agent writes: Markdown and code rendered, " +
  "and edited where you read them.";

/** Where the docs are served: GitHub Pages' site and the docs' base under it. */
export const SITE = "https://remziduzagac.github.io";
export const BASE = "/slipbox/docs/";
export const DOCS_URL = `${SITE}${BASE}`;
export const GITHUB = "https://github.com/remziduzagac/slipbox";

/** The picture a shared link shows (SEO-D4): assets/share-card.png, served at the docs' root. */
export const CARD = {
  file: "share-card.png",
  type: "image/png",
  width: 1200,
  height: 630,
  alt:
    `slipbox's logo and name, its line "${SENTENCE.slice(0, -1)}", and slipbox in a terminal beside them: a design ` +
    "doc an agent changed, its new line being edited in the lens, and the scratch holding the code it cites.",
} as const;

/** A page's title (SEO-D2): its own, then slipbox and the line; the docs home's is slipbox and the line alone. */
export function fullTitle(page: string, home = false): string {
  return home ? `slipbox: ${LINE}` : `${page} | slipbox: ${LINE}`;
}

/** A tag for a page's head, as Starlight's `head` config takes it. */
export interface HeadTag {
  tag: "meta" | "link";
  attrs: Record<string, string>;
}

/** The card's tags, and the link to llms.txt, for pages of the docs at `docs` (an absolute address ending in `/`). */
export function headTags(docs: string): HeadTag[] {
  const meta = (property: string, content: string): HeadTag => ({ tag: "meta", attrs: { property, content } });
  return [
    meta("og:image", new URL(CARD.file, docs).href),
    meta("og:image:type", CARD.type),
    meta("og:image:width", String(CARD.width)),
    meta("og:image:height", String(CARD.height)),
    meta("og:image:alt", CARD.alt),
    { tag: "meta", attrs: { name: "twitter:image:alt", content: CARD.alt } },
    { tag: "link", attrs: { rel: "describedby", href: new URL("llms.txt", docs).href } },
    {
      tag: "link",
      attrs: {
        rel: "icon",
        type: "image/svg+xml",
        href: new URL("slipbox-logomark-light.svg", docs).href,
        media: "(prefers-color-scheme: dark)",
      },
    },
  ];
}
