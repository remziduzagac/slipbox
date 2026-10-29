// All-tab problem rows from the current graph, findings, filter and fold state.

import { join, relative } from "node:path";
import type { LinkProblem } from "../../../../core/workspace/graph/graph.ts";
import type { LintVisibility } from "../../../../core/documents/diagnostics/lint-visibility.ts";
import { frontmatterFindings } from "../../../../core/documents/diagnostics/diagnostics.ts";
import { match } from "../../../shell/overlays/match.ts";
import type { App } from "../../../app/runtime/app.ts";
import { readText } from "../../../../core/foundation/platform/fsutil.ts";
import type { ProblemRow, ProblemsPanel } from "./contracts.ts";

export function problemRows(
  owner: {
    readonly app: Pick<App, "loc" | "graph" | "languages" | "git">;
    readonly panel: ProblemsPanel;
    readonly folded: Set<string>;
  },
  vaultLint: () => LintVisibility,
): ProblemRow[] {
  if (owner.app.loc.mode === "folder") return [];
  const q = owner.panel.all.filter;
  const p = owner.app.graph.problems();
  const out: ProblemRow[] = [];
  const written = (l: LinkProblem) => (l.kind === "wiki" || l.kind === "embed" ? `[[${l.target}]]` : l.target);
  const section = (name: string, list: LinkProblem[], why: (l: LinkProblem) => string) => {
    const rows = list
      .map((l) => ({ l, label: `L${l.line}`, detail: `${written(l)}${why(l) ? `  ${why(l)}` : ""}` }))
      .filter((r) => !q || match(q, `${r.l.from} ${r.label} ${r.detail}`));
    if (q && !rows.length) return;
    const folded = !q && owner.folded.has(name);
    out.push({ section: name, heading: true, label: `${name} (${list.length})`, detail: "", text: name, folded });
    if (folded) return;
    // Under the note each is in: the path once, then its problems by line.
    let note = "";
    for (const r of rows) {
      if (r.l.from !== note) {
        note = r.l.from;
        out.push({ section: name, heading: false, note, label: note, detail: "", text: note, folded: false });
      }
      out.push({
        section: name,
        heading: false,
        label: r.label,
        detail: r.detail,
        text: `${r.l.from} ${r.label} ${r.detail}`,
        folded: false,
        link: r.l,
      });
    }
  };
  section("Broken links", p.broken, (l) => l.reason ?? "");
  section("Ambiguous links", p.ambiguous, (l) => `— ${l.candidates.length} notes`);
  // Won by where they're written: a note of the name nearer would take them (code actions name them for sure).
  section("Fragile links", p.fragile, (l) => `— ${l.reason}; [[${l.fix}]] for sure`);
  // Frontmatter (22.2): notes breaking their document type's rules, by note, each finding at its line.
  const fm = frontmatterFindings(owner.app.graph);
  const fmRows = fm
    .flatMap((f) =>
      f.problems.map((x) => ({ path: f.path, line: x.start.line, label: `L${x.start.line}`, detail: x.message })),
    )
    .filter((r) => !q || match(q, `${r.path} ${r.label} ${r.detail}`));
  if (fmRows.length) {
    const folded = !q && owner.folded.has("Frontmatter");
    out.push({
      section: "Frontmatter",
      heading: true,
      label: `Frontmatter (${fm.reduce((n, f) => n + f.problems.length, 0)})`,
      detail: "",
      text: "Frontmatter",
      folded,
    });
    if (!folded) {
      let note = "";
      for (const r of fmRows) {
        if (r.path !== note) {
          note = r.path;
          out.push({
            section: "Frontmatter",
            heading: false,
            note,
            label: note,
            detail: "",
            text: note,
            folded: false,
          });
        }
        out.push({
          section: "Frontmatter",
          heading: false,
          label: r.label,
          detail: r.detail,
          text: `${r.path} ${r.label} ${r.detail}`,
          folded: false,
          frontmatter: { path: r.path, line: r.line },
        });
      }
    }
  }
  // Lint (3.21): the linter's findings over the vault, by note; while it runs, said so.
  if (owner.app.languages.lintCmd || owner.app.languages.vaultLint.issues) {
    const all = owner.app.languages.vaultLint.issues ? vaultLint().shown : null;
    const rows = (all ?? [])
      .map((i) => ({
        i,
        rel: relative(owner.app.loc.root, i.file),
        label: `L${i.line}`,
        detail: `${i.rule} ${i.name}  ${i.description}`,
      }))
      .filter((r) => !q || match(q, `${r.rel} ${r.label} ${r.detail}`));
    if (!q || rows.length) {
      const folded = !q && owner.folded.has("Lint");
      out.push({
        section: "Lint",
        heading: true,
        label: all
          ? `Lint (${all.length})${owner.app.languages.vaultLint.running ? " …" : ""}`
          : owner.app.languages.vaultLint.skipped && !owner.app.languages.vaultLint.running
            ? `Lint — not shown: ${owner.app.languages.vaultLint.skipped}`
            : "Lint — linting…",
        detail: "",
        text: "Lint",
        folded,
      });
      if (!folded) {
        let note = "";
        for (const r of rows) {
          if (r.rel !== note) {
            note = r.rel;
            out.push({ section: "Lint", heading: false, note, label: note, detail: "", text: note, folded: false });
          }
          out.push({
            section: "Lint",
            heading: false,
            label: r.label,
            detail: r.detail,
            text: `${r.rel} ${r.label} ${r.detail}`,
            folded: false,
            lint: r.i,
          });
        }
      }
    }
  }
  // A merge's conflicts (5.12): the files git says are unmerged, each at its first marker.
  const conflicts = [...(owner.app.git.states ?? [])]
    .filter(([, st]) => st === "conflict")
    .map(([path]) => path)
    .sort();
  const shownConflicts = conflicts.filter((n) => !q || match(q, n));
  if (shownConflicts.length) {
    const folded = !q && owner.folded.has("Conflicts");
    out.push({
      section: "Conflicts",
      heading: true,
      label: `Conflicts (${conflicts.length})`,
      detail: "",
      text: "Conflicts",
      folded,
    });
    if (!folded) {
      for (const path of shownConflicts) {
        const line = conflictLine(join(owner.app.loc.root, path));
        out.push({
          section: "Conflicts",
          heading: false,
          label: path,
          detail: line ? `L${line}` : "",
          text: path,
          folded: false,
          conflict: { path, line: Math.max(1, line) },
        });
      }
    }
  }
  // Orphans (9.5): each a note's row alone.
  const orphans = p.orphans.filter((n) => !q || match(q, n));
  if (!q || orphans.length) {
    const folded = !q && owner.folded.has("Orphans");
    out.push({
      section: "Orphans",
      heading: true,
      label: `Orphans (${p.orphans.length})`,
      detail: "",
      text: "Orphans",
      folded,
    });
    if (!folded)
      for (const n of orphans)
        out.push({ section: "Orphans", heading: false, note: n, label: n, detail: "", text: n, folded: false });
  }
  return out;
}

/** The first line of a file with a merge's conflict marker, or 0. */
function conflictLine(abs: string): number {
  try {
    return (
      readText(abs)
        .text.split(/\r?\n/)
        .findIndex((l) => /^<{7}( |$)/.test(l)) + 1
    );
  } catch {
    return 0;
  }
}
