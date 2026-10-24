// The docs for agents (SEO-D5), written by the gathering beside the pages, at the docs' root: llms.txt, the index
// llmstxt.org proposes — what slipbox is, then a line per page under the docs map's groups, the reference under
// "Optional", the section an agent may skip — and llms-full.txt, every page's text in the map's order. Their pages come
// with absolute addresses and text whose links are absolute too (gather.ts), so either file reads whole on its own.

import { DESCRIPTION, DOCS_URL } from "./about.ts";

/** A page as the files list it: its title, where llms.txt links it (its Markdown, where the site serves that), its
 *  address, its description and its Markdown. */
export interface LlmsPage {
  title: string;
  url: string;
  source: string;
  description: string;
  text: string;
}

/** The map's group an agent may skip: the reference, which the full text holds whole. */
export const OPTIONAL = "Reference";

/** The agent guide, which the site serves as Markdown too, at the docs' root. */
export const AGENT_GUIDE = "agent-guide.md";

/** The full text: every page in the map's order, each its title, its address and its Markdown. */
export function llmsFull(groups: { label: string; pages: LlmsPage[] }[]): string {
  const head = [
    "# slipbox documentation",
    "",
    `> ${DESCRIPTION}`,
    "",
    `Every page of slipbox's documentation (${DOCS_URL}), in the order of its map, each under its title with its ` +
      `address. The index is ${DOCS_URL}llms.txt.`,
  ];
  const pages = groups.flatMap((g) => g.pages).map((p) => `# ${p.title}\n\nSource: ${p.source}\n\n${p.text.trim()}`);
  return `${[head.join("\n"), ...pages].join("\n\n---\n\n")}\n`;
}

/** llms.txt: what slipbox is, then a section per group of the map, a line per page; the reference last, as Optional. */
export function llmsTxt(groups: { label: string; pages: LlmsPage[] }[], fullBytes: number): string {
  // Its paragraph promises the section.
  if (!groups.some((g) => g.label === OPTIONAL))
    throw new Error(`llms.txt: the docs map has no "${OPTIONAL}" group, which its Optional section lists`);
  const kb = Math.max(1, Math.round(fullBytes / 1024));
  const lines = [
    "# slipbox",
    "",
    `> ${DESCRIPTION}`,
    "",
    "slipbox is made for the person working beside a coding agent: in its full-screen terminal interface they read, " +
      "review and edit what the agent writes. An agent can use it too, through its command line: the " +
      `[agent guide](${DOCS_URL}${AGENT_GUIDE}) says how, and \`slipbox skill\` prints the skill of the version ` +
      "installed, which these docs, written for the newest release, may be ahead of. " +
      `The full text of every page is in [llms-full.txt](${DOCS_URL}llms-full.txt) (about ${kb} KB); the Optional ` +
      "section below is the reference: keys, commands, settings, environment.",
  ];
  const section = (label: string, pages: LlmsPage[]) => [
    "",
    `## ${label}`,
    "",
    ...pages.map((p) => `- [${p.title}](${p.url})${p.description ? `: ${p.description}` : ""}`),
  ];
  for (const g of groups) if (g.label !== OPTIONAL) lines.push(...section(g.label, g.pages));
  for (const g of groups) if (g.label === OPTIONAL) lines.push(...section("Optional", g.pages));
  return `${lines.join("\n")}\n`;
}
