// What's wrong in a file, from every source alike (plan 19.8): its syntax (16.9), the linter's
// findings (3.21), its links (1.7, 11.5) and git's conflict markers — later, language servers'.
// One shape, so the TUI's bar and marks, its status line and the CLI show them the same way.

import { homedir } from "node:os";
import { dirname, isAbsolute, join, posix } from "node:path";
import {
  describeLanding,
  disambiguated,
  fragile,
  type Graph,
  type LinkRef,
  type Pos,
} from "./workspace/graph/graph.ts";
import { landing, lineFragment } from "./workspace/links/landing.ts";
import { slugify } from "./documents/markdown/parse.ts";
import type { LintIssue } from "./lint.ts";
import { unavailable } from "./workspace/vaults/registry.ts";
import type { SyntaxError } from "./documents/syntax/syntax.ts";
import { type DocType, docTypes, frontmatterProblems, ofType } from "./documents/model/doctypes.ts";

/** How bad, worst first. */
export type Severity = "error" | "warning" | "info" | "hint";
export const SEVERITIES: readonly Severity[] = ["error", "warning", "info", "hint"];

export interface Problem {
  /** Where it starts and ends: lines and columns from 1, columns in UTF-16 units, the end after its last character. */
  start: Pos;
  end: Pos;
  severity: Severity;
  /** Who found it: `slipbox`, `syntax`, `markdownlint`, a language server's name. */
  source: string;
  code: string | null;
  message: string;
  /** A link's problem: the link's target as written, so a rendered view can mark the link itself. */
  target?: string;
  /** Its fix: the text that replaces `start`–`end` (offered as a code action), and what it's called. */
  fix?: { title: string; text: string };
}

/** Whether a severity is at least as bad as `min`. */
export function atLeast(s: Severity, min: Severity): boolean {
  return SEVERITIES.indexOf(s) <= SEVERITIES.indexOf(min);
}

/** The worst of some problems' severities. */
export function worst(problems: Problem[]): Severity {
  return SEVERITIES[Math.min(...problems.map((p) => SEVERITIES.indexOf(p.severity)))] ?? "hint";
}

/** A link's `#fragment`: a wikilink's heading, or a markdown link's part after `#` (decoded). */
export function fragmentOf(l: Pick<LinkRef, "kind" | "target" | "heading">): string | null {
  if (l.kind === "wiki" || l.kind === "embed") return l.heading;
  const i = l.target.indexOf("#");
  if (i < 0) return null;
  try {
    return decodeURIComponent(l.target.slice(i + 1));
  } catch {
    return l.target.slice(i + 1);
  }
}

