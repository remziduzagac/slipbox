import { UNIT_TIMEOUT_MS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCliProcessSandbox } from "../../support/cli-process.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { sandbox, slipbox } = makeCliProcessSandbox();

describe("writing", () => {
  test("where walk.exclude leaves it out, a note is written and said not indexed: in its line, its JSON, or a warning (D246)", () => {
    const dir = realpathSync(mkdtempSync(join(sandbox, "excluded-")));
    const own = {
      XDG_STATE_HOME: join(dir, "state"),
      XDG_CACHE_HOME: join(dir, "cache"),
      XDG_DATA_HOME: join(dir, "d"),
    };
    const root = join(dir, "root");
    const w = (rel: string, text: string) => {
      mkdirSync(join(root, rel, ".."), { recursive: true });
      writeFileSync(join(root, rel), text);
    };
    w(
      ".slipbox/config.toml",
      '[walk]\nexclude = ["drafts/", "*.draft.md"]\n\n[capture]\nlocation = "root"\nfile = "drafts/scratch.md"\n',
    );
    w("a.md", "# A\n");
    w("b.md", "# B\n");
    w("ideas/i.md", "# I\n");
    const run = (args: string[]) => slipbox(args, { cwd: root, env: own });
    const said = " (not indexed: walk.exclude)";
    // Made, and written again: said each time; never indexed.
    expect(run(["write", "drafts/x", "text", "--create"])).toMatchObject({
      code: 0,
      out: `created drafts/x.md${said}\n`,
    });
    expect(run(["write", "drafts/x.md", "more", "--append"])).toMatchObject({
      code: 0,
      out: `wrote drafts/x.md${said}\n`,
    });
    expect(run(["write", "y.draft", "text", "--create", "--json"]).json.data).toMatchObject({
      path: "y.draft.md",
      notIndexed: "walk.exclude",
    });
    expect(run(["ls"]).out).not.toMatch(/drafts\/x\.md|y\.draft\.md/);
    // Where it's indexed: nothing said, no field.
    expect(run(["write", "ideas/new", "text", "--create"]).out).toBe("created ideas/new.md\n");
    expect(run(["write", "ideas/n2", "text", "--create", "--json"]).json.data).not.toHaveProperty("notIndexed");
    // Moved or copied there: said after where it goes, a dry run's too.
    expect(run(["mv", "a.md", "drafts/", "--dry-run"]).out).toStartWith(`would rename a.md → drafts/a.md${said}: `);
    expect(run(["mv", "a.md", "drafts/", "--json"]).json.data).toMatchObject({
      to: "drafts/a.md",
      notIndexed: "walk.exclude",
    });
    expect(run(["mv", "ideas", "drafts/"]).out).toStartWith(`moved folder ideas → drafts/ideas${said}: `);
    expect(run(["cp", "b.md", "drafts/"]).out).toBe(`copied b.md → drafts/b.md${said}\n`);
    expect(run(["cp", "b.md", "c.md", "--json"]).json.data).toEqual({ from: "b.md", to: "c.md", dir: false });
    // Exported there as Markdown, a note.
    expect(run(["export", "b.md", "-o", "drafts/b.export.md"]).out).toBe(
      "exported b.md to drafts/b.export.md (Markdown (.md), not indexed: walk.exclude)\n",
    );
    expect(run(["export", "b.md", "-o", "drafts/b2.export.md", "--json"]).json.data.notIndexed).toBe("walk.exclude");
    // A bare path, for scripts, stays one: a warning says it, and the JSON a field.
    const cap = run(["capture", "an idea"]);
    expect([cap.code, cap.out, cap.err]).toEqual([
      0,
      `${join(root, "drafts", "scratch.md")}\n`,
      "slipbox: warning: the scratch, drafts/scratch.md, is not indexed: walk.exclude leaves it out\n",
    ]);
    const capJson = run(["capture", "another", "--json"]).json;
    expect(capJson.data.notIndexed).toBe("walk.exclude");
    expect(capJson.warnings.join("\n")).not.toContain("not indexed");
    const sub = run(["mkdir", "drafts/sub"]);
    expect([sub.out, sub.err]).toEqual([
      "drafts/sub/\n",
      "slipbox: warning: drafts/sub/ is not indexed: walk.exclude leaves it out\n",
    ]);
    expect(run(["mkdir", "ideas2", "--json"]).json.data).toEqual({ path: "ideas2", created: true });
  });
});
