import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("SQLite, the runtime's own (node:sqlite)", () => {
  test("statements; pragmas set and read; a transaction all or none; one inside another a savepoint", async () => {
    const { Database } = await import("../../../../src/core/foundation/platform/sqlite.ts");
    const db = new Database(":memory:");
    db.exec("create table t (id integer primary key, v text)");
    const ins = db.prepare("insert into t (v) values (?)");
    expect(Number(ins.run("a").lastInsertRowid)).toBe(1);
    expect(db.prepare("select v from t where id = ?").get(1)).toEqual({ v: "a" });
    expect(db.prepare("select v from t where id = ?").get(9)).toBeUndefined();
    db.pragma("user_version = 7");
    expect(db.pragma("user_version")).toBe(7);
    // Thrown out of: none of it.
    expect(() =>
      db.transaction(() => {
        ins.run("b");
        throw new Error("no");
      }),
    ).toThrow("no");
    expect(db.prepare("select count(*) as n from t").get()).toEqual({ n: 1 });
    // A failing inner one, caught: its own changes gone, the outer's kept.
    expect(
      db.transaction(() => {
        ins.run("c");
        try {
          db.transaction(() => {
            ins.run("d");
            throw new Error("inner");
          });
        } catch {}
        return "done";
      }),
    ).toBe("done");
    expect(db.prepare("select v from t order by id").all()).toEqual([{ v: "a" }, { v: "c" }]);
    // Both succeeding: both kept; the next transaction a transaction again.
    db.transaction(() => {
      ins.run("e");
      db.transaction(() => ins.run("f"));
    });
    db.transaction(() => ins.run("g"));
    expect(db.prepare("select v from t order by id").all()).toEqual([
      { v: "a" },
      { v: "c" },
      { v: "e" },
      { v: "f" },
      { v: "g" },
    ]);
    // FTS5 as the index has it, bm25 weighted.
    db.exec("create virtual table f using fts5(a, b, tokenize = 'unicode61 remove_diacritics 2')");
    db.prepare("insert into f values (?, ?)").run("Café crème", "x");
    expect((db.prepare("select bm25(f, 2.0, 1.0) as s from f where f match 'cafe'").all() as unknown[]).length).toBe(1);
    db.close();
  });
});
