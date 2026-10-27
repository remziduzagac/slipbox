// Completed diagram results shared across sessions; private, optional and bounded like the parse cache.
import { createHash } from "node:crypto";
import { join } from "node:path";
import packageInfo from "../../../../../package.json";
import type { DiagramRequest } from "./diagram-jobs.ts";
import type { Drawn } from "./diagram-render.ts";
import { cacheHome, ensureCacheHome } from "../../../foundation/platform/paths.ts";
import { Database } from "../../../foundation/platform/sqlite.ts";

export type DiagramResult = Drawn | string | null;
export interface DiagramStore {
  get(key: string): DiagramResult | undefined;
  put(key: string, value: DiagramResult): void;
}
const VERSION = 1;
const MAX_RESULT = 1024 * 1024;

/** Include the rendering implementation, slipbox's and the library's versions, not just the source: an upgrade draws
 *  afresh, even when only slipbox's own handling of a drawing changed. */
export function diagramKey(request: DiagramRequest): string {
  return createHash("sha256")
    .update(JSON.stringify([VERSION, packageInfo.version, packageInfo.dependencies["beautiful-mermaid"], request]))
    .digest("hex");
}

function valid(value: unknown): value is DiagramResult {
  if (value === null || typeof value === "string") return true;
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.why === "string" ||
    (Array.isArray(v.rows) &&
      v.rows.every((row) => typeof row === "string") &&
      (v.wide === undefined || v.wide === true))
  );
}

export class DiagramCache implements DiagramStore {
  private constructor(
    private readonly db: Database,
    private readonly bytes: number,
    private readonly entries: number,
  ) {}

  static open(file = join(cacheHome(), "diagrams.db"), bytes = 32 * 1024 * 1024, entries = 2048): DiagramCache | null {
    let db: Database | null = null;
    try {
      ensureCacheHome(join(file, ".."));
      db = new Database(file);
      db.pragma("journal_mode = wal");
      db.pragma("synchronous = normal");
      db.pragma("busy_timeout = 25");
      db.exec(
        "create table if not exists drawings (key text primary key, data text not null, bytes integer not null, used integer not null)",
      );
      return new DiagramCache(db, bytes, entries);
    } catch {
      try {
        db?.close();
      } catch {}
      return null;
    }
  }

  get(key: string): DiagramResult | undefined {
    try {
      const row = this.db.prepare("select data from drawings where key = ? and bytes <= ?").get(key, MAX_RESULT) as
        | { data: string }
        | undefined;
      if (!row || Buffer.byteLength(row.data) > MAX_RESULT) return undefined;
      const value: unknown = JSON.parse(row.data);
      if (!valid(value)) return undefined;
      this.db.prepare("update drawings set used = ? where key = ?").run(Date.now(), key);
      return value;
    } catch {
      return undefined;
    }
  }

  put(key: string, value: DiagramResult): void {
    try {
      const data = JSON.stringify(value);
      const bytes = Buffer.byteLength(data);
      if (bytes > MAX_RESULT || bytes > this.bytes) return;
      this.db.transaction(() => {
        this.db.prepare("insert or replace into drawings values (?, ?, ?, ?)").run(key, data, bytes, Date.now());
        let totals = this.db
          .prepare("select count(*) as count, coalesce(sum(bytes), 0) as bytes from drawings")
          .get() as { count: number; bytes: number };
        while (totals.count > this.entries || totals.bytes > this.bytes) {
          this.db.exec("delete from drawings where key = (select key from drawings order by used, rowid limit 1)");
          totals = this.db
            .prepare("select count(*) as count, coalesce(sum(bytes), 0) as bytes from drawings")
            .get() as typeof totals;
        }
      });
    } catch {
      /* An unavailable cache never prevents rendering. */
    }
  }

  close(): void {
    this.db.close();
  }
}

let shared: DiagramCache | null | undefined;
export function diagramStore(): DiagramCache | null {
  if (process.env.SLIPBOX_DIAGRAM_CACHE === "off") return null;
  if (shared === undefined) shared = DiagramCache.open();
  return shared;
}
