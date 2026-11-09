import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Config } from "../../../../src/core/application/config/config.ts";
import { elsewhereAt } from "../../../../src/core/workspace/vaults/vault.ts";
import { harness, makeSandbox, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
const sandbox = makeSandbox();

const git = (cwd: string, ...args: string[]) =>
  Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]);

/** `files.show = "auto"`, the hidden names not listed: the rows these tests count. */
const auto = (c: Config) => {
  c.files.show = "auto";
  c.files.hidden = false;
};

/** A folder at `dir` holding a note, a data file and code; `.slipbox/` in it when asked. */
function folder(dir: string, slipbox: boolean): string {
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "a.md"), "# A\n");
  writeFileSync(join(dir, "data.json"), "{}\n");
  writeFileSync(join(dir, "script.py"), "print(1)\n");
  writeFileSync(join(dir, "src", "main.ts"), "export {};\n");
  if (slipbox) mkdirSync(join(dir, ".slipbox"));
  return dir;
}

/** A git repository at `dir`: `git init`, else (no git here) a `.git` folder, which is what the rule looks at. */
function repository(dir: string, slipbox: boolean): string {
  folder(dir, slipbox);
  if (git(dir, "init", "-q", "-b", "main").exitCode !== 0) mkdirSync(join(dir, ".git"));
  return dir;
}

const place = () => realpathSync(mkdtempSync(join(sandbox, "place-")));

/** The explorer's rows, the vault's `src` unfolded. */
const shown = (h: Harness) => {
  h.app.explorer.expanded.add("src");
  h.app.explorer.invalidateTree();
  return h.app.explorer.rows().map((r) => `${"  ".repeat(r.depth)}${r.name}`);
};

/** What the explorer's pane draws under the rule at its foot: the line saying why it lists what it does. */
const foot = (h: Harness): string[] => {
  const p = (h.frame(), h.app.geometry!.sidebarPane!);
  const rows = h
    .frame()
    .split("\n")
    .slice(p.y, p.y + p.h)
    .map((l) =>
      [...l]
        .slice(p.x, p.x + p.w)
        .join("")
        .trim(),
    );
  const rule = rows.findLastIndex((r) => r.length > 0 && r === h.app.glyphs.hbar.repeat(r.length));
  return rule < 0 ? [] : rows.slice(rule + 1).filter(Boolean);
};

const GIT_LINE = "every text file: git repository · [files] show";

