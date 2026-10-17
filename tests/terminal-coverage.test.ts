// The terminal checks' coverage (TT-D4): every command and every area of the reference set has a check, or is left
// out with its reason. It reads the checks' declarations; it runs no terminal (the runner checks a declared command
// was run).

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Check } from "./terminal/check.ts";
import { CHECK_FILES, CHECKS, LEFT_OUT } from "./terminal/checks/index.ts";
import { caseAreas, coverage, ownerOfCase, ownerOfCommand, report } from "./terminal/coverage.ts";
import { COMMAND_SPECS } from "../src/core/command-specs.ts";
import { CHECKS_FOR, importGraph, SAMPLES_FOR } from "../scripts/ci-scope.ts";

describe("the terminal checks' coverage", () => {
  test("every command and every area of the reference set has a check, or is left out with its reason", () => {
    expect(report(coverage())).toBe("");
  });
  test("every command and every area has an owner: the area whose task covers it", () => {
    expect(COMMAND_SPECS.map((c) => c.id).filter((id) => ownerOfCommand(id) === "?")).toEqual([]);
    expect(caseAreas().filter((a) => ownerOfCase(a) === "?")).toEqual([]);
  });
  test("each check is named once, and declares what it covers", () => {
    const names = CHECKS.map((c) => `${c.area}: ${c.name}`);
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
    expect(CHECKS.filter((c) => !(c.covers.cases?.length || c.covers.commands?.length)).map((c) => c.name)).toEqual([]);
  });
  test("the checks a change runs (D239): each check file by its name; each feature's files and name pieces there", () => {
    const top = join(import.meta.dir, "..");
    const files = readdirSync(join(import.meta.dir, "terminal", "checks"))
      .filter((f) => f !== "index.ts")
      .map((f) => f.replace(/\.ts$/, ""));
    expect(Object.keys(CHECK_FILES).sort()).toEqual(files.sort());
    // Each pattern names a file there is, and each piece a check: one stale runs nothing, and says so here.
    const known = [...importGraph().keys(), "skills/slipbox/SKILL.md"];
    const names = CHECKS.map((c) => c.name.toLowerCase());
    expect(CHECKS_FOR.filter(([re]) => !known.some((f) => re.test(f))).map(([re]) => String(re))).toEqual([]);
    const pieces = [...CHECKS_FOR.flatMap(([, p]) => p), ...Object.values(SAMPLES_FOR).flatMap((s) => s.checks)];
    expect(pieces.filter((p) => !names.some((n) => n.includes(p.toLowerCase())))).toEqual([]);
    const samples = Object.entries(SAMPLES_FOR).flatMap(([f, s]) => [f, ...s.tests]);
    expect(samples.filter((f) => !existsSync(join(top, f)))).toEqual([]);
  });
  test("each reason says something", () => {
    const reasons = [...Object.values(LEFT_OUT.commands), ...Object.values(LEFT_OUT.cases)];
    expect(reasons.filter((r) => r.trim().length < 10)).toEqual([]);
  });

  // The rule itself, on checks made up for it.
  const check = (covers: Check["covers"]): Check => ({ area: "reading", name: "made up", covers, run: async () => {} });
  const empty = { commands: {}, cases: {} };
  const all = COMMAND_SPECS.map((c) => c.id);
  test("a command no check runs, nor left out, is uncovered: added without a check, the test fails naming it", () => {
    const most = check({ commands: all.slice(1), cases: caseAreas() });
    expect(coverage([most], empty).uncovered).toEqual({ commands: [all[0]!], cases: [] });
    expect(report(coverage([most], empty))).toContain(`command ${all[0]}`);
    expect(coverage([most], { commands: { [all[0]!]: "nothing to see" }, cases: {} }).uncovered.commands).toEqual([]);
  });
  test("an area of CASES.md no check covers, nor left out, is uncovered", () => {
    const areas = caseAreas();
    const most = check({ commands: all, cases: areas.slice(1) });
    expect(coverage([most], empty).uncovered.cases).toEqual([areas[0]!]);
  });
  test("a name that isn't there is said: a check's or a left-out list's", () => {
    const c = coverage([check({ commands: ["app.no_such"], cases: ["no-such-area"] })], {
      commands: { "edit.nothing": "a reason of some length" },
      cases: {},
    });
    expect(c.unknown).toEqual([
      "command app.no_such (a check)",
      "case area no-such-area (a check)",
      "command edit.nothing (left out)",
    ]);
  });
  test("left out yet covered: the left-out entry is stale", () => {
    const c = coverage([check({ commands: ["app.quit"] })], {
      commands: { "app.quit": "nothing to see here" },
      cases: {},
    });
    expect(c.stale).toEqual(["command app.quit"]);
  });
});
