import { describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../../../../src/core/application/config/config.ts";

import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("linters without a server (19.19)", () => {
  const until = async (ok: () => boolean, ms = 25_000) => {
    for (const t = Date.now(); !ok() && Date.now() - t < ms; ) await Bun.sleep(20);
    return ok();
  };
  const linters = (c: Config) => {
    c.linter = {
      fake: {
        "lint-command": "grep -n BAD | sed 's/^\\([0-9]*\\):.*/stdin:\\1:1: [error] found BAD/'; exit 1",
        "lint-formats": ["%f:%l:%c: [%trror] %m"],
      },
      saved: {
        "lint-command": "grep -n BAD ${INPUT} | sed 's/^\\([0-9]*\\):.*/\\1: saved BAD/'; exit 1",
        "lint-stdin": false,
        "lint-formats": ["%l: %m"],
        "lint-severity": 2,
      },
      gone: { "lint-command": "slipbox-no-such-linter --stdin" },
    };
    c.language = [{ name: "dockerfile", linters: ["fake", "saved", "gone"] }];
    c.lint.enabled = "auto"; // the harness's is off
  };

  test("a file's linters: findings beside their lines as it opens; one reading its input again once typing pauses, one reading the file once saved", async () => {
    // Each linter's answer lands on its own, in whatever order they end: the two found are held here until a frame is
    // drawn, the one not installed until their findings are; the order a busy machine gave on CI (#6).
    const servers = await import("../../../../src/core/documents/servers/linters.ts");
    const run = servers.runLinter;
    let found = () => {};
    let release = () => {};
    const first = new Promise<void>((go) => (found = go));
    const held = new Promise<void>((go) => (release = go));
    const spy = spyOn(servers, "runLinter").mockImplementation((async (def, ...rest) => {
      await (def.name === "gone" ? held : first);
      return run(def, ...rest);
    }) as typeof run);
    let restore = () => {};
    try {
      const root = makeVault();
      writeFileSync(join(root, "Dockerfile"), "FROM x\nRUN BAD\n");
      const h = await harness({ root, open: "Dockerfile", config: linters });
      const shown = () =>
        h.app.problems.ofView(h.app.view!).map((p) => `${p.start.line} ${p.severity} ${p.source}: ${p.message}`);
      const gone = () => h.app.messages.filter((m) => m.text.includes("linter gone")).length;
      // Drawn as they come: the view laid out again and a frame asked for once the two have answered, the third still
      // running (it was only once all three had).
      h.frame();
      let asked = 0;
      const render = h.app.host.requestRender;
      restore = () => void (h.app.host.requestRender = render);
      h.app.host.requestRender = () => void asked++;
      found();
      expect(await until(() => h.app.view!.buf.linterProblems.size === 2)).toBe(true);
      expect(h.app.view!.layoutKey).toBe("");
      expect(asked).toBeGreaterThan(0);
      restore();
      expect(await until(() => (h.frame(), shown().length === 2))).toBe(true);
      expect(shown().sort()).toEqual(["2 error fake: found BAD", "2 warning saved: saved BAD"]);
      expect(h.frame()).toMatch(/[┃│] ✖2 {2}RUN BAD/); // the bar: the worse one's sign and its two, beside its line
      // Not installed: said once, when its run ends.
      expect(gone()).toBe(0);
      release();
      expect(await until(() => gone() === 1)).toBe(true);
      expect(
        h.app.messages.filter((m) => m.text.includes("linter gone: slipbox-no-such-linter not found")).length,
      ).toBe(1);
      // Typed: the input's linter again after the pause; the file's waits for the save. A line Dockerfile's grammar
      // reads (16.21): no syntax error of its own among the findings.
      await h.keys("shift+g", "o", "R", "U", "N", "space", "B", "A", "D", "escape");
      expect(await until(() => (h.frame(), shown().length === 2))).toBe(true);
      expect(shown().sort()).toEqual(["2 error fake: found BAD", "3 error fake: found BAD"]);
      await h.keys("ctrl+s");
      expect(await until(() => (h.frame(), shown().length === 4))).toBe(true);
      expect(
        shown()
          .filter((p) => p.includes("saved"))
          .sort(),
      ).toEqual(["2 warning saved: saved BAD", "3 warning saved: saved BAD"]);
      expect(gone()).toBe(1); // still once
    } finally {
      restore();
      found();
      release();
      spy.mockRestore();
    }
  });

  test("a linter whose run throws ends that run all the same: the file is linted again once typing pauses", async () => {
    // Its run ended in an exception, not an answer: the others' answers are kept, and the next run isn't held back as
    // if this one were still going.
    const servers = await import("../../../../src/core/documents/servers/linters.ts");
    const run = servers.runLinter;
    let threw = false;
    const spy = spyOn(servers, "runLinter").mockImplementation((async (def, ...rest) => {
      if (def.name === "saved" && !threw) {
        threw = true;
        throw new Error("the linter's run went wrong");
      }
      return run(def, ...rest);
    }) as typeof run);
    try {
      const root = makeVault();
      writeFileSync(join(root, "Dockerfile"), "FROM x\nRUN BAD\n");
      const h = await harness({ root, open: "Dockerfile", config: linters });
      const shown = () =>
        h.app.problems.ofView(h.app.view!).map((p) => `${p.start.line} ${p.severity} ${p.source}: ${p.message}`);
      expect(await until(() => (h.frame(), threw && shown().includes("2 error fake: found BAD")))).toBe(true);
      await h.keys("shift+g", "o", "R", "U", "N", "space", "B", "A", "D", "escape");
      expect(await until(() => (h.frame(), shown().includes("3 error fake: found BAD")))).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  test("one not installed, failing for two files at once, is said once", async () => {
    const root = makeVault();
    writeFileSync(join(root, "Dockerfile"), "RUN x\n");
    mkdirSync(join(root, "web"));
    writeFileSync(join(root, "web", "Dockerfile"), "RUN y\n");
    const h = await harness({
      root,
      open: "Dockerfile",
      config: (c) => (linters(c), (c.language = [{ name: "dockerfile", linters: ["gone"] }])),
    });
    const other = h.app.buffer("web/Dockerfile")!;
    h.app.languages.ensureLinters(other); // both run together
    h.frame();
    expect(await until(() => other.linted.typed >= 0 && h.app.view!.buf.linted.typed >= 0)).toBe(true);
    await Bun.sleep(300);
    expect(h.app.messages.filter((m) => m.text.includes("linter gone")).length).toBe(1);
  });

  test("off with the lint surface: [lint] enabled = off runs none", async () => {
    const root = makeVault();
    writeFileSync(join(root, "Dockerfile"), "RUN BAD\n");
    const h = await harness({ root, open: "Dockerfile", config: (c) => (linters(c), (c.lint.enabled = "off")) });
    h.frame();
    await Bun.sleep(400);
    h.frame();
    expect(h.app.problems.ofView(h.app.view!)).toEqual([]);
  });
});
