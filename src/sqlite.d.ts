// better-sqlite3's per-platform entries (src/core/sqlite.ts): the default entry's Database, with its
// binary required by a literal path. The package's types declare only the default entry.
declare module "better-sqlite3/linux-arm64" {
  import Database from "better-sqlite3";
  export default Database;
}
declare module "better-sqlite3/linux-x64" {
  import Database from "better-sqlite3";
  export default Database;
}
declare module "better-sqlite3/darwin-arm64" {
  import Database from "better-sqlite3";
  export default Database;
}
declare module "better-sqlite3/darwin-x64" {
  import Database from "better-sqlite3";
  export default Database;
}
