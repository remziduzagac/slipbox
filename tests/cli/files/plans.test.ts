import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCliProcessSandbox } from "../../support/cli-process.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { sandbox, slipbox } = makeCliProcessSandbox();

describe("the vault and the tool", () => {
  test("mv, name, relink: a preview, then the change (17.15, 21.10)", () => {
    const dir = join(sandbox, "renames");
    mkdirSync(join(dir, "notes"), { recursive: true });
    writeFileSync(join(dir, "notes", "plan.md"), "# Plan\n");
    writeFileSync(join(dir, "index.md"), "[plan](notes/plan.md) and [p](notes/plan.md)\n");
    expect(slipbox(["init", dir, "--name", "cliren"]).code).toBe(0);
    const dry = slipbox(["mv", "plan", "roadmap", "--dry-run"], { cwd: dir });
    expect(dry.out).toContain("would rename notes/plan.md → roadmap.md: 1 change in 1 file"); // no old name written into it (21.12)
    expect(dry.out).toContain("- [plan](notes/plan.md) and [p](notes/plan.md)");
    expect(dry.out).toContain("+ [plan](roadmap.md) and [p](roadmap.md)");
    expect(existsSync(join(dir, "notes", "plan.md"))).toBe(true);
    const done = slipbox(["mv", "plan", "roadmap", "--json"], { cwd: dir }).json;
    expect(done.data).toMatchObject({ kind: "note", from: "notes/plan.md", to: "roadmap.md", dryRun: false });
    expect(readFileSync(join(dir, "index.md"), "utf8")).toBe("[plan](roadmap.md) and [p](roadmap.md)\n");
    expect(slipbox(["mv", "roadmap", "index"], { cwd: dir }).code).toBe(5); // index.md is there
    const vr = slipbox(["name", "cliren2", "--json"], { cwd: dir }).json;
    expect(vr.data).toMatchObject({ kind: "root", from: "cliren", to: "cliren2" });
    expect(slipbox(["info", "--json"], { cwd: dir }).json.data.name).toBe("cliren2");
    writeFileSync(join(dir, "late.md"), "[plan](notes/plan.md)\n");
    const rl = slipbox(["relink", "late", "--json"], { cwd: dir }).json;
    expect(rl.data.files[0].edits[0]).toMatchObject({ before: "[plan](notes/plan.md)", after: "[plan](roadmap.md)" });
    // undo (7.4): the newest first — the relink, the vault's name, then the move.
    expect(slipbox(["undo", "--dry-run"], { cwd: dir }).out).toStartWith(
      "would undo the relink of late.md: 1 change in 1 file\n",
    );
    expect(slipbox(["undo"], { cwd: dir }).out).toStartWith("undid the relink of late.md: 1 change in 1 file\n");
    expect(readFileSync(join(dir, "late.md"), "utf8")).toBe("[plan](notes/plan.md)\n");
    expect(slipbox(["undo"], { cwd: dir }).out).toStartWith("renamed folder cliren2 back to cliren: ");
    expect(slipbox(["undo", "--json"], { cwd: dir }).json.data).toMatchObject({
      kind: "note",
      from: "roadmap.md",
      to: "notes/plan.md",
      undo: { at: expect.any(String) },
    });
    expect(readFileSync(join(dir, "index.md"), "utf8")).toBe("[plan](notes/plan.md) and [p](notes/plan.md)\n");
    expect(slipbox(["undo"], { cwd: dir }).code).toBe(3); // nothing more
  });
  test("rename-heading: a preview, then the heading and its links (11.9)", () => {
    const dir = join(sandbox, "headings");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "plan.md"), "# Plan\n\n## Goals\n");
    writeFileSync(join(dir, "index.md"), "[the goals](plan.md#goals) and [g](plan.md#goals)\n");
    expect(slipbox(["init", dir, "--name", "cliheads"]).code).toBe(0);
    const dry = slipbox(["rename-heading", "plan", "Goals", "Aims", "--dry-run"], { cwd: dir });
    expect(dry.out).toContain("would rename heading plan.md#Goals → plan.md#Aims: 2 changes in 2 files");
    expect(dry.out).toContain("+ [the goals](plan.md#aims) and [g](plan.md#aims)");
    expect(slipbox(["rename-heading", "plan", "Goals", "Aims", "--json"], { cwd: dir }).json.data).toMatchObject({
      kind: "heading",
      dryRun: false,
    });
    expect(readFileSync(join(dir, "plan.md"), "utf8")).toBe("# Plan\n\n## Aims\n");
    expect(readFileSync(join(dir, "index.md"), "utf8")).toBe("[the goals](plan.md#aims) and [g](plan.md#aims)\n");
    expect(slipbox(["rename-heading", "plan", "Nope", "X"], { cwd: dir }).code).toBe(5);
    expect(slipbox(["rename-heading", "plan", "Aims"], { cwd: dir }).code).toBe(2);
  });
  test("convert-links (20.1): a vault's wikilinks as paths, previewed with --dry-run; an ambiguous one said", () => {
    // The demo vault is converted already: a vault written as it was before (as the demo's home.md was).
    const dir = join(sandbox, "convert");
    mkdirSync(join(dir, "people"), { recursive: true });
    mkdirSync(join(dir, "equipment"), { recursive: true });
    writeFileSync(join(dir, "about-this-vault.md"), "# About\n");
    writeFileSync(join(dir, "people", "contacts.md"), "# People\n");
    writeFileSync(join(dir, "equipment", "contacts.md"), "# Suppliers\n");
    writeFileSync(join(dir, "home.md"), "# Home\n\n- [[about-this-vault]]\n- [[contacts]]\n");
    expect(slipbox(["init", dir, "--name", "convert"]).code).toBe(0);
    const r = slipbox(["convert-links", "--dry-run", "--json"], { cwd: dir });
    expect(r.code).toBe(0);
    expect(r.json.data).toMatchObject({ kind: "convert", dryRun: true });
    expect(r.json.data.files.find((f: { path: string }) => f.path === "home.md").edits[0]).toMatchObject({
      before: expect.stringContaining("[[about-this-vault]]"),
      after: expect.stringContaining("[about-this-vault](about-this-vault.md)"),
    });
    expect(r.json.data.ambiguous).toMatchObject([
      { shown: "home.md", written: "[[contacts]]", candidates: ["equipment/contacts.md", "people/contacts.md"] },
    ]);
    expect(readFileSync(join(dir, "home.md"), "utf8")).toContain("[[about-this-vault]]"); // nothing written
  });
});

