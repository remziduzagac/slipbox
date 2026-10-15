// The CLI's info commands: the vault and slipbox's own places, a note's info as the TUI shows it, the themes, the
// document types (22.3), the notes read lately and what's open, the named commands and their CLI equivalents.

import { existsSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { scratchLocation } from "../core/capture.ts";
import { COMMAND_SPECS } from "../core/command-specs.ts";
import { conventionOf, describeConvention } from "../core/convention.ts";
import { copyAvailable, folderIdentity, pointerName, readFolders } from "../core/folders.ts";
import { parseNoteFile } from "../core/readers.ts";
import { cacheDir, stateDir, userConfigFile } from "../core/paths.ts";
import { listThemes } from "../core/theme/index.ts";
import { loadSession, PositionStore } from "../core/position.ts";
import { frontmatterFindings, rootTypes } from "../core/diagnostics.ts";
import { backgroundStatus, describeBackground } from "../core/autoindex.ts";
import { rootLabel, tildePath } from "../core/names.ts";
import { readVaultVersion } from "../core/vault.ts";
import { describeCap } from "../core/home.ts";
import { flag } from "./args.ts";
import { VERSION } from "../version.ts";
import { RELEASE } from "../core/release.ts";
import { notesOfType, ofType } from "../core/doctypes.ts";
import { EXIT, CliError, type Handler, requireArg, resolveNote, readNoteFile } from "./common.ts";
import { searchInfo } from "./search.ts";

/** What's here: the vault, a note's info, themes, document types, the commands, what was read. */
export const INFO_COMMANDS: Record<string, Handler> = {
  info(s) {
    const g = s.graph;
    const scratch = scratchLocation(s.loc, s.config);
    // Its name, as a pointer names it (21.6): the lookup's copies, the one links open.
    const ident = s.loc.mode === "vault" ? folderIdentity(s.loc.root) : null;
    const known = readFolders();
    const named = ident ? known.find((f) => f.key === ident.key) : undefined;
    const folder = ident
      ? {
          name: ident.name,
          pointer: pointerName({ key: ident.key, name: ident.name, remote: ident.remote }, known),
          remote: ident.remote,
          id: ident.id,
          private: ident.private,
          copies: (named?.copies ?? []).map((c) => ({
            path: c.path,
            seen: c.seen,
            here: c.path === ident.copy,
            available: copyAvailable(c.path),
          })),
          default: named?.default ?? null,
        }
      : null;
    const data = {
      version: VERSION,
      // A release build's repository and platform (14.2); null: run from source, or built by hand.
      release: RELEASE,
      // The vault (21.10): its path — a folder outside every vault opened, that folder's — and its name, when it
      // has one.
      root: s.loc.root,
      // "root" where the code says vault: the JSON's word since DF-D9, kept for the agents and scripts that read it;
      // what's printed for a person says vault (VV-D1).
      mode: s.loc.mode === "vault" ? "root" : s.loc.mode,
      name: s.loc.name,
      // What its cache and state are kept by (21.8): its path's key.
      key: s.loc.key,
      markerVersion: s.loc.mode === "vault" ? readVaultVersion(s.loc.root) : null,
      config: {
        user: flag(s.args, "config") ?? s.io.env.SLIPBOX_CONFIG ?? userConfigFile(),
        sources: s.configSources,
        theme: s.config.theme,
      },
      cache: cacheDir(s.loc),
      state: stateDir(s.loc),
      scratch: scratch.path,
      notes: g.notes.size,
      index: {
        ...g.stats,
        written: g.indexedAt()?.toISOString() ?? null,
        reached: g.reached.size,
        // Home's walk (VV-D2): when it was made (null: not yet, its top alone looked at), what its cap left out.
        ...(g.home
          ? { walked: g.home.walked === null ? null : new Date(g.home.walked).toISOString(), capped: g.home.capped }
          : {}),
      },
      // The background auto-index of the home folder (20.9): where it is.
      background: backgroundStatus(s.config),
      search: searchInfo(s),
      skipped: g.skipped,
      folder,
      // How the links slipbox makes here look, each part with what said it (21.4).
      links: conventionOf(g, s.config, s.configOrigins),
      stale: s.stale(),
    };
    const human = [
      `slipbox   ${VERSION}${RELEASE ? ` (${RELEASE.target}, released from ${RELEASE.repo})` : ""}`,
      data.mode === "folder"
        ? `folder    ${data.root} (outside every vault)`
        : data.mode === "home"
          ? `vault     ${data.root} (home: its notes outside every other vault)`
          : `vault     ${data.root}${data.markerVersion ? ` (marker v${data.markerVersion})` : ""}`,
      folder
        ? `name      ${folder.pointer}${folder.pointer !== folder.name ? ` (${folder.name} is another's too)` : ""}${folder.private ? ", private: this machine's only" : ""}${folder.copies.length > 1 ? ` — ${folder.copies.length} copies, links open ${tildePath(folder.default ?? "")}` : ""}`
        : `name      none — ${s.loc.mode === "folder" ? "no vault" : s.loc.mode === "home" ? "home is ~" : "no remote and no .slipbox/ name"}: linked to by relative path`,
      `notes     ${data.notes} (parsed ${g.stats.parsed}, cached ${g.stats.cached}, ${g.stats.ms.toFixed(0)} ms)`,
      `index     ${data.index.written ? `written ${data.index.written.slice(0, 16).replace("T", " ")}` : "not written yet"}${g.reached.size ? `, ${g.reached.size} reached outside the walk` : ""}`,
      ...(g.home
        ? [
            `walk      ${g.home.walked === null ? "not yet: home's top alone, the rest while nobody is working" : `home walked ${new Date(g.home.walked).toISOString().slice(0, 16).replace("T", " ")}`}${g.home.capped ? ` — ${describeCap(g.home.capped)}` : ""}`,
          ]
        : []),
      `home      ${describeBackground(data.background)}`,
      `links     ${describeConvention(data.links)}`,
      `theme     ${data.config.theme}`,
      `config    ${data.config.sources.length ? data.config.sources.join(", then ") : `none (${data.config.user} doesn't exist)`}`,
      `cache     ${data.cache}`,
      `search    ${data.search.engine}${data.search.index ? ` — index: ${data.search.index.files} files${data.search.index.complete ? "" : " (being built)"}` : " — no index"}`,
      `state     ${data.state}`,
      `scratch   ${data.scratch}`,
      ...g.skipped.map((x) => `skipped   ${x.rel} — ${x.reason}`),
      ...(folder?.copies ?? [])
        .filter((c) => !c.here)
        .map((c) => `copy      ${tildePath(c.path)}${c.available ? "" : " (not here)"}`),
      "",
    ].join("\n");
    return { data, human };
  },

  // The TUI's note info (space n i), in one call.
  async stat(s, rest) {
    const rel = resolveNote(s, requireArg(rest, "note"));
    await s.graph.loadGrammars();
    const abs = s.graph.abs(rel);
    const file = readNoteFile(s, abs, false);
    const e = s.graph.entry(rel);
    const links = s.graph.linksOf(rel);
    // Its properties (3.19): the frontmatter as parsed, as the TUI's Info view shows it.
    const fm = s.graph.notes.has(rel) ? parseNoteFile(rel, file.text).frontmatter : null;
    const data = {
      path: rel,
      abs,
      // Its root (21.10): the path, and the name when it has one.
      root: s.loc.mode === "folder" ? null : s.loc.root,
      name: s.loc.name,
      properties: fm?.data ?? null,
      size: file.bytes.length,
      mtime: new Date(statSync(abs).mtimeMs).toISOString(),
      title: e?.title ?? null,
      tags: e?.tags ?? [],
      headings: e?.headings.length ?? 0,
      links: links.length,
      unresolved: links.filter((l) => l.resolvedKind === "unresolved").length,
      backlinks: s.graph.backlinks(rel).length,
      sha: file.sha,
      bom: file.bom,
      crlf: file.crlf,
      invalidUtf8: file.invalidUtf8,
    };
    const encoding = [
      file.invalidUtf8 ? "invalid UTF-8" : "UTF-8",
      ...(file.crlf ? ["crlf"] : []),
      ...(file.bom ? ["bom"] : []),
    ].join(", ");
    const rows: [string, string][] = [
      ["path", abs],
      ["size", `${data.size} bytes`],
      ["modified", data.mtime],
      [
        "vault",
        s.loc.mode === "folder"
          ? `none (${tildePath(s.loc.root)} is outside every vault)`
          : s.loc.mode === "home"
            ? "home (~)"
            : rootLabel(s.loc),
      ],
      ["title", data.title ?? "—"],
      ["tags", data.tags.join(", ") || "—"],
      ...Object.entries(data.properties ?? {}).map(([k, v]): [string, string] => [
        `  ${k}`,
        typeof v === "object" ? JSON.stringify(v) : String(v),
      ]),
      ["headings", String(data.headings)],
      ["links", `${data.links}${data.unresolved ? ` (${data.unresolved} unresolved)` : ""}`],
      ["backlinks", String(data.backlinks)],
      ["encoding", encoding],
      ["sha", data.sha],
    ];
    return { data, human: rows.map(([k, v]) => `${k.padEnd(10)}${v}\n`).join("") };
  },

  // Document types (22.3): each with how many notes are of it here and how many break its rules (22.2); or a type's
  // notes, by number then path — each its title, its status, and what supersedes it.
  types(s, rest) {
    const types = rootTypes(s.graph);
    const notes = [...s.graph.notes.entries()].map(([path, e]) => ({ path, title: e.title ?? "" }));
    const want = rest[0];
    if (want !== undefined) {
      const t = types.find((x) => x.name === want);
      if (!t) throw new CliError(`no document type "${want}" here: slipbox types lists them`, EXIT.notFound);
      s.graph.ensureAll();
      const list = notesOfType(
        t,
        [...s.graph.notes.entries()].map(([path, e]) => ({ path, title: e.title ?? "" })),
        (rel) => s.graph.textOf(rel),
      );
      const width = Math.max(0, ...list.map((n) => (n.number === null ? 0 : String(n.number).length)));
      const human = list
        .map(
          (n) =>
            `${n.number === null ? " ".repeat(width) : String(n.number).padStart(width)}${width ? "  " : ""}${n.path}${n.title ? `  ${n.title}` : ""}${n.status ? `  (${n.status}${n.supersededBy ? ` → ${n.supersededBy}` : ""})` : ""}\n`,
        )
        .join("");
      return {
        data: { name: t.name, source: t.source, paths: t.paths, notes: list },
        human: human || `no ${t.name} notes here (${t.paths.join(", ")})\n`,
      };
    }
    const findings = frontmatterFindings(s.graph);
    const data = types.map((t) => ({
      name: t.name,
      source: t.source,
      paths: t.paths,
      notes: notes.filter((n) => ofType(n.path, t)).length,
      problems: findings.filter((f) => ofType(f.path, t)).length,
    }));
    const width = Math.max(0, ...data.map((t) => t.name.length));
    return {
      data,
      human: data
        .map(
          (t) =>
            `${t.name.padEnd(width)}  ${t.notes} note${t.notes === 1 ? "" : "s"}${t.problems ? `, ${t.problems} breaking its rules` : ""}  (${t.source}: ${t.paths.join(", ")})\n`,
        )
        .join(""),
    };
  },

  themes(s) {
    const list = listThemes();
    return {
      data: list.map((t) => ({ ...t, current: t.name === s.config.theme })),
      human: list
        .map((t) => `${t.name === s.config.theme ? "*" : " "} ${t.name}${t.source === "user" ? `  (${t.path})` : ""}\n`)
        .join(""),
    };
  },

  history(s) {
    // Reading positions are kept by file, for the machine (21.8): this root's, and those read from it.
    const read = new PositionStore(s.loc)
      .entries()
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .map((p) => ({
        path: p.key,
        at: p.at,
        line: p.line,
        exists: existsSync(isAbsolute(p.key) ? p.key : join(s.loc.root, p.key)),
      }));
    const session = loadSession(s.loc);
    const open = (session?.tabs ?? []).map((t) => t.panes.map((p) => p.path));
    // What the user is looking at: the active tab's active window's note.
    const tab = session?.tabs[session.activeTab];
    const current = tab ? ((tab.panes[tab.active] ?? tab.panes[0])?.path ?? null) : null;
    return {
      data: { read, open, activeTab: session?.activeTab ?? null, current },
      human: read.length
        ? read
            .map((r) => `${r.at.slice(0, 16).replace("T", " ")}  ${r.path}:${r.line}${r.exists ? "" : "  (deleted)"}\n`)
            .join("")
        : "nothing read in the TUI yet\n",
    };
  },

  commands() {
    return {
      data: COMMAND_SPECS,
      human: COMMAND_SPECS.map((c) => `${c.id.padEnd(20)} ${c.title.padEnd(44)} ${c.cli ?? "(interaction)"}\n`).join(
        "",
      ),
    };
  },
};