/** A link's file on a drive that isn't there (20.10): unavailable, not gone — said so. */
function onUnplugged(g: Graph, rel: string, target: string): boolean {
  let path = target.split("#")[0]!;
  try {
    path = decodeURIComponent(path);
  } catch {}
  if (path.startsWith("~/")) path = join(homedir(), path.slice(2));
  else if (/^file:\/\//i.test(path)) path = path.replace(/^file:\/\//i, "");
  else if (!path.startsWith("/")) path = join(g.root, dirname(rel), path);
  return unavailable(path);
}

/**
 * A note's own problems (11.5): a link that reaches nothing — a note not written yet is information, a
 * missing file or an unknown folder a warning — or several notes; a heading or block a link names that
 * its note hasn't; git's conflict markers, an error.
 */
export function noteProblems(g: Graph, rel: string): Problem[] {
  const out: Problem[] = [];
  const add = (l: LinkRef, severity: Severity, code: string, message: string) =>
    out.push({
      start: { line: l.line, column: l.column },
      end: l.end,
      severity,
      source: "slipbox",
      code,
      message,
      target: l.target,
    });
  const text = g.textOf(rel) ?? "";
  const lines = text.split("\n");
  for (const l of g.linksOf(rel)) {
    const wiki = l.kind === "wiki" || l.kind === "embed";
    const frag = fragmentOf(l);
    // Won by where it's written (the nearest, the shortest of several of its name): a note of that
    // name nearer would take it, silently. Said, with the path that names it for sure.
    if (
      wiki &&
      (l.resolvedKind === "note" || l.resolvedKind === "file") &&
      fragile(l) &&
      l.path &&
      !isAbsolute(l.path)
    ) {
      const sure = disambiguated(l, rel);
      const at = lines[l.line - 1] ?? "";
      const written = l.end.line === l.line ? at.slice(l.column - 1, l.end.column - 1) : "";
      const open = written.indexOf("[[");
      const i = open >= 0 ? written.indexOf(l.target, open + 2) : -1;
      const fixed = i >= 0 ? written.slice(0, i) + sure + written.slice(i + l.target.length) : null;
      out.push({
        start: { line: l.line, column: l.column },
        end: l.end,
        severity: "info",
        source: "slipbox",
        code: "fragile",
        message: `[[${l.target}]] reaches ${l.path} as ${describeLanding(l)} — a note of that name nearer would take it; [[${sure}]] names it for sure`,
        target: l.target,
        ...(fixed ? { fix: { title: `Name it for sure: [[${sure}]]`, text: fixed } } : {}),
      });
    }
    // A link to the repository's hosting at another ref than the branch here: what it shows there may differ.
    if (l.via === "hosting" && l.hosted && l.resolvedKind !== "unresolved")
      add(
        l,
        "info",
        "other-ref",
        `${l.target} names ${l.hosted.ref}; this copy is on ${l.hosted.branch ?? "no branch"}`,
      );
    // A folder named the old way (21.11): the fix writes its pointer, a markdown link.
    if (l.resolvedKind === "unresolved" && l.suggest) {
      const at = lines[l.line - 1] ?? "";
      const written = l.end.line === l.line ? at.slice(l.column - 1, l.end.column - 1) : "";
      const text =
        l.alias ??
        (wiki ? posix.basename(l.target.slice(l.target.indexOf(":") + 1)).replace(/\.(md|markdown)$/i, "") : null);
      const frag = wiki && l.heading ? `#${slugify(l.heading)}` : wiki && l.block ? `#^${l.block}` : "";
      const fixed = wiki
        ? `${written.startsWith("!") ? "!" : ""}[${text}](${l.suggest}${frag})`
        : written.replace(
            `(${l.target}`,
            `(${l.suggest}${l.target.includes("#") ? l.target.slice(l.target.indexOf("#")) : ""}`,
          );
      out.push({
        start: { line: l.line, column: l.column },
        end: l.end,
        severity: "warning",
        source: "slipbox",
        code: "old-form",
        message: l.reason!,
        target: l.target,
        ...(written ? { fix: { title: `Write its pointer: ${l.suggest}`, text: fixed } } : {}),
      });
      continue;
    }
    switch (l.resolvedKind) {
      case "unresolved":
        if (l.reason) add(l, "warning", "unresolved", l.reason);
        else if (wiki) {
          // Its path's file seen to move (17.12): said, with the fix, as a markdown link's.
          const to = g.movedTarget(l, rel);
          if (to) add(l, "warning", "unresolved", `broken link: ${l.target} — moved to ${to} (relink fixes it)`);
          else add(l, "info", "unresolved", `no note named "${l.target}" yet`);
        } else {
          // A note not written yet: information, as a wikilink's was. Its file seen to move (17.12):
          // said, with the fix — a move never resolves it (20.2). Else broken.
          const to = g.movedTarget(l, rel);
          const yet = to ? null : g.missingNote(l, rel);
          if (yet) add(l, "info", "unresolved", `no note at ${yet} yet`);
          else
            add(
              l,
              "warning",
              "unresolved",
              to
                ? `broken link: ${l.target} — moved to ${to} (relink fixes it)`
                : onUnplugged(g, rel, l.target)
                  ? `broken link: ${l.target} — its drive isn't there`
                  : `broken link: ${l.target}`,
            );
        }
        break;
      case "ambiguous":
        add(
          l,
          "warning",
          "ambiguous",
          `"${l.target}" matches ${l.candidates.length} notes: ${l.candidates.join(", ")}`,
        );
        break;
      case "note":
      case "anchor": {
        if ((!frag && !l.block) || (frag && lineFragment(frag))) break;
        // A branch not checked out here (21.7): its file is git's, not the one on disk — not checked.
        if (l.gitRef) break;
        const path = l.resolvedKind === "anchor" ? rel : l.path!;
        const where = l.resolvedKind === "anchor" ? "this note" : isAbsolute(path) ? posix.basename(path) : path;
        const hit = landing(g, path, frag, l.block, wiki);
        // A heading named by its text, several of that text: the first is meant — said, never silent.
        if (hit?.ambiguous)
          add(l, "info", "ambiguous-heading", `several headings "${frag}" in ${where}: this link reaches the first`);
        if (hit) break;
        const block = l.block ?? (frag!.startsWith("^") ? frag!.slice(1) : null);
        if (block) add(l, "warning", "no-block", `no block ^${block} in ${where}`);
        else add(l, "warning", "no-heading", `no heading "${frag}" in ${where}`);
        break;
      }
    }
  }
  out.push(...conflictProblems(text));
  // Its frontmatter, by its document types' rules (22.2).
  out.push(
    ...frontmatterProblems(
      text,
      rootTypes(g).filter((t) => ofType(rel, t)),
    ),
  );
  return out;
}

const typesFor = new WeakMap<object, DocType[]>();

/** A root's document types (22.2, 22.3): the built-in ones and its config's — read once per config. */
export function rootTypes(g: Pick<Graph, "config">): DocType[] {
  let t = typesFor.get(g.config.types);
  if (!t) typesFor.set(g.config.types, (t = docTypes(g.config.types)));
  return t;
}

const findings = new WeakMap<Graph, { generation: number; list: { path: string; problems: Problem[] }[] }>();

/** The root's notes whose frontmatter breaks their types' rules (22.2), each with its problems; by path, kept while the
 *  root is as it was. */
export function frontmatterFindings(g: Graph): { path: string; problems: Problem[] }[] {
  const hit = findings.get(g);
  if (hit?.generation === g.generation) return hit.list;
  const ruled = rootTypes(g).filter(
    (t) => t.required.length || Object.keys(t.keys).length || Object.keys(t.values).length,
  );
  const list: { path: string; problems: Problem[] }[] = [];
  if (ruled.length) {
    for (const rel of [...g.notes.keys()].sort()) {
      const mine = ruled.filter((t) => ofType(rel, t));
      if (!mine.length) continue;
      const problems = frontmatterProblems(g.textOf(rel) ?? "", mine);
      if (problems.length) list.push({ path: rel, problems });
    }
  }
  findings.set(g, { generation: g.generation, list });
  return list;
}

/** git's conflict markers in a text: each conflict, `<<<<<<<` to `>>>>>>>`, an error. */
export function conflictProblems(text: string): Problem[] {
  const out: Problem[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/^<{7}(\s|$)/.test(lines[i]!)) continue;
    let end = lines.findIndex((x, j) => j > i && /^>{7}(\s|$)/.test(x));
    if (end < 0) end = i;
    out.push({
      start: { line: i + 1, column: 1 },
      end: { line: end + 1, column: lines[end]!.replace(/\r$/, "").length + 1 },
      severity: "error",
      source: "slipbox",
      code: "conflict",
      message: "a merge conflict: both sides are still here",
    });
  }
  return out;
}

/** A parser's syntax errors (16.9), as problems. */
export function syntaxProblems(errors: SyntaxError[]): Problem[] {
  return errors.map((e) => ({
    start: { line: e.line, column: e.from + 1 },
    end: { line: e.line, column: e.to + 1 },
    severity: "error",
    source: "syntax",
    code: null,
    message: e.message,
  }));
}

/** The linter's findings (3.21), as problems: a warning at its line (and column, when it gives one). */
export function lintProblems(issues: LintIssue[]): Problem[] {
  return issues.map((i) => ({
    start: { line: i.line, column: i.column ?? 1 },
    end: { line: i.line, column: i.column ? i.column + 1 : 1 },
    severity: "warning",
    source: "markdownlint",
    code: i.rule,
    message: `${i.name}: ${i.description}`,
  }));
}
