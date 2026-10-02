// What's wrong in a file, from every source alike (plan 19.8): its syntax (16.9), the linter's
// findings (3.21), its links (1.7, 11.5) and git's conflict markers — later, language servers'.
// One shape, so the TUI's bar and marks, its status line and the LSP face show them the same way.

import { isAbsolute, posix } from "node:path";
import type { Graph, LinkRef, Pos } from "./graph.ts";
import { landingLine } from "./landing.ts";
import type { LintIssue } from "./lint.ts";
import type { SyntaxError } from "./syntax.ts";

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

/**
 * A note's own problems (11.5): a link that reaches nothing — a note not written yet is information, a
 * missing file or an unknown vault a warning — or several notes; a heading or block a link names that
 * its note hasn't; git's conflict markers, an error.
 */
export function noteProblems(g: Graph, rel: string): Problem[] {
  const out: Problem[] = [];
  const add = (l: LinkRef, severity: Severity, code: string, message: string) => out.push({ start: { line: l.line, column: l.column }, end: l.end, severity, source: "slipbox", code, message, target: l.target });
  for (const l of g.linksOf(rel)) {
    const wiki = l.kind === "wiki" || l.kind === "embed";
    const frag = fragmentOf(l);
    switch (l.resolvedKind) {
      case "unresolved":
        if (l.reason) add(l, "warning", "unresolved", l.reason);
        else if (wiki) add(l, "info", "unresolved", `no note named "${l.target}" yet`);
        else {
          // A note not written yet: information, as a wikilink's was. Its file seen to move (17.12):
          // said, with the fix — a move never resolves it (20.2). Else broken.
          const to = g.movedTarget(l, rel);
          const yet = to ? null : g.missingNote(l, rel);
          if (yet) add(l, "info", "unresolved", `no note at ${yet} yet`);
          else add(l, "warning", "unresolved", to ? `broken link: ${l.target} — moved to ${to} (relink fixes it)` : `broken link: ${l.target}`);
        }
        break;
      case "ambiguous":
        add(l, "warning", "ambiguous", `"${l.target}" matches ${l.candidates.length} notes: ${l.candidates.join(", ")}`);
        break;
      case "note":
      case "anchor": {
        if ((!frag && !l.block) || (frag && /^L\d+$/.test(frag))) break;
        const path = l.resolvedKind === "anchor" ? rel : l.path!;
        if (landingLine(g, path, frag, l.block) !== null) break;
        const where = l.resolvedKind === "anchor" ? "this note" : isAbsolute(path) ? posix.basename(path) : path;
        const block = l.block ?? (frag!.startsWith("^") ? frag!.slice(1) : null);
        if (block) add(l, "warning", "no-block", `no block ^${block} in ${where}`);
        else add(l, "warning", "no-heading", `no heading "${frag}" in ${where}`);
        break;
      }
    }
  }
  out.push(...conflictProblems(g.textOf(rel) ?? ""));
  return out;
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
  return errors.map((e) => ({ start: { line: e.line, column: e.from + 1 }, end: { line: e.line, column: e.to + 1 }, severity: "error", source: "syntax", code: null, message: e.message }));
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
