import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";

import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("deleting and copying: the path checked by the core, whoever asks (18.4, 18.5)", () => {
  test("a file gone since it was listed, a path out of the root, slipbox's and git's own: refused, nothing trashed or copied", async () => {
    const { copyPath, FileOpError, trashPath } = await import("../../../../src/core/workspace/mutations/files.ts");
    const { listTrash } = await import("../../../../src/core/workspace/mutations/trash.ts");
    const dir = mkdtempSync(join(tmpdir(), "slipbox-fileops-"));
    mkdirSync(join(dir, ".slipbox"));
    mkdirSync(join(dir, ".git"));
    writeFileSync(join(dir, ".git", "HEAD"), "ref: refs/heads/main\n");
    writeFileSync(join(dir, "a.md"), "# A\n");
    writeFileSync(join(dir, "gone.md"), "# Gone\n");
    const loc = locateVault({ root: dir });
    const g = openGraph(loc, DEFAULT_CONFIG, false);
    rmSync(join(dir, "gone.md")); // deleted by another program, the sidebar still listing it
    const refused = (f: () => unknown) => {
      try {
        f();
      } catch (err) {
        expect(err).toBeInstanceOf(FileOpError);
        return (err as Error).message;
      }
      return null;
    };
    expect(refused(() => trashPath(g, loc, "gone.md"))).toBe(`no note, file or folder gone.md in ${dir}`);
    expect(refused(() => copyPath(g, "/gone.md/"))).toBe(`no note, file or folder gone.md in ${dir}`);
    expect(refused(() => trashPath(g, loc, "../a.md"))).toBe("../a.md isn't inside the vault");
    expect(refused(() => copyPath(g, "docs/../.."))).toBe("docs/../.. isn't inside the vault");
    expect(refused(() => trashPath(g, loc, ".slipbox/config.toml"))).toBe(
      ".slipbox/config.toml: slipbox's and git's own folders aren't notes",
    );
    expect(refused(() => copyPath(g, ".git/HEAD"))).toBe(".git/HEAD: slipbox's and git's own folders aren't notes");
    expect(listTrash(loc)).toEqual([]);
    expect(readdirSync(dir).sort()).toEqual([".git", ".slipbox", "a.md"]);
    // The check passes what's there: a.md trashed.
    expect(trashPath(g, loc, "a.md")).toMatchObject({ abs: join(dir, "a.md"), dir: false });
    expect(existsSync(join(dir, "a.md"))).toBe(false);
  });

  test("the trash emptied: all, or what a preview listed; past 30 days, gone when the trash is next read or written (DF-D14)", async () => {
    const { FileOpError, restorePath, trashPath } = await import("../../../../src/core/workspace/mutations/files.ts");
    const { emptyTrash, listTrash, TRASH_DAYS, trashDir } = await import(
      "../../../../src/core/workspace/mutations/trash.ts"
    );
    const dir = mkdtempSync(join(tmpdir(), "slipbox-trash-"));
    mkdirSync(join(dir, ".slipbox"));
    for (const n of ["a", "b", "c", "d"]) writeFileSync(join(dir, `${n}.md`), `# ${n}\n`);
    const loc = locateVault({ root: dir });
    const g = openGraph(loc, DEFAULT_CONFIG, false);
    const now = Date.now();
    const day = (n: number) => new Date(now + n * 86_400_000);
    const shown = (at: Date) => listTrash(loc, at).map((i) => i.shown);
    expect(TRASH_DAYS).toBe(30);
    const a = trashPath(g, loc, "a.md", day(-45));
    trashPath(g, loc, "b.md", day(-20));
    expect(shown(day(-15))).toEqual(["b.md", "a.md"]); // a.md 30 days old: kept
    expect(existsSync(join(trashDir(loc), a.id, "a.md"))).toBe(true);
    // Written: a.md, past 30 days, goes as c.md comes — its folder too.
    trashPath(g, loc, "c.md", day(0));
    expect(shown(day(0))).toEqual(["c.md", "b.md"]);
    expect(existsSync(join(trashDir(loc), a.id))).toBe(false);
    // Read: b.md goes in its turn; gone, it can't be restored.
    expect(shown(day(11))).toEqual(["c.md"]);
    expect(() => restorePath(g, loc, "b.md", day(11))).toThrow(FileOpError);
    // Emptied: what a preview listed (d.md, deleted since, stays), then the rest.
    const listed = listTrash(loc, day(11)).map((i) => i.id);
    trashPath(g, loc, "d.md", day(11));
    expect(emptyTrash(loc, listed, day(11)).map((i) => i.shown)).toEqual(["c.md"]);
    expect(shown(day(11))).toEqual(["d.md"]);
    expect(emptyTrash(loc, undefined, day(11)).map((i) => i.shown)).toEqual(["d.md"]);
    expect(shown(day(11))).toEqual([]);
    expect(readdirSync(trashDir(loc))).toEqual(["trash.json"]);
    expect(existsSync(join(dir, "d.md"))).toBe(false); // gone for good, never put back
    // An id edited to climb out of the trash is never followed: only the list forgets it.
    const outside = join(dirname(trashDir(loc)), "keep");
    mkdirSync(outside);
    writeFileSync(
      join(trashDir(loc), "trash.json"),
      JSON.stringify({
        version: 1,
        items: [{ id: "../keep", abs: join(dir, "x.md"), shown: "x.md", dir: false, at: day(-90).toISOString() }],
      }),
    );
    expect(shown(day(0))).toEqual([]);
    expect(existsSync(outside)).toBe(true);
  });
});
