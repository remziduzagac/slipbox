import { expect, test } from "bun:test";
import { join } from "node:path";
import { generatedLocksMatch, locksModule } from "../../scripts/lock-servers.ts";

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