describe("files.show auto: git at the vault's top lists every text file, .slipbox/ or not (D272, #105)", () => {
  test("a repository with .slipbox/: every text file, said at the explorer's foot; a narrows it for now, said", async () => {
    const repo = repository(join(place(), "kestrel"), true);
    const h = await harness({ root: repo, open: "a.md", config: auto });
    expect(h.app.explorer.filesShown()).toBe("all");
    expect(shown(h)).toEqual(["src", "  main.ts", "a.md", "data.json", "script.py"]);
    // The switcher's files are the explorer's: the code too.
    expect(h.app.explorer.shownFiles().map((f) => f.path)).toEqual(
      expect.arrayContaining(["src/main.ts", "script.py", "data.json"]),
    );
    expect(h.app.explorer.filesNotice()).toBe(GIT_LINE);
    // On two rows in the default pane, the setting kept whole.
    expect(foot(h)).toEqual(["every text file: git", "repository · [files] show"]);
    // a: notes and data files for now — the two code files left out, said, and why.
    h.app.leftView = "explorer";
    h.app.region = "sidebar";
    await h.keys("a");
    expect(shown(h)).toEqual(["src", "a.md", "data.json"]);
    expect(h.app.explorer.filesNotice()).toBe("2 files not listed for now (a) · [files] show");
    expect(foot(h)).toEqual(["2 files not listed for now", "(a) · [files] show"]);
    await h.keys("a");
    expect(h.app.explorer.filesNotice()).toBe(GIT_LINE);
  });

  test("a repository without .slipbox/: every text file, as before, said", async () => {
    const repo = repository(join(place(), "infra"), false);
    const h = await harness({ root: repo, open: "a.md", config: auto, width: 160, height: 30 });
    h.app.panels.sideW = 60;
    expect(h.app.explorer.filesShown()).toBe("all");
    expect(shown(h)).toEqual(["src", "  main.ts", "a.md", "data.json", "script.py"]);
    // On one row where the pane is wide enough; a little narrower, the setting on a row of its own, no `·` left over.
    expect(foot(h)).toEqual([GIT_LINE]);
    h.app.panels.sideW = 40;
    expect(foot(h)).toEqual(["every text file: git repository", "[files] show"]);
  });

  test("a notes vault inside a repository, no .git beside its .slipbox/: notes and data files, the code left out said", async () => {
    const repo = repository(join(place(), "kestrel"), false);
    const notes = folder(join(repo, "notes"), true);
    const h = await harness({ root: notes, open: "a.md", config: auto });
    expect(h.app.explorer.filesShown()).toBe("renderable");
    expect(shown(h)).toEqual(["src", "a.md", "data.json"]);
    expect(h.app.explorer.filesNotice()).toBe("2 files not listed: notes vault · [files] show");
    expect(foot(h)).toEqual(["2 files not listed: notes", "vault · [files] show"]);
    // a lists every text file: nothing left out, nothing said.
    h.app.leftView = "explorer";
    h.app.region = "sidebar";
    await h.keys("a");
    expect(shown(h)).toEqual(["src", "  main.ts", "a.md", "data.json", "script.py"]);
    expect(h.app.explorer.filesNotice()).toBeNull();
    expect(foot(h)).toEqual([]);
  });

  test("a notes folder outside git: notes and data files; nothing said where nothing is left out", async () => {
    const notes = folder(join(place(), "notes"), true);
    const h = await harness({ root: notes, open: "a.md", config: auto });
    expect(h.app.explorer.filesShown()).toBe("renderable");
    expect(shown(h)).toEqual(["src", "a.md", "data.json"]);
    expect(h.app.explorer.filesNotice()).toBe("2 files not listed: notes vault · [files] show");
    // A notes folder of notes and data files alone: nothing left out, so nothing to say.
    const only = join(place(), "journal");
    mkdirSync(join(only, ".slipbox"), { recursive: true });
    writeFileSync(join(only, "a.md"), "# A\n");
    writeFileSync(join(only, "data.json"), "{}\n");
    const quiet = await harness({ root: only, open: "a.md", config: auto });
    expect(quiet.app.explorer.filesShown()).toBe("renderable");
    expect(quiet.app.explorer.filesNotice()).toBeNull();
    expect(foot(quiet)).toEqual([]);
  });

  test("Elsewhere: every text file, listed a level at a time, a repository's .slipbox/ aside; nothing said", async () => {
    const top = place();
    const plain = folder(join(top, "plain"), false);
    const repo = repository(join(plain, "kestrel"), true);
    const notes = folder(join(plain, "journal"), true);
    const h = await harness({ loc: elsewhereAt(plain), open: null, config: auto });
    expect(h.app.explorer.filesShown()).toBe("all");
    expect(h.app.explorer.filesNotice()).toBeNull();
    expect(foot(h)).toEqual([]);
    // A repository with .slipbox/ listed a level at a time: its code too; a notes folder: its notes and data files.
    h.app.explorer.expanded.add(repo);
    h.app.explorer.expanded.add(notes);
    h.app.explorer.invalidateTree();
    const rows = shown(h);
    const under = (name: string) => {
      const at = rows.indexOf(name);
      const out: string[] = [];
      for (const r of rows.slice(at + 1)) {
        if (!r.startsWith("  ")) break;
        out.push(r.trim());
      }
      return out;
    };
    expect(under("kestrel")).toEqual(["src", "a.md", "data.json", "script.py"]);
    expect(under("journal")).toEqual(["src", "a.md", "data.json"]);
    expect(rows.filter((r) => !r.startsWith("  ")).slice(-3)).toEqual(["a.md", "data.json", "script.py"]);
  });

  test("a git worktree, its top holding a .git file, .slipbox/ committed: every text file, said", async () => {
    const repo = repository(join(place(), "kestrel"), true);
    writeFileSync(join(repo, ".slipbox", "config.toml"), 'name = "kestrel"\n');
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "first");
    const wt = join(dirname(repo), "kestrel-feat");
    if (git(repo, "worktree", "add", "-q", "-b", "feat", wt).exitCode !== 0) {
      // No git here: a worktree's top as git leaves it, a `.git` file pointing at its admin folder.
      folder(wt, true);
      writeFileSync(join(wt, ".git"), `gitdir: ${join(repo, ".git", "worktrees", "feat")}\n`);
    }
    const h = await harness({ root: wt, open: "a.md", config: auto });
    expect(h.app.explorer.filesShown()).toBe("all");
    expect(shown(h)).toEqual(["src", "  main.ts", "a.md", "data.json", "script.py"]);
    expect(h.app.explorer.filesNotice()).toBe(GIT_LINE);
  });

  test("a repository with .slipbox/ seen from a notes vault beside it: its code listed a level at a time", async () => {
    const top = place();
    const notes = folder(join(top, "notes"), true);
    const repo = repository(join(top, "kestrel"), true);
    const h = await harness({ root: notes, open: "a.md", config: auto });
    h.app.explorer.zoomTo(top);
    h.app.explorer.expanded.add(repo);
    h.app.explorer.invalidateTree();
    const rows = shown(h);
    const at = rows.indexOf("kestrel");
    expect(rows.slice(at + 1, at + 5).map((r) => r.trim())).toEqual(["src", "a.md", "data.json", "script.py"]);
  });
});

