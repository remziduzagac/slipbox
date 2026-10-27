import { UNIT_TIMEOUT_MS, TEST_BUDGETS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCliProcessSandbox } from "../../support/cli-process.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { sandbox, env } = makeCliProcessSandbox();

describe("the compiled binary", () => {
  test(
    "runs nothing of the folder it's started in (no bunfig.toml preload, no .env); its SQLite works; its workers start",
    () => {
      const dir = mkdtempSync(join(sandbox, "compiled-"));
      const bin = join(dir, "slipbox");
      // Built by package.json's own build script, its output moved here: what a release would ship.
      const script = JSON.parse(readFileSync(join(import.meta.dir, "../../..", "package.json"), "utf8")).scripts
        .build as string;
      const argv = script.split(" ").map((a) => (a === "dist/slipbox" ? bin : a));
      expect(argv[0]).toBe("bun");
      const built = Bun.spawnSync([process.execPath, ...argv.slice(1)], {
        cwd: join(import.meta.dir, "../../.."),
        stderr: "pipe",
      });
      expect(built.exitCode).toBe(0);
      // A folder holding a preload that leaves a mark, and a .env naming a config that picks a theme.
      const work = join(dir, "work");
      mkdirSync(work);
      const mark = join(work, "PRELOAD_RAN");
      writeFileSync(join(work, "bunfig.toml"), 'preload = ["./pre.ts"]\n');
      writeFileSync(join(work, "pre.ts"), `require("node:fs").writeFileSync(${JSON.stringify(mark)}, "ran\\n");\n`);
      writeFileSync(join(work, "picked.toml"), 'theme = "nord"\n');
      writeFileSync(join(work, ".env"), `SLIPBOX_CONFIG=${join(work, "picked.toml")}\n`);
      const { SLIPBOX_CONFIG: _, ...rest } = env;
      const r = Bun.spawnSync([bin, "themes", "--json"], { cwd: work, env: rest, timeout: 30_000 });
      expect(r.exitCode).toBe(0);
      expect(existsSync(mark)).toBe(false);
      const current = (JSON.parse(r.stdout.toString()).data as { name: string; current: boolean }[]).find(
        (t) => t.current,
      );
      expect(current?.name).not.toBe("nord");
      // Its SQLite the runtime's own, there in the binary: a root indexed and searched.
      const root = join(dir, "notes");
      mkdirSync(join(root, ".slipbox"), { recursive: true });
      writeFileSync(join(root, "a.md"), "# A\n\nThe zorvexian word.\n");
      const run = (args: string[]) => Bun.spawnSync([bin, ...args, "--json"], { cwd: root, env, timeout: 30_000 });
      expect(run(["index", "--refresh"]).exitCode).toBe(0);
      const found = run(["search", "zorvexian"]);
      expect(found.exitCode).toBe(0);
      expect(JSON.parse(found.stdout.toString()).data.hits.map((h: { path: string }) => h.path)).toEqual(["a.md"]);
      // Its spell checker's thread (D232): a worker's script the binary has as an entry point of its own — the
      // dictionary embedded in it built there, a word checked and its suggestions asked.
      writeFileSync(join(root, "b.md"), "We recieve it.\n"); // typos: ignore-line
      const spelt = run(["spell", "b.md", "--suggest"]);
      expect(new TextDecoder().decode(spelt.stderr)).toBe("");
      expect(JSON.parse(spelt.stdout.toString())).toMatchObject({
        data: { words: [{ word: "recieve", suggestions: expect.arrayContaining(["receive"]) }] }, // typos: ignore-line
      });
    },
    TEST_BUDGETS.compiledBinary,
  );
});
