import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { makeCoreSandbox } from "../../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("staging, from the source control view (26.2)", () => {
  const git = (cwd: string, ...args: string[]) => {
    const r = Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]);
    return new TextDecoder().decode(r.stdout);
  };
  const repo = (files: Record<string, string>) => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-stage-"));
    for (const [rel, text] of Object.entries(files)) writeFileSync(join(root, rel), text);
    git(root, "init", "-q", "-b", "main");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "start");
    return root;
  };

  test("status entries with both letters; renames with where from; sections: conflicted, staged, unstaged, untracked", async () => {
    const { parseEntries, sections } = await import("../../../../../src/core/workspace/git/staging/gitstage.ts");
    const entries = parseEntries("MM a.md\0A  b.md\0R  new.md\0old.md\0?? u.md\0UU c.md\0 D d.md\0");
    // Every pair a merge's conflict has; sorted by path within each section.
    const s2 = sections(parseEntries("AA x.md\0DU y.md\0UD w.md\0M  z.md\0M  m.md\0"));
    expect([s2.conflicted.map((e) => e.path), s2.staged.map((e) => e.path)]).toEqual([
      ["w.md", "x.md", "y.md"],
      ["m.md", "z.md"],
    ]);
    expect(entries).toEqual([
      { path: "a.md", x: "M", y: "M" },
      { path: "b.md", x: "A", y: " " },
      { path: "new.md", x: "R", y: " ", from: "old.md" },
      { path: "u.md", x: "?", y: "?" },
      { path: "c.md", x: "U", y: "U" },
      { path: "d.md", x: " ", y: "D" },
    ]);
    const s = sections(entries);
    expect([s.conflicted, s.staged, s.unstaged, s.untracked].map((l) => l.map((e) => e.path))).toEqual([
      ["c.md"],
      ["a.md", "b.md", "new.md"],
      ["a.md", "d.md"],
      ["u.md"],
    ]);
  });

  test("a commit message as git keeps it: # lines left out, blank lines around trimmed, runs of them one (26.3)", async () => {
    const { cleanMessage } = await import("../../../../../src/core/workspace/git/staging/gitstage.ts");
    expect(cleanMessage("\nSubject\n\n\n\nbody\n# a guide\n#another\n\n")).toBe("Subject\n\nbody");
    expect(cleanMessage("# only guides\n\n")).toBe("");
    expect(cleanMessage("Fix #12 here\n")).toBe("Fix #12 here");
  });

  test("lines replaced in a text: its line breaks kept, its final one as it was, an empty text's lines ended", async () => {
    const { replaceLines } = await import("../../../../../src/core/workspace/git/staging/gitstage.ts");
    expect(replaceLines("a\nb\nc\n", 1, 1, ["B", "B2"])).toBe("a\nB\nB2\nc\n");
    expect(replaceLines("a\r\nb\r\n", 2, 0, ["c"])).toBe("a\r\nb\r\nc\r\n");
    expect(replaceLines("a\nb", 0, 1, [])).toBe("b");
    expect(replaceLines("", 0, 0, ["x"])).toBe("x\n");
    expect(replaceLines("x\n", 0, 1, [])).toBe("");
    // A byte order mark stays the text's, a first line replaced or not.
    expect(replaceLines("\uFEFF# T\nb\n", 0, 1, ["# U"])).toBe("\uFEFF# U\nb\n");
    expect(replaceLines("\uFEFFa\r\nb\r\n", 1, 1, [])).toBe("\uFEFFa\r\n");
  });

  test("a file staged, unstaged, discarded; all staged and unstaged; one change staged and unstaged, the others left", async () => {
    const { discardFile, stageAll, stageChange, stageFile, unstageAll, unstageChange, unstageFile } = await import(
      "../../../../../src/core/workspace/git/staging/gitstage.ts"
    );
    const { gitChanges } = await import("../../../../../src/core/workspace/git/gitsigns.ts");
    const root = repo({ "a.md": "one\ntwo\nthree\nfour\n", "b.md": "b\n" });
    const c = { root };
    const staged = (p: string) => git(root, "show", `:${p}`);
    writeFileSync(join(root, "a.md"), "ONE\ntwo\nthree\nFOUR\n");
    // One change of two staged: the index has it, the other stays the working tree's alone.
    const changes = gitChanges(staged("a.md"), readFileSync(join(root, "a.md"), "utf8"));
    expect(changes.map((x) => x.from)).toEqual([1, 4]);
    expect(stageChange(c, "a.md", staged("a.md"), changes[1]!)).toBeNull();
    expect(staged("a.md")).toBe("one\ntwo\nthree\nFOUR\n");
    expect(git(root, "status", "--porcelain")).toBe("MM a.md\n");
    // Unstaged again: between the commit and the index, that change put back.
    const head = git(root, "show", "HEAD:a.md");
    expect(unstageChange(c, "a.md", staged("a.md"), gitChanges(head, staged("a.md"))[0]!)).toBeNull();
    expect(staged("a.md")).toBe("one\ntwo\nthree\nfour\n");
    // Whole files.
    expect(stageFile(c, "a.md")).toBeNull();
    expect(git(root, "status", "--porcelain")).toBe("M  a.md\n");
    expect(unstageFile(c, "a.md")).toBeNull();
    expect(git(root, "status", "--porcelain")).toBe(" M a.md\n");
    expect(discardFile(c, "a.md")).toBeNull();
    expect(readFileSync(join(root, "a.md"), "utf8")).toBe("one\ntwo\nthree\nfour\n");
    writeFileSync(join(root, "b.md"), "B\n");
    writeFileSync(join(root, "n.md"), "new\n");
    expect(stageAll(c)).toBeNull();
    expect(git(root, "status", "--porcelain")).toBe("M  b.md\nA  n.md\n");
    expect(unstageAll(c)).toBeNull();
    expect(git(root, "status", "--porcelain")).toBe(" M b.md\n?? n.md\n");
    // A failure says git's why.
    expect(discardFile(c, "nope.md")).toMatch(/nope\.md/);
    // A change staged in an executable file keeps its mode.
    writeFileSync(join(root, "run.sh"), "echo a\necho b\n");
    chmodSync(join(root, "run.sh"), 0o755);
    git(root, "add", "run.sh");
    git(root, "commit", "-q", "-m", "run");
    writeFileSync(join(root, "run.sh"), "echo A\necho b\n");
    expect(stageChange(c, "run.sh", staged("run.sh"), gitChanges(staged("run.sh"), "echo A\necho b\n")[0]!)).toBeNull();
    expect(git(root, "ls-files", "-s", "run.sh")).toStartWith("100755 ");
    // In a repository with no commit yet: unstaged by taking it out of the index.
    const fresh = mkdtempSync(join(tmpdir(), "slipbox-stage-"));
    git(fresh, "init", "-q", "-b", "main");
    writeFileSync(join(fresh, "f.md"), "f\n");
    git(fresh, "add", "f.md");
    expect(unstageFile({ root: fresh }, "f.md")).toBeNull();
    expect(git(fresh, "status", "--porcelain")).toBe("?? f.md\n");
  });

  /** The paths git has staged, and those it hasn't, as `-z` gives them. */
  const listOf = (root: string, ...args: string[]) =>
    git(root, ...args, "--name-only", "-z")
      .split("\0")
      .filter(Boolean)
      .sort();
  const NAMES = ["Why?.md", "WhyX.md", "a*.md", "ab.md", "[x] d.md", "x d.md", ":!k.md", "k.md", ":j.md", "j.md"];

  test("a file whose name holds a glob's characters, or starts with `:`, is the only one staged, unstaged or discarded", async () => {
    const { discardFile, stageFile, unstageFile, writeIndex } = await import(
      "../../../../../src/core/workspace/git/staging/gitstage.ts"
    );
    const { blameLine, fileLog } = await import("../../../../../src/core/workspace/git/history/gitlog.ts");
    const root = repo(Object.fromEntries(NAMES.map((n) => [n, "1\n"])));
    const c = { root };
    for (const n of NAMES) writeFileSync(join(root, n), `1\n2 ${n}\n`);
    // Discarded: that file alone goes back; the files its name would match as a pattern keep their changes.
    for (const n of ["Why?.md", "a*.md", "[x] d.md", ":!k.md", ":j.md"]) expect(discardFile(c, n)).toBeNull();
    expect(listOf(root, "diff")).toEqual(["WhyX.md", "ab.md", "j.md", "k.md", "x d.md"]);
    for (const n of NAMES) writeFileSync(join(root, n), `1\n2 ${n}\n`);
    // Staged, one by one: each name stages itself and nothing else.
    for (const n of ["Why?.md", "a*.md", "[x] d.md", ":!k.md", ":j.md"]) {
      expect(stageFile(c, n)).toBeNull();
      expect(listOf(root, "diff", "--cached")).toEqual([n]);
      expect(unstageFile(c, n)).toBeNull();
      expect(listOf(root, "diff", "--cached")).toEqual([]);
    }
    // Unstaged with its look-alike staged too: the look-alike stays.
    stageFile(c, "Why?.md");
    stageFile(c, "WhyX.md");
    expect(unstageFile(c, "Why?.md")).toBeNull();
    expect(listOf(root, "diff", "--cached")).toEqual(["WhyX.md"]);
    // A file's history and blame are its own: not the commits of a file its name would match.
    git(root, "commit", "-q", "-m", "only WhyX");
    expect(fileLog(c, "Why?.md")!.map((x) => x.subject)).toEqual(["start"]);
    expect(fileLog(c, ":!k.md")!.map((x) => x.subject)).toEqual(["start"]);
    expect(blameLine(c, "[x] d.md", 1)!.subject).toBe("start");
    // A new file's mode is a new file's, not that of a file its name would match.
    writeFileSync(join(root, "RunX.sh"), "echo\n");
    chmodSync(join(root, "RunX.sh"), 0o755);
    git(root, "add", "RunX.sh");
    git(root, "commit", "-q", "-m", "run");
    expect(writeIndex(c, "Run?.sh", "echo new\n")).toBeNull();
    expect(git(root, "--literal-pathspecs", "ls-files", "-s", "--", "Run?.sh")).toStartWith("100644 ");
  });

  test("a section staged, unstaged or discarded in one git call: its files, and only them", async () => {
    const { discardFiles, stageFiles, unstageFiles } = await import(
      "../../../../../src/core/workspace/git/staging/gitstage.ts"
    );
    const root = repo(Object.fromEntries(NAMES.map((n) => [n, "1\n"])));
    const c = { root };
    for (const n of NAMES) writeFileSync(join(root, n), `1\n2 ${n}\n`);
    const some = ["Why?.md", "a*.md", "[x] d.md", ":!k.md"];
    expect(stageFiles(c, some)).toBeNull();
    expect(listOf(root, "diff", "--cached")).toEqual([...some].sort());
    expect(unstageFiles(c, ["Why?.md", ":!k.md"])).toBeNull();
    expect(listOf(root, "diff", "--cached")).toEqual(["[x] d.md", "a*.md"]);
    expect(discardFiles(c, ["Why?.md", ":j.md"])).toBeNull();
    expect(listOf(root, "diff")).toEqual(
      NAMES.filter((n) => !["Why?.md", ":j.md", "[x] d.md", "a*.md"].includes(n)).sort(),
    );
    // None: nothing asked of git.
    expect(stageFiles(c, [])).toBeNull();
    // A setting of the user's for patterns doesn't stop it: git refuses it beside literal paths, so it's left out.
    const was = process.env.GIT_GLOB_PATHSPECS;
    process.env.GIT_GLOB_PATHSPECS = "1";
    try {
      expect(stageFiles(c, ["ab.md"])).toBeNull();
    } finally {
      if (was === undefined) delete process.env.GIT_GLOB_PATHSPECS;
      else process.env.GIT_GLOB_PATHSPECS = was;
    }
    expect(listOf(root, "diff", "--cached")).toEqual(["[x] d.md", "a*.md", "ab.md"]);
  });

  test("unstaging everything during a merge keeps the merge: a conflict stays one, the next commit is the merge's", async () => {
    const { unstageAll } = await import("../../../../../src/core/workspace/git/staging/gitstage.ts");
    const root = repo({ "a.md": "1\n", "b.md": "1\n" });
    git(root, "switch", "-q", "-c", "x");
    writeFileSync(join(root, "a.md"), "x\n");
    writeFileSync(join(root, "b.md"), "x\n");
    git(root, "commit", "-q", "-am", "x");
    git(root, "switch", "-q", "main");
    writeFileSync(join(root, "a.md"), "m\n");
    git(root, "commit", "-q", "-am", "m");
    git(root, "merge", "-q", "x");
    expect(git(root, "status", "--porcelain")).toBe("UU a.md\nM  b.md\n");
    expect(unstageAll({ root })).toBeNull();
    expect(existsSync(join(root, ".git", "MERGE_HEAD"))).toBe(true);
    expect(git(root, "status", "--porcelain")).toBe("UU a.md\n M b.md\n");
  });

  test("a staged rename unstaged whole: its old path back, its new one untracked, nothing staged", async () => {
    const { parseEntries, unstageAll, unstageFile } = await import(
      "../../../../../src/core/workspace/git/staging/gitstage.ts"
    );
    const root = repo({ "old.md": "a\nb\nc\nd\n" });
    git(root, "mv", "old.md", "new.md");
    const e = parseEntries(git(root, "status", "--porcelain=v1", "-z")).find((x) => x.x === "R")!;
    expect(e).toEqual({ path: "new.md", x: "R", y: " ", from: "old.md" });
    expect(unstageFile({ root }, e.path, e.from)).toBeNull();
    expect(git(root, "status", "--porcelain")).toBe(" D old.md\n?? new.md\n");
    // Everything unstaged takes a rename whole too.
    git(root, "add", "-A");
    expect(unstageAll({ root })).toBeNull();
    expect(git(root, "status", "--porcelain")).toBe(" D old.md\n?? new.md\n");
  });

  test("the message box's text committed as typed: a line starting with # is its own; the editor's guide picks a mark", async () => {
    const { cleanMessage, commentFor } = await import("../../../../../src/core/workspace/git/staging/gitstage.ts");
    expect(cleanMessage("#12 fix the link\n", null)).toBe("#12 fix the link");
    expect(cleanMessage("# Notes cleanup\n\nbody\n", null)).toBe("# Notes cleanup\n\nbody");
    // The editor's: its guide's lines start with a mark no line of the message does, as git's commentChar = auto.
    expect(commentFor("Fix it\n\nbody")).toBe("#");
    expect(commentFor("#12 fix the link")).toBe(";");
    expect(commentFor("# Notes\n;x")).toBe("@");
    expect(cleanMessage("#12 fix the link\n\n; Committing: 1 file staged.\n", ";")).toBe("#12 fix the link");
  });
});
