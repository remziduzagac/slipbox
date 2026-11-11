import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { App, View } from "../../../../src/tui/app/runtime/app.ts";
import { placeAt } from "../../../../src/tui/documents/editing/source/position.ts";
import { makeGitPanelFixture } from "../../../support/tui/git-panel-fixture.ts";

// A line's web link (EG-D18): `space g y` copies it, `space g w` opens it — never over SSH, where it's copied. The
// commit checked out, the lines as committed; a line not committed has none; a commit not pushed is linked, and said.
const { sandbox, git, repo, until, panel } = makeGitPanelFixture();

/** The fixture's repository, its note longer and a script committed; origin `remote`, each test's own: two copies of
 *  one project on this machine would ask which of them links to it open. */
function linked(remote: string): { root: string; head: string } {
  const root = repo();
  writeFileSync(join(root, "a.md"), "# A\n\none\n\ntwo\n\nthree\n");
  writeFileSync(join(root, "run.ts"), "const a = 1;\nconst b = 2;\nconst c = 3;\n");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "longer");
  git(root, "remote", "add", "origin", remote);
  return { root, head: git(root, "rev-parse", "HEAD").trim() };
}

/** The app on `open`, in source mode, the cursor on `line`; what it copies collected. */
async function at(root: string, open: string, line: number) {
  const p = await panel(root, open, false);
  const copied: string[] = [];
  p.app.host.osc52 = (t) => (copied.push(t), true);
  const view = p.app.view!;
  if (view.source === false) await p.keys("ctrl+k");
  toLine(p.app, view, line);
  return { ...p, view, copied };
}

const toLine = (app: App, view: View, line: number) => placeAt(app, view, view.buf.lineStarts()[line - 1]!);

/** Waits for the next message after `keys`, and returns it (a copy's file left out). */
async function after(p: Awaited<ReturnType<typeof at>>, ...keys: string[]): Promise<string> {
  const last = p.app.messages.at(-1);
  await p.keys(...keys);
  await until(() => p.app.messages.at(-1) !== last, 3000);
  return (p.app.messages.at(-1)?.text ?? "").replace(/ to \/\S+$/, "");
}

describe("space g y, a line's web link copied", () => {
  test("the cursor's line at the commit checked out; a Markdown note as its source; not on the remote yet, said", async () => {
    const { root, head } = linked("git@github.com:ada/notes.git");
    const p = await at(root, "a.md", 5);
    expect(await after(p, "space", "g", "y")).toBe(
      `copied the web link to line 5 of a.md — ${head.slice(0, 7)} isn't on origin yet`,
    );
    expect(p.copied).toEqual([`https://github.com/ada/notes/blob/${head}/a.md?plain=1#L5`]);
    // Pushed: on origin's branches as of the last fetch.
    git(root, "update-ref", "refs/remotes/origin/feature", "HEAD");
    expect(await after(p, "space", "g", "y")).toBe("copied the web link to line 5 of a.md");
  });

  test("a selection's lines, a range; lines added since shift none; a line not committed has no link", async () => {
    const { root, head } = linked("https://github.com/ada/scripts.git");
    git(root, "update-ref", "refs/remotes/origin/main", "HEAD");
    const p = await at(root, "run.ts", 1);
    // Unsaved, a line at the top: the committed lines are a line further down now.
    p.view.buf.edit(0, 0, "// new\n");
    toLine(p.app, p.view, 2);
    expect(await after(p, "V", "j", "j", "space", "g", "y")).toBe("copied the web link to lines 1–3 of run.ts");
    expect(p.copied.at(-1)).toBe(`https://github.com/ada/scripts/blob/${head}/run.ts#L1-L3`);
    expect(p.view.sel).toBeNull();
    // From the new line on: the committed lines alone.
    toLine(p.app, p.view, 1);
    expect(await after(p, "V", "j", "space", "g", "y")).toBe("copied the web link to line 1 of run.ts");
    expect(p.copied.at(-1)).toBe(`https://github.com/ada/scripts/blob/${head}/run.ts#L1`);
    toLine(p.app, p.view, 1);
    const n = p.copied.length;
    expect(await after(p, "space", "g", "y")).toBe("line 1 isn't committed yet: no web link");
    expect(p.copied.length).toBe(n);
  });

  test("a rendered selection keeps every source line of its last row, selected forward or backward", async () => {
    const { root } = linked("https://github.com/ada/rendered-notes.git");
    writeFileSync(
      join(root, "a.md"),
      "# A\n\nAlpha on the first line,\nbeta ends the first paragraph.\n\nGamma starts another,\ndelta continues it,\nand epsilon ends it.\n",
    );
    git(root, "add", "a.md");
    git(root, "commit", "-qm", "paragraph");
    const head = git(root, "rev-parse", "HEAD").trim();
    git(root, "update-ref", "refs/remotes/origin/feature", "HEAD");
    const p = await at(root, "a.md", 3);
    try {
      await p.app.run("view.mode_read");
      expect(p.view.source || p.view.live).toBeFalsy();
      const rows = p.app.currentLayout(p.view).lines;
      const row = rows.findIndex((l) =>
        l.spans
          .map((s) => s.text)
          .join("")
          .includes("Alpha on the first line"),
      );
      expect(row).toBeGreaterThanOrEqual(0);
      expect(rows[row]!.spans.some((s) => s.src === 4)).toBe(true);
      const lastRow = rows.findIndex((l) =>
        l.spans
          .map((s) => s.text)
          .join("")
          .includes("Gamma starts another"),
      );
      expect(lastRow).toBeGreaterThan(row);
      expect(rows[lastRow]!.spans.some((s) => s.src === 8)).toBe(true);
      p.app.moveCursor(p.view, { row, col: 0 });
      for (const keys of [
        ["v", ...Array<string>(lastRow - row).fill("j"), "$"],
        ["$", "v", ...Array<string>(lastRow - row).fill("k"), "0"],
      ]) {
        expect(await after(p, ...keys, "space", "g", "y")).toBe("copied the web link to lines 3–8 of a.md");
        expect(p.copied.at(-1)).toBe(`https://github.com/ada/rendered-notes/blob/${head}/a.md?plain=1#L3-L8`);
        expect(p.view.sel).toBeNull();
      }
    } finally {
      p.app.quit();
    }
  });

  test("the branch's upstream's remote, GitLab's form; no remote, another host, a file not committed: said, none", async () => {
    const { root, head } = linked("https://codeberg.org/ada/trail.git");
    const p = await at(root, "run.ts", 2);
    expect(await after(p, "space", "g", "y")).toBe(
      "origin isn't on GitHub or GitLab (https://codeberg.org/ada/trail.git): no web link",
    );
    git(root, "remote", "add", "lab", "git@gitlab.com:group/sub/trail.git");
    git(root, "config", "branch.feature.remote", "lab");
    git(root, "update-ref", "refs/remotes/lab/feature", "HEAD");
    expect(await after(p, "space", "g", "y")).toBe("copied the web link to line 2 of run.ts");
    expect(p.copied).toEqual([`https://gitlab.com/group/sub/trail/-/blob/${head}/run.ts#L2`]);
    git(root, "config", "branch.feature.remote", "gone");
    expect(await after(p, "space", "g", "y")).toBe("no remote named gone: no web link");
    git(root, "config", "--unset", "branch.feature.remote");
    git(root, "remote", "set-url", "origin", "git@github.com:ada/maps.git");
    writeFileSync(join(root, "d.md"), "# D\n");
    p.app.open("d.md", { heading: null, headingIndex: 0, offset: 0, line: 1 });
    expect(await after(p, "space", "g", "y")).toBe("d.md isn't committed yet: no web link");
    expect(p.copied).toHaveLength(1);
  });
});

