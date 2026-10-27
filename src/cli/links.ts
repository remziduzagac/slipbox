// The CLI's link commands: a link as slipbox writes one (21.5), a link followed to its file (`resolve`), a note's
// links with their status and its backlinks, what's wrong in the vault (1.7, 9.5), and its tags (1.6).

import { existsSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { checkoutOf } from "../core/git.ts";
import { inVault, statusOf } from "../core/gitops.ts";
import { conventionOf, type LinkStyle } from "../core/convention.ts";
import { linkEnds, linkWarnings, writeLink } from "../core/write-link.ts";
import { isPointer } from "../core/pointer.ts";
import { certainty, describeLanding, type LinkProblem, type Target } from "../core/graph.ts";
import { type LintIssue, lintCommand, lintFailure, runLint } from "../core/lint.ts";
import { slugify } from "../core/parse.ts";
import { headingFragment, landing, lineFragment } from "../core/landing.ts";
import { classify } from "../core/filetypes.ts";
import { readText } from "../core/foundation/platform/fsutil.ts";
import { frontmatterFindings } from "../core/diagnostics.ts";
import { urlPath } from "../core/convert.ts";
import { findVaultRoot, isInside } from "../core/vault.ts";
import { flag, has, UsageError } from "./args.ts";
import { EXIT, CliError, type Handler, needsIndex, requireArg, resolveNote } from "./common.ts";

/** Links: one written, one followed, a note's links and backlinks, what's broken, the tags. */
export const LINK_COMMANDS: Record<string, Handler> = {
  /**
   * A link to a note or file, as slipbox writes one where `--from` is (21.5): the root's convention
   * (21.4) — `--style` the one already chosen — a note's title its text, a file's name.
   */
  link(s, rest) {
    const arg = requireArg(rest, "note");
    const g = s.graph;
    const fromRel = flag(s.args, "from") ? resolveNote(s, flag(s.args, "from")!) : null;
    // No --from: as from a note at the root.
    const fromAbs = fromRel ? g.abs(fromRel) : join(s.loc.root, ".link.md");
    const file = resolve(s.io.cwd, arg);
    const isFile = existsSync(file) && statSync(file).isFile();
    // A file by its path — not a note, or one out of this root, a root nested in it included (a
    // pointer, 21.7); a note here as any command takes one (its path, its name).
    const byPath =
      isFile &&
      (classify(file, s.config.walk.extensions).group !== "note" ||
        !isInside(s.loc.root, file) ||
        (findVaultRoot(file) ?? s.loc.root) !== s.loc.root);
    // A note here the walk leaves out (git-ignored, under a hidden folder): named, it's reached (20.8),
    // as the note that says which root this is would be — with --from, that's the other note.
    // One the walk never takes (under node_modules, walk.exclude) isn't reached: it goes by its path.
    let reached = true;
    if (isFile && !byPath) {
      const rel = relative(s.loc.root, file).split(sep).join("/");
      if (!g.notes.has(rel)) reached = g.reachFile(rel, { keep: true });
    }
    const toAbs = byPath || (isFile && !reached) ? file : g.abs(resolveNote(s, arg));
    const style = flag(s.args, "style");
    if (style !== undefined && style !== "markdown" && style !== "wiki")
      throw new UsageError(`--style is markdown or wiki (got ${style})`);
    const c = conventionOf(g, s.config, s.configOrigins, style as LinkStyle | undefined);
    const ends = linkEnds(g, fromAbs, toAbs);
    // Its title, from its own root's index when it's another's.
    const title = ends.to.note ? (g.entryAnywhere(ends.to.rel ?? toAbs)?.title ?? "") : "";
    const text =
      flag(s.args, "text") ??
      (c.style.value === "wiki" && !ends.pointer ? "" : title || basename(toAbs).replace(/\.(md|markdown)$/i, ""));
    const link = writeLink(c, c.style.value, ends, text, has(s.args, "embed"));
    // A pointer by a private name, or by a name different folders share: said (D74, D83).
    s.warnings.push(...linkWarnings(ends));
    return {
      data: {
        link,
        path: ends.to.rel ?? toAbs,
        from: fromRel,
        style: c.style.value,
        pathForm: c.path.value,
        extension: c.extension.value,
      },
      human: `${link}\n`,
    };
  },

  resolve(s, rest) {
    const raw = requireArg(rest, "link");
    // A markdown link, [text](target), given whole: its target, resolved as `links` and the TUI do.
    const mdLink = /^!?\[[^\]]*\]\(\s*<?([^>)]*?)>?\s*\)$/.exec(raw);
    const inner = mdLink ? mdLink[1]! : raw;
    // A path, `#heading` after it, as in a link.
    const hash = inner.indexOf("#");
    let parts = {
      target: decodeURIComponentSafe(hash < 0 ? inner : inner.slice(0, hash)),
      heading: hash < 0 ? null : decodeURIComponentSafe(inner.slice(hash + 1)) || null,
    };
    const fromArg = flag(s.args, "from");
    const from = fromArg ? resolveNote(s, fromArg) : null;
    let status: string;
    let path: string | null = null;
    let candidates: string[] = [];
    let found: Target | null = null;
    // A wikilink (21.3): `[[target#heading|alias]]`, read within the root as `links` and the TUI read it.
    const wiki = /^(!?)\[\[([^\]|#]*)(?:#([^\]|]*))?(?:\|[^\]]*)?\]\]$/.exec(raw);
    const bracketed = /^!?\[\[/.test(raw);
    if (wiki) parts = { target: wiki[2]!.trim(), heading: wiki[3]?.trim() || null };
    // A file:// URL names a file (17.16), a slipbox:// pointer a named folder's (21.7): resolved, not external.
    const fileUrl = /^file:\/\//i.test(inner);
    const pointer = isPointer(inner);
    // This repository's hosting (`https://github.com/me/repo/blob/main/x.md`): the file here, not a URL to copy.
    const hosted =
      /^https?:\/\//i.test(inner) &&
      s.graph.resolveLink({ kind: "markdown", target: inner }, fromArg ? resolveNote(s, fromArg) : "").via ===
        "hosting";
    // A folder named the old way (`research:x.md`, 21.12): no link, its pointer said (21.11).
    const old = bracketed || fileUrl || pointer || hosted ? null : s.graph.oldForm(inner);
    // A scheme makes it external, with no spaces (a URL has none) and when no note is named so:
    // "Meeting: Q3" is a note.
    const external =
      /^[a-z][a-z0-9+.-]*:/i.test(inner) &&
      !fileUrl &&
      !pointer &&
      !hosted &&
      !old &&
      (!!mdLink || (/^\S*$/.test(inner) && s.graph.findNote(parts.target, s.io.cwd).status === "unresolved"));
    if (bracketed) {
      const w = s.graph.resolveLink({ kind: wiki?.[1] ? "embed" : "wiki", target: parts.target }, from ?? "");
      status =
        w.resolvedKind === "note" || w.resolvedKind === "file" || w.resolvedKind === "anchor"
          ? "resolved"
          : w.resolvedKind === "ambiguous"
            ? "ambiguous"
            : "unresolved";
      path = status === "resolved" ? w.path : null;
      candidates = w.candidates;
      found = w;
    } else if (old) {
      status = "unresolved";
      found = old;
    } else if (external) {
      status = "external";
      path = inner;
    } else if (!parts.target && from) {
      status = "resolved";
      path = from;
    } else if (from || mdLink || pointer || hosted) {
      // A link written in --from (or at the vault's root): its path — the resolver `links` and the
      // TUI use, so `resolve` is link.follow's CLI equivalent.
      const md = s.graph.resolveLink({ kind: "markdown", target: inner }, from ?? "");
      status =
        md.resolvedKind === "note" || md.resolvedKind === "file" || md.resolvedKind === "folder"
          ? "resolved"
          : md.resolvedKind === "ambiguous"
            ? "ambiguous"
            : "unresolved";
      path = status === "resolved" ? md.path : null;
      candidates = md.candidates;
      found = md;
    } else {
      // No --from: the note a command would name — a path, from here or the vault's root, or its name.
      const r = s.graph.findNote(parts.target, s.io.cwd);
      if (r.status !== "unresolved") {
        status = r.status;
        path = r.path;
        candidates = r.candidates;
      } else {
        const md = s.graph.resolveLink({ kind: "markdown", target: inner }, "");
        status =
          md.resolvedKind === "note" || md.resolvedKind === "file" || md.resolvedKind === "folder"
            ? "resolved"
            : "unresolved";
        path = status === "resolved" ? md.path : null;
        found = md;
      }
    }
    const abs = path && status !== "external" ? (isAbsolute(path) ? path : s.graph.abs(path)) : null;
    let line: number | null = null;
    // The fragment as a link writes it: a heading's id, or GitHub's numbered slug; a block's and lines' as they are.
    const asWritten = !!parts.heading && (parts.heading.startsWith("^") || !!lineFragment(parts.heading));
    let fragment: string | null = null;
    const entry = path && parts.heading && status === "resolved" ? s.graph.entryAnywhere(path) : undefined;
    if (entry) {
      // Where it lands, as following it in the TUI finds it (landing.ts): a heading, a block, lines. Nowhere: the
      // note's top, and what isn't there said.
      const hit = landing(s.graph, path!, parts.heading, null, bracketed);
      line = hit?.line ?? null;
      if (hit) fragment = hit.anchor ?? (hit.heading !== null ? headingFragment(entry.headings, hit.heading) : null);
      else
        s.warnings.push(
          `${parts.heading!.startsWith("^") ? `no block ${parts.heading}` : `no heading "${parts.heading}"`} in ${s.graph.shownPath(abs!)}: the link lands at its top`,
        );
    }
    // With --from, the link to write there (20.20): the relative path, as a link carries it.
    const href =
      abs && from
        ? `${urlPath(
            relative(dirname(s.graph.abs(from)), abs)
              .split(sep)
              .join("/"),
          )}${parts.heading ? `#${fragment ?? (asWritten ? parts.heading : slugify(parts.heading))}` : ""}`
        : null;
    const data = {
      link: raw,
      status,
      path,
      abs,
      shown: abs ? s.graph.shownPath(abs) : null,
      href,
      heading: parts.heading,
      line,
      candidates,
      ...s.rootOf(abs),
      reason: found?.reason ?? null,
      how: found?.via ?? found?.how ?? null,
      certainty: found ? certainty(found) : status === "resolved" ? "exact" : status,
      ...(found?.gitRef ? { git: found.gitRef } : {}),
      ...(found?.suggest ? { suggest: found.suggest } : {}),
    };
    if (status === "ambiguous")
      throw new CliError(
        `ambiguous link "${raw}"${data.reason ? ` (${data.reason})` : ""}: ${candidates.join(", ")}`,
        EXIT.ambiguous,
        data,
      );
    if (status === "unresolved")
      throw new CliError(`unresolved link "${raw}"${data.reason ? `: ${data.reason}` : ""}`, EXIT.notFound, data);
    return { data, human: `${abs ?? path}${line ? `:${line}` : ""}\n` };
  },

  async links(s, rest) {
    // --all: every note's links in one call (a vault-wide check for broken ones), each with `from`.
    const all = has(s.args, "all");
    if (all && rest.length) throw new UsageError("links takes a note or --all, not both");
    const notes = all
      ? (s.graph.ensureAll(), [...s.graph.notes.keys()].sort())
      : [resolveNote(s, requireArg(rest, "note"))];
    if (!all) await s.graph.loadGrammars(); // a code file's links are in its comments (16.10)
    // Each link's file as shown (21.9): its path from this root, else from home, else absolute. A web
    // address is no file: its path is the address, whole, and it has no `shown`, as `resolve` says it.
    const links = notes.flatMap((from) =>
      s.graph.linksOf(from).map((l) => {
        const abs =
          l.path && l.resolvedKind !== "external" ? (isAbsolute(l.path) ? l.path : s.graph.abs(l.path)) : null;
        return { ...l, from, abs, shown: abs ? s.graph.shownPath(abs) : null };
      }),
    );
    const human = links
      .map((l) => {
        const where = `${all ? `${l.from}:` : ""}${l.line}:${l.column}`.padEnd(8);
        const dest =
          l.resolvedKind === "unresolved"
            ? `UNRESOLVED${l.reason ? ` (${l.reason})` : ""}`
            : l.resolvedKind === "ambiguous"
              ? `AMBIGUOUS (${l.candidates.join(", ")})`
              : `${l.shown ?? l.path ?? ""}${describeLanding(l) ? ` (${describeLanding(l)})` : ""}`;
        const shown =
          l.kind === "wiki" || l.kind === "embed" ? `[[${l.target}${l.heading ? `#${l.heading}` : ""}]]` : l.target;
        return `${where} ${l.kind.padEnd(8)} ${shown} -> ${dest}\n`;
      })
      .join("");
    return {
      data: links.map((l) => ({
        ...(all ? { from: l.from } : {}),
        kind: l.kind,
        target: l.target,
        heading: l.heading,
        text: l.text,
        line: l.line,
        column: l.column,
        end: l.end,
        status: l.resolvedKind,
        path: l.path,
        shown: l.shown,
        candidates: l.candidates,
        // Another root's file: that root, and its name (21.10).
        ...s.rootOf(l.abs),
        reason: l.reason ?? null,
        // How it landed, and how sure that is (exact, inferred, ambiguous, broken).
        how: l.via ?? l.how ?? null,
        certainty: certainty(l),
      })),
      human,
    };
  },

  async backlinks(s, rest) {
    const rel = resolveNote(s, requireArg(rest, "note"));
    needsIndex(s, "backlinks");
    await s.graph.loadGrammars(); // code files link from their comments (16.10)
    // Each from as shown (21.9): its path from this root, else from home, else absolute.
    const bl = s.graph.backlinks(rel).map(({ vault: _, ...b }) => {
      const from = isAbsolute(b.from) ? b.from : s.graph.abs(b.from);
      return { ...b, ...s.rootOf(from), shown: s.graph.shownPath(from) };
    });
    return { data: { path: rel, backlinks: bl }, human: bl.map((b) => `${b.shown}:${b.line}  ${b.text}\n`).join("") };
  },

  async problems(s) {
    // What's wrong in the vault (1.7, 9.5): links that reach nothing, or more than one note; notes
    // nothing links to. Elsewhere has no index to look across (VV-D3).
    needsIndex(s, "check of its links");
    const p = s.graph.problems();
    const shown = (x: LinkProblem) =>
      `${x.from}:${x.line}:${x.column}  ${x.kind === "wiki" || x.kind === "embed" ? `[[${x.target}]]` : x.target}`;
    const human: string[] = [
      `broken links (${p.broken.length})`,
      ...p.broken.map((x) => `  ${shown(x)}${x.reason ? `  — ${x.reason}` : ""}`),
      `ambiguous links (${p.ambiguous.length})`,
      ...p.ambiguous.map((x) => `  ${shown(x)}  — ${x.candidates.join(", ")}`),
      // Won by where they're written: a note of the name nearer would take them.
      `fragile links (${p.fragile.length})`,
      ...p.fragile.map((x) => `  ${shown(x)}  — ${x.reason}; [[${x.fix}]] names it for sure`),
      `orphans (${p.orphans.length})`,
      ...p.orphans.map((x) => `  ${x}`),
    ];
    // A merge's conflicts (5.12): the files git says are unmerged, at their first marker.
    const c = checkoutOf(s.loc.root);
    const status = c ? statusOf(c) : null;
    const conflicts = [...(status ?? [])]
      .filter(([, st]) => st === "conflict")
      .map(([p]) => inVault(c!, s.loc.root, p))
      .filter((p): p is string => p !== null)
      .map((path) => ({ path, line: conflictLine(join(s.loc.root, path)) }));
    if (conflicts.length)
      human.push(`conflicts (${conflicts.length})`, ...conflicts.map((x) => `  ${x.path}:${x.line}`));
    // --lint (3.21): your linter's findings too — markdownlint-cli2 with your config, as the TUI runs it.
    let lint: (Omit<LintIssue, "file"> & { file: string })[] | undefined;
    if (has(s.args, "lint")) {
      const cmd = lintCommand(s.config.lint, s.loc.root, undefined, s.config.lsp.auto_install);
      const files = [...s.graph.notes.keys()]
        .filter((rel) => /\.(md|markdown)$/i.test(rel))
        .sort()
        .map((rel) => s.graph.abs(rel));
      const found: LintIssue[] = [];
      let ran = !!cmd;
      // Its output past slipbox's limit: no findings shown, since a list missing some would pass for whole.
      let skipped: string | undefined;
      for (let i = 0; cmd && ran && !skipped && i < files.length; i += 300) {
        const got = await runLint(cmd, files.slice(i, i + 300), s.loc.root, undefined, (text) => s.io.err(`${text}\n`));
        if (got === null) ran = false;
        else if (!Array.isArray(got)) skipped = got.skipped;
        else found.push(...got);
      }
      if (!cmd)
        s.warnings.push(
          s.config.lint.enabled === "off"
            ? 'lint is off: [lint] enabled = "off"'
            : "lint is off: no markdownlint config (~/.markdownlint-cli2.jsonc, or the folder's) and [lint] enabled isn't \"on\"",
        );
      else if (!ran) s.warnings.push(`lint: ${lintFailure(s.config)}`);
      else if (skipped) s.warnings.push(`lint: ${skipped} — its findings aren't shown`);
      else {
        lint = found.map((x) => ({ ...x, file: relative(s.loc.root, x.file) }));
        human.push(
          `lint (${lint.length})`,
          ...lint.map(
            (x) => `  ${x.file}:${x.line}${x.column ? `:${x.column}` : ""}  ${x.rule} ${x.name}  ${x.description}`,
          ),
        );
      }
    }
    // Frontmatter that breaks its document type's rules (22.2): a key missing, of another kind, a value not allowed.
    const frontmatter = frontmatterFindings(s.graph).flatMap((f) =>
      f.problems.map((x) => ({ path: f.path, line: x.start.line, message: x.message })),
    );
    if (frontmatter.length)
      human.push(
        `frontmatter (${frontmatter.length})`,
        ...frontmatter.map((x) => `  ${x.path}:${x.line}  ${x.message}`),
      );
    return {
      data: {
        broken: p.broken,
        ambiguous: p.ambiguous,
        fragile: p.fragile,
        orphans: p.orphans,
        conflicts,
        frontmatter,
        ...(lint ? { lint } : {}),
      },
      human: `${human.join("\n")}\n`,
    };
  },

  tags(s, rest) {
    // A tag's notes — its nested tags' too (1.6) — or every tag with its count; none in Elsewhere (VV-D3).
    needsIndex(s, "tags across its notes");
    const want = rest[0];
    if (want !== undefined) {
      const t = s.graph.tagged(want);
      if (!t) throw new CliError(`no note has #${want.replace(/^#/, "")}`, EXIT.notFound);
      return { data: t, human: t.notes.map((n) => `${n}\n`).join("") };
    }
    const tags = s.graph.tags();
    return { data: tags, human: tags.map((t) => `${String(t.count).padStart(4)}  #${t.tag}\n`).join("") };
  },
};

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** The first line of a file with a merge's conflict marker, or 0. */
function conflictLine(abs: string): number {
  try {
    const i = readText(abs)
      .text.split(/\r?\n/)
      .findIndex((l) => /^<{7}( |$)/.test(l));
    return i + 1;
  } catch {
    return 0;
  }
}