describe("review cycle 6 (cli)", () => {
  /** A folder of its own and a state only it knows: what one test names, no other sees. */
  function own(prefix: string): { dir: string; env: Record<string, string> } {
    const dir = mkdtempSync(join(sandbox, prefix));
    return {
      dir,
      env: { XDG_STATE_HOME: join(dir, "state"), XDG_CACHE_HOME: join(dir, "cache"), XDG_DATA_HOME: join(dir, "data") },
    };
  }
  test("--plan where no .slipbox/ is made a plan of: init on a plain folder, name on a repository — exit 2, nothing written", () => {
    const { dir, env } = own("plan-");
    const repo = join(dir, "repo");
    mkdirSync(join(repo, ".git"), { recursive: true });
    writeFileSync(join(repo, "a.md"), "# A\n");
    const named = slipbox(["name", "planned", "--plan"], { cwd: repo, env });
    expect(named.code).toBe(2);
    expect(existsSync(join(repo, ".slipbox"))).toBe(false);
    const plain = join(dir, "plain");
    mkdirSync(plain);
    expect(slipbox(["init", "--plan"], { cwd: plain, env }).code).toBe(2);
    expect(existsSync(join(plain, ".slipbox"))).toBe(false);
    expect(slipbox(["apply", "--json"], { cwd: plain, env }).json.data).toEqual([]);
  });
  test("apply of a saved name: the machine's list learns the new name; undo with an argument is refused, nothing undone", () => {
    const { dir, env } = own("apply-name-");
    const root = join(dir, "root");
    mkdirSync(root);
    writeFileSync(join(root, "a.md"), "# A\n");
    const old = `fo${Date.now().toString(36)}`; // typos: ignore-line
    const now = `ba${Date.now().toString(36)}`; // typos: ignore-line
    expect(slipbox(["init", root, "--name", old], { env }).code).toBe(0);
    const planned = slipbox(["name", now, "--plan", "--json"], { cwd: root, env }).json.data.plan.id as string;
    expect(slipbox(["apply", planned], { cwd: root, env }).code).toBe(0);
    const elsewhere = join(dir, "elsewhere");
    mkdirSync(elsewhere);
    const names = slipbox(["folders", "--json"], { cwd: elsewhere, env }).json.data.map(
      (f: { name: string }) => f.name,
    );
    expect(names).toContain(now);
    expect(names).not.toContain(old);
    expect(slipbox(["resolve", `slipbox://${now}/a.md`], { cwd: elsewhere, env }).code).toBe(0);
    // More than undo takes (none): a usage error before anything is taken back.
    expect(slipbox(["undo", "x"], { cwd: root, env }).code).toBe(2);
    expect(slipbox(["info", "--json"], { cwd: root, env }).json.data.name).toBe(now);
  });
});

describe("review cycle 3 (core, cli)", () => {
  test("name on a folder never named, its [vault] table one the edit can't follow: refused, the file as it was", () => {
    const dir = mkdtempSync(join(sandbox, "name-dotted-"));
    const xdg = {
      XDG_STATE_HOME: join(dir, "state"),
      XDG_CACHE_HOME: join(dir, "cache"),
      XDG_DATA_HOME: join(dir, "data"),
    };
    const root = join(dir, "root");
    mkdirSync(join(root, ".slipbox"), { recursive: true });
    writeFileSync(join(root, "a.md"), "# A\n");
    for (const text of ['vault.aliases = ["n"]\n\n[render]\ninset = 2\n', '[ vault ]\naliases = ["n"]\n']) {
      writeFileSync(join(root, ".slipbox", "config.toml"), text);
      const r = slipbox(["name", "dotted"], { cwd: root, env: xdg });
      expect(r.code).not.toBe(0);
      expect(r.err).toContain("edit it by hand");
      expect(readFileSync(join(root, ".slipbox", "config.toml"), "utf8")).toBe(text);
    }
  });
});
