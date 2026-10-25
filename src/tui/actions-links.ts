// The commands of links (`link.*`, `links.*`, `backlinks.*`, `peek.*`): a link followed — to a note, a heading, a
// line, another vault's file (a peek) or a pointer — cycled through, listed, its target copied.

import { type Run, withView, lay } from "./actions.ts";
import { diffEnter } from "./diffview.ts";
import { canonKey } from "../core/commands.ts";
import { prettyKey } from "./keys.ts";
import { peekGo, peekKeep, peekFill, peekInstead, ownPath } from "./peek.ts";
import { planRelink, planVaultRename } from "../core/rename.ts";
import type { App, View, ListItem } from "./app.ts";
import type { LayoutLink } from "../core/layout/ir.ts";
import * as E from "./editing.ts";
import { linkTokens } from "../core/syntax.ts";
import { readerFor } from "../core/readers.ts";
import { type Anchor, TOP } from "../core/position.ts";
import { isAbsolute, join, posix } from "node:path";
import { isNotePath, pathLink, pathForm } from "../core/links.ts";
import { isFile } from "./actions-files.ts";
import { isPointer, parsePointer, resolvePointer } from "../core/pointer.ts";
import { ELSEWHERE, tildePath } from "../core/names.ts";
import { slugName } from "../core/registry.ts";
import { rootAt } from "../core/vault.ts";
import { classify } from "../core/filetypes.ts";
import { lineFragment, blockLine, findHeading } from "../core/landing.ts";
import { anchorsOf, headingsOf } from "../core/parse.ts";

/** Links: followed, peeked at, cycled through, listed (links and backlinks), inserted and converted. */
export function linkActions(): Record<string, Run> {
  return {
    // links
    "link.insert": (a) => withView(a, (v) => a.linking.insertLink(v)),
    "link.next": (a) => cycleLink(a, 1),
    "link.prev": (a) => cycleLink(a, -1),
    "link.follow": (a) =>
      withView(a, (v) => {
        // A diff window's row (GIT-D2): a fold opened, a line gone to.
        if (diffEnter(a, v)) return;
        if (a.currentLayout(v).lines[v.cur.row]?.details) return a.run("html.details_toggle");
        // The code view's run of imports (24.5): folded or unfolded.
        if (a.code.toggleFold(v)) return;
        const i = a.linking.linkForFollow(v);
        const link = i >= 0 ? lay(a, v).links[i]! : sourceLinkAt(a, v);
        if (!link) {
          // The keys bound to the next link, as configured: one of its own, and the leader's.
          const keys = a.keymap.keysFor("link.next");
          const lead = canonKey(a.leader);
          const said = [keys.find((k) => k.split(" ")[0] !== lead), keys.find((k) => k.split(" ")[0] === lead)]
            .filter((k) => k !== undefined)
            .map((k) => prettyKey(k, a.leader));
          return a.message(
            "info",
            said.length ? `no link here · ${said.join(" or ")} goes to the next one` : "no link here",
          );
        }
        return followLink(a, link, "here");
      }),
    "link.follow_split": (a) =>
      withView(a, (v) => {
        const i = a.linking.linkForFollow(v);
        const link = i >= 0 ? lay(a, v).links[i]! : sourceLinkAt(a, v);
        if (!link) return a.message("info", "no link here");
        return followLink(a, link, "split");
      }),
    "link.follow_tab": (a) =>
      withView(a, (v) => {
        const i = a.linking.linkForFollow(v);
        const link = i >= 0 ? lay(a, v).links[i]! : sourceLinkAt(a, v);
        if (!link) return a.message("info", "no link here");
        return followLink(a, link, "tab");
      }),
    // ctrl+click (VV-D7): out of this vault, gone into at once, without a peek; within it, as a click.
    "link.go": (a) =>
      withView(a, (v) => {
        const i = a.linking.linkForFollow(v);
        const link = i >= 0 ? lay(a, v).links[i]! : sourceLinkAt(a, v);
        if (!link) return a.message("info", "no link here");
        return followLink(a, link, "here", true);
      }),
    // The peek (VV-D7): o goes there, t keeps it as a tab, z fills the screen.
    "peek.go": (a) => peekGo(a),
    "peek.tab": (a) => peekKeep(a),
    "peek.fill": (a) => peekFill(a),
    "links.open": (a) =>
      withView(a, (v) => {
        const layout = lay(a, v);
        if (!layout.links.length) return a.message("info", "no links in this note");
        a.overlays.openList({
          title: `Links from ${v.buf.name}`,
          items: layout.links.map((l, i) => ({
            label: l.text,
            detail:
              l.kind === "markdown" || l.kind === "image"
                ? l.target
                : `[[${l.target}${l.heading ? `#${l.heading}` : ""}]]`,
            hint: l.status,
            data: i,
          })),
          accept: (item) => {
            const l = layout.links[item.data as number]!;
            if (l.line >= 0) a.moveCursor(v, { row: l.line, col: l.col });
            return followLink(a, l, "here");
          },
        });
      }),
    "backlinks.open": (a) =>
      withView(a, (v) => {
        // Elsewhere has no index (VV-D3): no backlinks there, and why, not an empty list.
        if (a.loc.mode === "folder")
          return a.message(
            "info",
            `no backlinks in ${ELSEWHERE}: it has no index — a note in a vault or home has them`,
          );
        if (!v.buf.rel) return a.message("info", "backlinks are kept for the notes of a vault");
        const bl = a.graph.backlinks(v.buf.rel);
        if (!bl.length) return a.message("info", `no notes link to ${v.buf.rel}`);
        a.overlays.openList({
          title: `Linking to ${v.buf.name} (${bl.length})`,
          // Another root's link (17.11): by its path, as files are shown (21.9).
          items: bl.map((b) => ({
            label: b.vault ? a.graph.shownPath(b.from) : b.from,
            detail: b.text,
            hint: `${b.line}`,
            data: b,
          })),
          accept: (item) => {
            const b = item.data as { from: string; line: number };
            const at = { heading: null, headingIndex: 0, offset: b.line - 1, line: b.line };
            // From another vault: read in a peek, at the link (VV-D7), going there a choice.
            if (peekInstead(a, b.from, at)) return;
            a.open(b.from, at);
          },
        });
      }),
    "link.convert": (a, arg) => {
      // A note named: its links; else every note's.
      if (!arg) return a.renaming.previewConvert();
      const r = a.graph.findNote(arg, a.loc.root);
      if (r.status !== "resolved")
        return a.message(
          "warn",
          r.status === "ambiguous" ? `"${arg}" matches ${r.candidates.join(", ")}` : `no note "${arg}"`,
        );
      a.renaming.previewConvert([r.path]);
    },
    "link.relink": (a) =>
      withView(a, (v) => {
        if (!v.buf.rel) return a.message("warn", "only this vault's notes are relinked");
        const rel = v.buf.rel;
        a.renaming.preview(() => planRelink(a.graph, [rel]));
      }),
  };
}

