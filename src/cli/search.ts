// The CLI's search (6.x): notes ranked by the words, from the index or a scan of the files, by root (20.16); and
// the index built or brought up to date — this vault's, another's (20.10), home's in the background's way (20.9).

import { existsSync, rmSync, statSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { catchUp, SearchIndex } from "../core/search.ts";
import { loadConfig } from "../core/config.ts";
import { Graph } from "../core/graph.ts";
import { sanitize } from "../core/sanitize.ts";
import { noteIndexed } from "../core/registry.ts";
import { AutoIndex, autoIndexFile } from "../core/autoindex.ts";
import { type Scope, SCOPES, searchScoped } from "../core/scope.ts";
import { homeFolder, isListed, locationAt, recordLocation, configFilesFor } from "../core/vault.ts";
import { describeCap, walkHomeNow } from "../core/home.ts";
import { flag, has, UsageError } from "./args.ts";
import { EXIT, CliError, type Session, type Handler, needsIndex, wholeFlag } from "./common.ts";
import { ELSEWHERE } from "../core/names.ts";

/** Search (6.x), and its index brought up to date. */
export const SEARCH_COMMANDS: Record<string, Handler> = {
  // Search (6.x): ranked by the words, from the index (caught up first) or a scan of the files.
  search(s, rest) {
    if (!rest.length) throw new UsageError("missing what to search for (search <words…>)");
    needsIndex(s, "search across it");
    const query = rest.join(" ");
    const limit = wholeFlag(s, "limit", 20, 1, 500);
    // By root (20.16, 21.10): here by default, so an agent's results are predictable; linked, all.
    let scope = (flag(s.args, "scope") ?? "here") as Scope;
    if ((scope as string) === "vault") {
      s.warnings.push("--scope vault is --scope here now");
      scope = "here";
    }
    if (!SCOPES.includes(scope)) throw new UsageError(`--scope takes ${SCOPES.join(", ")}`);
    const idx = searchIndex(s);
    try {
      const r = searchScoped(s.graph, idx, query, scope, { limit });
      if (r.relaxed) s.warnings.push("no note has every word: these have some of them");
      const mark = (h: { snippet: string; marks: [number, number][] }) => {
        let out = "";
        let at = 0;
        for (const [a, b] of h.marks) {
          out += `${h.snippet.slice(at, a)}[${h.snippet.slice(a, b)}]`;
          at = b;
        }
        return sanitize(out + h.snippet.slice(at));
      };
      const human = r.hits
        .map(
          (h) =>
            `${h.shown}:${h.line}:${h.column}  ${h.heading ? `${sanitize(h.heading)} — ` : ""}${mark(h)}${h.more ? `  (+${h.more} more)` : ""}\n`,
        )
        .join("");
      // Each hit's root: another's by its path and name (21.10).
      const hits = r.hits.map(({ vault: _, ...h }) => ({ ...h, ...s.rootOf(h.abs) }));
      return { data: { query, scope, engine: r.engine, relaxed: r.relaxed, roots: r.vaults, hits }, human };
    } finally {
      idx?.close();
    }
  },

  index(s, rest) {
    // A vault's index brought up to date now (20.10) — this one, or the one holding a path: every
    // file's size and time checked, every folder listed again; any vault, opened or not.
    if (has(s.args, "refresh")) {
      const at = rest[0] ? (isAbsolute(rest[0]) ? rest[0] : join(s.io.cwd, rest[0])) : s.loc.root;
      if (!existsSync(at)) throw new CliError(`no such file or folder: ${rest[0]}`, EXIT.notFound);
      // Its vault — a marker's, or home (VV-D2) — else the plain folder it's in, or this one's (20.22): its own index.
      const loc = !rest[0] ? s.loc : locationAt(statSync(at).isDirectory() ? at : dirname(at));
      if (isListed(loc))
        throw new CliError(`${ELSEWHERE} has no index: ${loc.root} is outside home and every vault`, EXIT.refused);
      const root = loc.root;
      recordLocation(loc); // known on this machine from now on, as reaching it would make it (17.6)
      const t = performance.now();
      const config = loadConfig({ ...configFilesFor(loc), configFile: flag(s.args, "config") }).config;
      // Home's every folder listed again too (VV-D2): its walk made now, and kept.
      const g = new Graph(loc, config).build(true, "all", loc.mode === "home" ? walkHomeNow(loc, config) : undefined);
      noteIndexed(loc.key);
      const ms = Math.round(performance.now() - t);
      const st = g.stats;
      return {
        data: {
          root,
          notes: st.notes,
          changed: st.parsed,
          unchanged: st.cached,
          gone: st.gone,
          reached: g.reached.size,
          indexed: g.indexedAt()?.toISOString() ?? null,
          ms,
        },
        human: `refreshed ${root}: ${st.notes} note${st.notes === 1 ? "" : "s"} — ${st.parsed} read again, ${st.gone} gone (${ms} ms)\n`,
      };
    }
    // A path names what --refresh brings up to date; otherwise it would be dropped, the root indexed.
    if (rest[0] !== undefined) throw new UsageError("index takes a path only with --refresh");
    // The background auto-index of the home folder (20.9), run here in the foreground: a pass, or as
    // much as --budget allows; where it is, either way.
    if (has(s.args, "home")) {
      const budget = Number(flag(s.args, "budget") ?? 0);
      if (!(budget >= 0)) throw new UsageError("--budget takes milliseconds (0: the whole pass)");
      // --rebuild: a new pass now, whatever was done.
      if (has(s.args, "rebuild")) rmSync(autoIndexFile(), { force: true });
      const job = new AutoIndex(homeFolder());
      const t = performance.now();
      while (
        job.step(budget ? Math.max(1, budget - (performance.now() - t)) : 200) &&
        (!budget || performance.now() - t < budget)
      ) {}
      const p = job.status;
      const done = !!p.passFinished;
      const left = p.queue.length + (p.current ? 1 : 0);
      return {
        data: {
          root: p.root,
          found: p.found,
          indexed: p.indexed,
          left,
          finished: p.passFinished,
          started: p.passStarted,
          // Home's own index (VV-D2): built this pass, its notes, what its cap left out.
          home: { indexed: p.home, notes: p.homeNotes, capped: p.capped },
        },
        human: `home ${p.root}: ${p.home ? `${p.homeNotes} note${p.homeNotes === 1 ? "" : "s"} of its own indexed` : "being walked"}, ${p.found} vault${p.found === 1 ? "" : "s"} found, ${p.indexed} indexed${done ? ` — pass done ${p.passFinished!.slice(0, 16).replace("T", " ")}` : p.home ? ` — ${left} vault${left === 1 ? "" : "s"} left` : ""}${p.capped ? `\n${describeCap(p.capped)}` : ""}\n`,
      };
    }
    if (isListed(s.loc))
      throw new CliError(`${ELSEWHERE} has no index: ${s.loc.root} is outside home and every vault`, EXIT.refused);
    const idx = SearchIndex.open(s.loc);
    if (!idx) throw new CliError("the search index can't be opened", 1);
    try {
      const t = performance.now();
      if (has(s.args, "rebuild")) idx.clear();
      const r = catchUp(s.graph, idx);
      const st = idx.stats();
      const ms = Math.round(performance.now() - t);
      return {
        data: {
          path: idx.file,
          rebuilt: has(s.args, "rebuild"),
          indexed: r.indexed,
          removed: r.removed,
          files: st.files,
          ms,
        },
        human: `search index: ${st.files} files — ${r.indexed} indexed, ${r.removed} removed (${ms} ms)\n`,
      };
    } finally {
      idx.close();
    }
  },
};

/** Which search engine answers here, and the index's size when there is one (`info`). */
export function searchInfo(s: Session): { engine: string; index: { files: number; complete: boolean } | null } {
  if (isListed(s.loc) || s.config.search.engine === "scan" || !SearchIndex.exists(s.loc))
    return { engine: s.config.search.engine, index: null };
  const idx = SearchIndex.open(s.loc);
  if (!idx) return { engine: s.config.search.engine, index: null };
  try {
    return { engine: s.config.search.engine, index: { ...idx.stats(), complete: idx.complete } };
  } finally {
    idx.close();
  }
}

/**
 * The vault's search index for a CLI run (6.x), brought up to the files — or null, and the files
 * are scanned: when `[search] engine` says so, in `$HOME` or `/` opened as a plain folder, or
 * while it's never been built (`slipbox index` builds it; the TUI does as it runs).
 */
function searchIndex(s: Session): SearchIndex | null {
  const engine = s.config.search.engine;
  if (engine === "scan" || isListed(s.loc)) return null;
  if (engine === "auto" && !SearchIndex.exists(s.loc)) {
    s.warnings.push("no search index yet: the files were scanned — slipbox index builds it (the TUI does as it runs)");
    return null;
  }
  const idx = SearchIndex.open(s.loc);
  if (!idx) {
    s.warnings.push("the search index can't be opened: the files were scanned");
    return null;
  }
  if (engine === "auto" && !idx.complete) {
    idx.close();
    s.warnings.push("the search index is still being built: the files were scanned");
    return null;
  }
  catchUp(s.graph, idx);
  return idx;
}
