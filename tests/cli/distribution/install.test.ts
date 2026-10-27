import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { makeCliProcessSandbox } from "../../support/cli-process.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { sandbox, slipbox } = makeCliProcessSandbox();

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
