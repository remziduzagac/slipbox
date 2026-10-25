// slipbox's documentation site, served from GitHub Pages at /slipbox/docs/ beside the installer. The pages are the
// Markdown in ../docs, gathered into src/content/docs by scripts/gather.ts before each build; the sidebar is the docs
// map's (../docs/README.md) order and groups, which the gathering writes to src/sidebar.json. What it says slipbox is,
// and the picture a shared link shows, are scripts/about.ts' (SEO-D1).
import { readFileSync } from "node:fs";
import starlight from "@astrojs/starlight";
import { defineConfig, passthroughImageService } from "astro/config";
import { BASE, DESCRIPTION, DOCS_URL, GITHUB, headTags, SITE } from "./scripts/about.ts";

const sidebar = JSON.parse(readFileSync(new URL("./src/sidebar.json", import.meta.url), "utf8"));

export default defineConfig({
  site: SITE,
  base: BASE.replace(/\/$/, ""),
  trailingSlash: "always",
  // The screenshots as they are: no image processing. sharp, which would do it, isn't even installed: package.json's
  // override puts a placeholder in its place (stubs/sharp), so libvips (LGPL) is never fetched.
  image: { service: passthroughImageService() },
  integrations: [
    starlight({
      title: "slipbox",
      // The compact wordmark follows the site's selected theme; its accessible title stays in Starlight.
      logo: {
        light: "./public/slipbox-logotype-dark.svg",
        dark: "./public/slipbox-logotype-light.svg",
        replacesTitle: true,
      },
      favicon: "/slipbox-logomark-dark.svg",
      description: DESCRIPTION,
      // The share card and the link to llms.txt on every page; each page's full title is src/route-data.ts' (SEO-D2).
      head: headTags(DOCS_URL),
      routeMiddleware: "./src/route-data.ts",
      social: [{ icon: "github", label: "GitHub", href: GITHUB }],
      // Each gathered page carries its own edit link, to its file in docs/ (its frontmatter's editUrl).
      editLink: { baseUrl: `${GITHUB}/edit/main/site/` },
      lastUpdated: false,
      sidebar,
    }),
  ],
});
