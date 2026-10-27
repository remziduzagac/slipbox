import { expect, test } from "bun:test";
import { join } from "node:path";
import { generatedLocksMatch, locksMatchPins, locksModule } from "../../scripts/lock-servers.ts";

test("stored locks must match all and only the pins, including their manifest versions", () => {
  const pins = [{ package: "example", version: "1", bin: "example" }];
  const lock = JSON.stringify({ workspaces: { "": { dependencies: { example: "1" } } } });
  expect(locksMatchPins({ "example@1": lock }, pins)).toBe(true);
  expect(locksMatchPins({}, pins)).toBe(false);
  expect(locksMatchPins({ "example@1": lock, "orphan@1": lock }, pins)).toBe(false);
  expect(locksMatchPins({ "example@1": "invalid" }, pins)).toBe(false);
  const changed = JSON.stringify({ workspaces: { "": { dependencies: { example: "2" } } } });
  expect(locksMatchPins({ "example@1": changed }, pins)).toBe(false);
});

test("generated locks match the offline generator; dropped data and extra code are rejected", () => {
  const locks = { "example@1": '{"pin":"1"}\n', "example@2": '{"pin":"2"}\n' };
  expect(generatedLocksMatch(locksModule(locks), locks)).toBe(true);
  expect(generatedLocksMatch(locksModule({ "example@1": locks["example@1"] }), locks)).toBe(false);
  expect(generatedLocksMatch(`${locksModule(locks)}\nconsole.log("unexpected");`, locks)).toBe(false);
});

test("the committed lock module regenerates offline", () => {
  const root = join(import.meta.dir, "../..");
  // A fresh process reads the committed data, not another test's temporary changes to the shared LOCKS object.
  const run = Bun.spawnSync([process.execPath, join(root, "scripts/lock-servers.ts"), "--check"], { cwd: root });
  expect(run.exitCode).toBe(0);
  expect(run.stdout.toString()).toContain("offline generator verification passed");
});
