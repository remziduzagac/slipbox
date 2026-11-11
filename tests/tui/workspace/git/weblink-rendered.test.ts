import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeGitPanelFixture } from "../../../support/tui/git-panel-fixture.ts";

const { git, repo, until, panel } = makeGitPanelFixture();
let made = 0;

/** One paragraph: several source lines share a displayed row, and its long source line wraps between rows. */
async function rendered() {
  const root = repo();
  const source = [
    "# Rendered",
    "",
    "Amber starts here.",
    "Birch continues here.",
    "Cedar carries the paragraph across displayed rows with enough words to make this source line wrap.",
    "Dogwood follows it.",
    "Elm follows too.",
    "Fir ends the paragraph.",
    "",
  ].join("\n");
  writeFileSync(join(root, "a.md"), source);
  git(root, "add", "a.md");
  git(root, "commit", "-qm", "paragraph");
  const project = `rendered-lines-${++made}`;
  git(root, "remote", "add", "origin", `https://github.com/ada/${project}.git`);
  git(root, "update-ref", "refs/remotes/origin/feature", "HEAD");
  const head = git(root, "rev-parse", "HEAD").trim();
  const p = await panel(root, "a.md", false, 100);
  p.app.panels.showSidebar(false);
  await p.app.run("view.mode_read");
  p.app.relayoutAll();
  p.frame();
  const view = p.app.view!;
  const body = p.app
    .currentLayout(view)
    .lines.map((line, row) => ({ line, row }))
    .filter(({ line }) => !line.decor && line.src >= 3 && line.spans.some((s) => s.text.trim()));
  expect(view.source || view.live).toBeFalsy();
  expect(body).toHaveLength(3);
  const [first, last] = [body[0]!, body[2]!];
  const sources = (line: typeof first.line) => [
    ...new Set([line.src, ...line.spans.flatMap((s) => (s.src === undefined ? [] : [s.src]))]),
  ];
  expect(sources(first.line)).toEqual([3, 4, 5]);
  expect(body[1]!.line.src).toBe(5);
  expect(sources(last.line)).toEqual([7, 8]);
  expect([first.line.srcMap, last.line.srcMap]).toEqual([undefined, undefined]);
  const copied: string[] = [];
  p.app.host.osc52 = (text) => (copied.push(text), true);
  const copy = async (...keys: string[]) => {
    const before = copied.length;
    await p.keys(...keys, "space", "g", "y");
    expect(await until(() => copied.length > before, 3000)).toBe(true);
    return copied.at(-1);
  };
  const url = (range: string) => `https://github.com/ada/${project}/blob/${head}/a.md?plain=1#${range}`;
  return { ...p, view, first, last, copy, url };
}

describe("web links from rendered paragraphs (EG-D18)", () => {
  test("the cursor includes every source line contributing to its displayed row", async () => {
    const p = await rendered();
    try {
      p.app.moveCursor(p.view, { row: p.first.row, col: 0 });
      expect(await p.copy()).toBe(p.url("L3-L5"));
      p.app.moveCursor(p.view, { row: p.last.row, col: 0 });
      expect(await p.copy()).toBe(p.url("L7-L8"));
    } finally {
      p.app.quit();
    }
  });

  test("forward and reverse selections include every source line of both endpoint rows", async () => {
    const p = await rendered();
    try {
      p.app.moveCursor(p.view, { row: p.first.row, col: 0 });
      const down = Array<string>(p.last.row - p.first.row).fill("j");
      const up = Array<string>(p.last.row - p.first.row).fill("k");
      expect(await p.copy("v", ...down, "$")).toBe(p.url("L3-L8"));
      expect(p.view.sel).toBeNull();
      expect(await p.copy("$", "v", ...up, "0")).toBe(p.url("L3-L8"));
      expect(p.view.sel).toBeNull();
    } finally {
      p.app.quit();
    }
  });
});
