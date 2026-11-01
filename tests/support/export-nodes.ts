import type { Image, Link, PhrasingContent, RootContent } from "mdast";
import type { ExportDoc, ExportPicture } from "../../src/core/rendering/export/assemble.ts";

/** Every node under `nodes`. */
export function all(nodes: readonly unknown[]): (RootContent | PhrasingContent)[] {
  return (nodes as (RootContent | PhrasingContent)[]).flatMap((n) => [n, ...("children" in n ? all(n.children) : [])]);
}
export const links = (doc: ExportDoc) =>
  doc.chapters.flatMap((ch) => all(ch.nodes)).filter((n): n is Link => n.type === "link");
export const textOf = (nodes: readonly unknown[]): string =>
  all(nodes)
    .map((n) => (n.type === "text" || n.type === "inlineCode" ? n.value : n.type === "break" ? "\n" : ""))
    .join("");
export const pictures = (doc: ExportDoc) =>
  doc.chapters
    .flatMap((ch) => all(ch.nodes))
    .filter((n): n is Image => n.type === "image")
    .map((n) => ({ alt: n.alt, picture: (n.data as { picture?: ExportPicture } | undefined)?.picture }));
/** A note with Obsidian's marks: a highlight, comments in a line, a paragraph of one, one over blank lines. */
export const OBSIDIAN =
  "# Flan\n\n%% Check the amounts with Mum. %%\n\nA ==splash of **vanilla**== %% never more %% here, *always %%said Mum%% fresh* %%twice over%%.\n\n%%\nA block comment:\n\n- over a blank line,\n- closed after a list.\n%%\n\nAfter.\n";
/** What none of the formats may show of `OBSIDIAN`: its comments' words, their marks. */
export const COMMENTS = /Mum|never more|twice|block comment|blank line|%%/;
