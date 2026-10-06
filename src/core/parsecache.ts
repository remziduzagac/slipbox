// The parse cache by content (plan 20.11; docs/idea.md, "The index"): what a note says once parsed —
// its links as written, headings, tags, aliases, a title of its own — kept by its text's hash, its
// format and the parser's version, and shared by every copy on this machine. A worktree, a branch
// switched to, a second clone: each parses only what no copy has parsed before. Where a link points
// depends on where the file is, so links are resolved and backlinks derived per copy (graph.ts),
// never here. A cache: deletable, rebuilt as notes are read. `SLIPBOX_PARSE_CACHE=off` goes without.

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { cacheHome } from "./paths.ts";
import type { Statement } from "better-sqlite3";
import { type Database, Sqlite } from "./sqlite.ts";

/** The cache's own shape: bumped with it, the cache starts again. */
const PARSE_CACHE_VERSION = 2; // 2: a heading's `{#id}` kept (its text without it)

/** A note's parsed content: nothing about where it is, or what it's called. */
export interface ParsedContent {
  /** Its own title (frontmatter, else its first `#` heading); null: its file's name stands in. */
  title: string | null;
  headings: unknown[];
  /** HTML anchors (`<a id>`): none in a record from before they were kept. */
  anchors?: unknown[];
  links: unknown[];
  tags: string[];
  aliases: string[];
  previous: string[];
}

export class ParseCache {
  /** Reads answered, and not, since the process started: what sharing saves, measured (20.11). */
  hits = 0;
  misses = 0;
  private readonly get_: Statement<[string]>;
  private readonly put_: Statement<[string, string]>;

  private constructor(private readonly db: Database) {
    this.get_ = db.prepare<[string]>("select data from parsed where key = ?");
    this.put_ = db.prepare<[string, string]>("insert or replace into parsed (key, data) values (?, ?)");
  }

  /** The machine's parse cache, made when missing; null when it can't be (a read-only cache). */
  static open(file = join(cacheHome(), "parsed.db")): ParseCache | null {
    let db: Database | null = null;
    try {
      mkdirSync(join(file, ".."), { recursive: true });
      db = new Sqlite(file);
      db.pragma("journal_mode = wal");
      db.pragma("synchronous = normal");
      db.pragma("busy_timeout = 3000");
      if ((db.pragma("user_version", { simple: true }) as number) !== PARSE_CACHE_VERSION) {
        db.exec("drop table if exists parsed");
        db.pragma(`user_version = ${PARSE_CACHE_VERSION}`);
      }
      db.exec("create table if not exists parsed (key text primary key, data text not null)");
      return new ParseCache(db);
    } catch {
      try {
        db?.close();
      } catch {}
      return null;
    }
  }

  /** The key of a note's content: its text's hash, its format, the version of what parses it. */
  static key(textHash: string, format: string, parser: number): string {
    return `${parser}:${format}:${textHash}`;
  }

  get(key: string): ParsedContent | null {
    try {
      const row = this.get_.get(key) as { data: string } | undefined;
      if (row) {
        this.hits++;
        return JSON.parse(row.data) as ParsedContent;
      }
    } catch {}
    this.misses++;
    return null;
  }

  put(key: string, content: ParsedContent): void {
    try {
      this.put_.run(key, JSON.stringify(content));
    } catch {}
  }

  close(): void {
    try {
      this.db.close();
    } catch {}
  }
}

let shared: ParseCache | null | undefined;

/** This process's parse cache, opened on first use (`SLIPBOX_PARSE_CACHE=off`: none). */
export function sharedParseCache(): ParseCache | null {
  if (process.env.SLIPBOX_PARSE_CACHE === "off") return null;
  if (shared === undefined) shared = ParseCache.open();
  return shared;
}
