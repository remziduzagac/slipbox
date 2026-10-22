// SQLite for slipbox — the search index (6.6) and the parse cache — through `node:sqlite`: the SQLite built into the
// runtime. Bun implements it (its own SQLite on Linux and Windows; macOS's on macOS), as Node does, so nothing native
// is packaged per platform and nothing raises the glibc Bun needs (2026-10-10, replacing better-sqlite3, after
// trailscout's research: D196). What slipbox asks of SQLite is small — FTS5 with `unicode61` and `bm25`,
// WAL, a busy timeout — and both databases are caches, made again when they don't open or are of another version.
//
// The few calls slipbox makes, as it made them on better-sqlite3: a statement's `get`, `all` and `run`; `pragma`, set
// or read; a `transaction` (nested ones as savepoints); `exec`; `close`.

import { DatabaseSync } from "node:sqlite";

/** What a statement's `run` says: rows changed, and the last row inserted. */
export interface RunResult {
  changes: number | bigint;
  lastInsertRowid: number | bigint;
}

/** A prepared statement: its first row (undefined with none), all of them, or run for what it changes. */
export interface Statement {
  get(...params: (string | number | null)[]): unknown;
  all(...params: (string | number | null)[]): unknown[];
  run(...params: (string | number | null)[]): RunResult;
}

export class Database {
  private readonly db: DatabaseSync;
  /** How deep the transactions open are: the outermost a transaction, the rest savepoints. */
  private depth = 0;

  constructor(file: string) {
    this.db = new DatabaseSync(file);
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  prepare(sql: string): Statement {
    return this.db.prepare(sql) as unknown as Statement;
  }

  /** A pragma — `name` read, `name = value` set — and its answer's first column (a setting has none, mostly). */
  pragma(sql: string): unknown {
    const row = this.db.prepare(`pragma ${sql}`).get() as Record<string, unknown> | undefined;
    return row ? Object.values(row)[0] : undefined;
  }

  /** `fn` as one transaction: all of it, or — when it throws — none; inside another, a savepoint of it. */
  transaction<T>(fn: () => T): T {
    const savepoint = `sp${this.depth}`;
    this.db.exec(this.depth ? `savepoint ${savepoint}` : "begin");
    this.depth++;
    try {
      const out = fn();
      this.depth--;
      this.db.exec(this.depth ? `release ${savepoint}` : "commit");
      return out;
    } catch (err) {
      this.depth--;
      this.db.exec(this.depth ? `rollback to ${savepoint}; release ${savepoint}` : "rollback");
      throw err;
    }
  }

  close(): void {
    this.db.close();
  }
}
