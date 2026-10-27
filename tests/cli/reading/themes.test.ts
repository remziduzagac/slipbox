import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCliProcessSandbox } from "../../support/cli-process.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { sandbox, slipbox } = makeCliProcessSandbox();

describe("the CLI's edges: help flags, error paths, empty states", () => {
  /** A root of its own, with a state, cache and config only it knows. */
  function fresh(prefix: string): { root: string; dir: string; env: Record<string, string> } {
    const dir = mkdtempSync(join(sandbox, prefix));
    const root = join(dir, "root");
    mkdirSync(join(root, ".slipbox"), { recursive: true });
    const env = {
      XDG_STATE_HOME: join(dir, "state"),
      XDG_CACHE_HOME: join(dir, "cache"),
      XDG_DATA_HOME: join(dir, "data"),
      XDG_CONFIG_HOME: join(dir, "config"),
      SLIPBOX_CONFIG: join(dir, "config", "slipbox", "config.toml"),
    };
    return { root, dir, env };
  }
  test("themes: the configured one marked current; a user theme listed with its file", () => {
    const { root, dir, env } = fresh("themes-");
    const themes = join(dir, "config", "slipbox", "themes");
    mkdirSync(themes, { recursive: true });
    writeFileSync(join(themes, "mine.yaml"), 'scheme: "mine"\n');
    writeFileSync(join(dir, "config", "slipbox", "config.toml"), 'theme = "nord"\n');
    const out = slipbox(["themes"], { cwd: root, env }).out;
    expect(out).toContain("* nord\n");
    expect(out).toContain("  tokyo-night\n");
    expect(out).toContain(`  mine  (${join(themes, "mine.yaml")})\n`);
    const list = slipbox(["themes", "--json"], { cwd: root, env }).json.data as {
      name: string;
      source: string;
      current: boolean;
      path?: string;
    }[];
    expect(list.filter((t) => t.current).map((t) => t.name)).toEqual(["nord"]);
    expect(list.find((t) => t.name === "mine")).toEqual({
      name: "mine",
      source: "user",
      path: join(themes, "mine.yaml"),
      current: false,
    });
  });
});
