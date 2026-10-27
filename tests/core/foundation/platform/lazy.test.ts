import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("lazy loading (16.6)", () => {
  test("asked before it's ready: null, loaded once; then the value, and whoever listens hears it", async () => {
    const { lazy, load, loadError, onLoaded } = await import("../../../../src/core/foundation/platform/lazy.ts");
    const name = "test:lazy-ready";
    const heard: string[] = [];
    const off = onLoaded((n) => n.startsWith("test:") && heard.push(n));
    let calls = 0;
    const loader = async () => {
      calls++;
      return { answer: 42 };
    };
    expect(lazy(name, loader)).toBeNull();
    expect(lazy(name, loader)).toBeNull(); // still loading: not started again
    const waited = await load(name, loader); // the CLI waits for the same load
    expect(waited).toEqual({ answer: 42 });
    expect(lazy(name, loader)).toBe(waited!);
    expect(await load(name, loader)).toBe(waited!);
    expect(calls).toBe(1);
    expect(heard).toEqual([name]);
    expect(loadError(name)).toBeNull();
    off();
  });

  test("a load that fails: null, and why; never tried again; a listener removed hears no more", async () => {
    const { lazy, load, loadError, onLoaded } = await import("../../../../src/core/foundation/platform/lazy.ts");
    const heard: string[] = [];
    const off = onLoaded((n) => n.startsWith("test:") && heard.push(n));
    let calls = 0;
    const loader = async (): Promise<number> => {
      calls++;
      throw new Error("no such grammar");
    };
    expect(await load("test:lazy-fails", loader)).toBeNull();
    expect(loadError("test:lazy-fails")).toBe("no such grammar");
    expect(lazy("test:lazy-fails", loader)).toBeNull();
    expect(await load("test:lazy-fails", loader)).toBeNull();
    expect(calls).toBe(1);
    expect(heard).toEqual(["test:lazy-fails"]);
    off();
    await load("test:lazy-after", async () => 1);
    expect(heard).toEqual(["test:lazy-fails"]);
    expect(loadError("test:never-asked")).toBeNull();
  });
});