// ---------------------------------------------------------------------------------------------
// Links

/**
 * The link under the cursor on a source row (source mode, the lens), read from the markdown: a
 * `[[wikilink]]`, an `![[embed]]` or a `[text](url)` around the cursor. Rendered rows carry their
 * links; source rows are the text itself.
 */
function sourceLinkAt(a: App, v: View): LayoutLink | null {
  const row = lay(a, v).lines[v.cur.row];
  if (!row?.srcMap) return null;
  const at = E.offsetOf(a, v);
  const line = E.lineOf(v, at);
  const text = E.lineText(v, line);
  const col = at - (v.buf.lineStarts()[line - 1] ?? 0);
  const base = { status: "unknown" as const, line: -1, col: -1, src: line };
  // A text file's: a URL, or a path naming a file of the vault, `path:42` at its line (16.10) — in
  // a comment or not (an import's path is worth following too).
  if (v.buf.kind.group === "text") {
    const t = linkTokens(text).find((k) => col >= k.index && col < k.index + k.length);
    if (!t) return null;
    if (t.url) return { ...base, kind: "markdown", target: t.target, heading: null, text: t.target };
    const path = v.buf.rel ? a.graph.commentPath(t.target, v.buf.rel) : null;
    return path
      ? { ...base, kind: "markdown", target: `/${path}${t.at ? `#L${t.at}` : ""}`, heading: null, text: t.target }
      : null;
  }
  // A note's: its format's link syntax (16.2).
  if (v.buf.kind.group !== "note") return null;
  const l = readerFor(v.buf.kind.format).linkAt(text, col);
  return l ? { ...base, ...l } : null;
}

/** Where a followed link opens: this window, the split's other one, or a new tab. */
type Into = "here" | "split" | "tab";

/**
 * A note or file opened where a link goes: here, in the split's other window, or a tab of its own. Out of this vault —
 * another vault's, or outside every vault — read in a peek instead, or, `go`, gone into at once (VV-D7).
 */
function openInto(a: App, into: Into, path: string, anchor?: Anchor, go = false): void {
  if (peekInstead(a, path, anchor, go)) return;
  if (into === "tab") return a.openInNewTab(path, anchor);
  if (into === "split") a.windows.other();
  a.open(path, anchor);
}

function followLink(a: App, link: LayoutLink, into: Into, goOut = false): void | Promise<void> {
  const view = a.view;
  if (!view) return;
  // Another vault's file read here — a peek, a tab kept from one: its links read in its own vault (VV-D7), its paths
  // there reached by their absolute paths; outside every vault, from where it is.
  const there = view.buf.elsewhere;
  const graph = there ? there.graph : a.graph;
  const own = there ? there.rel : view.buf.rel;
  // A link drawn inside an embed (1.11) is the embedded note's: followed from there.
  const from = link.from ?? own;
  const reach = (path: string) => (there?.graph && !isAbsolute(path) ? join(there.graph.root, path) : path);
  const go = (path: string, heading: string | null) => {
    const to = ownPath(a, reach(path));
    openInto(
      a,
      into,
      to,
      heading ? fragmentAnchor(a, to, heading, link.kind === "wiki" || link.kind === "embed") : undefined,
      goOut,
    );
  };
  switch (link.kind) {
    case "tag":
      // A tag (1.6): the notes that carry it.
      return a.search.openTagNotes(link.target);
    case "footnote": {
      const layout = lay(a, view);
      // The definition's first row, by identifier (whatever the label's case, in a quote or a list).
      const row = layout.lines.findIndex(
        (l) => l.footnoteDef !== undefined && l.footnoteDef.toLowerCase() === link.target.toLowerCase(),
      );
      if (row < 0) return a.message("warn", `footnote [^${link.target}] has no definition`);
      a.history.push(view);
      a.moveCursor(view, { row, col: 0 });
      return;
    }
    case "wiki":
    case "embed": {
      if (!link.target) {
        // `[[#Heading]]` inside an embed: the embedded note's heading, in it.
        if (link.heading && link.from && link.from !== own) return go(link.from, link.heading);
        if (link.heading) jumpToHeading(a, view, link.heading, true);
        return;
      }
      if (!from || !graph)
        return a.message("warn", `[[${link.target}]]: a wikilink is read within a vault — this file is in none`);
      const r = graph.resolveLink({ kind: link.kind, target: link.target }, from);
      if (r.via)
        a.message(
          "info",
          `[[${link.target}]] reached ${r.path} by ${r.via === "alias" ? "an alias" : r.via === "previous-name" ? "a previous name" : "a redirect"}`,
        );
      // `#^id`: the block it marks, by its line (21.3), as a path link's lands.
      if (r.resolvedKind === "note") return go(r.path!, link.heading);
      if (r.resolvedKind === "file") return fileLink(a, reach(r.path!), link.heading, into, goOut);
      if (r.resolvedKind === "ambiguous") {
        // Two notes of a name, or two attachments (`![[dal.png]]`, 21.3): one picked, opened as its link would.
        const notes = r.candidates.every(isNotePath);
        return a.overlays.openList({
          title: `[[${link.target}]] matches ${r.candidates.length} ${notes ? "notes" : "files"}`,
          items: r.candidates.map((c) => ({ label: c, data: c })),
          accept: (item) =>
            isNotePath(item.data as string)
              ? go(item.data as string, link.heading)
              : fileLink(a, reach(item.data as string), link.heading, into, goOut),
        });
      }
      // In another vault, or a vault this machine doesn't know: say which (17.8).
      if (r.reason) return a.message("warn", `[[${link.target}]]: ${r.reason}`);
      // Another vault's file, read here: a note is written there, never from here.
      if (there) return a.message("warn", `[[${link.target}]]: no note by that name in ${there.vault}`);
      // No note by that name yet: make it (beside the note linking to it), the name typed already.
      return a.files.promptNewNote(posix.dirname(from) === "." ? "" : posix.dirname(from), link.target);
    }
    case "markdown":
    case "image": {
      // A URL — a pointer too (21.7), which names its folder: followed from a file of no root as well.
      const external = /^[a-z][a-z0-9+.-]*:/i.test(link.target);
      // The fragment, decoded when it can be (`%zz` can't); a block's `^id` lands on its block, as
      // the line it marks (a converted `[[note#^id]]`, 20.1).
      const raw = link.target.includes("#") ? link.target.slice(link.target.indexOf("#") + 1) : "";
      let frag: string | null = null;
      if (raw) {
        try {
          frag = decodeURIComponent(raw);
        } catch {
          frag = raw;
        }
      }
      if ((!from || !graph) && !external) {
        // A file outside every vault, read in a peek (VV-D7), or one of Elsewhere's (VV-D3): its paths read from
        // where it is.
        const path = link.target.split("#")[0]!;
        if ((there && !there.graph) || a.loc.mode === "folder") {
          if (!path && frag) return jumpToHeading(a, view, frag);
          // A plain `b.md` is from its folder too: no vault's top to start from.
          const hit = path ? pathLink(pathForm(path) ? path : `./${path}`, view.buf.abs, false) : null;
          if (hit && isFile(hit.abs)) return go(hit.abs, frag);
          return a.message("warn", `broken link: ${link.target}`);
        }
        return a.message(
          "warn",
          `${link.target}: this file is outside the vault — open its folder to follow its links`,
        );
      }
      // A picture on the internet: fetched, as `[render] images_remote` says (12.12).
      if (link.kind === "image" && external && a.pictures.followRemote(link.target)) return;
      const r = (graph ?? a.graph).resolveLink(
        { kind: link.kind === "image" ? "image" : "markdown", target: link.target },
        from ?? "",
      );
      if (r.resolvedKind === "external") {
        a.copy(link.target, false);
        return a.message("info", `copied: ${link.target}`);
      }
      // A pointer (21.7): its folder by a name it had, or another copy than the one links open — said so;
      // a branch not checked out here, the file read from git; a name of different folders, picked.
      if (r.via === "old-name") a.message("info", `${link.target} reached ${r.vault} by a name it had`);
      if (r.via === "another-copy")
        a.message("info", `${link.target}: the copy of ${r.vault} links open isn't here — another copy`);
      if (r.gitRef) return a.git.showFromGit(r.gitRef, link.target);
      if (r.resolvedKind === "ambiguous" && isPointer(link.target))
        return pickPointerFolder(a, link.target, frag, into);
      // Not on this machine, gone, no such file there: why — never a new note by a pointer's name. A
      // folder named the old way (`research:x.md`, 21.11): why, and its pointer.
      if (r.resolvedKind === "unresolved" && (isPointer(link.target) || r.suggest))
        return a.message("warn", r.suggest ? r.reason! : `${link.target}: ${r.reason ?? "not found"}`);
      if (r.resolvedKind === "anchor") {
        const here = link.from ?? own;
        if (frag && here && (here !== own || frag.startsWith("^"))) return go(here, frag);
        if (frag) jumpToHeading(a, view, frag);
        return;
      }
      if (r.resolvedKind === "note") return go(r.path!, frag);
      if (r.resolvedKind === "file") return fileLink(a, reach(r.path!), frag, into, goOut);
      if (r.resolvedKind === "folder") return a.explorer.revealFolder(reach(r.path!));
      // Its file seen to move (17.12): where, and the fix (20.2: a move never resolves a link).
      const as = { kind: link.kind === "image" ? ("image" as const) : ("markdown" as const), target: link.target };
      const to = from && graph ? graph.movedTarget(as, from) : null;
      // A note not written yet: made where the link names it, its name typed already (a wikilink's
      // was offered so; a path names its place, so no other note's name stands in the way). Another vault's file,
      // read here: written there, never from here.
      const yet = from && graph && !to ? graph.missingNote(as, from) : null;
      if (yet && there) return a.message("warn", `${link.target}: not written yet, in ${there.vault}`);
      if (yet) {
        const dir = posix.dirname(yet);
        const name = posix.basename(yet).replace(/\.(md|markdown)$/i, "");
        return a.files.promptNewNote(dir === "." ? "" : dir, name, name);
      }
      return a.message(
        "warn",
        to ? `broken link: ${link.target} — moved to ${to}: space l r relinks it` : `broken link: ${link.target}`,
      );
    }
  }
}

/**
 * A pointer whose name different folders have (21.7): each, to open what it names there; and, for a
 * `.slipbox/` folder, renaming its name — the parent folder's name prefixed as a suggestion, the
 * edit to its config previewed first. Not now (esc) leaves it ambiguous, picked when followed again.
 */
function pickPointerFolder(a: App, target: string, frag: string | null, into: Into): void {
  const p = parsePointer(target);
  const t = p ? resolvePointer(p) : null;
  if (!p || t?.status !== "ambiguous") return;
  const items: ListItem[] = [];
  for (const f of t.folders) {
    const at = f.default ?? f.copies[0]?.path;
    if (!at) continue;
    items.push({
      label: tildePath(at),
      detail: f.remote ?? `.slipbox/ ${f.id ?? ""}`.trim(),
      data: { open: join(at, p.path) },
    });
  }
  for (const f of t.folders.filter((x) => !x.remote)) {
    const at = f.default ?? f.copies[0]?.path;
    if (at)
      items.push({
        label: `Rename ${tildePath(at)}'s name…`,
        detail: `${f.name} → ${slugName(posix.basename(posix.dirname(at)))}-${f.name}`,
        data: { rename: at, name: f.name },
      });
  }
  a.overlays.openList({
    title: `${p.name}: ${t.folders.length} different folders have this name — which is meant?`,
    items,
    filterable: false,
    accept: (item) => {
      const d = item.data as { open?: string; rename?: string; name?: string };
      if (d.open) return openInto(a, into, d.open, frag ? fragmentAnchor(a, d.open, frag) : undefined);
      const root = d.rename!;
      const suggested = `${slugName(posix.basename(posix.dirname(root)))}-${d.name}`;
      a.overlays.prompt(
        `rename ${d.name} at ${tildePath(root)} to: `,
        (name) => name.trim() && a.renaming.preview(() => planVaultRename(rootAt(root), name.trim())),
      );
      if (a.overlay?.kind === "prompt") a.overlay.text = suggested;
    },
  });
}

export function fileLink(a: App, path: string, heading: string | null = null, into: Into = "here", go = false): void {
  // This vault's file by its path in it; another's absolute.
  const rel = ownPath(a, path);
  // A data or text file opens (16.4) — at a data file's section when the link names one
  // (`[[config.toml#editor]]`); a binary one (a picture, a PDF) never opens: its path is copied.
  if (classify(rel, a.config.walk.extensions).group !== "binary") {
    const line = heading ? lineAnchor(heading) : undefined;
    openInto(a, into, rel, line, go);
    if (heading && !line && a.view) jumpToHeading(a, a.view, heading);
    return;
  }
  // Another vault's attachment by its own absolute path, never this vault's root before it.
  a.copy(isAbsolute(rel) ? rel : join(a.loc.root, rel), false);
  a.message("info", `attachment ${rel} — path copied`);
}

/** A line fragment (GitHub's `L42`, `L42-L50`, `L42C5-L45C10`; a code comment's `path:42`, 16.10): its first line. */
function lineAnchor(fragment: string): Anchor | undefined {
  const f = lineFragment(fragment);
  return f ? { heading: null, headingIndex: 0, offset: 0, line: f.line } : undefined;
}

/**
 * Where a link's fragment lands in a note, as an anchor: its lines (`L42`), its block (`^id`, the line it
 * marks, 21.3), else a heading (`headingAnchor`). One that lands nowhere opens the note at its top, and
 * what isn't there is said, a heading or a block alike (design/links.md § Where a link lands).
 */
function fragmentAnchor(a: App, path: string, fragment: string, wiki = false): Anchor {
  const lines = lineAnchor(fragment);
  if (lines) return lines;
  if (!fragment.startsWith("^")) return headingAnchor(a, path, fragment, wiki);
  const line = blockLine(a.graph, path, fragment.slice(1));
  if (line !== null) return { ...TOP, line };
  a.message("warn", `no block ${fragment} in ${shownAt(a, path)}: opened at its top`);
  return { ...TOP };
}

/** Text as Markdown reads it back, its punctuation escaped: a heading's `*` or a path's `_` never formatting. */
export function markdownText(s: string): string {
  return s.replace(/[!-/:-@[-`{-~]/g, "\\$&");
}

/** A note's path as a message gives it (21.9): from this root, else from home, else absolute. */
function shownAt(a: App, path: string): string {
  return isAbsolute(path) ? a.graph.shownPath(path) : path;
}

/** Where a heading lands in a note (landing.ts: an id, a heading by slug or text, a path of headings), as an anchor; nowhere, the note's top, said. */
function headingAnchor(a: App, path: string, heading: string, wiki = false): Anchor {
  // A note of another vault too (17.10): its heading is found in that vault's index.
  const note = a.graph.entryAnywhere(path);
  const hit = note ? findHeading(note.headings, note.anchors ?? [], heading, wiki) : null;
  if (!hit) {
    a.message("warn", `no heading "${heading}" in ${shownAt(a, path)}: opened at its top`);
    return { ...TOP };
  }
  if (hit.ambiguous) a.message("info", `${path} has several headings "${heading}": the first`);
  if (hit.heading === null) return { heading: null, headingIndex: 0, offset: 0, line: hit.line };
  const h = note!.headings[hit.heading]!;
  const idx = note!.headings.filter((x) => x.slug === h.slug && x.line < h.line).length;
  return { heading: h.slug, headingIndex: idx, offset: 0, line: h.line };
}

/**
 * A JSON pointer (`#/components/schemas/Frame`, a `$ref`'s) as a heading: each segment the next
 * level's key under the one before, in a data file's tree (16.12). A list index counts from 0,
 * the tree's item rows from 1.
 */
function pointerHeading(headings: { level: number; text: string }[], pointer: string): number {
  const segs = pointer
    .slice(1)
    .split("/")
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
  let at = -1;
  let level = 0;
  for (const seg of segs) {
    const want = [seg, ...(/^\d+$/.test(seg) ? [String(Number(seg) + 1)] : [])];
    let found = -1;
    for (let i = at + 1; i < headings.length; i++) {
      const h = headings[i]!;
      if (h.level <= level) break; // out of the parent's rows
      if (h.level === level + 1 && want.includes(h.text)) {
        found = i;
        break;
      }
    }
    if (found < 0) return -1;
    at = found;
    level++;
  }
  return at;
}

function jumpToHeading(a: App, view: View, heading: string, wiki = false): void {
  const full = headingsOf(view.buf.parsed.tree);
  const target = findHeading(full, anchorsOf(view.buf.parsed.tree), heading, wiki);
  if (target) a.html.reveal(view, target.line);
  const layout = lay(a, view);
  const p = heading.startsWith("/") ? pointerHeading(layout.headings, heading) : -1;
  if (p >= 0) {
    a.history.push(view);
    return a.moveCursor(view, { row: layout.headings[p]!.line, col: 0 });
  }
  // As a link finds one (landing.ts): its id, an anchor (`<a id>`, from the note's parse), its slug, its text.
  const heads = layout.headings.map((h) => ({ depth: h.level, text: h.text, slug: h.slug, line: h.src, id: h.id }));
  const anchors =
    view.buf.kind.group === "note" && view.buf.parsed && !view.buf.parsing ? anchorsOf(view.buf.parsed.tree) : [];
  const hit = findHeading(heads, anchors, heading, wiki);
  if (!hit) return a.message("warn", `no heading "${heading}" here`);
  if (hit.ambiguous) a.message("info", `several headings "${heading}" here: the first`);
  a.history.push(view);
  if (hit.heading !== null) return a.moveCursor(view, { row: layout.headings[hit.heading]!.line, col: 0 });
  const row = layout.lines.findIndex((l) => l.src >= hit.line);
  a.moveCursor(view, { row: Math.max(0, row), col: 0 });
}

function cycleLink(a: App, dir: 1 | -1): void {
  withView(a, (v) => {
    const layout = lay(a, v);
    const links = layout.links.map((l, i) => ({ l, i })).filter((x) => x.l.line >= 0);
    if (!links.length) return a.message("info", "no links in this note");
    // Off a link, a link starting right at the cursor counts as the next one.
    const onLink = a.linking.linkUnderCursor(v) >= 0;
    const after = (x: { l: LayoutLink }) =>
      x.l.line > v.cur.row || (x.l.line === v.cur.row && (onLink ? x.l.col > v.cur.col : x.l.col >= v.cur.col));
    const before = (x: { l: LayoutLink }) => x.l.line < v.cur.row || (x.l.line === v.cur.row && x.l.col < v.cur.col);
    const next =
      dir === 1 ? (links.find(after) ?? links[0]!) : ([...links].reverse().find(before) ?? links[links.length - 1]!);
    a.moveCursor(v, { row: next.l.line, col: next.l.col });
  });
}

export function linkTarget(a: App, v: View, link: LayoutLink): string {
  if (link.kind === "tag") return `#${link.target}`;
  if (!v.buf.rel || link.kind === "footnote") return link.target;
  const r = a.graph.resolveLink({ kind: link.kind, target: link.target }, v.buf.rel);
  return r.path && r.resolvedKind !== "external" ? join(a.loc.root, r.path) : link.target;
}
