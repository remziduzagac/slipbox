import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { makeCliProcessSandbox } from "../../support/cli-process.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { sandbox, slipbox: runCli } = makeCliProcessSandbox();
const home = join(sandbox, "home");
beforeAll(() => mkdirSync(home));

function slipbox(args: string[], inherited: Record<string, string> = {}) {
  return runCli(args, {
    env: {
      ...inherited,
      HOME: home,
      CLAUDE_CONFIG_DIR: "",
      CODEX_HOME: "",
      HOMEBREW_SLIPBOX_CLAUDE_CONFIG_DIR: "",
      HOMEBREW_SLIPBOX_CODEX_HOME: "",
    },
  });
}

describe("the vault and the tool", () => {
  test("uninstall without --yes only lists (14.8): nothing of the installer's here; slipbox's folders kept, or with --purge listed", () => {
    const listed = slipbox(["uninstall", "--json"]);
    expect(listed.code).toBe(0);
    expect(listed.json.data.remove).toEqual([]);
    expect(listed.json.data.removed).toBe(false);
    const kept = listed.json.data.keep.map((i: { path: string }) => i.path);
    expect(kept).toContain(join(sandbox, "config", "slipbox"));
    for (const p of kept) expect(p.startsWith(`${sandbox}/`)).toBe(true);
    expect(slipbox(["uninstall"]).out).toStartWith("nothing of slipbox's to remove here\n");
    const purge = slipbox(["uninstall", "--purge", "--json"]).json.data;
    expect(purge.remove.map((i: { path: string }) => i.path)).toEqual(kept);
    expect(purge.removed).toBe(false);
    expect(existsSync(join(sandbox, "config", "slipbox", "config.toml"))).toBe(true);
  });

  test.each(["default", "configured", "homebrew"])(
    "uninstall fixture discovers only its own skills with %s foreign-home settings",
    (mode) => {
      const foreignHome = join(sandbox, `foreign-${mode}`);
      const foreignClaude = join(foreignHome, "custom-claude");
      const foreignCodex = join(foreignHome, "custom-codex");
      const foreignDirs = [".claude", ".codex", ".agents", "custom-claude", "custom-codex"];
      const foreignText = "---\nname: slipbox\n---\nForeign skill\n";
      const foreignSkills = foreignDirs.map((dir) => join(foreignHome, dir, "skills", "slipbox", "SKILL.md"));
      for (const path of foreignSkills) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, foreignText);
      }
      const inherited = {
        HOME: foreignHome,
        CLAUDE_CONFIG_DIR: mode === "configured" ? foreignClaude : "",
        CODEX_HOME: mode === "configured" ? foreignCodex : "",
        HOMEBREW_SLIPBOX_CLAUDE_CONFIG_DIR: mode === "homebrew" ? foreignClaude : "",
        HOMEBREW_SLIPBOX_CODEX_HOME: mode === "homebrew" ? foreignCodex : "",
      };

      const host = runCli(["uninstall", "--json"], { env: inherited });
      expect(host.code).toBe(0);
      expect(host.json.data.remove.map((item: { path: string }) => item.path)).toEqual(
        mode === "default" ? foreignSkills.slice(0, 3) : foreignSkills.slice(3),
      );
      const empty = slipbox(["uninstall", "--json"], inherited);
      expect(empty.code).toBe(0);
      expect(empty.json.data.remove).toEqual([]);
      const ownSkills = [".claude", ".codex", ".agents"].map((dir) => {
        const skills = join(home, dir, "skills");
        const installed = slipbox(["skill", "--install", skills, "--json"], inherited);
        expect(installed.code).toBe(0);
        return join(skills, "slipbox", "SKILL.md");
      });
      const listed = slipbox(["uninstall", "--json"], inherited);
      expect(listed.code).toBe(0);
      expect(listed.json.data.remove.map((item: { path: string }) => item.path)).toEqual(ownSkills);
      expect(listed.json.data.removed).toBe(false);
      for (const path of ownSkills) expect(existsSync(path)).toBe(true);
      const removed = slipbox(["uninstall", "--yes", "--json"], inherited);
      expect(removed.code).toBe(0);
      expect(removed.json.data.remove.map((item: { path: string }) => item.path)).toEqual(ownSkills);
      expect(removed.json.data.removed).toBe(true);
      for (const path of ownSkills) expect(existsSync(path)).toBe(false);
      for (const path of foreignSkills) expect(readFileSync(path, "utf8")).toBe(foreignText);
      expect(existsSync(join(sandbox, "config", "slipbox", "config.toml"))).toBe(true);
    },
  );

  test("upgrade from source (14.4): no releases to follow, said; nothing fetched", () => {
    const r = slipbox(["upgrade", "--json"]);
    expect(r.code).toBe(1);
    expect(r.json.error?.message).toBe(
      "this slipbox runs from source (or was built by hand): it has no releases to follow — update its checkout",
    );
  });

  test("channel from source (GR-D15): it has none — refused (exit 5), saying how it updates; a channel not one, a usage error", () => {
    const r = slipbox(["channel", "--json"]);
    expect(r.code).toBe(5);
    expect(r.json.error?.message).toBe(
      "this slipbox runs from source (or was built by hand): it has no channel — update its checkout",
    );
    expect(slipbox(["channel", "set", "preview"])).toMatchObject({
      code: 5,
      err: "slipbox: this slipbox runs from source (or was built by hand): it has no channel — update its checkout\n",
    });
    expect(slipbox(["channel", "set", "beta"])).toMatchObject({
      code: 2,
      err: "slipbox: a channel is stable or preview, not beta\n",
    });
    expect(slipbox(["channel", "set"])).toMatchObject({ code: 2, err: "slipbox: a channel is stable or preview\n" });
    expect(slipbox(["channel", "list"])).toMatchObject({
      code: 2,
      err: "slipbox: slipbox channel says the channel; slipbox channel set stable|preview sets it (not list)\n",
    });
    expect(slipbox(["channel", "set", "preview", "now"]).code).toBe(2);
  });
});
