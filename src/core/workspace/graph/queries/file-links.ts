// Data files and code comments read for links; Graph owns the stamp cache passed to this module.
import { statSync } from "node:fs";
import { join, posix } from "node:path";
import { readText } from "../../../foundation/platform/fsutil.ts";
import { classify, extensionOf } from "../../../documents/model/filetypes.ts";
import { dataLinks, parseData } from "../../../documents/model/data.ts";
import {
  commentLinks,
  grammarFor,
  grammarNow,
  linkTokens,
  parseSyntax,
  type Grammar,
} from "../../../documents/syntax/syntax.ts";
import type { Config } from "../../../application/config/config.ts";
import type { LinkRef, Target } from "../graph-types.ts";

const DATA_LINK_MAX = 256 * 1024;
export type FileLinkCache = Map<string, { stamp: string; links: LinkRef[] }>;
interface FileLinkContext {
  readonly root: string;
  readonly config: Pick<Config, "walk">;
  resolveLink(link: Pick<LinkRef, "kind" | "target">, from: string): Target;
  commentPath(target: string, from: string): string | null;
}

export function fileLinksOf(context: FileLinkContext, cache: FileLinkCache, rel: string): LinkRef[] {
  const kind = classify(rel, context.config.walk.extensions);
  const g = kind.group === "text" ? grammarFor(kind.format, extensionOf(rel)) : null;
  if (kind.group !== "data" && !g) return [];
  let st: { size: number; mtimeMs: number };
  try {
    st = statSync(join(context.root, rel));
  } catch {
    return [];
  }
  if (st.size > DATA_LINK_MAX) return [];
  const stamp = `${st.mtimeMs}:${st.size}`;
  const hit = cache.get(rel);
  if (hit?.stamp === stamp) return hit.links;
  let links: LinkRef[] = [];
  if (g) {
    const code = codeLinks(context, rel, g, readText(join(context.root, rel)).text);
    if (!code) return [];
    cache.set(rel, { stamp, links: code });
    return code;
  }
  try {
    const d = parseData(kind.format, readText(join(context.root, rel)).text);
    links = dataLinks(d.tree)
      .filter(
        (l) =>
          l.explicit ||
          ["note", "file"].includes(context.resolveLink({ kind: "markdown", target: l.target }, rel).resolvedKind),
      )
      .map((l) => ({
        kind: "markdown",
        target: l.target,
        heading: null,
        block: null,
        alias: null,
        text: l.key,
        line: l.line,
        column: 1,
        end: { line: l.line, column: 1 },
      }));
  } catch {}
  cache.set(rel, { stamp, links });
  return links;
}

/** A code file's comment links; null while its grammar loads. Parsed only when the text has a
 *  URL or a path of the vault somewhere (most files have neither, and cost a scan). */
function codeLinks(context: FileLinkContext, rel: string, g: Grammar, text: string): LinkRef[] | null {
  if (!linkTokens(text).some((t) => t.url || context.commentPath(t.target, rel))) return [];
  const loaded = grammarNow(g);
  if (!loaded) return null;
  const tree = parseSyntax(loaded, text);
  if (!tree) return [];
  const out: LinkRef[] = [];
  const lines = text.split("\n");
  for (const l of commentLinks(tree.comments())) {
    const path = l.url ? null : context.commentPath(l.target, rel);
    if (!l.url && !path) continue;
    const target = l.url ? l.target : `/${path}${l.at ? `#L${l.at}` : ""}`;
    out.push({
      kind: "markdown",
      target,
      heading: null,
      block: null,
      alias: null,
      text: lines[l.line - 1]!.slice(l.from, l.to),
      line: l.line,
      column: l.from + 1,
      end: { line: l.line, column: l.to + 1 },
    });
  }
  tree.delete();
  return out;
}

export function commentPath(context: { known(rel: string): boolean }, target: string, fromRel: string): string | null {
  const cands = target.startsWith("/")
    ? [posix.normalize(target.slice(1))]
    : [posix.normalize(posix.join(posix.dirname(fromRel), target)), posix.normalize(target)];
  return cands.find((c) => !c.startsWith("..") && c !== fromRel && context.known(c)) ?? null;
}
