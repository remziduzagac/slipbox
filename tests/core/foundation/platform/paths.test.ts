import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureCacheHome, type StoreKind, storeDir } from "../../../../src/core/foundation/platform/paths.ts";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const sandbox = makeCoreSandbox();

describe("where slipbox keeps things (14.9)", () => {
  test("Linux and macOS: XDG's folders under home, or the XDG_* set — a relative one ignored, as XDG says", () => {
    for (const platform of ["linux", "darwin"]) {
      const at = (kind: StoreKind, env: Record<string, string> = {}) => storeDir(kind, platform, env, "/home/u");
      expect([at("config"), at("cache"), at("state"), at("data")]).toEqual([
        "/home/u/.config/slipbox",
        "/home/u/.cache/slipbox",
        "/home/u/.local/state/slipbox",
        "/home/u/.local/share/slipbox",
      ]);
      expect(at("cache", { XDG_CACHE_HOME: "/var/c" })).toBe("/var/c/slipbox");
      expect(at("data", { XDG_DATA_HOME: "rel/data" })).toBe("/home/u/.local/share/slipbox");
    }
  });
  test("Windows: the config in %APPDATA%, the rest in %LOCALAPPDATA% — a database never roams; an XDG_* set still taken", () => {
    const env = { APPDATA: "C:\\Users\\u\\AppData\\Roaming", LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local" };
    const at = (kind: StoreKind, e: Record<string, string> = env) => storeDir(kind, "win32", e, "C:\\Users\\u");
    expect(at("config")).toBe("C:\\Users\\u\\AppData\\Roaming\\slipbox");
    expect([at("cache"), at("state"), at("data")]).toEqual(
      ["cache", "state", "data"].map((k) => `C:\\Users\\u\\AppData\\Local\\slipbox\\${k}`),
    );
    // Neither set: where Windows keeps them.
    expect([at("config", {}), at("state", {})]).toEqual([
      "C:\\Users\\u\\AppData\\Roaming\\slipbox",
      "C:\\Users\\u\\AppData\\Local\\slipbox\\state",
    ]);
    expect(at("cache", { ...env, XDG_CACHE_HOME: "D:\\cache" })).toBe("D:\\cache\\slipbox");
    expect(at("cache", { ...env, XDG_CACHE_HOME: "cache" })).toBe("C:\\Users\\u\\AppData\\Local\\slipbox\\cache");
  });
  test("the cache is tagged for backup tools to skip (CACHEDIR.TAG); a tag already there is left as it is", () => {
    const dir = join(mkdtempSync(join(sandbox, "tag-")), "slipbox");
    expect(ensureCacheHome(dir)).toBe(dir);
    const tag = readFileSync(join(dir, "CACHEDIR.TAG"), "utf8");
    expect(tag.startsWith("Signature: 8a477f597d28d172789f06886806bc55")).toBe(true);
    const other = join(mkdtempSync(join(sandbox, "tag-")), "slipbox");
    mkdirSync(other);
    writeFileSync(join(other, "CACHEDIR.TAG"), "Signature: 8a477f597d28d172789f06886806bc55\n# someone else's\n");
    ensureCacheHome(other);
    expect(readFileSync(join(other, "CACHEDIR.TAG"), "utf8")).toEndWith("# someone else's\n");
  });
});
