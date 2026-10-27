import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCliProcessSandbox } from "../../support/cli-process.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { sandbox, vault, slipbox } = makeCliProcessSandbox();

describe("the vault and the tool", () => {
  test("info, themes, commands, init, help, version", () => {
    const i = slipbox(["info", "--json"]).json.data;
    expect(i.root).toBe(vault);
    expect(i.notes).toBeGreaterThan(10);
    expect(slipbox(["themes"]).out).toContain("tokyo-night");
    const c = slipbox(["commands", "--json"]).json.data;
    expect(c.find((x: { id: string }) => x.id === "task.toggle").cli).toStartWith("slipbox task");
    const fresh = join(sandbox, "fresh");
    mkdirSync(fresh);
    // init: settings only — a name (and an id) when one is given (21.10).
    const made = slipbox(["init", fresh, "--json"]).json.data;
    expect(made).toMatchObject({ created: true, name: null, id: null });
    expect(existsSync(join(fresh, ".slipbox"))).toBe(true);
    expect(slipbox(["info", "--json"], { cwd: fresh }).json.data).toMatchObject({
      root: fresh,
      name: null,
      folder: null,
    });
    const named = slipbox(["init", fresh, "--name", "clifresh", "--json"]).json.data;
    expect(named).toMatchObject({
      created: false,
      identified: true,
      name: "clifresh",
      id: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
    expect(slipbox(["info"], { cwd: fresh }).out).toContain("name      clifresh");
    // Vaults lists known workspaces; folders retains pointer names and copy defaults.
    const known = slipbox(["vaults", "--json"]);
    expect(known.code).toBe(0);
    expect(known.json.data.some((row: { data: { root: string } | null }) => row.data?.root === fresh)).toBe(true);
    expect(slipbox(["vault-moved"]).code).toBe(2);
    expect(
      slipbox(["folders", "--json"]).json.data.some(
        (f: { name: string; default: string }) => f.name === "clifresh" && f.default === fresh,
      ),
    ).toBe(true);
    // Plans waiting to be applied (20.18): a list, maybe empty; one that isn't there, not found.
    expect(Array.isArray(slipbox(["apply", "--json"]).json.data)).toBe(true);
    expect(slipbox(["apply", "00000000", "--json"]).code).toBe(3);
    expect(slipbox(["help"]).out).toContain("slipbox find <query>");
    expect(slipbox(["--version"]).out).toMatch(/^slipbox \d+\.\d+\.\d+/);
  });
  test("the CLI's JSON keeps root in its values (DF-D9): info's mode, a change's kind; what it prints says vault (VV-D1): what was skipped, nothing to undo; themes are built-in", () => {
    const i = slipbox(["info", "--json"]).json.data;
    expect(i.mode).toBe("root");
    expect(i.skipped).toContainEqual({ rel: "outreach", reason: "nested vault" });
    const human = slipbox(["info"]).out;
    expect(human).toContain(`vault     ${vault}`);
    expect(human).toContain("skipped   outreach — nested vault");
    expect(
      slipbox(["themes", "--json"]).json.data.find((t: { name: string }) => t.name === "tokyo-night"),
    ).toMatchObject({ source: "built-in" });
    // A folder made a root, and a nested root made a plain folder: previews, nothing written.
    expect(slipbox(["init", "people", "--name", "cli-words-people", "--dry-run", "--json"]).json.data).toMatchObject({
      kind: "make-root",
      dryRun: true,
    });
    expect(slipbox(["deinit", "outreach", "--dry-run", "--json"]).json.data).toMatchObject({
      kind: "unmake-root",
      dryRun: true,
    });
    // A root's naming, planned: the plans waiting say it as `apply` does.
    const dir = join(sandbox, "cli-words");
    mkdirSync(dir);
    writeFileSync(join(dir, "a.md"), "# A\n");
    expect(slipbox(["init", dir, "--name", "cli-words-a"]).code).toBe(0);
    const none = slipbox(["undo", "--json"], { cwd: dir });
    expect(none.code).toBe(3);
    expect(none.json.error?.message).toBe(
      "nothing to undo: no rename, move, relink or replace has been done in this vault",
    );
    const plan = slipbox(["name", "cli-words-b", "--plan", "--json"], { cwd: dir }).json.data;
    expect(plan).toMatchObject({ kind: "root", from: "cli-words-a", to: "cli-words-b" });
    expect(slipbox(["apply", "--json"]).json.data.find((p: { id: string }) => p.id === plan.plan.id)).toMatchObject({
      kind: "root",
    });
    expect(slipbox(["apply", plan.plan.id, "--json"], { cwd: dir }).json.data).toMatchObject({
      kind: "root",
      dryRun: false,
    });
    // Applied, the machine's list learns the name, as `name` itself teaches it.
    expect(
      slipbox(["folders", "--json"]).json.data.some(
        (f: { name: string; default: string }) => f.name === "cli-words-b" && f.default === dir,
      ),
    ).toBe(true);
  });
});
