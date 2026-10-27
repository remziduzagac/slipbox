import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { makeSandbox, harness, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
const sandbox = makeSandbox();

describe("branches (26.5)", () => {
  const git = (cwd: string, ...args: string[]) =>
    new TextDecoder().decode(
      Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]).stdout,
    );
  /** main and feat: a.md the same on both, b.md not. */
  const repo = () => {
    const root = mkdtempSync(join(sandbox, "branches-"));
    mkdirSync(join(root, ".slipbox"));
    writeFileSync(join(root, ".gitignore"), ".slipbox/\n");
    writeFileSync(join(root, "a.md"), "a\n");
    writeFileSync(join(root, "b.md"), "b on main\n");
    git(root, "init", "-q", "-b", "main");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "start");
    git(root, "switch", "-q", "-c", "feat");
    writeFileSync(join(root, "b.md"), "b on feat\n");
    git(root, "commit", "-q", "-am", "feat's b");
    git(root, "switch", "-q", "main");
    return git(root, "rev-parse", "HEAD") ? root : null;
  };
  const branch = (root: string) => git(root, "branch", "--show-current").trim();
  const list = (h: Harness) => h.app.overlay as ListOverlay;
  const type = (s: string) => [...s].map((ch) => (ch === " " ? "space" : ch));
  /** A checkout runs in the background (a big tree takes a while): `root` on `name` once it's done. */
  const on = async (root: string, name: string) => {
    for (const t = Date.now(); branch(root) !== name && Date.now() - t < 10_000; ) await Bun.sleep(20);
    return branch(root);
  };
  /** The last message once one matching `text` has come. */
  const said = async (h: Harness, text: RegExp) => {
    for (const t = Date.now(); !text.test(h.app.messages.at(-1)?.text ?? "") && Date.now() - t < 10_000; )
      await Bun.sleep(20);
    return h.app.messages.at(-1)?.text ?? "";
  };

  test("the branches, this one marked; one checked out; a new one made from here; a name git won't take, said", async () => {
    const root = repo();
    if (!root) return;
    const h = await harness({ root, open: "a.md", width: 120, height: 40 });
    await h.app.run("git.branches");
    expect(list(h).items.map((i) => [i.label, i.detail])).toEqual([
      ["feat", ""],
      ["main", "here"],
      ["A new branch from here…", "from main"],
    ]);
    expect(list(h).selected).toBe(1);
    await h.keys("up", "enter");
    expect(await on(root, "feat")).toBe("feat");
    expect(await said(h, /^switched to branch feat/)).toStartWith("switched to branch feat");
    // Already there: said.
    await h.app.run("git.branches");
    await h.keys("enter");
    expect(h.app.messages.at(-1)?.text).toBe("already on feat");
    // A new one, from here.
    await h.app.run("git.branches");
    await h.keys("down", "down", "enter", ...type("topic"), "enter");
    expect(await on(root, "topic")).toBe("topic");
    await h.app.run("git.branches");
    // Three branches now, topic selected: the new-branch row is the next.
    await h.keys("down", "enter", ...type("bad name"), "enter");
    expect(await said(h, /bad name/)).toBe(`git: "bad name" isn't a name git takes for a branch`);
    expect(branch(root)).toBe("topic");
  });

  test("unsaved notes first: saved, or kept as typed, or nothing done; git refusing a switch says why", async () => {
    const root = repo();
    if (!root) return;
    const h = await harness({ root, open: "a.md", width: 120, height: 40 });
    const a = h.app.view!.buf;
    a.edit(0, 0, "edited ");
    await h.app.run("git.branches");
    await h.keys("up", "enter");
    expect(list(h).title).toBe("Unsaved: a.md");
    expect(list(h).items.map((i) => i.label)).toEqual([
      "Save them, then switch",
      "Switch, keeping them unsaved",
      "Cancel",
    ]);
    // Cancel: nothing.
    await h.keys("down", "down", "enter");
    expect(branch(root)).toBe("main");
    // Kept: switched, the note as typed.
    await h.app.run("git.branches");
    await h.keys("up", "enter", "down", "enter");
    expect(await on(root, "feat")).toBe("feat");
    expect([a.dirty, a.source]).toEqual([true, "edited a\n"]);
    // Saved, then switched: the change goes along (git keeps it, b.md not touched).
    await h.app.run("git.branches");
    await h.keys("down", "enter", "enter");
    expect(await on(root, "main")).toBe("main");
    expect(a.dirty).toBe(false);
    expect(readFileSync(join(root, "a.md"), "utf8")).toBe("edited a\n");
    // b.md changed here, and different on feat: git won't switch, and says why.
    writeFileSync(join(root, "b.md"), "mine\n");
    await h.app.run("git.branches");
    await h.keys("up", "enter");
    expect(await said(h, /^git: /)).toMatch(/^git: Your local changes to the following files would be overwritten/);
    expect(branch(root)).toBe("main");
  });
});
