import { expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { UpdateEnv } from "../../../../src/tui/app/distribution/updates.ts";
import { harness, makeSandbox } from "../../../tui-harness.ts";

const sandbox = makeSandbox();
let sequence = 0;

function environment(): UpdateEnv {
  const dir = join(sandbox, String(++sequence));
  mkdirSync(dir);
  return {
    release: { repo: "o/r", target: "linux-x64" },
    version: "0.5.0",
    by: "installer",
    channel: "stable",
    data: dir,
    execPath: join(dir, "slipbox"),
    startedBy: null,
    stateDir: dir,
    env: {},
    checkOn: () => false,
    fetcher: async () => {
      throw new Error("no network in a test");
    },
  };
}

function script(file: string, text: string): void {
  writeFileSync(file, `#!/bin/sh\n${text}\n`);
  chmodSync(file, 0o755);
}

test("observation polls on the tenth tick, reads the live environment and stops delivering on quit", async () => {
  const now = 2_000_000_000_000;
  const h = await harness({ now: () => now });
  h.app.lastInputAt = now - 3000;
  const initial = environment();
  h.app.updates.env = initial;
  h.app.updates.start();
  const next = environment();
  mkdirSync(join(next.data, "versions", "0.6.0"), { recursive: true });
  symlinkSync("versions/0.6.0", join(next.data, "current"));
  h.app.updates.env = next;
  for (let i = 0; i < 9; i++) h.app.updates.tick();
  expect(h.app.overlay).toBeNull();
  h.app.updates.tick();
  await Promise.resolve();
  expect(h.frame()).toContain("slipbox 0.6.0 is installed");
  h.app.overlay = null;
  h.app.quit();
  h.app.updates.found({ version: "0.7.0", said: "newer" });
  for (let i = 0; i < 10; i++) h.app.updates.tick();
  expect(h.app.overlay).toBeNull();
  expect(h.app.updates.available).toBe("0.7.0");
});

test("overlapping observation probes run one child, cache its stamp and read a replacement environment", async () => {
  const h = await harness();
  const env = environment();
  const runs = join(env.data, "runs");
  script(env.execPath, `echo run >> '${runs}'\nsleep 0.05\necho 'slipbox 0.6.0'`);
  env.by = "other";
  env.startedBy = env.execPath;
  h.app.updates.env = env;
  await Promise.all([h.app.updates.lookUnderneath(), h.app.updates.lookUnderneath()]);
  await h.app.updates.lookUnderneath();
  expect(readFileSync(runs, "utf8")).toBe("run\n");
  expect(h.app.updates.installedNewer()).toBe("0.6.0");
  const next = environment();
  next.by = "other";
  next.startedBy = next.execPath;
  script(next.execPath, "echo 'slipbox 0.7.0'");
  h.app.updates.env = next;
  await h.app.updates.lookUnderneath();
  expect(h.app.updates.installedNewer()).toBe("0.7.0");
});

test("a detached upgrade finishing after quit removes its answer without publishing or claiming the version", async () => {
  const h = await harness();
  const env = environment();
  const result = { ok: true, data: { status: "upgraded", latest: "0.6.0", from: "0.5.0", removed: [] } };
  script(env.execPath, `sleep 0.1\necho '${JSON.stringify(result)}'`);
  h.app.updates.env = env;
  h.app.updates.upgradeBeside("0.6.0");
  const done = h.app.updates.background!.done;
  const file = join(env.stateDir, `upgrade-${process.pid}.json`);
  expect(existsSync(file)).toBe(true);
  h.app.quit();
  const messages = h.app.messages.map((m) => m.text);
  await done;
  expect(h.app.updates.background).toBeNull();
  expect(existsSync(file)).toBe(false);
  expect(h.app.updates.mine.size).toBe(0);
  expect(h.app.messages.map((m) => m.text)).toEqual(messages);
  expect(h.app.background.tasks.size).toBe(0);
});