describe("space g w, a line's web link opened", () => {
  /** A browser this machine opens by `xdg-open` (or `open`), faked: what it runs recorded, never run. */
  function opener(app: App, env: Record<string, string> = {}) {
    const ran: string[][] = [];
    app.host.runDetached = async (argv) => (ran.push(argv), 0);
    const saved = { ...process.env };
    const bin = join(sandbox, `bin-${Math.random().toString(36).slice(2)}`);
    mkdirSync(bin);
    for (const p of ["xdg-open", "open", "wslview"]) {
      writeFileSync(join(bin, p), "#!/bin/sh\nexit 0\n");
      chmodSync(join(bin, p), 0o755);
    }
    Object.assign(process.env, { DISPLAY: ":0", SSH_CONNECTION: "", SSH_CLIENT: "", SSH_TTY: "", ...env });
    process.env.PATH = `${bin}:${saved.PATH ?? ""}`;
    const restore = () => {
      for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
      Object.assign(process.env, saved);
    };
    return { ran, restore };
  }

  test("pushed, opened in the browser; not pushed, copied instead and said; over SSH, copied, never opened", async () => {
    const { root, head } = linked("ssh://git@github.com/ada/tools");
    const p = await at(root, "run.ts", 3);
    const link = `https://github.com/ada/tools/blob/${head}/run.ts#L3`;
    const o = opener(p.app);
    try {
      expect(await after(p, "space", "g", "w")).toBe(
        `copied the web link to line 3 of run.ts, not opened — ${head.slice(0, 7)} isn't on origin yet`,
      );
      expect([o.ran, p.copied]).toEqual([[], [link]]);
      git(root, "update-ref", "refs/remotes/origin/feature", "HEAD");
      expect(await after(p, "space", "g", "w")).toBe("the web link to line 3 of run.ts is opening in your browser");
      expect(o.ran).toHaveLength(1);
      expect(o.ran[0]!.at(-1)).toBe(link);
      expect(p.copied).toHaveLength(1);
      process.env.SSH_CONNECTION = "10.0.0.2 50000 10.0.0.1 22";
      expect(await after(p, "space", "g", "w")).toBe(
        "copied the web link to line 3 of run.ts — no browser to open here",
      );
      expect([o.ran.length, p.copied]).toEqual([1, [link, link]]);
    } finally {
      o.restore();
    }
  });

  test("a browser opener failure copies the committed link instead, for a status code or startup error", async () => {
    const { root, head } = linked("https://github.com/ada/browser-failures.git");
    git(root, "update-ref", "refs/remotes/origin/feature", "HEAD");
    const p = await at(root, "run.ts", 2);
    const o = opener(p.app);
    try {
      for (const failure of [9, "could not start"]) {
        p.copied.length = 0;
        o.ran.length = 0;
        p.app.host.runDetached = async (argv) => (o.ran.push(argv), failure);
        const message = await after(p, "space", "g", "w");
        const link = `https://github.com/ada/browser-failures/blob/${head}/run.ts#L2`;
        expect(p.copied).toEqual([link]);
        expect(o.ran).toHaveLength(1);
        expect(o.ran[0]!.at(-1)).toBe(link);
        const name = o.ran[0]![0]!.split("/").at(-1)!;
        const why = typeof failure === "number" ? `${name} exited with ${failure}` : `${name}: ${failure}`;
        expect(message).toBe(`copied the web link to line 2 of run.ts — ${why}`);
        expect(p.app.messages.some((m) => m.text.includes("is opening in your browser"))).toBe(false);
      }
    } finally {
      o.restore();
      p.app.quit();
    }
  });
});
