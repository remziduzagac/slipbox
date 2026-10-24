// The Pages site's root, `/slipbox/` (SEO-D3): still an instant redirect to the docs, which Google takes as permanent,
// so the docs home is what it indexes, but with a head that says what slipbox is — to a link preview, which reads the
// page it's given and follows no refresh, and to a search engine or an agent before it follows. scripts/release.ts
// site writes it beside the installer; check-meta.ts checks it. It imports about.ts alone, and that nothing: pages.yml
// runs release.ts before any package is installed.

import { DESCRIPTION, fullTitle, headTags, LINE } from "./about.ts";

/** Text made safe for HTML, in an attribute's quotes or between tags. */
export function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** The root's `index.html` for the Pages site at `site` (`https://<owner>.github.io/<name>`, no slash at the end), whose
 *  repository is at `repository`. */
export function rootPage(site: string, repository: string): string {
  const docs = `${site}/docs/`;
  const title = fullTitle("", true);
  const tag = (name: string, attrs: Record<string, string>) =>
    `<${name}${Object.entries(attrs)
      .map(([k, v]) => ` ${k}="${escapeHtml(v)}"`)
      .join("")}>`;
  const head = [
    tag("meta", { charset: "utf-8" }),
    tag("meta", { name: "viewport", content: "width=device-width, initial-scale=1" }),
    `<title>${escapeHtml(title)}</title>`,
    tag("meta", { name: "description", content: DESCRIPTION }),
    tag("link", { rel: "canonical", href: docs }),
    tag("meta", { "http-equiv": "refresh", content: "0; url=docs/" }),
    tag("meta", { property: "og:type", content: "website" }),
    tag("meta", { property: "og:title", content: title }),
    tag("meta", { property: "og:description", content: DESCRIPTION }),
    tag("meta", { property: "og:url", content: docs }),
    tag("meta", { property: "og:site_name", content: "slipbox" }),
    ...headTags(docs).map((t) => tag(t.tag, t.attrs)),
    tag("meta", { name: "twitter:card", content: "summary_large_image" }),
    tag("link", { rel: "icon", href: "docs/logo.svg", type: "image/svg+xml" }),
  ];
  const body =
    `<p>slipbox: ${escapeHtml(LINE)}. Read <a href="docs/">its documentation</a>, ` +
    `<a href="docs/guides/install/">install it</a>, or see <a href="${escapeHtml(repository)}">its repository</a>.</p>`;
  return `<!doctype html>\n<html lang="en">\n<head>\n${head.join("\n")}\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
}
