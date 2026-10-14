// slipbox's documentation site, served from GitHub Pages at /slipbox/docs/ beside the installer. The pages are the
// Markdown in ../docs, gathered into src/content/docs by scripts/gather.ts before each build; the sidebar is the docs
// map's (../docs/README.md) order and groups, which the gathering writes to src/sidebar.json.
import { readFileSync } from "node:fs";
import starlight from "@astrojs/starlight";
import { defineConfig, passthroughImageService } from "astro/config";

const sidebar = JSON.parse(readFileSync(new URL("./src/sidebar.json", import.meta.url), "utf8"));

export default defineConfig({
  site: "https://remziduzagac.github.io",
  base: "/slipbox/docs",
  trailingSlash: "always",
  // The screenshots as they are: no image processing. sharp, which would do it, isn't even installed: package.json's
  // override puts a placeholder in its place (stubs/sharp), so libvips (LGPL) is never fetched.
  image: { service: passthroughImageService() },
  integrations: [
    starlight({
      title: "slipbox",
      logo: { src: "./public/favicon.svg" },
      favicon: "/favicon.svg",
      description: "The terminal companion for coding agents: read, review and edit what your agent writes.",
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/remziduzagac/slipbox" }],
      // Each gathered page carries its own edit link, to its file in docs/ (its frontmatter's editUrl).
      editLink: { baseUrl: "https://github.com/remziduzagac/slipbox/edit/main/site/" },
      lastUpdated: false,
      sidebar,
    }),
  ],
});
