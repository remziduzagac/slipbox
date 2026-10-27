import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  forgetOperation,
  operationNow,
  operationStatus,
  type OperationContext,
} from "../../../../../src/core/workspace/git/branches/operation-status.ts";
import { makeCoreSandbox } from "../../../../support/core-sandbox.ts";

const sandbox = makeCoreSandbox();
let serial = 0;
const fixture = () => {
  const gitDir = join(sandbox, String(++serial));
  mkdirSync(join(gitDir, "rebase-merge"), { recursive: true });
  writeFileSync(join(gitDir, "rebase-merge", "msgnum"), "2\n");
  writeFileSync(join(gitDir, "rebase-merge", "end"), "5\n");
  writeFileSync(join(gitDir, "rebase-merge", "head-name"), "refs/heads/topic\n");
  const clock = { now: 0 };
  const source = { git: { checkout: { gitDir } as { gitDir: string } | null, generation: 0 }, now: () => clock.now };
  const step = (n: number) => writeFileSync(join(gitDir, "rebase-merge", "msgnum"), `${n}\n`);
  return { gitDir, source, clock, step };
};

describe("operation observations without a client", () => {
  test("read the rebase status and branch from Git files with the existing words", () => {
    const { source } = fixture();
    expect(operationNow(source)).toMatchObject({ kind: "rebase", step: 2, total: 5, branch: "topic" });
    expect(operationStatus(source)).toEqual({ text: "rebasing 2/5", branch: "topic" });
  });

  test("reuse the observation below 500 ms and refresh at the exact boundary", () => {
    const { source, clock, step } = fixture();
    const first = operationNow(source);
    step(3);
    clock.now = 499;
    expect(operationNow(source)).toBe(first);
    clock.now = 500;
    expect(operationNow(source)?.step).toBe(3);
  });

  test("a generation change and explicit invalidation each refresh immediately", () => {
    const { source, step } = fixture();
    operationNow(source);
    step(3);
    source.git.generation++;
    expect(operationNow(source)?.step).toBe(3);
    step(4);
    expect(operationNow(source)?.step).toBe(3);
    forgetOperation(source);
    expect(operationNow(source)?.step).toBe(4);
  });

  test("different caller identities do not share a cached observation", () => {
    const { source, step } = fixture();
    const first = operationNow(source);
    step(3);
    const other: OperationContext = { git: source.git, now: source.now };
    expect(operationNow(other)?.step).toBe(3);
    forgetOperation(other);
    expect(operationNow(source)).toBe(first);
  });

  test("no checkout returns null without consulting the clock or retaining stale status", () => {
    const { source } = fixture();
    operationNow(source);
    source.git.checkout = null;
    source.now = () => {
      throw new Error("no checkout needs no clock");
    };
    expect(operationNow(source)).toBeNull();
    expect(operationStatus(source)).toBeNull();
  });

  test("an absent operation is cached too, and explicit invalidation reveals a newly started merge", () => {
    const { source, clock } = fixture();
    const gitDir = join(sandbox, "empty-git");
    mkdirSync(gitDir);
    source.git.checkout = { gitDir };
    expect(operationNow(source)).toBeNull();
    writeFileSync(join(gitDir, "MERGE_HEAD"), "commit\n");
    writeFileSync(join(gitDir, "MERGE_MSG"), "Merge branch 'topic'\n");
    clock.now = 499;
    expect(operationNow(source)).toBeNull();
    forgetOperation(source);
    expect(operationNow(source)?.kind).toBe("merge");
  });

  test("clock movement backwards retains the existing elapsed-time comparison", () => {
    const { source, clock, step } = fixture();
    clock.now = 500;
    const first = operationNow(source);
    step(3);
    clock.now = 499;
    expect(operationNow(source)).toBe(first);
  });
});
