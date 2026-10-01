// SQLite for slipbox (the search index, 6.6): better-sqlite3, which bundles its own SQLite (3.53.4)
// and works the same under Node and Bun on macOS and Linux — chosen with scout, which uses it too,
// so a process holding both loads one SQLite. Bun 1.3 panics on it; slipbox needs Bun 1.4.2 or later.
//
// Loaded through its per-platform entry, by a literal name each: those `require` their prebuilt
// binary by a literal path, which `bun build --compile` embeds. The package's default entry finds it
// by a path computed at run time — the build machine's — and a compiled binary elsewhere has none.
//
// Every JS number is bound as a double (`typeof(?)` is `real`), where bun:sqlite narrowed integral
// ones: an integer the schema needs (a rowid, a LIMIT) is bound as `CAST(? AS INTEGER)`.

import type BetterSqlite3 from "better-sqlite3";

export type Database = BetterSqlite3.Database;

async function load(): Promise<typeof BetterSqlite3> {
  switch (`${process.platform}-${process.arch}`) {
    case "linux-arm64":
      return (await import("better-sqlite3/linux-arm64")).default;
    case "linux-x64":
      return (await import("better-sqlite3/linux-x64")).default;
    case "darwin-arm64":
      return (await import("better-sqlite3/darwin-arm64")).default;
    case "darwin-x64":
      return (await import("better-sqlite3/darwin-x64")).default;
    default:
      return (await import("better-sqlite3")).default;
  }
}

/** better-sqlite3's `Database`, for this platform. */
export const Sqlite: typeof BetterSqlite3 = await load();
