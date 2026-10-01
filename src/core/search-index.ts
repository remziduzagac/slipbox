// The vault's search index (6.6): SQLite FTS5 in the vault's cache — derived data, made again when
// it's gone, of another version or unreadable. A row per file — its title, aliases, tags, path,
// headings and text — so a search's words are the note's, wherever in it they are; ranked by
// BM25, the title weighing most. What each file was when indexed (size, mtime) says what to index
// again: whoever changed the file, the next catch-up finds it.

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { cacheDir, type Keyed } from "./paths.ts";

/** Bumped when the rows or their columns change: an index of another version is made again. */
const SEARCH_VERSION = 2;

/** BM25 weights, by column: title, aliases, tags, path, headings, body. */
export const WEIGHTS = [10, 8, 5, 3, 4, 1] as const;

/** What a file gives the index. */
export interface IndexedDoc {
  group: "note" | "data";
  title: string;
  aliases: string[];
  tags: string[];
  headings: string[];
  /** The file's text, as it is. */
  body: string;
}

/** A file a query matched. */
export interface IndexRow {
  path: string;
  group: "note" | "data";
  /** BM25: lower is better (SQLite's sign). */
  score: number;
  body: string;
}

export class SearchIndex {
  private constructor(
    readonly db: Database,
    readonly file: string,
  ) {}

  /**
   * The vault's index, made when there's none. One of another version, or one SQLite can't read
   * (a crash, a disk filling up), is deleted and made again: it's derived data. Null when even a new
   * one can't be made (a read-only cache).
   */
  static open(v: Keyed): SearchIndex | null {
    const dir = cacheDir(v);
    const file = join(dir, "search.db");
    const drop = () => {
      for (const f of [file, `${file}-wal`, `${file}-shm`]) rmSync(f, { force: true });
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      let db: Database | null = null;
      try {
        mkdirSync(dir, { recursive: true });
        db = new Database(file, { create: true });
        const version = (db.query("pragma user_version").get() as { user_version: number }).user_version;
        if (version !== 0 && version !== SEARCH_VERSION) throw new Error("another version");
        return new SearchIndex(SearchIndex.prepare(db), file);
      } catch {
        try {
          db?.close();
        } catch {}
        if (attempt === 0) drop();
      }
    }
    return null;
  }

  private static prepare(db: Database): Database {
    db.run("pragma journal_mode = wal");
    db.run("pragma synchronous = normal");
    db.run("pragma busy_timeout = 3000");
    db.run("create table if not exists meta (key text primary key, value text)");
    db.run("create table if not exists docs (id integer primary key, path text not null unique, grp text not null, size integer not null, mtime real not null)");
    db.run("create table if not exists tags (path text not null, tag text not null)");
    db.run("create index if not exists tags_tag on tags(tag)");
    db.run("create index if not exists tags_path on tags(path)");
    db.run("create virtual table if not exists fts using fts5(title, aliases, tags, path, headings, body, tokenize = 'unicode61 remove_diacritics 2')");
    db.run(`pragma user_version = ${SEARCH_VERSION}`);
    // A file that isn't a database fails here, not at the first search.
    db.query("select count(*) from docs").get();
    return db;
  }

  /** Whether an index is there to use, without making one. */
  static exists(v: Keyed): boolean {
    return existsSync(join(cacheDir(v), "search.db"));
  }

  close(): void {
    try {
      this.db.close();
    } catch {}
  }

  /** Built whole at least once: until then a search scans the files instead. */
  get complete(): boolean {
    return (this.db.query("select value from meta where key = 'complete'").get() as { value: string } | null)?.value === "1";
  }

  markComplete(): void {
    this.db.run("insert or replace into meta (key, value) values ('complete', '1')");
  }

  /** Every file as it was indexed. */
  indexed(): Map<string, { size: number; mtime: number }> {
    const out = new Map<string, { size: number; mtime: number }>();
    for (const r of this.db.query("select path, size, mtime from docs").all() as { path: string; size: number; mtime: number }[]) out.set(r.path, { size: r.size, mtime: r.mtime });
    return out;
  }

  /** A file's row, replaced: its text and fields, its tags, and what it was. */
  put(path: string, doc: IndexedDoc, stat: { size: number; mtime: number }): void {
    this.remove(path);
    const id = Number(this.db.prepare("insert into docs (path, grp, size, mtime) values (?, ?, ?, ?)").run(path, doc.group, stat.size, stat.mtime).lastInsertRowid);
    const tags = [...new Set(doc.tags.map((t) => t.toLowerCase()))];
    this.db.prepare("insert into fts (rowid, title, aliases, tags, path, headings, body) values (?, ?, ?, ?, ?, ?, ?)").run(id, doc.title, doc.aliases.join("\n"), tags.join("\n"), path, doc.headings.join("\n"), doc.body);
    const insTag = this.db.prepare("insert into tags (path, tag) values (?, ?)");
    for (const t of tags) insTag.run(path, t);
  }

  remove(path: string): void {
    this.db.run("delete from fts where rowid = (select id from docs where path = ?)", [path]);
    this.db.run("delete from docs where path = ?", [path]);
    this.db.run("delete from tags where path = ?", [path]);
  }

  /** Everything, gone: a rebuild starts from nothing. */
  clear(): void {
    this.db.transaction(() => {
      for (const t of ["fts", "docs", "tags", "meta"]) this.db.run(`delete from ${t}`);
    })();
  }

  /** Several changes at once, all or none. */
  batch(fn: () => void): void {
    this.db.transaction(fn)();
  }

  /** The folders and tags to keep, as SQL on a path column: a tag counts with the ones nested under it. */
  private static filters(opts: { pathPrefix?: string[]; tags?: string[] }, path: string): { where: string[]; args: string[] } {
    const esc = (x: string) => x.replace(/[\\%_]/g, (c) => `\\${c}`);
    const where: string[] = [];
    const args: string[] = [];
    if (opts.pathPrefix?.length) {
      where.push(`(${opts.pathPrefix.map(() => `${path} like ? escape '\\'`).join(" or ")})`);
      for (const p of opts.pathPrefix) args.push(`${esc(p)}%`);
    }
    for (const t of opts.tags ?? []) {
      where.push(`${path} in (select path from tags where tag = ? or tag like ? escape '\\')`);
      args.push(t, `${esc(t)}/%`);
    }
    return { where, args };
  }

  /** The files an FTS5 query matches, best first, within the folders and tags given. Null when the query is one FTS5 can't take. */
  query(match: string, opts: { limit: number; pathPrefix?: string[]; tags?: string[] }): IndexRow[] | null {
    const f = SearchIndex.filters(opts, "docs.path");
    try {
      return this.db
        .query(
          `select docs.path as path, docs.grp as "group", bm25(fts, ${WEIGHTS.join(", ")}) as score, fts.body as body
           from fts join docs on docs.id = fts.rowid where ${["fts match ?", ...f.where].join(" and ")} order by score limit ?`,
        )
        .all(match, ...f.args, opts.limit) as IndexRow[];
    } catch {
      return null;
    }
  }

  /** The files within the folders and tags given, by path: a query of filters only. */
  filesWhere(opts: { pathPrefix?: string[]; tags?: string[]; limit: number }): string[] {
    const f = SearchIndex.filters(opts, "path");
    return (this.db.query(`select path from docs where ${["1", ...f.where].join(" and ")} order by path limit ?`).all(...f.args, opts.limit) as { path: string }[]).map((r) => r.path);
  }

  /** How many files it holds. */
  stats(): { files: number } {
    return { files: (this.db.query("select count(*) as n from docs").get() as { n: number }).n };
  }
}
