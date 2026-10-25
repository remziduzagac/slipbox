import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { visibleLint } from "../src/core/lint-visibility.ts";
import { parseMarkdown } from "../src/core/parse.ts";
import { DEFAULT_CONFIG, loadConfig } from "../src/core/config.ts";
import type { LintIssue } from "../src/core/lint.ts";
import { harness, makeSandbox, makeVault } from "./tui-harness.ts";

const sandbox = makeSandbox();
const source =
  "# Heading\n\nParagraph\n\n- List\n\n> Quote\n\n| A |\n| - |\n| B |\n\n```ts\nlong code\n```\n\n    indented code\n";
const parsed = parseMarkdown(source);
const issue = (line: number, rule = "MD013"): LintIssue => ({
  file: "/note.md",
  line,
  column: 1,
  rule,
  name: "line-length",
  description: "Line length",
});

describe("lint visibility follows the view", () => {
  test("prose, lists and quotes follow wrapping; tables always fit; fence interiors follow code wrapping", () => {
    const issues = [1, 3, 5, 7, 9, 10, 11, 13, 14, 15, 17].map((line) => issue(line));
    for (const wrap of [false, true])
      for (const codeWrap of [false, true]) {
        const result = visibleLint(issues, parsed, DEFAULT_CONFIG.lint, { wrap, codeWrap });
        expect(result.shown.map((i) => i.line)).toEqual([
          1,
          ...(!wrap ? [3, 5, 7] : []),
          13,
          ...(!codeWrap ? [14] : []),
          15,
          17,
        ]);
        expect(result.hidden.get("table rows the view fits")).toBe(3);
      }
  });

  test("follow_view false keeps every rule except ignore; show all restores ignored and view-hidden findings", () => {
    const issues = [issue(3), issue(11), issue(3, "MD033")];
    const settings = { follow_view: false, ignore: ["MD033"] };
    expect(visibleLint(issues, parsed, settings, { wrap: true, codeWrap: true }).shown).toEqual(issues.slice(0, 2));
    const result = visibleLint(
      issues,
      parsed,
      { ...settings, follow_view: true },
      { wrap: true, codeWrap: true },
      true,
    );
    expect(result.shown).toEqual(issues);
    expect([...result.hidden.values()].reduce((a, b) => a + b, 0)).toBe(3);
    expect(issues).toHaveLength(3);
    expect(visibleLint(issues, null, DEFAULT_CONFIG.lint, { wrap: true, codeWrap: true }).shown).toEqual(issues);
  });

  test("nested and unclosed fences classify their content, not the fence or indented code", () => {
    const text = "> ```\n> code\n> ```\n\n- item\n\n  ~~~\n  code\n";
    const p = parseMarkdown(text);
    const result = visibleLint(
      [2, 3, 8].map((line) => issue(line)),
      p,
      DEFAULT_CONFIG.lint,
      { wrap: true, codeWrap: true },
    );
    expect(result.shown.map((i) => i.line)).toEqual([3]);
  });

  test("safe vault settings accept follow_view, ignore and caption and reject an invalid caption", () => {
    const root = makeVault();
    writeFileSync(join(sandbox, "user.toml"), "");
    const cfg = join(root, ".slipbox/config.toml");
    writeFileSync(cfg, '[lint]\nfollow_view = false\nignore = ["MD033"]\n[render]\ncaption = "top"\n');
    const loaded = loadConfig({ vaultRoot: root, configFile: join(sandbox, "user.toml") });
    expect(loaded.config.lint).toMatchObject({ follow_view: false, ignore: ["MD033"] });
    expect(loaded.config.render.caption).toBe("top");
    expect(loaded.warnings).toEqual([]);
    writeFileSync(cfg, '[render]\ncaption = "side"\n');
    const invalid = loadConfig({ vaultRoot: root, configFile: join(sandbox, "user.toml") });
    expect(invalid.config.render.caption).toBe("bottom");
    expect(invalid.warnings.join(" ")).toContain("caption");
  });

  test("Problems filters file and vault counts, explains hidden findings and reveals them by named command and key", async () => {
    const root = makeVault();
    writeFileSync(join(root, "visibility.md"), source);
    const h = await harness({
      root,
      open: "visibility.md",
      config: (c) => {
        c.lint.enabled = "off";
      },
    });
    const v = h.app.view!;
    const issues = [issue(3), issue(11), issue(14), issue(3, "MD033")].map((i) => ({ ...i, file: v.buf.abs }));
    v.buf.lint = { version: v.buf.version, issues };
    h.app.languages.vaultLint.issues = issues;
    expect(h.app.problems.ofFile().filter((p) => p.source === "markdownlint")).toHaveLength(2);
    h.app.problems.open("file");
    expect(h.frame()).toContain("1 hidden: lines the view wraps; 1 hidden: table rows the view fits");
    expect(h.frame()).toContain("a: show all");
    await h.keys("a");
    expect(h.app.problems.ofFile().filter((p) => p.source === "markdownlint")).toHaveLength(4);
    expect(h.frame()).toContain("revealed:");
    h.app.run("problems.show_all");
    h.app.ui.wrap = false;
    expect(h.app.problems.ofFile().filter((p) => p.source === "markdownlint")).toHaveLength(3);
    h.app.config.render.code_wrap = "wrap";
    h.app.config.lint.ignore = ["MD033"];
    expect(h.app.problems.ofFile().filter((p) => p.source === "markdownlint")).toHaveLength(1);
    h.app.problems.panel.tab = "all";
    expect(h.app.problems.rows().find((r) => r.section === "Lint" && r.heading)?.label).toBe("Lint (1)");
    expect(h.app.problems.hiddenCaption()).toContain("rules in lint.ignore");
    h.app.run("problems.show_all");
    expect(h.app.problems.rows().find((r) => r.section === "Lint" && r.heading)?.label).toBe("Lint (4)");
    h.app.quit();
  });
});