describe("the explorer's line at its foot, beside auto (D272)", () => {
  test("the default, every text file: nothing said, in a repository or a notes vault", async () => {
    const repo = repository(join(place(), "kestrel"), true);
    const h = await harness({ root: repo, open: "a.md" });
    expect(h.app.explorer.filesShown()).toBe("all");
    expect(h.app.explorer.filesNotice()).toBeNull();
    expect(foot(h)).toEqual([]);
    const notes = folder(join(place(), "notes"), true);
    const n = await harness({ root: notes, open: "a.md" });
    expect(n.app.explorer.filesNotice()).toBeNull();
  });

  test("files.show set to fewer: how many are left out, files.include's and files.exclude's not counted", async () => {
    const repo = repository(join(place(), "kestrel"), true);
    writeFileSync(join(repo, "notes.txt"), "plain\n");
    const h = await harness({
      root: repo,
      open: "a.md",
      config: (c) => {
        c.files.show = "renderable";
        c.files.include = ["script.py"];
        c.files.exclude = ["notes.txt"];
      },
    });
    expect(h.app.explorer.filesNotice()).toBe("1 file not listed · [files] show");
    const only = await harness({ root: repo, open: "a.md", config: (c) => (c.files.show = "notes") });
    // notes: the data file left out too.
    expect(only.app.explorer.filesNotice()).toBe("4 files not listed · [files] show");
  });

  test("a narrow pane: [files] show never split, the reason cut short above it; too narrow for it, no line", async () => {
    const repo = repository(join(place(), "kestrel"), true);
    const h = await harness({ root: repo, open: "a.md", config: auto, width: 160, height: 30 });
    const at = (w: number) => {
      h.app.panels.sideW = w;
      return foot(h);
    };
    // Too wide for two rows of words: the reason cut short, the setting whole on a row of its own.
    expect(at(26)).toEqual(["every text file: git re…", "[files] show"]);
    expect(at(24)).toEqual(["every text file: git …", "[files] show"]);
    expect(at(20)).toEqual(["every text file: …", "[files] show"]);
    expect(at(14)).toEqual(["every text …", "[files] show"]);
    // Narrower than the setting: no line at all, rather than a part of its name.
    expect(at(13)).toEqual([]);
    expect(at(12)).toEqual([]);
    h.app.leftView = "explorer";
    h.app.region = "sidebar";
    await h.keys("a");
    expect(at(20)).toEqual(["2 files not liste…", "[files] show"]);
    expect(at(13)).toEqual([]);
  });

  test("a pane too short for it: no line, the tree keeps its rows", async () => {
    const repo = repository(join(place(), "kestrel"), true);
    const h = await harness({ root: repo, open: "a.md", config: auto, height: 9 });
    expect(h.app.explorer.filesNotice()).toBe(GIT_LINE);
    expect(foot(h)).toEqual([]);
  });
});
