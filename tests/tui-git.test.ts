// Source control in the TUI, driven headlessly as tests/tui.test.ts drives the rest (the harness:
// tests/tui-harness.ts): git's worktrees; marks, what changed, a note's diff, conflicts; the diff window; the
// review, the merge screen, pull and rebase.

import { describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, delimiter, dirname, join, relative } from "node:path";
import { type ListOverlay, App } from "../src/tui/app.ts";
import type { Line } from "../src/core/layout/ir.ts";
import { stringWidth } from "../src/core/foundation/text/width.ts";
import { makeSandbox, makeVault, harness, onlyRootsUnder, statusRow, topRow, type Harness } from "./tui-harness.ts";

const sandbox = makeSandbox();

describe("git worktrees in the TUI (17.19)", () => {
  const git = (cwd: string, ...args: string[]) =>
    Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]);
  /** project/x, a vault and its repository, and two worktrees of it in project/worktrees/x/. */
  const layout = () => {
    const base = mkdtempSync(join(sandbox, "wt-"));
    const x = join(base, "project", "x");
    mkdirSync(join(x, ".slipbox"), { recursive: true });
    writeFileSync(
      join(x, ".slipbox", "config.toml"),
      `[vault]\nid = "wt${base.slice(-6).replace(/[^a-z0-9]/gi, "")}"\nname = "wtx${base.slice(-6).replace(/[^a-z0-9]/gi, "")}"\n`,
    );
    writeFileSync(join(x, "index.md"), "# X\n");
    if (git(x, "init", "-q", "-b", "main").exitCode !== 0) return null;
    git(x, "add", "-A");
    git(x, "commit", "-q", "-m", "x");
    const wts = join(base, "project", "worktrees", "x");
    for (const b of ["feat", "fix"])
      if (git(x, "worktree", "add", "-q", "-b", b, join(wts, b)).exitCode !== 0) return null;
    return { base, x, wts };
  };

  test("the top bar: the vault's name and its branch, a worktree names its vault and branch once (VB-D3); :folders groups its repository", async () => {
    const l = layout();
    if (!l) return;
    const width = 2 * stringWidth(l.wts) + 100; // room for full location items, independent of the temp prefix
    const main = await harness({ root: l.x, open: "index.md", width });
    const name = main.app.loc.name!;
    expect(topRow(main.frame())).toContain(`◈ ${name} │ ⎇ main`);
    expect(topRow(main.frame()).match(/⎇/g)).toHaveLength(1);
    expect(statusRow(main.frame())).not.toContain(name); // said once (WSP-D5)
    const feat = await harness({ root: join(l.wts, "feat"), open: "index.md", width });
    expect(topRow(feat.frame())).toContain(`◈ ${name} │ ⎇ feat`);
    expect(topRow(feat.frame()).match(/⎇/g)).toHaveLength(1);
    await harness({ root: join(l.wts, "fix"), open: "index.md", width }); // seen too
    // From elsewhere: :folders lists it once, by its name — its worktrees are its branches, not copies (21.6).
    const { tildePath } = await import("../src/core/names.ts");
    const other = await harness({ open: "index.md", width });
    await other.app.run("folders.open");
    const items = (other.app.overlay as ListOverlay).items.filter((i) => i.label === name && i.header);
    expect(items.map((i) => i.detail)).toEqual([tildePath(l.x)]);
    expect((other.app.overlay as ListOverlay).items.some((item) => item.label === "main" && item.indent === 1)).toBe(
      true,
    );
    // A checkout switched to another branch: the top bar follows it.
    git(join(l.wts, "feat"), "checkout", "-q", "-b", "feat-2");
    expect(topRow(feat.frame())).toContain(`${name} │ ⎇ feat-2`);
  });

  test("a second copy of a folder opened: which one links to its name open — asked once, remembered; dismissed, the first stays (21.6)", async () => {
    const { readFolders, recordFolder } = await import("../src/core/folders.ts");
    const copies = (tag: string) => {
      const id = basename(mkdtempSync(join(sandbox, "cp-")))
        .replace(/[^a-z0-9]/gi, "")
        .toLowerCase();
      const name = `${tag}${id.slice(-6)}`;
      const mk = () => {
        const dir = mkdtempSync(join(sandbox, `${tag}-`));
        mkdirSync(join(dir, ".slipbox"));
        writeFileSync(join(dir, ".slipbox", "config.toml"), `[vault]\nid = "${id}"\nname = "${name}"\n`);
        writeFileSync(join(dir, "n.md"), "# N\n");
        return dir;
      };
      return { name, a: mk(), b: mk() };
    };
    const { name, a, b } = copies("pick");
    recordFolder(a);
    const h = await harness({ root: b, open: "n.md" });
    const o = h.app.overlay as ListOverlay;
    expect(o.title).toBe(`${name}: 2 copies on this machine — which do links to it open?`);
    expect(o.items.map((i) => [i.label, i.hint])).toEqual([
      [a, "links open it now"],
      [b, undefined],
    ]);
    await h.keys("down", "enter");
    expect(readFolders().find((f) => f.name === name)).toMatchObject({ default: b, asked: true });
    expect(h.app.messages.at(-1)!.text).toBe(`links to ${name} open ${b}`);
    // Opened again, either copy: not asked.
    expect((await harness({ root: a, open: "n.md" })).app.overlay).toBeNull();
    // Dismissed: the first found stays the one, and it isn't asked again.
    const d = copies("esc");
    recordFolder(d.a);
    const e = await harness({ root: d.b, open: "n.md" });
    expect((e.app.overlay as ListOverlay).title).toContain("which do links to it open?");
    await e.keys("escape");
    expect(readFolders().find((f) => f.name === d.name)).toMatchObject({ default: d.a, asked: true });
    expect((await harness({ root: d.b, open: "n.md" })).app.overlay).toBeNull();
    // To be asked, but one copy gone since: nothing to choose between — not asked.
    const g = copies("gone");
    recordFolder(g.a);
    expect(recordFolder(g.b)?.ask).toBe(true);
    rmSync(g.a, { recursive: true });
    expect((await harness({ root: g.b, open: "n.md" })).app.overlay).toBeNull();
  });

  test("named folders' words (21.10): :folders goes into one; :folders-default sets the copy links open; :name names a repository; :open takes a pointer", async () => {
    const { readFolders, recordFolder } = await import("../src/core/folders.ts");
    const { tildePath } = await import("../src/core/names.ts");
    const tag = basename(mkdtempSync(join(sandbox, "wd-")))
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
    const mk = () => {
      const d = join(mkdtempSync(join(sandbox, "wd-f-")), `f${tag}`);
      mkdirSync(join(d, ".slipbox"), { recursive: true });
      writeFileSync(join(d, ".slipbox", "config.toml"), `[vault]\nid = "f${tag}"\nname = "f${tag}"\n`);
      writeFileSync(join(d, "n.md"), "# N there\n");
      recordFolder(d);
      return d;
    };
    const one = mk();
    const two = mk();
    const repo = mkdtempSync(join(sandbox, "wd-r-"));
    mkdirSync(join(repo, ".git"));
    writeFileSync(join(repo, "r.md"), "# R\n");
    const h = await harness({ root: repo, open: "r.md" });
    expect(h.app.overlay).toBeNull();
    await h.app.run("folders.open");
    const list = h.app.overlay as ListOverlay;
    const at = list.items.findIndex((item) => (item.data as { root?: string } | null)?.root === one);
    expect(
      list.items
        .filter((item) => item.label === `f${tag}`)
        .map((item) => item.detail)
        .sort(),
    ).toEqual([tildePath(one), tildePath(two)].sort());
    expect(list.items[at]).toMatchObject({ detail: tildePath(one) });
    list.selected = at;
    await h.keys("enter");
    // Into the selected copy; pointer-copy preference is asked independently, once (21.6).
    expect(h.app.loc.root).toBe(one);
    expect((h.app.overlay as ListOverlay).title).toBe(`f${tag}: 2 copies on this machine — which do links to it open?`);
    await h.keys("escape");
    // Chosen later: :folders-default.
    await h.app.run("folders.default");
    expect((h.app.overlay as ListOverlay).title).toBe(`f${tag}: which copy do links open?`);
    expect((h.app.overlay as ListOverlay).items.map((i) => [i.label, i.hint])).toEqual([
      [tildePath(one), "links open it"],
      [tildePath(two), undefined],
    ]);
    await h.keys("down", "enter");
    expect(readFolders().find((f) => f.name === `f${tag}`)?.default).toBe(two);
    // Back to the repository: named, a .slipbox/ to hold it.
    await h.app.run("history.back");
    expect(h.app.loc.root).toBe(repo);
    await h.app.run(`folder.name r${tag}`);
    expect(readFileSync(join(repo, ".slipbox", "config.toml"), "utf8")).toContain(`name = "r${tag}"`);
    expect(h.app.messages.at(-1)!.text).toContain(`is named r${tag}`);
    expect(h.app.loc.name).toBe(`r${tag}`); // shown by it from now on
    expect(topRow(h.frame())).toContain(`r${tag}`);
    // :open with a pointer: the note in the copy links open.
    await h.app.run(`note.open slipbox://f${tag}/n.md`);
    expect(h.app.view!.buf.abs).toBe(join(two, "n.md"));
  });

  test(":folders-default offers a repository's every copy, a clone with a .slipbox/ name of its own too (DF-D30)", async () => {
    const { readFolders, recordFolder } = await import("../src/core/folders.ts");
    const { tildePath } = await import("../src/core/names.ts");
    const tag = basename(mkdtempSync(join(sandbox, "dc-")))
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
    const mk = (name: string) => {
      const d = mkdtempSync(join(sandbox, "dc-r-"));
      mkdirSync(join(d, ".slipbox"));
      writeFileSync(join(d, ".slipbox", "config.toml"), `[vault]\nid = "${name}"\nname = "${name}"\n`);
      mkdirSync(join(d, ".git", "info"), { recursive: true });
      writeFileSync(
        join(d, ".git", "config"),
        `[core]\n\tbare = false\n[remote "origin"]\n\turl = https://github.com/labs/r${tag}\n`,
      );
      writeFileSync(join(d, "n.md"), "# N\n");
      recordFolder(d);
      return d;
    };
    const repo = mk(`r${tag}`);
    const clone = mk(`r${tag}-spike`);
    const h = await harness({ root: repo, open: "n.md" });
    await h.app.run("folders.default");
    const list = h.app.overlay as ListOverlay;
    expect(list.title).toBe(`r${tag}: which copy do links open?`);
    expect(list.items.map((i) => [i.label, i.hint])).toEqual([
      [tildePath(repo), "links open it"],
      [tildePath(clone), undefined],
    ]);
    await h.keys("down", "enter");
    expect(readFolders().find((f) => f.name === `r${tag}`)?.default).toBe(clone);
    expect(h.app.messages.at(-1)!.text).toBe(`links to r${tag} open ${tildePath(clone)}`);
  });

  test("repairs (21.11): a batch of moves made elsewhere offers the relink once; a folder named the old way says so, its pointer written by a code action", async () => {
    const { recordFolder } = await import("../src/core/folders.ts");
    const tag = basename(mkdtempSync(join(sandbox, "rp-")))
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
    const research = join(mkdtempSync(join(sandbox, "rp-r-")), `research${tag}`);
    mkdirSync(join(research, ".slipbox"), { recursive: true });
    writeFileSync(join(research, ".slipbox", "config.toml"), `[vault]\nid = "r${tag}"\nname = "research${tag}"\n`);
    mkdirSync(join(research, "algorithms"));
    writeFileSync(join(research, "algorithms", "dijkstra.md"), "# Dijkstra\n\n## Proof\n");
    recordFolder(research);
    const root = mkdtempSync(join(sandbox, "rp-a-"));
    mkdirSync(join(root, ".slipbox"));
    mkdirSync(join(root, "old"));
    writeFileSync(join(root, "old", "plan.md"), "# Plan\n\nThe plan, long enough to be told by its text.\n");
    writeFileSync(join(root, "Meeting: Q3.md"), "# Q3\n");
    writeFileSync(
      join(root, "a.md"),
      `# A\n\n[plan](old/plan.md) [d](research${tag}:algorithms/dijkstra.md) [[research${tag}:dijkstra#Proof|D]] [[Meeting: Q3]] [[zz${tag}:thing]]\n\n[far](${relative(root, join(research, "algorithms", "dijkstra.md"))})\n`,
    );
    const h = await harness({ root, open: "a.md" });
    // Moved elsewhere (a file manager): one batch, gone and come with the same text.
    mkdirSync(join(root, "new"));
    renameSync(join(root, "old", "plan.md"), join(root, "new", "plan.md"));
    h.app.watch.applyChanges({
      changes: [
        { rel: "old/plan.md", kind: "deleted", isNote: true },
        { rel: "new/plan.md", kind: "created", isNote: true },
      ],
      rescan: false,
    });
    expect(
      h.app.messages.some(
        (m) => m.text === "old/plan.md moved to new/plan.md: 1 line of links broke — the relink, to look over",
      ),
    ).toBe(true);
    const preview = (h.app.overlay as ListOverlay).items.map((i) => `${i.label} ${i.detail ?? ""}`).join("\n");
    expect(preview).toContain("a.md:3");
    expect(preview).toContain("new/plan.md");
    expect(preview).not.toContain("slipbox://"); // the moves' fixes only: no pointer offered unasked
    await h.keys("escape");
    // The old forms: not links, said — `Meeting: Q3` is a note's name, a link.
    const links = h.app.graph.linksOf("a.md").map((l) => [l.target, l.resolvedKind, l.suggest ?? null]);
    expect(links.slice(1)).toEqual([
      [`research${tag}:algorithms/dijkstra.md`, "unresolved", `slipbox://research${tag}/algorithms/dijkstra.md`],
      [`research${tag}:dijkstra`, "unresolved", `slipbox://research${tag}/algorithms/dijkstra.md`],
      ["Meeting: Q3", "note", null],
      [`zz${tag}:thing`, "unresolved", null], // no folder of that name: nothing to say of it
      [relative(root, join(research, "algorithms", "dijkstra.md")), "note", null],
    ]);
    expect(h.app.graph.linksOf("a.md")[4]!.reason).toBeUndefined();
    await h.keys("g", "g", "tab", "tab", "enter");
    expect(h.app.messages.at(-1)!.text).toBe(
      `research${tag}:algorithms/dijkstra.md names a folder the old way — not a link; slipbox://research${tag}/algorithms/dijkstra.md is (space c a writes it)`,
    );
    // Written by the code actions: each a pointer, a markdown link.
    await h.app.run("lsp.code_action");
    expect((h.app.overlay as ListOverlay).items.map((i) => i.label)).toEqual([
      `Write its pointer: slipbox://research${tag}/algorithms/dijkstra.md`,
      `Write its pointer: slipbox://research${tag}/algorithms/dijkstra.md`,
    ]);
    await h.keys("enter");
    await h.app.run("lsp.code_action");
    await h.keys("enter");
    expect(readFileSync(join(root, "a.md"), "utf8")).toStartWith(
      `# A\n\n[plan](old/plan.md) [d](slipbox://research${tag}/algorithms/dijkstra.md) [D](slipbox://research${tag}/algorithms/dijkstra.md#proof) [[Meeting: Q3]]`,
    );
  });

  test("a fragile link: the status line says how it landed; a code action names it for sure; a nearer namesake is said", async () => {
    const root = mkdtempSync(join(sandbox, "fragile-"));
    mkdirSync(join(root, ".obsidian"));
    for (const [rel, text] of Object.entries({
      "Home.md": "# Home\n\nSee [[Pie]] now.\n",
      "Recipes/Baking/Pie.md": "# P\n",
      "Archive/Old/Older/Pie.md": "# P2\n",
    })) {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), text);
    }
    const h = await harness({ root, open: "Home.md", width: 160 });
    await h.keys("g", "g", "tab");
    expect(statusRow(h.frame())).toContain("→ [[Pie]] (resolved, the shortest path of 2 named so)");
    // A nearer Pie, from outside (an agent's): said.
    writeFileSync(join(root, "Pie.md"), "# P3\n");
    h.app.graph.updateFile("Pie.md", { rel: "Pie.md", abs: join(root, "Pie.md"), size: 5, mtimeMs: Date.now() });
    expect(h.app.messages.at(-1)!.text).toBe("[[Pie]] in Home.md reaches Pie.md now, not Recipes/Baking/Pie.md");
    h.app.graph.removeFile("Pie.md");
    // Named for sure, from the code actions (no server for a note: slipbox's own).
    await h.app.run("lsp.code_action");
    const o = h.app.overlay as ListOverlay;
    expect(o.items.map((i) => [i.label, i.hint])).toEqual([["Name it for sure: [[Recipes/Baking/Pie]]", "slipbox"]]);
    await h.keys("enter");
    expect(readFileSync(join(root, "Home.md"), "utf8")).toBe("# Home\n\nSee [[Recipes/Baking/Pie]] now.\n");
  });

  test("fragments followed as a link finds them: GitHub's #setup-1, a heading path, an <a id> in the same note", async () => {
    const root = mkdtempSync(join(sandbox, "frag-"));
    mkdirSync(join(root, ".slipbox"));
    writeFileSync(join(root, "n.md"), "# N\n\n## Setup\n\none\n\n## Setup\n\ntwo\n\n## Install\n\n### Linux\n\nlx\n");
    writeFileSync(
      join(root, "a.md"),
      '# A\n\n[second](n.md#setup-1) [[n#Install#Linux]] [faq](#faq)\n\nfiller\n\n<a id="faq"></a>\n\nQ and A.\n',
    );
    const h = await harness({ root, open: "a.md" });
    const src = () => h.app.currentLayout(h.app.view!).lines[h.app.view!.cur.row]!.src;
    await h.keys("g", "g", "tab", "enter");
    expect(h.app.view!.buf.rel).toBe("n.md");
    expect(src()).toBe(7);
    await h.keys("ctrl+o", "g", "g", "tab", "tab", "enter");
    expect(h.app.view!.buf.rel).toBe("n.md");
    expect(src()).toBe(13);
    await h.keys("ctrl+o", "g", "g", "tab", "tab", "tab", "enter");
    expect(h.app.view!.buf.rel).toBe("a.md");
    expect(src()).toBe(7); // the anchor's own line
  });

  test("a heading or block that isn't there opens the note at its top, not where it was left, and says which", async () => {
    const root = mkdtempSync(join(sandbox, "frag-"));
    mkdirSync(join(root, ".slipbox"));
    writeFileSync(join(root, "n.md"), `# N\n\n${"filler\n\n".repeat(40)}## Setup\n\nthe end ^here\n`);
    writeFileSync(
      join(root, "a.md"),
      "# A\n\n[gone](n.md#nowhere) [no](n.md#^none) [[n#Nowhere]] [[n#^none]] [here](n.md#^here)\n",
    );
    const h = await harness({ root, open: "n.md", height: 20 });
    const src = () => h.app.currentLayout(h.app.view!).lines[h.app.view!.cur.row]!.src;
    const follow = async (nth: number) => {
      // n.md read to its end, and left there.
      h.app.open("n.md");
      await h.keys("G");
      expect(src()).toBeGreaterThan(80);
      h.app.open("a.md");
      await h.keys("g", "g", ...Array<string>(nth).fill("tab"), "enter");
      expect(h.app.view!.buf.rel).toBe("n.md");
      return { line: src(), said: h.app.messages.at(-1)?.text };
    };
    expect(await follow(1)).toEqual({ line: 1, said: 'no heading "nowhere" in n.md: opened at its top' });
    expect(await follow(2)).toEqual({ line: 1, said: "no block ^none in n.md: opened at its top" });
    expect(await follow(3)).toEqual({ line: 1, said: 'no heading "Nowhere" in n.md: opened at its top' });
    expect(await follow(4)).toEqual({ line: 1, said: "no block ^none in n.md: opened at its top" });
    expect((await follow(5)).line).toBe(85); // a block that is there: its line
  });

  test("a pointer followed (21.7): into another named folder, at its heading; by an old name, said; two folders of the name, picked — or one renamed", async () => {
    const { recordFolder } = await import("../src/core/folders.ts");
    const tag = basename(mkdtempSync(join(sandbox, "pt-")))
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
    const named = (name: string, files: Record<string, string>, extra = "") => {
      const dir = join(mkdtempSync(join(sandbox, "ptr-")), name);
      mkdirSync(join(dir, ".slipbox"), { recursive: true });
      writeFileSync(
        join(dir, ".slipbox", "config.toml"),
        `[vault]\nid = "${basename(dirname(dir)).replace(/[^a-z0-9]/gi, "")}"\nname = "${name}"\n${extra}`,
      );
      for (const [rel, text] of Object.entries(files)) writeFileSync(join(dir, rel), text);
      recordFolder(dir);
      return dir;
    };
    const b = named(`b${tag}`, { "x.md": "# X\n\nfirst\n\n## Top\n\nunder top\n" }, `previous_names = ["old${tag}"]\n`);
    const twin1 = named(`twin${tag}`, { "t.md": "# T1\n" });
    named(`twin${tag}`, { "t.md": "# T2\n" });
    const a = named(`a${tag}`, {
      "a.md": `# A\n\n[to](slipbox://b${tag}/x.md#Top) [old](slipbox://old${tag}/x.md) [twin](slipbox://twin${tag}/t.md) [gone](slipbox://none${tag}/x.md)\n`,
    });
    const h = await harness({ root: a, open: "a.md" });
    await h.keys("tab", "enter");
    // Read in a peek (VV-D7), at the heading; o goes there.
    expect(h.app.floating?.kind).toBe("peek");
    expect(h.app.currentLayout(h.app.view!).lines[h.app.view!.cur.row]!.src).toBe(5);
    await h.keys("o");
    expect(h.app.loc.root).toBe(b);
    expect(h.app.view!.buf.rel).toBe("x.md");
    expect(h.app.currentLayout(h.app.view!).lines[h.app.view!.cur.row]!.src).toBe(5); // at ## Top
    // An old name: there, and said so.
    const h2 = await harness({ root: a, open: "a.md" });
    await h2.keys("g", "g", "tab", "tab", "enter"); // from the top: its reading position is kept
    expect(h2.app.view!.buf.abs).toBe(join(b, "x.md"));
    expect(h2.app.messages.some((m) => m.text === `slipbox://old${tag}/x.md reached b${tag} by a name it had`)).toBe(
      true,
    );
    // Two different folders of one name: each, and renaming one — the parent folder's name its prefix.
    const h3 = await harness({ root: a, open: "a.md" });
    await h3.keys("g", "g", "tab", "tab", "tab", "enter");
    const o = h3.app.overlay as ListOverlay;
    expect(o.title).toBe(`twin${tag}: 2 different folders have this name — which is meant?`);
    expect(o.items.map((i) => i.label).filter((l) => l.startsWith("Rename"))).toHaveLength(2);
    await h3.keys("enter");
    expect(h3.app.view!.buf.abs).toBe(join(twin1, "t.md"));
    const h4 = await harness({ root: a, open: "a.md" });
    await h4.keys("g", "g", "tab", "tab", "tab", "enter");
    const at = (h4.app.overlay as ListOverlay).items.findIndex((i) => i.label === `Rename ${twin1}'s name…`);
    h4.app.overlay && ((h4.app.overlay as ListOverlay).selected = at);
    await h4.keys("enter");
    expect(h4.app.overlay?.kind).toBe("prompt");
    // Not on this machine: why — no new note by a pointer's name.
    const h5 = await harness({ root: a, open: "a.md" });
    await h5.keys("g", "g", "tab", "tab", "tab", "tab", "enter");
    expect(h5.app.messages.at(-1)!.text).toBe(
      `slipbox://none${tag}/x.md: none${tag} isn't on this machine yet: open it, or let the index find it`,
    );
    expect(h5.app.overlay).toBeNull();
    expect((h4.app.overlay as import("../src/tui/app.ts").PromptOverlay).text).toBe(
      `${basename(dirname(twin1)).replace(/[^\p{L}\p{N}._-]/gu, "")}-twin${tag}`,
    );
  });

  test("a pointer to a branch not checked out here (21.7): the file as git has it there, read-only, in the floating window", async () => {
    const repo = join(mkdtempSync(join(sandbox, "ptr-git-")), "repo");
    mkdirSync(repo);
    const git = (...args: string[]) =>
      Bun.spawnSync(["git", "-c", "user.email=t@t", "-c", "user.name=t", "-c", "init.defaultBranch=main", ...args], {
        cwd: repo,
      }).exitCode;
    if (git("init", "-q") !== 0) return;
    const tag = basename(dirname(repo))
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
    git("remote", "add", "origin", `git@github.com:me/r${tag}.git`);
    writeFileSync(join(repo, "x.md"), "# On main\n");
    writeFileSync(join(repo, "a.md"), `[draft](slipbox://r${tag}@draft/x.md)\n`);
    git("add", ".");
    git("commit", "-qm", "main");
    git("checkout", "-qb", "draft");
    writeFileSync(join(repo, "x.md"), "# Drafted, on its branch\n");
    git("commit", "-qam", "draft");
    git("checkout", "-q", "main");
    const h = await harness({ root: repo, open: "a.md" });
    await h.keys("tab", "enter");
    expect(h.app.floating?.kind).toBe("hover");
    expect(h.app.floating?.title).toBe("x.md on draft, read-only from git");
    expect(h.app.floating?.view.buf.source).toBe("# Drafted, on its branch\n");
    expect(h.app.tabs.flatMap((t) => t.views.map((v) => v.buf.rel))).toEqual(["a.md"]); // nothing opened
  });

  test("a named folder opened where it was moved by hand: its state along, said once, nothing asked (21.8)", async () => {
    const { PositionStore } = await import("../src/core/position.ts");
    const { locateVault, recordLocation } = await import("../src/core/vault.ts");
    const { tildePath } = await import("../src/core/names.ts");
    const dir = join(mkdtempSync(join(sandbox, "mv-")), "mva");
    const tag = `mva${basename(dirname(dir))
      .slice(-6)
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase()}`;
    mkdirSync(join(dir, ".slipbox"), { recursive: true });
    writeFileSync(join(dir, ".slipbox", "config.toml"), `[vault]\nid = "${tag}"\nname = "${tag}"\n`);
    writeFileSync(join(dir, "n.md"), "# N\n\none\n\ntwo\n");
    await onlyRootsUnder(dirname(dir), async () => {
      const first = locateVault({ path: dir });
      recordLocation(first); // opened there once
      const ps = new PositionStore(first);
      ps.set("n.md", { heading: null, headingIndex: 0, offset: 0, line: 5 });
      ps.save();
      const moved = join(dirname(dir), "elsewhere");
      renameSync(dir, moved);
      const h = await harness({ loc: locateVault({ path: moved }), open: "n.md" });
      expect(h.app.overlay).toBeNull(); // sure, so nothing asked
      expect(
        h.app.messages.some((m) =>
          m.text.startsWith(
            `${tag} moved here from ${tildePath(dir)}: its workspaces, scratch, trash and reading positions came along`,
          ),
        ),
      ).toBe(true);
      expect(new PositionStore(h.app.loc).get("n.md")?.line).toBe(5);
      const again = await harness({ loc: locateVault({ path: moved }), open: "n.md" });
      expect(again.app.messages.some((m) => m.text.includes("moved here"))).toBe(false);
    });
  });

  test("trust (23.x): asked once, when it first matters — never over another window, never mid-typing; y trusts, remembered; :untrust and :trust after", async () => {
    const { setTrust, trustOf } = await import("../src/core/trust.ts");
    const h = await harness({ open: "index.md" });
    const root = h.app.loc.root;
    try {
      // Another window open: the question waits for it to close, then for a key.
      await h.keys(":");
      h.app.languages.askTrust(join(root, "src"), ["fake without the project's code"]);
      expect((h.app.overlay as { label?: string } | null)?.label ?? "").not.toContain("Trust");
      await h.keys("escape");
      // Typing: a typed n is text, never an answer.
      await h.keys("i");
      expect(h.app.view!.insert).toBe(true);
      await h.keys("n");
      expect(h.app.overlay).toBeNull();
      await h.keys("escape", "escape", "j");
      // About the root opened, not the project in it the server was for (src/): one answer for all of it.
      expect((h.app.overlay as { label: string }).label).toBe(
        `Trust ${root}? Its own tools would run code it holds — fake without the project's code. Only a folder you know (y trusts it; n keeps it safe)`,
      );
      // Its servers started again, trusted: a stand-in manager says which root.
      const restarted: string[] = [];
      const app = h.app.languages as unknown as { servers: unknown };
      const said = { restartUnder: (r: string) => restarted.push(r) } as Record<string | symbol, unknown>;
      app.servers = new Proxy(said, { get: (t, k) => (k in t ? t[k] : () => undefined) }); // the rest: nothing
      await h.keys("y");
      app.servers = null;
      expect(restarted).toEqual([root]);
      expect(trustOf(root)).toBe("trusted");
      expect(h.app.messages.at(-1)!.text).toContain(
        `: its own tools run as they would anywhere — :untrust takes it back`,
      );
      // Answered: never asked again.
      h.app.languages.askTrust(root, ["x"]);
      expect(h.app.overlay).toBeNull();
      await h.app.run("root.untrust");
      expect(trustOf(root)).toBe("restricted");
      await h.app.run("root.trust");
      expect(trustOf(root)).toBe("trusted");
    } finally {
      setTrust(root, null);
    }
  });

  test("started from the command line where a named folder was moved by hand: the start records it once, the App says so (21.8)", async () => {
    const { locateVault, recordLocation } = await import("../src/core/vault.ts");
    const { prepare } = await import("../src/tui/run.ts");
    const dir = join(mkdtempSync(join(sandbox, "mvs-")), "mvs");
    const tag = `mvs${basename(dirname(dir))
      .slice(-6)
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase()}`;
    mkdirSync(join(dir, ".slipbox"), { recursive: true });
    writeFileSync(join(dir, ".slipbox", "config.toml"), `[vault]\nid = "${tag}"\nname = "${tag}"\n`);
    writeFileSync(join(dir, "n.md"), "# N\n");
    await onlyRootsUnder(dirname(dir), async () => {
      recordLocation(locateVault({ path: dir }));
      const moved = join(dirname(dir), "elsewhere");
      renameSync(dir, moved);
      // What `slipbox <path>` does before the screen is taken: the move found there, and passed on.
      const start = prepare([join(moved, "n.md")]);
      if (typeof start === "number") throw new Error(`exit ${start}`);
      expect(start.recorded?.carriedFrom).toBe(dir);
      const app = new App({ ...start, watch: false, host: { requestRender() {}, osc52: () => true, quit: () => {} } });
      expect(app.messages.some((m) => m.text.startsWith(`${tag} moved here from `))).toBe(true);
    });
  });

  test("the start (prepare): a path that isn't there said in a line, exit 3; a note opens in its vault, the flags passed on; a folder, the view at it (VV-D5)", async () => {
    const { prepare } = await import("../src/tui/run.ts");
    const said: string[] = [];
    const write = process.stderr.write;
    process.stderr.write = ((s: string) => (said.push(s), true)) as typeof process.stderr.write;
    let missing: ReturnType<typeof prepare>;
    try {
      missing = prepare([join(sandbox, "no-such-place", "x.md")]);
    } finally {
      process.stderr.write = write;
    }
    expect(missing).toBe(3);
    expect(said).toEqual([`slipbox: no such file or directory: ${join(sandbox, "no-such-place", "x.md")}\n`]);
    const root = makeVault();
    const start = prepare([join(root, "notes", "alpha.md"), "--theme", "nord"]);
    if (typeof start === "number") throw new Error(`exit ${start}`);
    expect(start.loc.root).toBe(root);
    expect(start.open).toBe(join(root, "notes", "alpha.md"));
    expect(start.themeName).toBe("nord");
    expect(start.folder).toBeUndefined();
    expect(start.graph.notes.has("notes/alpha.md")).toBe(true);
    const loose = mkdtempSync(join(sandbox, "loose-"));
    writeFileSync(join(loose, "a.md"), "# A\n");
    const folder = prepare([loose]);
    if (typeof folder === "number") throw new Error(`exit ${folder}`);
    expect(folder.loc.mode).toBe("folder");
    expect(folder.open).toBeNull();
    expect(folder.folder).toBe(loose);
  });

  test("a named folder moved by hand: the links its move broke, their fix previewed at once (20.17, 21.8)", async () => {
    const { locateVault, recordLocation } = await import("../src/core/vault.ts");
    const base = mkdtempSync(join(sandbox, "mvfix-"));
    const a = join(base, "v");
    mkdirSync(join(a, ".slipbox"), { recursive: true });
    writeFileSync(
      join(a, ".slipbox", "config.toml"),
      `[vault]\nid = "${basename(base).replace(/[^a-z0-9]/gi, "")}"\nname = "mvfix${basename(base)
        .slice(-6)
        .replace(/[^a-z0-9]/gi, "")}"\n`,
    );
    writeFileSync(join(a, "n.md"), "# N\n\n[s](../shared.md)\n");
    writeFileSync(join(base, "shared.md"), "# Shared\n");
    await onlyRootsUnder(base, async () => {
      recordLocation(locateVault({ path: a }));
      const moved = join(base, "deep", "v");
      mkdirSync(dirname(moved), { recursive: true });
      renameSync(a, moved);
      const h = await harness({ loc: locateVault({ path: moved }), open: "n.md" });
      expect(h.app.overlay?.kind).toBe("list");
      expect(JSON.stringify((h.app.overlay as ListOverlay).items)).toContain("../../shared.md");
      await h.keys("enter"); // applied
      expect(readFileSync(join(moved, "n.md"), "utf8")).toBe("# N\n\n[s](../../shared.md)\n");
    });
  });

  test("the folder holding the worktrees: each its own vault, its branch beside it", async () => {
    const l = layout();
    if (!l) return;
    const { elsewhereAt } = await import("../src/core/vault.ts");
    const h = await harness({ loc: elsewhereAt(l.wts), open: null });
    h.app.panels.showSidebar(true);
    const f = h.frame();
    expect(f).toMatch(/feat +⎇ feat/);
    expect(f).toMatch(/fix +⎇ fix/);
  });
});

describe("git in the TUI: marks, what changed, a note's diff, worktrees, conflicts (5.11–5.14)", () => {
  const git = (cwd: string, ...args: string[]) =>
    Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]);
  /** A vault and its repository: on main a.md and notes/b.md; on feat (checked out) a.md changed, c.md new. */
  const repo = () => {
    const root = mkdtempSync(join(sandbox, "gitui-"));
    mkdirSync(join(root, ".slipbox"));
    mkdirSync(join(root, "notes"));
    writeFileSync(
      join(root, ".slipbox", "config.toml"),
      `[vault]\nid = "g${root.slice(-6).replace(/[^a-z0-9]/gi, "")}"\nname = "g${root.slice(-6).replace(/[^a-z0-9]/gi, "")}"\n`,
    );
    writeFileSync(join(root, "a.md"), "# A\n\none\ntwo\nthree\n");
    writeFileSync(join(root, "notes", "b.md"), "# B\n");
    if (git(root, "init", "-q", "-b", "main").exitCode !== 0) return null;
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "start");
    git(root, "checkout", "-q", "-b", "feat");
    writeFileSync(join(root, "a.md"), "# A\n\none\nTWO\nthree\n");
    writeFileSync(join(root, "c.md"), "# C\n");
    writeFileSync(join(root, "notes", "b.md"), "# B, changed\n");
    return root;
  };

  test("the explorer marks each changed file at its row's end, and a folder with one in it", async () => {
    const root = repo();
    if (!root) return;
    const h = await harness({ root, open: "a.md" });
    await h.app.git.refreshNow();
    h.app.panels.showSidebar(true);
    h.app.explorer.expanded.add("notes");
    h.app.explorer.invalidateTree();
    const rows = h.frame().split("\n");
    const row = (name: string) =>
      rows.find((r) => new RegExp(`\\b${name.replace(".", "\\.")}\\b`).test(r.split(/[┃┣]/)[0]!))!.split(/[┃┣]/)[0]!;
    expect(row("a.md").trimEnd()).toMatch(/a\.md +M$/);
    expect(row("c.md").trimEnd()).toMatch(/c\.md +\+$/);
    expect(row("notes").trimEnd()).toMatch(/notes +• ●$/); // git's dot, then the index's mark (VV-D9)
    expect(row("b.md").trimEnd()).toMatch(/b\.md +M$/);
    // A name as long as the row: cut short of its mark, never under it.
    writeFileSync(join(root, "a-rather-long-note-name-that-fills-the-whole-row.md"), "# Long\n");
    h.app.graph.build(true, "lazy");
    await h.app.git.refreshNow();
    const long = h
      .frame()
      .split("\n")
      .find((r) => r.includes("a-rather-long"))!
      .split(/[┃┣]/)[0]!;
    expect(long.trimEnd()).toMatch(/[^ ] \+$/);
  });

  test("a marked explorer row: its name scrolls to its end before the mark; a root's own name stops short of its •", async () => {
    const root = makeVault();
    const name = "aaaaaaaaaaaaaaaaaaaaaaaaz.md"; // as long as the pane's text: it scrolls sideways
    writeFileSync(join(root, name), "# x\n");
    const h = await harness({
      root,
      open: "index.md",
      width: 120,
      height: 40,
      config: (c) => (c.ui.sidebar_width = 30),
    });
    h.app.panels.showSidebar(true);
    h.app.git.states = new Map([[name, "modified"]]);
    h.app.git.folders.set("nested-vault", "modified");
    h.app.explorer.invalidateTree();
    const row = (has: string) =>
      h
        .frame()
        .split("\n")
        .find((r) => r.includes(has))!
        .split(/[┃┣]/)[0]!;
    // Named otherwise than its folder (17.13): the name, cut with a `…`, then the folder's dot.
    expect(row("nested-vault").trimEnd()).toMatch(/nested-vault fixture-.*… •$/);
    h.app.sidebar.left = 1000;
    expect(row("aaaaaaaa").trimEnd()).toMatch(/z\.md +M$/);
    // A pane too short to scroll sideways: the name cut with a `…` before the mark.
    const short = await harness({
      root,
      open: "index.md",
      width: 120,
      height: 6,
      config: (c) => (c.ui.sidebar_width = 30),
    });
    short.app.panels.showSidebar(true);
    short.app.git.states = new Map([[name, "modified"]]);
    short.app.explorer.invalidateTree();
    short.app.explorer.select(name);
    short.app.region = "content";
    expect(
      short
        .frame()
        .split("\n")
        .find((r) => r.includes("aaaaaaaa")),
    ).toMatch(/a… M/);
  });
  test(":changes lists what this branch changed; enter shows a file's diff; esc goes back; enter on a line goes there", async () => {
    const root = repo();
    if (!root) return;
    // A note's diff as its lines (`[git] diff`): a row a line, each going to its own.
    const h = await harness({ root, open: "c.md", config: (c) => (c.git.diff = "source") });
    await h.app.run("git.changes");
    const list = h.app.overlay as ListOverlay;
    expect(list.title).toBe("Changed against main (3) — enter: the diff");
    expect(list.items.map((i) => [i.label, i.role])).toEqual([
      ["M a.md", "git_modified"],
      ["+ c.md", "git_new"],
      ["M notes/b.md", "git_modified"],
    ]);
    await h.keys("enter"); // a.md's diff, in the diff window (GIT-D2)
    const f = h.app.floating!;
    expect([f.kind, f.title]).toEqual(["diff", "a.md against main — esc: the changes"]);
    const rows = h.app.currentLayout(f.view).lines.map((l) => [l.spans.map((s) => s.text).join(""), l.spans[0]?.role]);
    expect(rows).toEqual([
      ["@@ line 4", "diff_head"],
      ["  # A", "text"],
      ["  ", "text"],
      ["  one", "text"],
      ["- two", "diff_del"],
      ["+ TWO", "diff_add"],
      ["  three", "text"],
    ]);
    await h.keys("escape");
    expect(h.app.floating).toBeNull();
    expect((h.app.overlay as ListOverlay).title).toStartWith("Changed against main");
    // `q` goes back too.
    await h.keys("enter", "q");
    expect((h.app.overlay as ListOverlay).title).toStartWith("Changed against main");
    await h.keys("enter");
    await h.keys("j", "j", "j", "j", "j"); // on + TWO
    await h.keys("enter");
    expect(h.app.floating).toBeNull();
    expect(h.app.overlay).toBeNull();
    expect(h.app.view!.buf.rel).toBe("a.md");
    expect(statusRow(h.frame())).toMatch(/ L4:\d+ /); // on that line, inside its paragraph
  });

  test(":changes without its base: a [git] base that isn't there named; on a detached HEAD, the fallback base", async () => {
    const root = repo();
    if (!root) return;
    const h = await harness({ root, open: "c.md", config: (c) => Object.assign(c.git, { base: "nope", bases: [] }) });
    await h.app.run("git.changes");
    expect(h.app.overlay).toBeNull();
    expect(h.app.messages.at(-1)!.text).toBe('no branch or commit "nope" ([git] base)');
    // HEAD detached (a rebase, a checkout of a commit): against [git] base or main, never a guess among [git] bases —
    // here dev, at HEAD itself, which would leave nothing changed.
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "feat");
    git(root, "branch", "dev");
    git(root, "checkout", "-q", "--detach");
    const d = await harness({ root, open: "c.md", config: (c) => (c.git.bases = ["dev", "main"]) });
    await d.app.run("git.changes");
    expect((d.app.overlay as ListOverlay).title).toBe("Changed against main (3) — enter: the diff");
  });

  test("a key after enter in :changes waits for the diff git is read for: with git slow, enter's diff is open", async () => {
    const root = repo();
    if (!root) return;
    const h = await harness({ root, open: "c.md", config: (c) => (c.git.diff = "source") });
    await h.app.run("git.changes");
    // git answering slowly: the key's turn ends once the diff window is open, as the keys after it expect.
    const dir = mkdtempSync(join(sandbox, "slow-git-"));
    writeFileSync(join(dir, "git"), `#!/bin/sh\nsleep 0.2\nexec ${JSON.stringify(Bun.which("git")!)} "$@"\n`);
    chmodSync(join(dir, "git"), 0o755);
    const path = process.env.PATH;
    process.env.PATH = `${dir}${delimiter}${path}`;
    try {
      await h.keys("enter");
      expect(h.app.floating?.kind).toBe("diff");
      expect(h.app.floating?.title).toBe("a.md against main — esc: the changes");
    } finally {
      process.env.PATH = path;
    }
  });

  test(":merge-review: a branch picked, the links its merge would break; enter goes to one; esc back to the branches (20.21)", async () => {
    const root = repo();
    if (!root) return;
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "feat");
    // main moves a.md; feat (checked out) links to it from c.md.
    git(root, "checkout", "-q", "main");
    mkdirSync(join(root, "docs"));
    git(root, "mv", "a.md", "docs/a.md");
    git(root, "commit", "-q", "-m", "a moved");
    git(root, "checkout", "-q", "feat");
    writeFileSync(join(root, "c.md"), "# C\n\nSee [a](a.md).\n");
    git(root, "commit", "-q", "-am", "c links a");
    const h = await harness({ root, open: "c.md" });
    await h.app.run("git.merge_review");
    let list = h.app.overlay as ListOverlay;
    expect(list.title).toBe("Review a merge — enter: the links it would break");
    expect(list.items.map((i) => [i.label.replace(/^\S+ /, ""), i.detail])).toEqual([
      ["feat → main", "this branch into the base"],
      ["main → feat", "into this branch"],
    ]);
    await h.keys("enter");
    list = h.app.overlay as ListOverlay;
    expect(list.title).toBe("Merging feat into main: 1 link would break — esc: the branches");
    expect(list.items.map((i) => [i.label, i.detail, i.role])).toEqual([
      ["c.md:3  a.md", "main moves a.md to docs/a.md — the fix: docs/a.md", "git_modified"],
    ]);
    await h.keys("escape");
    expect((h.app.overlay as ListOverlay).title).toStartWith("Review a merge");
    await h.keys("enter", "enter");
    expect(h.app.view!.buf.rel).toBe("c.md");
    expect(statusRow(h.frame())).toMatch(/ L3:\d+ /);
    // Nothing would break: said so, no list.
    git(root, "checkout", "-q", "-b", "quiet", "main");
    h.app.git.checkHead();
    await h.app.run("git.merge_review");
    list = h.app.overlay as ListOverlay;
    list.selected = list.items.findIndex((i) => i.label.endsWith("main → quiet"));
    await h.keys("enter");
    expect(h.app.messages.at(-1)!.text).toBe("merging main into quiet breaks no link");
  });

  test(":merge-review: a branch made from dev is reviewed against dev, its own base, not main (GIT-D10)", async () => {
    const root = repo();
    if (!root) return;
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "feat");
    git(root, "checkout", "-q", "-b", "dev", "main");
    writeFileSync(join(root, "d.md"), "# D\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "dev");
    git(root, "checkout", "-q", "-b", "topic");
    writeFileSync(join(root, "t.md"), "# T\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "topic");
    const h = await harness({
      root,
      open: "t.md",
      config: (c) => {
        c.git.bases = ["main", "dev"];
      },
    });
    await h.app.run("git.merge_review");
    const list = h.app.overlay as ListOverlay;
    const shown = list.items.map((i) => [i.label.replace(/^\S+ /, ""), i.detail]);
    expect(shown[0]).toEqual(["topic → dev", "this branch into the base"]);
    expect(shown.map(([label]) => label)).not.toContain("topic → main");
  });

  test(":diff: this note's diff, as it is now (unsaved too); nothing different, said so", async () => {
    const root = repo();
    if (!root) return;
    const h = await harness({ root, open: "a.md" });
    await h.keys("space", "n", "v", "shift+g", "o", ...[..."four"], "escape");
    await h.app.run("git.diff");
    const labels = h.app.floating!.view.buf.source.split("\n");
    expect(labels).toContain("+ four");
    expect(labels).toContain("+ TWO");
    await h.keys("escape", "u");
    expect(h.app.floating).toBeNull();
    git(root, "checkout", "-q", "--", "a.md");
    await h.app.run("note.open notes/../c.md");
    git(root, "add", "c.md");
    git(root, "commit", "-q", "-m", "c");
    git(root, "checkout", "-q", "main");
    git(root, "merge", "-q", "feat");
    await h.app.run("git.diff");
    expect([h.app.floating, h.app.overlay, h.app.messages.at(-1)?.text]).toEqual([
      null,
      null,
      "no differences from main",
    ]);
  });

  test(":diff: a note with a byte order mark, unchanged, has no differences; its first line changed, that line", async () => {
    const root = repo();
    if (!root) return;
    git(root, "checkout", "-q", "main");
    writeFileSync(join(root, "d.md"), "\uFEFF# D\n\nbody\n");
    git(root, "add", "d.md");
    git(root, "commit", "-q", "-m", "d");
    git(root, "checkout", "-q", "feat");
    git(root, "merge", "-q", "main");
    const h = await harness({ root, open: "d.md" });
    await h.app.run("git.diff");
    expect([h.app.floating, h.app.messages.at(-1)?.text]).toEqual([null, "no differences from main"]);
    // Its gutter: no sign on the first line either (once git has said what's staged).
    for (let t = Date.now(); h.app.git.changesOf(h.app.view!) === null && Date.now() - t < 10_000; )
      await Bun.sleep(20);
    expect(h.app.git.changesOf(h.app.view!)).toEqual([]);
    h.app.view!.buf.edit(0, "# D".length, "# E"); // typed, unsaved
    await h.app.run("git.diff");
    const w = h.app.floating?.kind === "diff" ? h.app.floating.diff : null;
    expect(w?.rows.filter((r) => r.kind === "-" || r.kind === "+").map((r) => `${r.kind} ${r.text}`)).toEqual([
      "- # D",
      "+ # E",
    ]);
  });

  test(":worktrees: the worktrees by branch; enter opens this note in the one picked", async () => {
    const root = repo();
    if (!root) return;
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "feat's");
    const wt = `${root}-other`;
    git(root, "worktree", "add", "-q", "-b", "other", wt, "main");
    const h = await harness({ root, open: "notes/b.md", width: 2 * stringWidth(wt) + 100 });
    await h.app.run("git.worktrees");
    const list = h.app.overlay as ListOverlay;
    expect(list.items.map((i) => [i.label, i.detail])).toEqual([
      ["● ⎇ feat", `${root}  (main)`],
      ["  ⎇ other", wt],
    ]);
    await h.keys("down", "enter");
    expect(h.app.loc.root).toBe(wt);
    expect(h.app.view!.buf.rel).toBe("notes/b.md"); // the same note, there
    expect(h.app.view!.buf.source).toBe("# B\n"); // as the other branch has it
    expect(topRow(h.frame())).toContain(`${h.app.glyphs.branch} other`); // the worktree, by its branch (20.14)
  });

  test("a merge's conflicts in Problems: each file at its first marker; enter goes there", async () => {
    const root = repo();
    if (!root) return;
    git(root, "commit", "-q", "-am", "feat's two");
    git(root, "checkout", "-q", "main");
    writeFileSync(join(root, "a.md"), "# A\n\none\nmain's two\nthree\n");
    git(root, "commit", "-q", "-am", "main's two");
    git(root, "merge", "-q", "feat");
    const h = await harness({ root, open: "notes/b.md" });
    await h.app.git.refreshNow();
    const rows = h.app.problems.rows().filter((r) => r.section === "Conflicts");
    expect(rows.map((r) => [r.label, r.detail])).toEqual([
      ["Conflicts (1)", ""],
      ["a.md", "L4"],
    ]);
    await h.keys("space", "v", "p");
    h.app.problems.panel.all.selected = h.app.problems
      .rows()
      .findIndex((r) => r.label === "a.md" && r.section === "Conflicts");
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("a.md");
    expect(h.app.cursorLine(h.app.view!)).toBe(4);
    // Filtered to it, the selection on its heading (git's answer came after the typing): enter goes to its first.
    await h.app.run("note.open notes/b.md");
    await h.keys("space", "v", "p", "/", "a", ".", "m", "d");
    expect(h.app.problems.rows()[0]!.label).toBe("Conflicts (1)");
    h.app.problems.panel.all.selected = 0;
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("a.md");
    expect(h.app.cursorLine(h.app.view!)).toBe(4);
  });
});

describe("the diff window (GIT-D2)", () => {
  const code = `${Array.from({ length: 20 }, (_, i) => `const line${i + 1} = ${i + 1}; // line ${i + 1}`).join("\n")}\n`;
  /** The screen's rows. */
  const screen = (h: Harness) => h.frame().split("\n");
  /** The style of the first cell of `piece` on the screen row holding `holding` (ASCII rows). */
  const styleAt = (h: Harness, holding: string, piece: string) => {
    const c = h.canvas();
    const y = c.rows.findIndex((r) => r.join("").includes(holding));
    const at = c.rows[y]!.join("").indexOf(holding);
    return c.styles[y]![c.rows[y]!.join("").indexOf(piece, at)]!;
  };
  const opened = async (now: string, width = 100) => {
    const root = makeVault();
    writeFileSync(join(root, "x.ts"), now);
    const h = await harness({ root, open: "index.md", width, height: 40 });
    h.app.git.showLineDiff(code, now, "x.ts", "x.ts: its change");
    return h;
  };

  test("in the floating window: highlighted, a changed line tinted and its changed words more; a fold opened by enter, a line gone to", async () => {
    const now = code.replace("const line2 = 2;", "const line2 = 22;");
    const h = await opened(now);
    expect(h.app.floating).toMatchObject({ kind: "diff", title: "x.ts: its change" });
    const roles = h.app.theme.roles;
    // The words that changed, on the stronger tint; the rest of the line on its own; both highlighted.
    expect(styleAt(h, "+ const line2 = 22", "22")).toMatchObject({
      bg: roles.diff_add_word.bg,
      fg: roles.syn_number.fg,
    });
    expect(styleAt(h, "+ const line2 = 22", "line2")).toMatchObject({ bg: roles.diff_add.bg });
    expect(styleAt(h, "+ const line2 = 22", "const")).toMatchObject({
      bg: roles.diff_add.bg,
      fg: roles.syn_keyword.fg,
    });
    expect(styleAt(h, "- const line2 = 2;", "2;")).toMatchObject({ bg: roles.diff_del_word.bg });
    expect(styleAt(h, "- const line2 = 2;", "-")).toMatchObject({ fg: roles.diff_del.fg, bg: roles.diff_del.bg });
    // A line both have: highlighted, never tinted.
    const same = styleAt(h, "  const line1 = 1", "const");
    expect(same.fg).toBe(roles.syn_keyword.fg!);
    expect([roles.diff_add.bg, roles.diff_del.bg]).not.toContain(same.bg ?? undefined);
    // No gutter of its own, line numbers on or not: its rows aren't a file's lines.
    h.app.ui.line_numbers = true;
    expect(screen(h).find((r) => r.includes("const line1 = 1"))).toMatch(/│ {3}const line1 = 1;/);
    // The unchanged lines after: a row saying how many. enter opens it, the cursor staying on its row.
    expect(screen(h).some((r) => r.includes("▸ 15 unchanged lines"))).toBe(true);
    await h.keys("j", "j", "j", "j", "j", "j", "j", "enter");
    expect(screen(h).some((r) => r.includes("unchanged lines"))).toBe(false);
    expect(screen(h).some((r) => r.includes("  const line20 = 20;"))).toBe(true);
    expect(statusRow(h.frame())).toMatch(/ L8:1 /);
    // enter on a line: the window closes, and the file opens at it.
    await h.keys("k", "k", "k", "k", "enter");
    expect(h.app.floating).toBeNull();
    expect(h.app.view!.buf.rel).toBe("x.ts");
    expect(statusRow(h.frame())).toMatch(/ L2:\d+ /);
  });

  test("a line too long scrolls sideways, never cut with …: the cursor, a sideways wheel, shift with the wheel", async () => {
    const tail = ", then a tail long enough to go well past the right edge of the window, to its end";
    const h = await opened(code.replace("// line 18\n", `// line 18${tail}\n`), 80);
    const y = screen(h).findIndex((r) => r.includes("+ const line18 = 18;"));
    expect(screen(h)[y]).not.toContain("…");
    expect(screen(h)[y]).not.toContain("to its end");
    expect(screen(h)[y]).toMatch(/›\s*│/); // more to the right
    // The cursor on it, to its end: the rows scroll to it; to its start, back.
    await h.keys("j", "j", "j", "j", "j", "j", "$");
    expect(screen(h)[y]).toMatch(/to its end\s*│/);
    expect(screen(h)[y]).toMatch(/│ \+‹/);
    expect(screen(h).find((r) => r.includes("@@ line 18"))).toBeDefined(); // the head stays
    await h.keys("0");
    expect(screen(h)[y]).toContain("+ const line18 = 18;");
    // The wheel: sideways, or shift with it, over the rows.
    const pane = h.app.geometry!.panes.find((p) => p.view === h.app.floating!.view)!;
    const wheel = (direction: string, shift = false) =>
      h.app.mouse.handle({ type: "scroll", x: pane.textX + 10, y, button: 0, scroll: { direction, delta: 3 }, shift });
    wheel("right");
    expect(screen(h)[y]).not.toContain("+ const line18");
    expect(screen(h)[y]).toContain("‹");
    wheel("up", true);
    expect(screen(h)[y]).toContain("+ const line18 = 18;");
    wheel("down", true);
    expect(screen(h)[y]).not.toContain("+ const line18");
  });

  test("the wheel over the floating window scrolls it, not the explorer or the window under it (regression)", async () => {
    // Found building the diff window: the wheel went to the explorer under the pointer, or to the note's pane, which
    // came first among the panes under it.
    const many = code.replace(/= (\d+);/g, "= $1$1;");
    const h = await opened(many, 100);
    const under = h.app.tabView!;
    const f = h.app.floating!.view;
    h.frame();
    const pane = h.app.geometry!.panes.find((p) => p.view === f)!;
    const wheel = (x: number) =>
      h.app.mouse.handle({ type: "scroll", x, y: pane.y + 2, button: 0, scroll: { direction: "down", delta: 1 } });
    // Where the explorer is under it.
    const explorer = h.app.geometry!.sidebarPane!;
    expect(pane.textX + 4 < explorer.x + explorer.w && pane.y + 2 < explorer.y + explorer.h).toBe(true);
    wheel(pane.textX + 4);
    h.frame();
    const once = f.top;
    expect(once).toBeGreaterThan(0);
    // Where the note's window is under it.
    wheel(pane.x + pane.w - 10);
    h.frame();
    expect(f.top).toBeGreaterThan(once);
    expect([under.top, h.app.sidebar.scroll]).toEqual([0, 0]);
  });

  test("the terminal's theme: a changed word bold and underlined, a theme without tints to give", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "index.md", width: 100, height: 40, themeName: "terminal" });
    h.app.git.showLineDiff(code, code.replace("const line2 = 2;", "const line2 = 22;"), "x.ts", "x.ts: its change");
    expect(styleAt(h, "+ const line2 = 22", "22")).toMatchObject({ bold: true, underline: true });
    expect(styleAt(h, "+ const line2 = 22", "line2")).toMatchObject({ bold: false, underline: false });
  });

  test("no line number drawn in it, line numbers on: its rows aren't a file's lines", async () => {
    // A row past the hundredth whose text is shorter than its number: the number would show past the text.
    const before = `${Array.from({ length: 105 }, (_, i) => `a${i}`).join("\n")}\n\nb\n`;
    const root = makeVault();
    const h = await harness({
      root,
      open: "index.md",
      width: 100,
      height: 40,
      config: (c) => (c.ui.line_numbers = true),
    });
    h.app.git.showLineDiff(before, before.replace(/^a/gm, "A"), "x.txt", "x.txt: every line");
    await h.keys("shift+g");
    const rows = screen(h);
    const y = rows.findIndex((r) => r.includes("+ A104"));
    // Between the window's borders, less the scrollbar's column.
    const inside = (r: string) => r.slice(r.indexOf("│") + 1, r.lastIndexOf("│") - 1);
    expect([inside(rows[y + 1]!).trim(), inside(rows[y + 2]!).trim()]).toEqual(["", "b"]);
  });

  test("two texts the same: said, and back where it came from; no window", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "index.md" });
    let back = 0;
    h.app.git.showLineDiff(code, code, "x.ts", "x.ts: none", "no differences from main", () => void back++);
    expect([h.app.floating, h.app.messages.at(-1)?.text, back]).toEqual([null, "no differences from main", 1]);
  });

  test("line endings, a byte order mark, a final line break: not drawn as every line changed, nor as nothing — a dim row", async () => {
    const root = makeVault();
    writeFileSync(join(root, "x.ts"), code);
    writeFileSync(join(root, "n.md"), "# N\n\nOne.\n\nTwo.");
    const h = await harness({ root, open: "index.md", width: 100, height: 40 });
    const crlf = code.replace(/\n/g, "\r\n");
    /** The window's text opened on the two, a line a row; null: no window. */
    const said = async (before: string, now: string, path = "x.ts") => {
      if (h.app.floating) await h.keys("escape");
      h.app.git.showLineDiff(before, now, path, `${path}: its change`, `${path}: nothing to show`);
      return h.app.floating?.kind === "diff" ? h.app.floating.view.buf.source.split("\n") : null;
    };
    expect(await said(crlf, code)).toEqual(["\\ line endings: CRLF → LF"]);
    expect(await said(code, code.replace(/\n$/, ""))).toEqual(["\\ no newline at end of file"]);
    expect(await said(`\uFEFF${code}`, code)).toEqual(["\\ byte order mark removed"]);
    // Drawn dim, as it reads.
    expect(screen(h).some((r) => r.includes("\\ byte order mark removed"))).toBe(true);
    expect(styleAt(h, "\\ byte order mark", "byte")).toMatchObject({ fg: h.app.theme.roles.dim.fg });
    // A line changed as well: that line, and no other, the line endings said before it.
    const both = await said(crlf, code.replace("const line2 = 2;", "const line2 = 22;"));
    expect(both?.filter((r) => /^[-+\\] /.test(r))).toEqual([
      "\\ line endings: CRLF → LF",
      "- const line2 = 2; // line 2",
      "+ const line2 = 22; // line 2",
    ]);
    // Nothing different: said, no window.
    expect([await said(code, code), h.app.messages.at(-1)?.text]).toEqual([null, "x.ts: nothing to show"]);
    // A note's, as its blocks: the row too; enter on it goes to the line it's at, the last.
    expect(await said("# N\n\nOne.\n\nTwo.\n", "# N\n\nOne.\n\nTwo.", "n.md")).toEqual([
      "\\ no newline at end of file",
    ]);
    expect(h.app.floating?.kind === "diff" && h.app.floating.diff.blocks?.on).toBe(true);
    await h.keys("enter");
    expect([h.app.floating, h.app.view!.buf.rel]).toEqual([null, "n.md"]);
    expect(statusRow(h.frame())).toMatch(/ L5:\d+ /);
  });

  test("the window is read-only, drawn one way: typing refused, no source mode; as wide as the screen less its margins", async () => {
    const h = await opened(code.replace("const line2 = 2;", "const line2 = 22;"), 140);
    const top = screen(h).find((r) => r.includes("x.ts: its change"))!;
    expect(top.lastIndexOf("┐") - top.indexOf("┌") + 1).toBe(132);
    const f = h.app.floating!.view;
    const text = f.buf.source;
    await h.keys("i");
    expect(h.app.messages.at(-1)?.text).toStartWith("the floating window is read-only");
    await h.keys("ctrl+k");
    expect([f.source ?? false, f.buf.source, h.app.messages.at(-1)?.text]).toEqual([
      false,
      text,
      "a diff is drawn one way",
    ]);
    // esc closes it: opened from nowhere, it has nowhere to go back to.
    await h.keys("escape");
    expect(h.app.floating).toBeNull();
  });

  test("a note's diff: its changed block before and after, only its changed words marked; tab its lines and back; enter goes to the line", async () => {
    const before =
      "# N\n\nThe 409 case is the one that bit us: a conflict is not transient. Since 2.3 a 409 parks\nthe op, and the loop goes on.\n\nThe end.\n\nMore one.\n\nMore two.\n\nMore three.\n";
    const now = before.replace("Since 2.3 a 409 parks\nthe op", "Since the incident a 409\nparks the op");
    const root = makeVault();
    writeFileSync(join(root, "n.md"), now);
    const h = await harness({ root, open: "index.md", width: 100, height: 40 });
    h.app.git.showLineDiff(before, now, "n.md", "n.md: its change");
    const roles = h.app.theme.roles;
    const has = (text: string) => screen(h).some((r) => r.includes(text));
    expect([has("┌ before"), has("┌ after"), has("@@ line 1")]).toEqual([true, true, true]);
    expect(has("tab: its lines · enter goes to the line")).toBe(true); // its footer says so
    // The words that changed, on the stronger tints; the rest of the paragraph plain, its moved line break no change.
    expect(styleAt(h, "Since 2.3 a 409", "2.3")).toMatchObject({ bg: roles.diff_del_word.bg });
    expect(styleAt(h, "Since the incident", "the incident")).toMatchObject({ bg: roles.diff_add_word.bg });
    const plain = styleAt(h, "a 409 parks the op", "parks");
    expect([roles.diff_add_word.bg, roles.diff_add.bg]).not.toContain(plain.bg ?? undefined);
    // tab: its lines, as source; the cursor on the row of the line it was on.
    await h.keys("j", "j", "j", "j"); // the after frame's first row: line 3
    await h.keys("tab");
    expect([has("┌ before"), has("+ parks the op, and the loop goes on.")]).toEqual([false, true]);
    expect(h.app.messages.at(-1)?.text).toBe("the diff's lines — tab: its blocks, before and after");
    const row = h.app.currentLayout(h.app.floating!.view).lines[h.app.floating!.view.cur.row]!;
    expect(row.spans.map((s) => s.text).join("")).toStartWith("- The 409 case");
    await h.keys("tab");
    expect(has("┌ before")).toBe(true);
    // enter on the fold after it: its blocks, unframed.
    const text = (r: Line) => r.spans.map((s) => s.text).join("");
    const fold = h.app.currentLayout(h.app.floating!.view).lines.findIndex((r) => text(r).includes("unchanged lines"));
    h.app.moveCursor(h.app.floating!.view, { row: fold, col: 0 });
    await h.keys("enter");
    expect([has("unchanged lines"), has("  More three."), h.app.floating?.kind]).toEqual([false, true, "diff"]);
    // enter on a word of the after frame's second row: the line that word is on, in the file — "parks", line 4, though
    // the row starts on line 3 ("a 409").
    const rows = h.app.currentLayout(h.app.floating!.view).lines.map((r) => r.spans.map((s) => s.text).join(""));
    const at = rows.findIndex((r) => r.includes("a 409 parks the op"));
    h.app.moveCursor(h.app.floating!.view, { row: at, col: rows[at]!.indexOf("parks") });
    await h.keys("enter");
    expect([h.app.floating, h.app.view!.buf.rel]).toEqual([null, "n.md"]);
    expect(statusRow(h.frame())).toMatch(/ L4:\d+ /);
  });

  test("[git] diff = \"source\": a note's diff opens as its lines, tab its blocks; a code file's has only its lines", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "index.md", width: 100, height: 40, config: (c) => (c.git.diff = "source") });
    h.app.git.showLineDiff("one two three four\n", "one two THREE four\n", "n.md", "n.md: its change");
    expect(screen(h).some((r) => r.includes("+ one two THREE four"))).toBe(true);
    // Its blocks not found until they're drawn.
    const blocks = () => (h.app.floating?.kind === "diff" ? h.app.floating.diff.blocks : undefined);
    expect(blocks()).toMatchObject({ on: false, diff: null });
    await h.keys("tab");
    expect(screen(h).some((r) => r.includes("┌ after"))).toBe(true);
    expect(blocks()?.diff?.items.some((i) => i.kind === "change")).toBe(true);
    await h.keys("escape");
    h.app.git.showLineDiff(code, code.replace("= 2;", "= 22;"), "x.ts", "x.ts: its change");
    await h.keys("tab");
    expect(h.app.messages.at(-1)?.text).toBe("a code file's diff is drawn as its lines: only a note's has blocks");
    expect(screen(h).some((r) => r.includes("+ const line2 = 22;"))).toBe(true);
  });

  test("a code file's diff side by side where two columns of 80 fit, both sides scrolled sideways together; unified narrower", async () => {
    const tail = ", and a tail long enough to go well past the edge of a column ninety wide, to its very end";
    const from = code.replace("// line 17\n", `// line 17${tail}\n`);
    const now = from.replace("const line18 = 18;", "const line18 = 180;");
    const root = makeVault();
    const h = await harness({ root, open: "index.md", width: 200, height: 40 });
    h.app.git.showLineDiff(from, now, "x.ts", "x.ts: its change");
    const row = (text: string) => screen(h).find((r) => r.includes(text)) ?? "";
    // Side by side: the line removed beside the line it became.
    expect(row("- const line18 = 18;")).toMatch(/- const line18 = 18; \/\/ line 18 +│ \+ const line18 = 180;/);
    // The long line, on both sides: its end out of sight on each; `$` on it scrolls both, one offset.
    expect(row("const line17")).not.toContain("its very end");
    expect(row("const line17").match(/const line17/g)?.length).toBe(2);
    await h.keys("j", "j", "j", "j"); // on line 17
    await h.keys("$");
    const scrolled = row("its very end");
    expect(scrolled.match(/its very end/g)?.length).toBe(2);
    expect(scrolled.match(/‹/g)?.length).toBe(2);
    await h.keys("0");
    expect(row("const line17").match(/const line17/g)?.length).toBe(2);
    await h.keys("escape");
    // [git] diff_layout: unified however wide; side by side however narrow.
    h.app.config.git.diff_layout = "unified";
    h.app.git.showLineDiff(from, now, "x.ts", "x.ts: its change");
    expect([row("- const line18 = 18;").includes("│ +"), row("+ const line18 = 180;") !== ""]).toEqual([false, true]);
    await h.keys("escape");
    const narrow = await harness({ root, open: "index.md", width: 120, height: 40 });
    narrow.app.git.showLineDiff(from, now, "x.ts", "x.ts: its change");
    const narrowRow = (text: string) =>
      narrow
        .frame()
        .split("\n")
        .find((r) => r.includes(text)) ?? "";
    expect(narrowRow("- const line18 = 18;")).not.toContain("+ const line18");
    narrow.app.config.git.diff_layout = "split";
    narrow.app.git.showLineDiff(from, now, "x.ts", "x.ts: its change");
    expect(narrowRow("- const line18")).toContain("│ + const line18");
  });
});

describe("git's review, merge screen, pull and rebase (GIT-D3, GIT-D5, GIT-D6)", () => {
  const git = (cwd: string, ...args: string[]) =>
    new TextDecoder()
      .decode(
        Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]).stdout,
      )
      .trim();
  const until = async (ok: () => boolean, ms = 25_000) => {
    for (const t = Date.now(); !ok() && Date.now() - t < ms; ) await Bun.sleep(20);
    return ok();
  };
  /** Nobody's git config but the test's, while it runs; its commits made by the test. */
  const isolated = async (run: () => Promise<void>) => {
    const keys = [
      "GIT_CONFIG_GLOBAL",
      "GIT_CONFIG_NOSYSTEM",
      "GIT_AUTHOR_NAME",
      "GIT_AUTHOR_EMAIL",
      "GIT_COMMITTER_NAME",
      "GIT_COMMITTER_EMAIL",
    ];
    const was = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    process.env.GIT_CONFIG_GLOBAL = "/dev/null";
    process.env.GIT_CONFIG_NOSYSTEM = "1";
    process.env.GIT_AUTHOR_NAME = process.env.GIT_COMMITTER_NAME = "t";
    process.env.GIT_AUTHOR_EMAIL = process.env.GIT_COMMITTER_EMAIL = "t@example.invalid";
    try {
      await run();
    } finally {
      for (const [k, v] of Object.entries(was))
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
  };
  /** A vault that's a repository, its files committed; with an origin beside it and a clone of it, if asked. */
  const repo = (files: Record<string, string>, remote = false) => {
    const top = mkdtempSync(join(sandbox, "git-"));
    const root = join(top, "work");
    mkdirSync(join(root, ".slipbox"), { recursive: true });
    writeFileSync(join(root, ".gitignore"), ".slipbox/\n");
    for (const [f, t] of Object.entries(files)) writeFileSync(join(root, f), t);
    git(root, "init", "-q", "-b", "main");
    // git's own markers, whatever the machine's config says (diff3's base section is read too: core.test.ts).
    git(root, "config", "merge.conflictStyle", "merge");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "start");
    const bare = join(top, "origin.git");
    const other = join(top, "other");
    if (remote) {
      Bun.spawnSync(["git", "init", "-q", "--bare", "-b", "main", bare]);
      git(root, "remote", "add", "origin", bare);
      git(root, "push", "-q", "-u", "origin", "main");
      Bun.spawnSync(["git", "clone", "-q", bare, other]);
    }
    return { root, bare, other };
  };
  const commit = (root: string, file: string, text: string, message = `${file}: ${text.trim()}`) => {
    writeFileSync(join(root, file), text);
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", message);
  };
  const said = (h: Harness, text: string | RegExp) =>
    until(() => h.app.messages.some((m) => (typeof text === "string" ? m.text === text : text.test(m.text))));
  const list = (h: Harness) => h.app.overlay as ListOverlay;
  const type = (s: string) => [...s].map((ch) => (ch === " " ? "space" : ch));
  const floatText = (h: Harness) => h.app.floating?.view.buf.source ?? "";

  const MIDDLE =
    "The queue is ordered.\nAn op waits its turn.\nA drain takes fifty.\nIt wakes every thirty seconds.\nOr when the network is back.";
  /** A merge of `theirs` into main stopped at its conflicts: both changed the same two lines of sync.md (and, `also`,
   *  a line of another.md). */
  const conflicted = (also = false) => {
    // Far enough apart for git to keep them two.
    const base = `# Sync\n\nRetry forever.\n\n${MIDDLE}\n\nA 409 retries the op.\nEnd.\n`;
    const { root } = repo({ "sync.md": base, "another.md": "one\n" });
    git(root, "switch", "-q", "-c", "theirs");
    if (also) commit(root, "another.md", "theirs\n");
    commit(root, "sync.md", base.replace("Retry forever.", "Retry with a budget.").replace("retries", "drops"));
    git(root, "switch", "-q", "main");
    if (also) commit(root, "another.md", "mine\n");
    commit(root, "sync.md", base.replace("Retry forever.", "Retry up to a minute.").replace("retries", "parks"));
    git(root, "merge", "-q", "theirs");
    return root;
  };

  test("opened with --base: the branch here kept against it, said on opening; a ref that names nothing, exit 3 before the screen (D255)", async () => {
    await isolated(async () => {
      const { prepare } = await import("../src/tui/run.ts");
      const { keptBases } = await import("../src/core/gitbase.ts");
      const { checkoutOf } = await import("../src/core/git.ts");
      const { root } = repo({ "a.md": "# A\n" }, true);
      git(root, "fetch", "-q", "origin");
      git(root, "switch", "-q", "-c", "fix-retry");
      const said: string[] = [];
      const write = process.stderr.write;
      process.stderr.write = ((s: string) => (said.push(s), true)) as typeof process.stderr.write;
      let bad: ReturnType<typeof prepare>;
      try {
        bad = prepare([root, "--base", "origin/no-such"]);
      } finally {
        process.stderr.write = write;
      }
      expect(bad).toBe(3);
      expect(said).toEqual(['slipbox: --base: no branch or commit "origin/no-such" in the repository\n']);
      expect(keptBases(checkoutOf(root)!)).toEqual({});
      const start = prepare([root, "--base", "origin/main"]);
      if (typeof start === "number") throw new Error(`exit ${start}`);
      expect(start.notes).toEqual(["fix-retry is compared against origin/main now"]);
      expect(keptBases(checkoutOf(root)!)).toEqual({ "fix-retry": "origin/main" });
      const app = new App({ ...start, watch: false, host: { requestRender() {}, osc52: () => true, quit: () => {} } });
      expect(app.messages.map((m) => [m.level, m.text])).toContainEqual([
        "info",
        "fix-retry is compared against origin/main now",
      ]);
      // Outside a repository: ignored, said, and the screen opens.
      const loose = mkdtempSync(join(sandbox, "loose-base-"));
      writeFileSync(join(loose, "a.md"), "# A\n");
      const plain = prepare([loose, "--base", "dev"]);
      if (typeof plain === "number") throw new Error(`exit ${plain}`);
      expect(plain.warnings).toContain("--base dev: not in a git repository, so it's ignored");
    });
  });

  describe("reviewing a change (GIT-D3)", () => {
    test("a review: three files' changes, one kept (staged), one reverted (saved, one undo), one noted (the scratch)", async () => {
      await isolated(async () => {
        const { root } = repo({ "a.md": "a\n", "b.md": "b one\nb two\n", "c.md": "c\n" });
        writeFileSync(join(root, "a.md"), "a\nkeep me\n");
        writeFileSync(join(root, "b.md"), "b one\nb TWO\n");
        writeFileSync(join(root, "c.md"), "c, noted\n");
        const h = await harness({ root, open: "a.md", width: 120, height: 40 });
        await h.app.run("git.review");
        expect(await until(() => h.app.floating?.kind === "review")).toBe(true);
        expect(h.app.floating!.title).toBe("Review — 1 of 3");
        expect(floatText(h)).toContain("a.md  line 2 · change 1 of 1 here, 1 of 3 in all");
        expect(floatText(h)).toContain("+ keep me");
        expect(h.frame()).toContain("y keep  x revert  c note for the agent");
        // y: staged; on to b.md.
        await h.keys("y");
        expect(git(root, "diff", "--cached", "--name-only")).toBe("a.md");
        expect(h.app.floating!.title).toBe("Review — 2 of 3");
        expect(floatText(h)).toContain("- b two");
        // x: b.md's lines back as staged, saved; u in it brings the change back.
        await h.keys("x");
        expect(readFileSync(join(root, "b.md"), "utf8")).toBe("b one\nb two\n");
        expect(await said(h, "reverted a change of b.md, saved — u in the file brings it back")).toBe(true);
        const b = h.app.buffers.get("b.md")!;
        b.undo();
        expect(b.source).toBe("b one\nb TWO\n");
        b.redo();
        // c: a note asked for; the scratch has the file, its line, the diff and the note.
        await h.keys("c", ...type("say why"), "enter");
        const scratch = readFileSync(h.app.scratch.location().path, "utf8");
        expect(scratch).toContain("**At:** `c.md:1`");
        expect(scratch).toContain("-c\n+c, noted");
        expect(scratch).toContain("**Note:** say why");
        // None left: the review's end, what it did said.
        expect(h.app.floating).toBeNull();
        expect(
          await said(
            h,
            "review: 1 kept (staged), 1 reverted, 1 note for the agent in the scratch — space s y copies it",
          ),
        ).toBe(true);
        // Nothing committed.
        expect(git(root, "log", "--oneline").split("\n").length).toBe(1);
      });
    });

    test("a review: n and p move; a hunk found again after another moved it; unsaved typing skipped; esc ends it", async () => {
      await isolated(async () => {
        const { root } = repo({ "a.md": "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\n" });
        writeFileSync(join(root, "a.md"), "ONE\nadded\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nNINE\n");
        writeFileSync(join(root, "new.md"), "brand new\n");
        const h = await harness({ root, open: "a.md", width: 120, height: 40 });
        await h.app.run("git.review");
        expect(await until(() => h.app.floating?.kind === "review")).toBe(true);
        // a.md's two changes, then the new file, wholly added.
        expect(h.app.floating!.title).toBe("Review — 1 of 3");
        await h.keys("n", "n");
        expect(floatText(h)).toContain("new.md  line 1 · change 1 of 1 here, 3 of 3 in all  new file");
        await h.keys("n");
        expect(await said(h, "the last change — esc ends the review")).toBe(true);
        await h.keys("p");
        expect(h.app.floating!.title).toBe("Review — 2 of 3");
        // The second change kept, then the first: found again though the index moved under it.
        await h.keys("y");
        expect(git(root, "show", ":a.md")).toBe("one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nNINE");
        expect(h.app.floating!.title).toBe("Review — 3 of 3");
        await h.keys("p", "p", "y");
        expect(git(root, "show", ":a.md")).toBe("ONE\nadded\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nNINE");
        await h.keys("escape");
        expect(await said(h, "review: 2 kept (staged); 1 left as it was")).toBe(true);
        // Unsaved typing in new.md: x refuses to write over it, says so, goes on.
        await h.app.run("note.open new.md");
        h.app.view!.buf.edit(0, 0, "typed ");
        await h.app.run("git.review");
        expect(await until(() => h.app.floating?.kind === "review")).toBe(true);
        expect(floatText(h)).toContain("new.md  line 1");
        await h.keys("x");
        expect(await said(h, "skipped: new.md has unsaved typing — save it, then x reverts the change")).toBe(true);
        expect(existsSync(join(root, "new.md"))).toBe(true);
        expect(await said(h, "review: nothing kept, reverted or noted; 1 skipped")).toBe(true);
      });
    });

    test("source control's v starts a review; with nothing to review, said; enter goes to the change", async () => {
      await isolated(async () => {
        const { root } = repo({ "a.md": "one\ntwo\nthree\n" });
        const h = await harness({ root, open: "a.md", width: 120, height: 40 });
        await h.app.run("git.view");
        await h.app.git.refreshNow();
        await h.keys("v");
        expect(await said(h, "nothing to review: the working tree has no change that isn't staged")).toBe(true);
        writeFileSync(join(root, "a.md"), "one\nTWO\nTHREE\n");
        await h.keys("v");
        expect(await until(() => h.app.floating?.kind === "review")).toBe(true);
        // enter on the change's second line: there, in the file, not at its first; the review ended. A note's change is
        // its paragraph before and after, laid out again: its word's own line, though its row starts on another.
        const rows = h.app.currentLayout(h.app.floating!.view).lines.map((l) => l.spans.map((s) => s.text).join(""));
        const row = rows.findIndex((t) => t.includes("THREE"));
        expect(rows[row]).toContain("│ one TWO THREE");
        h.app.moveCursor(h.app.floating!.view, { row, col: rows[row]!.indexOf("THREE") });
        await h.keys("enter");
        expect(h.app.floating).toBeNull();
        expect(h.app.view!.buf.rel).toBe("a.md");
        expect(h.app.cursorLine(h.app.view!)).toBe(3);
        expect(await said(h, "review: nothing kept, reverted or noted; 1 left as it was")).toBe(true);
      });
    });

    test("a note's change drawn before and after, its words marked; a code file's side by side where there's room (GIT-D2, GIT-D7)", async () => {
      await isolated(async () => {
        const para = "The queue is drained by a loop that wakes every thirty seconds.\n";
        const { root } = repo({ "a.md": `# A\n\n${para}`, "b.ts": "const a = 1;\nconst b = 2;\nconst c = 3;\n" });
        writeFileSync(join(root, "a.md"), `# A\n\n${para.replace("thirty seconds", "minute")}`);
        writeFileSync(join(root, "b.ts"), "const a = 1;\nconst b = 22;\nconst c = 3;\n");
        const h = await harness({ root, open: "a.md", width: 200, height: 40 });
        await h.app.run("git.review");
        expect(await until(() => h.app.floating?.kind === "review")).toBe(true);
        const rows = () => h.app.currentLayout(h.app.floating!.view).lines;
        const text = (l: typeof rows extends () => (infer L)[] ? L : never) => l.spans.map((s) => s.text).join("");
        // The paragraph whole, before and after, only the words that changed marked.
        expect(
          rows()
            .filter((l) => text(l).startsWith("┌"))
            .map((l) => text(l).split(" ")[1]),
        ).toEqual(["before", "after"]);
        const after = rows().find((l) => text(l).includes("every minute"))!;
        expect(after.spans.find((s) => s.text.includes("minute"))?.bg).toBe("diff_add_word");
        expect(after.spans.find((s) => s.text.includes("drained"))?.bg).toBeUndefined();
        // The window as tall as its rows, its frames' rules too: none of it cut off.
        h.frame();
        expect(h.app.geometry!.panes.find((p) => p.view === h.app.floating!.view)!.h).toBeGreaterThanOrEqual(
          rows().length,
        );
        // The code file's: its lines side by side, the line removed beside the line it became.
        await h.keys("n");
        expect(rows().some((l) => /- const b = 2; +│ \+ const b = 22;/.test(text(l)))).toBe(true);
      });
    });
    test("a review's revert: a deleted file comes back as staged; a new one goes to the trash, after asking", async () => {
      await isolated(async () => {
        const { root } = repo({ "a.md": "a\n", "b.md": "b\n" });
        rmSync(join(root, "b.md"));
        writeFileSync(join(root, "new.md"), "brand new\n");
        const h = await harness({ root, open: "a.md", width: 120, height: 40 });
        await h.app.run("git.review");
        expect(await until(() => h.app.floating?.kind === "review")).toBe(true);
        expect(floatText(h)).toContain("b.md  line 1 · change 1 of 1 here, 1 of 2 in all  deleted");
        expect(floatText(h)).toContain("- b");
        await h.keys("x");
        expect(readFileSync(join(root, "b.md"), "utf8")).toBe("b\n");
        expect(await said(h, "b.md is back as staged")).toBe(true);
        expect(floatText(h)).toContain("new.md  line 1");
        await h.keys("x");
        expect(h.app.overlay).toMatchObject({ kind: "prompt", confirm: true });
        await h.keys("y");
        expect(existsSync(join(root, "new.md"))).toBe(false);
        expect(await said(h, "review: 2 reverted")).toBe(true);
      });
    });

    test("tab in a review switches a note's change between its blocks and its lines, as in the diff window (regression)", async () => {
      await isolated(async () => {
        const para = "The queue is drained by a loop that wakes every thirty seconds.\n";
        const { root } = repo({ "a.md": `# A\n\n${para}`, "b.ts": "const a = 1;\nconst b = 2;\nconst c = 3;\n" });
        writeFileSync(join(root, "a.md"), `# A\n\n${para.replace("thirty seconds", "minute")}`);
        writeFileSync(join(root, "b.ts"), "const a = 1;\nconst b = 22;\nconst c = 3;\n");
        const h = await harness({ root, open: "a.md", width: 120, height: 40 });
        await h.app.run("git.review");
        expect(await until(() => h.app.floating?.kind === "review")).toBe(true);
        const rows = () =>
          h.app.currentLayout(h.app.floating!.view).lines.map((l) => l.spans.map((s) => s.text).join(""));
        const frames = () => rows().filter((t) => t.startsWith("┌")).length;
        expect(frames()).toBe(2);
        // Its lines, as source: the line removed and the line it became.
        await h.keys("tab");
        expect(await said(h, "the diff's lines — tab: its blocks, before and after")).toBe(true);
        expect(frames()).toBe(0);
        expect(
          rows().some((t) => t.startsWith("- The queue is drained by a loop that wakes every thirty seconds.")),
        ).toBe(true);
        expect(rows().some((t) => t.startsWith("+ The queue is drained by a loop that wakes every minute."))).toBe(
          true,
        );
        // Back to its blocks.
        await h.keys("tab");
        expect(await said(h, "the diff's blocks, before and after — tab: its lines")).toBe(true);
        expect(frames()).toBe(2);
        // A code file's change has only its lines.
        await h.keys("n");
        await h.keys("tab");
        expect(await said(h, "a code file's diff is drawn as its lines: only a note's has blocks")).toBe(true);
        // The merge screen's sides likewise.
        await h.keys("escape");
        const merging = conflicted();
        const m = await harness({ root: merging, open: "sync.md", width: 120, height: 50 });
        await m.app.git.refreshNow();
        await m.app.run("git.merge_screen");
        const mergeRows = () =>
          m.app.currentLayout(m.app.floating!.view).lines.map((l) => l.spans.map((s) => s.text).join(""));
        expect(mergeRows().filter((t) => t.startsWith("┌")).length).toBe(4);
        await m.keys("tab");
        expect(mergeRows().filter((t) => t.startsWith("┌")).length).toBe(0);
        expect(mergeRows()).toContain("- Retry forever.");
        expect(mergeRows()).toContain("+ Retry up to a minute.");
        expect(m.app.floating?.kind).toBe("merge");
      });
    });

    test("a file made again or changed since the review read it: x and y leave it as it is (regression)", async () => {
      await isolated(async () => {
        const { root } = repo({ "a.md": "a\n", "b.md": "b as committed\n" });
        rmSync(join(root, "b.md"));
        writeFileSync(join(root, "new.md"), "brand new\n");
        const h = await harness({ root, open: "a.md", width: 120, height: 40 });
        await h.app.run("git.review");
        expect(await until(() => h.app.floating?.kind === "review")).toBe(true);
        expect(floatText(h)).toContain("b.md  line 1 · change 1 of 1 here, 1 of 2 in all  deleted");
        // Written again meanwhile (an agent): neither brought back over it, nor staged as the deletion shown.
        writeFileSync(join(root, "b.md"), "a new b, never in git\n");
        await h.keys("x");
        expect(await said(h, "b.md is there again since the review read it: left as it is")).toBe(true);
        expect(readFileSync(join(root, "b.md"), "utf8")).toBe("a new b, never in git\n");
        await h.keys("y");
        expect(git(root, "diff", "--cached", "--name-only")).toBe("");
        // A new file changed meanwhile: not sent to the trash, nor asked about.
        await h.keys("n");
        expect(floatText(h)).toContain("new.md  line 1");
        writeFileSync(join(root, "new.md"), "brand new, and more\n");
        await h.keys("x");
        expect(await said(h, "new.md changed since the review read it: left as it is")).toBe(true);
        expect(h.app.overlay).toBeNull();
        expect(readFileSync(join(root, "new.md"), "utf8")).toBe("brand new, and more\n");
      });
    });

    test("a revert on a note open, unchanged, but not read again since the file changed: the change shown reverted (regression)", async () => {
      await isolated(async () => {
        const { root } = repo({ "a.md": "a\nb\nc\nd\n" });
        // Open as committed; then written on disk, the buffer not read again (the watcher off, or before it runs).
        const h = await harness({ root, open: "a.md", width: 120, height: 40 });
        const buf = h.app.buffers.get("a.md")!;
        writeFileSync(join(root, "a.md"), "X\na\nb\nc\nD\n");
        await h.app.run("git.review");
        expect(await until(() => h.app.floating?.kind === "review")).toBe(true);
        expect(floatText(h)).toContain("a.md  line 1 · change 1 of 2 here");
        expect(floatText(h)).toContain("+ X");
        await h.keys("x");
        expect(readFileSync(join(root, "a.md"), "utf8")).toBe("a\nb\nc\nD\n");
        expect(buf.source).toBe("a\nb\nc\nD\n");
        expect(buf.dirty).toBe(false);
        // The next change, a line up now that the one above is gone: shown there, and reverted there.
        expect(floatText(h)).toContain("a.md  line 4 · change 2 of 2 here");
        await h.keys("x");
        expect(readFileSync(join(root, "a.md"), "utf8")).toBe("a\nb\nc\nd\n");
        expect(await said(h, "review: 2 reverted")).toBe(true);
      });
    });
  });

  describe("the merge screen (GIT-D5)", () => {
    test("a note's sides drawn before and after against the base; a code file's side by side where there's room (GIT-D2, GIT-D7)", async () => {
      await isolated(async () => {
        const root = conflicted();
        const h = await harness({ root, open: "sync.md", width: 200, height: 50 });
        await h.app.git.refreshNow();
        await h.app.run("git.merge_screen");
        const text = (l: { spans: { text: string }[] }) => l.spans.map((s) => s.text).join("");
        const frames = () =>
          h.app
            .currentLayout(h.app.floating!.view)
            .lines.map(text)
            .filter((t) => t.startsWith("┌"))
            .map((t) => t.split(" ")[1]);
        // Each side against the base: its line removed, and the one it became added (less than half alike).
        expect(frames()).toEqual(["removed", "added", "removed", "added"]);
        await h.keys("escape");
        // A code file in conflict: each side's lines beside the base's.
        const base = "const a = 1;\nconst b = 2;\nconst c = 3;\n";
        const { root: code } = repo({ "x.ts": base });
        git(code, "switch", "-q", "-c", "theirs");
        commit(code, "x.ts", base.replace("b = 2", "b = 22"));
        git(code, "switch", "-q", "main");
        commit(code, "x.ts", base.replace("b = 2", "b = 3"));
        git(code, "merge", "-q", "theirs");
        const c = await harness({ root: code, open: "x.ts", width: 200, height: 50 });
        await c.app.git.refreshNow();
        await c.app.run("git.merge_screen");
        expect(c.app.floating?.kind).toBe("merge");
        const lines = c.app.currentLayout(c.app.floating!.view).lines.map(text);
        expect(lines.some((t) => /- const b = 2; +│ \+ const b = 3;/.test(t))).toBe(true);
        expect(lines.some((t) => /- const b = 2; +│ \+ const b = 22;/.test(t))).toBe(true);
      });
    });
    test("the merge screen: two conflicts, one taken from each side, saved, staged — git resolved", async () => {
      await isolated(async () => {
        const root = conflicted();
        expect(git(root, "status", "--porcelain")).toBe("UU sync.md");
        const h = await harness({ root, open: "sync.md", width: 120, height: 50 });
        await h.app.git.refreshNow();
        await h.app.run("git.merge_screen");
        expect(h.app.floating?.kind).toBe("merge");
        const card = floatText(h);
        expect(card).toContain("Conflict 1 of 2 · line 3 · not settled");
        // The base from stage 1; each side against it.
        expect(card).toContain("Base\n  Retry forever.");
        expect(card).toContain("Yours · HEAD, against the base\n- Retry forever.\n+ Retry up to a minute.");
        expect(card).toContain("Theirs · theirs, against the base\n- Retry forever.\n+ Retry with a budget.");
        expect(card).toContain("The result · 0 of 2 settled");
        // o: yours; on to the second. t: theirs. The result below, settled.
        await h.keys("o");
        expect(floatText(h)).toContain("Conflict 2 of 2");
        expect(floatText(h)).toContain("@@ conflict 1, line 3: yours");
        // w with one left: refused; the file as it was.
        const before = readFileSync(join(root, "sync.md"), "utf8");
        await h.keys("w");
        expect(await said(h, "1 conflict left: o, t or b settles one, e edits it in the lens")).toBe(true);
        expect(readFileSync(join(root, "sync.md"), "utf8")).toBe(before);
        await h.keys("t");
        expect(await said(h, "conflict 2: theirs — all settled: w saves sync.md")).toBe(true);
        // s before w: saved first.
        await h.keys("s");
        expect(await said(h, "w saves it first")).toBe(true);
        await h.keys("w");
        expect(readFileSync(join(root, "sync.md"), "utf8")).toBe(
          `# Sync\n\nRetry up to a minute.\n\n${MIDDLE}\n\nA 409 drops the op.\nEnd.\n`,
        );
        await h.keys("s");
        expect(await said(h, /^sync\.md staged, marked resolved — no conflict left/)).toBe(true);
        expect(git(root, "status", "--porcelain")).toBe("M  sync.md");
        expect(h.app.floating).toBeNull();
      });
    });

    test("the merge screen marks resolved the file it settled, and only it: a name like a pattern names itself", async () => {
      await isolated(async () => {
        const { root } = repo({ "Why?.md": "one\n", "WhyX.md": "one\n" });
        git(root, "switch", "-q", "-c", "theirs");
        commit(root, "Why?.md", "theirs\n");
        commit(root, "WhyX.md", "theirs\n");
        git(root, "switch", "-q", "main");
        commit(root, "Why?.md", "mine\n");
        commit(root, "WhyX.md", "mine\n");
        git(root, "merge", "-q", "theirs");
        expect(git(root, "status", "--porcelain")).toBe("UU Why?.md\nUU WhyX.md");
        const h = await harness({ root, open: "Why?.md", width: 120, height: 50 });
        await h.app.git.refreshNow();
        await h.app.run("git.merge_screen");
        expect(h.app.floating?.kind).toBe("merge");
        await h.keys("t", "w", "s");
        expect(await said(h, "Why?.md staged, marked resolved — next: WhyX.md")).toBe(true);
        // WhyX.md is still in conflict, its markers not staged.
        expect(git(root, "status", "--porcelain")).toBe("M  Why?.md\nUU WhyX.md");
      });
    });

    test("the merge screen: both either way, e puts the result in the lens, a sends a conflict to the agent", async () => {
      await isolated(async () => {
        const root = conflicted();
        const h = await harness({ root, open: "sync.md", width: 120, height: 50 });
        await h.app.git.refreshNow();
        await h.app.run("git.merge_screen");
        await h.keys("shift+b");
        expect(floatText(h)).toContain("conflict 1, line 3: both, theirs first");
        // a: the conflict, its base between the sides, into the scratch.
        await h.keys("a", ...type("both meant"), "enter");
        const scratch = readFileSync(h.app.scratch.location().path, "utf8");
        expect(scratch).toContain("**At:** `sync.md:");
        // The base between the sides, as diff3 has it: from git's index, the markers lacking it.
        expect(scratch).toContain(
          "<<<<<<< HEAD\nA 409 parks the op.\n||||||| base\nA 409 retries the op.\n=======\nA 409 drops the op.",
        );
        expect(scratch).toContain("**Note:** both meant");
        // e: the result in the file, the one not settled still marked, the lens on it; unsaved, autosave off.
        await h.keys("e");
        expect(h.app.floating).toBeNull();
        const buf = h.app.view!.buf;
        expect(buf.rel).toBe("sync.md");
        expect(buf.source).toContain("Retry with a budget.\nRetry up to a minute.\n");
        expect(buf.source).toContain("<<<<<<< HEAD\nA 409 parks the op.\n=======\n");
        expect(buf.dirty).toBe(true);
        expect(buf.markers).toBe(true);
        // Opened again: what's left, read from the file's markers; b keeps both, yours first.
        await h.app.run("git.merge_screen");
        expect(floatText(h)).toContain("Conflict 1 of 1");
        await h.keys("b", "w");
        expect(readFileSync(join(root, "sync.md"), "utf8")).toContain("A 409 parks the op.\nA 409 drops the op.\n");
      });
    });

    test("x on a conflict in the git panel, and in Problems, opens the merge screen; esc keeps what's settled", async () => {
      await isolated(async () => {
        const root = conflicted(true);
        // Open on the other file in conflict: x takes the one selected, not this note.
        const h = await harness({ root, open: "another.md", width: 120, height: 50 });
        await h.app.run("git.view");
        await h.app.git.refreshNow();
        // The second file in conflict selected: its own.
        h.app.sidebar.selected = h.app.gitPanel
          .rows()
          .findIndex((r) => r.kind === "file" && r.section === "conflicted" && r.entry.path === "sync.md");
        await h.keys("x");
        expect(await until(() => h.app.floating?.kind === "merge")).toBe(true);
        expect(h.app.floating!.title).toBe("Merge — sync.md");
        await h.keys("o", "escape");
        expect(await said(h, "sync.md: 1 of 2 settled, not saved — x opens the merge screen as you left it")).toBe(
          true,
        );
        await h.app.run("problems.open");
        h.app.region = "problems";
        h.app.problems.panel.all.selected = h.app.problems.rows().findIndex((r) => r.conflict?.path === "sync.md");
        await h.keys("x");
        expect(await until(() => h.app.floating?.kind === "merge")).toBe(true);
        expect(floatText(h)).toContain("Conflict 2 of 2");
        expect(floatText(h)).toContain("conflict 1, line 3: yours");
        // The note changed meanwhile: not written over.
        await h.keys("t");
        const buf = h.app.buffers.get("sync.md")!;
        buf.edit(0, 0, "typed ");
        await h.keys("w");
        expect(await said(h, "sync.md changed since the merge screen read it — x reads it again")).toBe(true);
        expect(readFileSync(join(root, "sync.md"), "utf8")).toContain("<<<<<<< HEAD");
      });
    });

    test("ctrl+s and :w save the merge screen as w does (regression)", async () => {
      await isolated(async () => {
        for (const save of [["ctrl+s"], [":", "w", "enter"]]) {
          const root = conflicted();
          const h = await harness({ root, open: "sync.md", width: 120, height: 50 });
          await h.app.git.refreshNow();
          await h.app.run("git.merge_screen");
          await h.keys("o", "t", ...save);
          expect(readFileSync(join(root, "sync.md"), "utf8")).toBe(
            `# Sync\n\nRetry up to a minute.\n\n${MIDDLE}\n\nA 409 drops the op.\nEnd.\n`,
          );
          expect(await said(h, "saved sync.md — s stages it, marking it resolved")).toBe(true);
          expect(h.app.floating?.kind).toBe("merge");
        }
      });
    });

    test("a save refused by a change on disk: the buffer back as the screen read it, x reads the file again (regression)", async () => {
      await isolated(async () => {
        const root = conflicted();
        const h = await harness({ root, open: "sync.md", width: 120, height: 50 });
        await h.app.git.refreshNow();
        await h.app.run("git.merge_screen");
        await h.keys("o", "t");
        // Written meanwhile (an agent), the buffer not read again yet.
        const marked = readFileSync(join(root, "sync.md"), "utf8");
        writeFileSync(join(root, "sync.md"), `${marked}An agent's line.\n`);
        await h.keys("w");
        expect(
          await said(h, "sync.md: not saved — it changed on disk since the merge screen read it; x reads it again"),
        ).toBe(true);
        const buf = h.app.buffers.get("sync.md")!;
        expect(buf.source).toBe(marked);
        expect(buf.dirty).toBe(false);
        expect(readFileSync(join(root, "sync.md"), "utf8")).toBe(`${marked}An agent's line.\n`);
        // x: the file as it is now, its conflicts read again.
        await h.keys("escape");
        await h.app.run("git.merge_screen");
        expect(h.app.floating?.kind).toBe("merge");
        expect(floatText(h)).toContain("Conflict 1 of 2 · line 3 · not settled");
        expect(buf.source).toContain("An agent's line.");
      });
    });

    test("s reads the file again: one changed since w, or with markers still in it, isn't staged (regression)", async () => {
      await isolated(async () => {
        const root = conflicted();
        const h = await harness({ root, open: "sync.md", width: 120, height: 50 });
        await h.app.git.refreshNow();
        await h.app.run("git.merge_screen");
        await h.keys("o", "t", "w");
        // Written again after w (an agent), markers and all.
        writeFileSync(join(root, "sync.md"), "start\n<<<<<<< HEAD\nx\n=======\ny\n>>>>>>> z\nend\n");
        await h.keys("s");
        expect(await said(h, "sync.md changed since it was saved — x reads it again")).toBe(true);
        expect(git(root, "status", "--porcelain")).toBe("UU sync.md");
        // Yours holding marker lines of its own: settled and saved, they're still there, and s says so.
        const { root: own } = repo({ "a.md": "start\nold\nend\n" });
        git(own, "switch", "-q", "-c", "theirs");
        commit(own, "a.md", "start\ntheirs\nend\n");
        git(own, "switch", "-q", "main");
        commit(own, "a.md", "start\n<<<<<<< a\nx\n=======\ny\n>>>>>>> b\nend\n");
        git(own, "merge", "-q", "theirs");
        const o = await harness({ root: own, open: "a.md", width: 120, height: 50 });
        await o.app.git.refreshNow();
        await o.app.run("git.merge_screen");
        await o.keys("o", "w");
        expect(readFileSync(join(own, "a.md"), "utf8")).toContain("<<<<<<< HEAD");
        await o.keys("s");
        expect(await said(o, "a.md still has conflict markers: not staged — e edits them by hand")).toBe(true);
        expect(git(own, "status", "--porcelain")).toBe("UU a.md");
      });
    });

    test("a ======= line inside yours: o and w keep yours whole, as git's index has it (regression)", async () => {
      await isolated(async () => {
        // Yours made the line a heading, its underline seven long, where theirs changed it.
        const { root } = repo({ "a.md": "start\nold\nend\n" });
        git(root, "switch", "-q", "-c", "theirs");
        commit(root, "a.md", "start\ntheirs body\nend\n");
        git(root, "switch", "-q", "main");
        commit(root, "a.md", "start\nSummary\n=======\nours body\nend\n");
        git(root, "merge", "-q", "theirs");
        expect(readFileSync(join(root, "a.md"), "utf8")).toContain("Summary\n=======\nours body\n=======\ntheirs body");
        const h = await harness({ root, open: "a.md", width: 120, height: 50 });
        await h.app.git.refreshNow();
        await h.app.run("git.merge_screen");
        expect(floatText(h)).toContain("Yours · HEAD, against the base");
        await h.keys("o", "w");
        expect(readFileSync(join(root, "a.md"), "utf8")).toBe("start\nSummary\n=======\nours body\nend\n");
      });
    });

    test("a conflict its markers and git's index can't part: o, t and b refused, e edits it by hand (regression)", async () => {
      await isolated(async () => {
        const { root } = repo({ "a.md": "start\nold\nend\n" });
        git(root, "switch", "-q", "-c", "theirs");
        commit(root, "a.md", "start\ntheirs\nend\n");
        git(root, "switch", "-q", "main");
        commit(root, "a.md", "start\nmine\nend\n");
        git(root, "merge", "-q", "theirs");
        // A ======= line written into it since (an agent): neither stage has either way of reading it.
        const marked = "start\n<<<<<<< HEAD\nmine\n=======\ntheirs\n=======\nmore\n>>>>>>> theirs\nend\n";
        writeFileSync(join(root, "a.md"), marked);
        const h = await harness({ root, open: "a.md", width: 120, height: 50 });
        await h.app.git.refreshNow();
        await h.app.run("git.merge_screen");
        expect(h.app.floating?.kind).toBe("merge");
        expect(floatText(h)).toContain("Ambiguous · more than one ======= line could part yours from theirs");
        for (const k of ["o", "t", "b", "shift+b"]) await h.keys(k);
        expect(
          await said(
            h,
            "conflict 1: more than one ======= line could part yours from theirs, and git's index doesn't say which — e edits it by hand",
          ),
        ).toBe(true);
        expect(floatText(h)).toContain("Conflict 1 of 1 · line 2 · not settled");
        await h.keys("w");
        expect(readFileSync(join(root, "a.md"), "utf8")).toBe(marked);
        await h.keys("e");
        expect(h.app.floating).toBeNull();
        expect(h.app.view!.buf.source).toBe(marked);
        expect(h.app.view!.buf.markers).toBe(true);
      });
    });

    test("a fenced example of git's markers in a note in conflict is text: kept byte for byte (regression)", async () => {
      await isolated(async () => {
        const example = "```\n<<<<<<< HEAD\nmine\n=======\nyours\n>>>>>>> branch\n```\n";
        const doc = (end: string) => `# How to settle a conflict\n\n${example}\n${end}\n`;
        const { root } = repo({ "a.md": doc("The end.") });
        git(root, "switch", "-q", "-c", "theirs");
        commit(root, "a.md", doc("Their end."));
        git(root, "switch", "-q", "main");
        commit(root, "a.md", doc("My end."));
        git(root, "merge", "-q", "theirs");
        const h = await harness({ root, open: "a.md", width: 120, height: 50 });
        await h.app.git.refreshNow();
        await h.app.run("git.merge_screen");
        expect(floatText(h)).toContain("Conflict 1 of 1 · line 11");
        await h.keys("o", "w");
        expect(readFileSync(join(root, "a.md"), "utf8")).toBe(doc("My end."));
      });
    });

    test("the conflict prompt's (m)erge settles a conflict on the merge screen; esc goes back to the prompt", async () => {
      await isolated(async () => {
        const { root } = repo({ "a.md": "one\ntwo\nthree\n" });
        const h = await harness({ root, open: "a.md", width: 120, height: 50 });
        const buf = h.app.view!.buf;
        buf.edit(buf.source.indexOf("two"), 3, "TWO");
        writeFileSync(join(root, "a.md"), "one\ntwo-t\nthree\n");
        h.app.saving.resolveConflict(buf, "m");
        expect(h.app.floating?.kind).toBe("merge");
        expect(floatText(h)).toContain("Yours · yours, against the base\n- two\n+ TWO");
        await h.keys("escape");
        expect(list(h).title).toBe("a.md changed on disk, and you have unsaved changes");
        await h.keys("m", "t", "w");
        expect(readFileSync(join(root, "a.md"), "utf8")).toBe("one\ntwo-t\nthree\n");
        expect(buf.dirty).toBe(false);
        expect(await said(h, "merged and saved a.md")).toBe(true);
        expect(h.app.floating).toBeNull();
      });
    });
  });

  describe("pulling where both sides moved, and rebasing (GIT-D6)", () => {
    test("a merge settled on the merge screen, then concluded: the top bar says it; shift+r offers continue, abort", async () => {
      await isolated(async () => {
        const root = conflicted();
        const h = await harness({ root, open: "sync.md", width: 2 * stringWidth(root) + 120, height: 50 });
        await h.app.git.refreshNow();
        await h.app.run("git.merge_screen");
        await h.keys("o", "t", "w", "s");
        expect(await said(h, "sync.md staged, marked resolved — no conflict left: shift+r concludes the merge")).toBe(
          true,
        );
        // The top bar says a merge is under way; shift+r offers continue and abort (skip is a rebase's).
        expect(topRow(h.frame())).toContain("main merging");
        await h.app.run("git.rebase");
        expect(list(h).title).toBe("Merging theirs");
        expect(list(h).items.map((i) => i.label)).toEqual(["(c) Continue", "(a) Abort"]);
        await h.keys("escape");
        await h.app.run("git.continue");
        expect(await said(h, /^merged: the merge committed/)).toBe(true);
        expect(git(root, "log", "-1", "--format=%s")).toBe("Merge branch 'theirs'");
        expect(topRow(h.frame())).not.toContain("merging");
      });
    });

    test("a pull where both sides moved asks: merge, rebase or nothing — git's pull.rebase the default", async () => {
      await isolated(async () => {
        const { root, other } = repo({ "a.md": "a\n" }, true);
        commit(other, "b.md", "theirs\n");
        git(other, "push", "-q");
        commit(root, "c.md", "mine\n");
        const h = await harness({ root, open: "a.md", width: 120, height: 40 });
        const head = git(root, "rev-parse", "HEAD");
        await h.app.run("git.pull");
        expect(await until(() => h.app.overlay?.kind === "list")).toBe(true);
        expect(list(h).title).toBe("main and origin/main have both moved on — bring them together?");
        expect(list(h).selected).toBe(0);
        expect(list(h).items[0]!.detail).toContain("the default (pull.rebase)");
        // Nothing: as they were.
        await h.keys("n");
        expect(await said(h, "nothing pulled: main and origin/main as they were")).toBe(true);
        expect(git(root, "rev-parse", "HEAD")).toBe(head);
        // Merge: a merge commit with both.
        await h.app.run("git.pull");
        expect(await until(() => h.app.overlay?.kind === "list")).toBe(true);
        await h.keys("m");
        expect(await said(h, "pulled: merged origin/main into main — this vault isn't trusted, so no hook ran")).toBe(
          true,
        );
        expect(git(root, "log", "-1", "--format=%P").split(" ").length).toBe(2);
        expect(existsSync(join(root, "b.md"))).toBe(true);
        // pull.rebase true: rebase the default, and done.
        commit(other, "d.md", "theirs again\n");
        git(other, "push", "-q");
        commit(root, "e.md", "mine again\n");
        git(root, "config", "pull.rebase", "true");
        await h.app.run("git.pull");
        expect(await until(() => h.app.overlay?.kind === "list")).toBe(true);
        expect(list(h).selected).toBe(1);
        await h.keys("enter");
        expect(await said(h, /^pulled: main rebased onto origin\/main/)).toBe(true);
        expect(git(root, "log", "-1", "--format=%P").split(" ").length).toBe(1);
        expect(existsSync(join(root, "d.md"))).toBe(true);
      });
    });

    /** A branch behind main, both having changed the same line: a rebase onto main stops there. */
    const behind = () => {
      const { root } = repo({ "a.md": "one\ntwo\nthree\n", "b.md": "b\n" });
      git(root, "switch", "-q", "-c", "agent");
      commit(root, "a.md", "one\nagent's two\nthree\n", "Agent: two");
      commit(root, "b.md", "b, the agent's\n", "Agent: b");
      git(root, "switch", "-q", "main");
      commit(root, "a.md", "one\nmain's two\nthree\n", "Main: two");
      git(root, "switch", "-q", "agent");
      return root;
    };

    test("shift+r rebases onto the base: asked, stopped at a conflict, the merge screen, the top bar; continued", async () => {
      await isolated(async () => {
        const root = behind();
        const h = await harness({ root, open: "b.md", width: 2 * stringWidth(root) + 120, height: 50 });
        await h.app.run("git.view");
        await h.app.git.refreshNow();
        await h.keys("shift+r");
        expect(h.app.overlay).toMatchObject({
          kind: "prompt",
          label: "Rebase agent onto main? Its 2 commits replayed after main's 1 new.",
        });
        await h.keys("y");
        expect(await until(() => h.app.floating?.kind === "merge")).toBe(true);
        expect(
          await said(
            h,
            /^the rebase stopped at commit 1 of 2: 1 file in conflict \(a\.md\) — settle on the merge screen/,
          ),
        ).toBe(true);
        expect(floatText(h)).toContain("Rebasing: yours is what's rebased onto; theirs, the commit being replayed");
        expect(topRow(h.frame())).toContain("agent rebasing 1/2");
        // Settled, saved, staged; shift+r: continue.
        await h.keys("t", "w", "s");
        expect(await said(h, /^a\.md staged, marked resolved — no conflict left: shift\+r continues the rebase/)).toBe(
          true,
        );
        h.app.region = "sidebar";
        await h.keys("shift+r");
        expect(list(h).items.map((i) => i.label)).toEqual(["(c) Continue", "(s) Skip this commit", "(a) Abort"]);
        await h.keys("c");
        expect(await said(h, /^rebased: the rebase is done/)).toBe(true);
        expect(git(root, "log", "--format=%s", "main..agent")).toBe("Agent: b\nAgent: two");
        expect(readFileSync(join(root, "a.md"), "utf8")).toBe("one\nagent's two\nthree\n");
        expect(topRow(h.frame())).not.toContain("rebasing");
      });
    });

    test("a rebase that stops while you type: the merge screen not opened over the text, x named (regression)", async () => {
      await isolated(async () => {
        const root = behind();
        const h = await harness({ root, open: "b.md", width: 120, height: 50 });
        await h.app.run("git.rebase");
        await h.keys("y");
        // Back to typing while git runs.
        await h.keys("i");
        expect(h.app.view!.insert).toBe(true);
        expect(
          await said(
            h,
            /^the rebase stopped at commit 1 of 2: 1 file in conflict \(a\.md\) — x in source control opens the merge screen \(:resolve\), s stages/,
          ),
        ).toBe(true);
        expect(h.app.floating).toBeNull();
        // The letters go into the note, none of them the merge screen's.
        await h.keys("t", "w", "s");
        expect(h.app.view!.buf.rel).toBe("b.md");
        expect(h.app.view!.buf.source).toStartWith("tws");
        expect(git(root, "status", "--porcelain")).toContain("UU a.md");
        // Typing done: x opens it.
        await h.keys("escape");
        await h.app.run("git.merge_screen");
        expect(h.app.floating?.kind).toBe("merge");
      });
    });

    test("a pull where both sides moved, while a question is open: said, not asked over it (regression)", async () => {
      await isolated(async () => {
        const { root, other } = repo({ "a.md": "a\n" }, true);
        commit(other, "b.md", "theirs\n");
        git(other, "push", "-q");
        commit(root, "c.md", "mine\n");
        const h = await harness({ root, open: "a.md", width: 120, height: 40 });
        await h.app.run("git.pull");
        // A question of its own opened while git pulls: its letters aren't the pull's m, r and n.
        h.app.overlays.confirm("Something else?", () => {});
        expect(
          await said(
            h,
            "main and origin/main have both moved on — p in source control (:pull) asks how to bring them together",
          ),
        ).toBe(true);
        expect(h.app.overlay).toMatchObject({ kind: "prompt", label: "Something else?" });
      });
    });

    test("a rebase aborted, asked first: the branch as it was; again, the conflicting commit skipped", async () => {
      await isolated(async () => {
        const root = behind();
        const was = git(root, "rev-parse", "agent");
        const h = await harness({ root, open: "b.md", width: 120, height: 50 });
        await h.app.run("git.rebase");
        await h.keys("y");
        expect(await until(() => h.app.floating?.kind === "merge")).toBe(true);
        await h.keys("escape");
        // Asked first, as a rebase is: n leaves it under way; y gives it up.
        await h.app.run("git.abort");
        expect(h.app.overlay).toMatchObject({
          kind: "prompt",
          confirm: true,
          label: "Abort the rebase? agent goes back as it was before it, and what's settled so far is lost.",
        });
        await h.keys("n");
        expect(existsSync(join(root, ".git", "rebase-merge"))).toBe(true);
        expect(git(root, "status", "--porcelain")).toBe("UU a.md");
        await h.app.run("git.abort");
        await h.keys("y");
        expect(await said(h, "the rebase aborted: agent as it was — this vault isn't trusted, so no hook ran")).toBe(
          true,
        );
        expect(git(root, "rev-parse", "HEAD")).toBe(was);
        expect(git(root, "status", "--porcelain")).toBe("");
        await h.app.run("git.rebase");
        await h.keys("y");
        expect(await until(() => h.app.floating?.kind === "merge")).toBe(true);
        await h.keys("escape");
        // Continue refused while a file is in conflict.
        await h.app.run("git.continue");
        expect(await said(h, /^still in conflict: a\.md/)).toBe(true);
        await h.app.run("git.skip");
        expect(await said(h, /^rebased: the rebase is done, a commit skipped/)).toBe(true);
        expect(git(root, "log", "--format=%s", "main..agent")).toBe("Agent: b");
      });
    });

    test("a cherry-pick begun in a terminal, stopped at a conflict: named, settled on the merge screen, continued, aborted", async () => {
      await isolated(async () => {
        const { root } = repo({ "a.md": "one\ntwo\nthree\n", "b.md": "b\n" });
        git(root, "switch", "-q", "-c", "other");
        commit(root, "a.md", "one\nother's two\nthree\n", "Other: two");
        commit(root, "b.md", "b, other's\n", "Other: b");
        git(root, "switch", "-q", "main");
        commit(root, "a.md", "one\nmain's two\nthree\n", "Main: two");
        commit(root, "b.md", "b, main's\n", "Main: b");
        const was = git(root, "rev-parse", "HEAD");
        // Both of other's commits, in a terminal: it stops at the first.
        git(root, "cherry-pick", "other~1", "other");
        expect(git(root, "status", "--porcelain")).toBe("UU a.md");
        const h = await harness({ root, open: "a.md", width: 2 * stringWidth(root) + 120, height: 50 });
        await h.app.run("git.view");
        await h.app.git.refreshNow();
        expect(topRow(h.frame())).toContain("main cherry-picking");
        const ids = () => h.app.gitPanel.buttons().map((b) => b.id);
        expect(ids()).toEqual(expect.arrayContaining(["resolve", "continue", "skip", "abort"]));
        const desc = (id: string) => h.app.gitPanel.buttons().find((b) => b.id === id)?.desc;
        expect(desc("continue")).toBe("commits what's settled, and picks the next, if there's one");
        expect(desc("abort")).toBe("the branch back where it was before the cherry-pick");
        await h.app.run("git.rebase");
        expect(list(h).title).toBe('Cherry-picking "Other: two" — 1 file in conflict');
        expect(list(h).items.map((i) => i.label)).toEqual([
          "(x) Settle the conflicts",
          "(c) Continue",
          "(s) Skip this commit",
          "(a) Abort",
        ]);
        // x: the merge screen on it; settled, saved, staged.
        await h.keys("x");
        expect(h.app.floating?.kind).toBe("merge");
        await h.keys("t", "w", "s");
        expect(
          await said(h, "a.md staged, marked resolved — no conflict left: shift+r continues the cherry-pick"),
        ).toBe(true);
        // Continued: the first committed with its message, the second picked, stopped at its own conflict — the merge
        // screen opens on it, as a rebase's stop does.
        await h.app.run("git.continue");
        expect(
          await said(
            h,
            /^the cherry-pick stopped: 1 file in conflict \(b\.md\) — settle on the merge screen, s stages, then shift\+r continues/,
          ),
        ).toBe(true);
        expect(await until(() => h.app.floating?.kind === "merge")).toBe(true);
        expect(h.app.floating!.title).toBe("Merge — b.md");
        expect(git(root, "log", "-1", "--format=%s")).toBe("Other: two");
        // Aborted, asked first: main as it was before the series.
        await h.keys("escape");
        await h.app.run("git.abort");
        expect(h.app.overlay).toMatchObject({
          kind: "prompt",
          confirm: true,
          label: "Abort the cherry-pick? main goes back as it was before it, and what's settled so far is lost.",
        });
        await h.keys("y");
        expect(await said(h, /^the cherry-pick aborted: main as it was/)).toBe(true);
        expect(git(root, "rev-parse", "HEAD")).toBe(was);
        expect(git(root, "status", "--porcelain")).toBe("");
        expect(topRow(h.frame())).not.toContain("cherry-picking");
      });
    });

    test("a revert begun in a terminal, stopped at a conflict: named, settled, continued; another aborted", async () => {
      await isolated(async () => {
        const { root } = repo({ "a.md": "one\ntwo\nthree\n" });
        commit(root, "a.md", "one\nTWO\nthree\n", "Shout two");
        commit(root, "a.md", "one\nTWO, again\nthree\n", "Again");
        // Reverting the first, the line changed again since: a conflict.
        git(root, "revert", "--no-edit", "HEAD~1");
        expect(git(root, "status", "--porcelain")).toBe("UU a.md");
        const h = await harness({ root, open: "a.md", width: 2 * stringWidth(root) + 120, height: 50 });
        await h.app.git.refreshNow();
        expect(topRow(h.frame())).toContain("main reverting");
        await h.app.run("git.rebase");
        expect(list(h).title).toBe('Reverting "Shout two" — 1 file in conflict');
        expect(list(h).items.map((i) => i.label)).toContain("(s) Skip this commit");
        await h.keys("escape");
        await h.app.run("git.merge_screen");
        await h.keys("t", "w", "s");
        expect(await said(h, "a.md staged, marked resolved — no conflict left: shift+r continues the revert")).toBe(
          true,
        );
        await h.app.run("git.continue");
        expect(await said(h, /^reverted: the revert is done/)).toBe(true);
        expect(git(root, "log", "-1", "--format=%s")).toBe('Revert "Shout two"');
        expect(readFileSync(join(root, "a.md"), "utf8")).toBe("one\ntwo\nthree\n");
        // Another, aborted after asking: the branch as it was.
        const was = git(root, "rev-parse", "HEAD");
        git(root, "revert", "--no-edit", "HEAD~1");
        await h.app.git.refreshNow();
        expect(topRow(h.frame())).toContain("main reverting");
        await h.app.run("git.abort");
        expect(h.app.overlay).toMatchObject({
          kind: "prompt",
          label: "Abort the revert? main goes back as it was before it, and what's settled so far is lost.",
        });
        await h.keys("y");
        expect(await said(h, /^the revert aborted: main as it was/)).toBe(true);
        expect(git(root, "rev-parse", "HEAD")).toBe(was);
        expect(git(root, "status", "--porcelain")).toBe("");
      });
    });

    test("nothing under way: continue, skip and abort say so; shift+r on the base says there's nothing to rebase", async () => {
      await isolated(async () => {
        const { root } = repo({ "a.md": "a\n" });
        const h = await harness({ root, open: "a.md", width: 120, height: 40 });
        await h.app.run("git.continue");
        expect(await said(h, "no merge, rebase, cherry-pick or revert under way")).toBe(true);
        await h.app.run("git.skip");
        expect(await said(h, "no rebase, cherry-pick or revert under way: only they skip a commit")).toBe(true);
        await h.app.run("git.rebase");
        expect(await said(h, "main is the base: nothing to rebase it onto")).toBe(true);
      });
    });
  });

  describe("a rebase over files changed: stashed and put back, asked (D247)", () => {
    /** A branch behind main, main having changed b.md and the branch made c.md: its rebase meets no conflict. */
    const apart = () => {
      const { root } = repo({ "a.md": "a\n", "b.md": "b\n" });
      git(root, "switch", "-q", "-c", "agent");
      commit(root, "c.md", "c\n", "Agent: c");
      git(root, "switch", "-q", "main");
      commit(root, "b.md", "b, main's\n", "Main: b");
      git(root, "switch", "-q", "agent");
      return root;
    };
    /** A message matching `text` said after the first `from` of them. */
    const saidSince = (h: Harness, from: number, text: string) =>
      until(() => h.app.messages.slice(from).some((m) => m.text === text));
    const rebased = (root: string) => git(root, "merge-base", "main", "agent") === git(root, "rev-parse", "main");

    test("shift+r with files changed asks to stash them too: no, nothing happens; yes, rebased and put back", async () => {
      await isolated(async () => {
        const root = apart();
        const was = git(root, "rev-parse", "HEAD");
        // A change not staged and one staged; an untracked file isn't one git refuses over.
        writeFileSync(join(root, "a.md"), "a, mine\n");
        writeFileSync(join(root, "c.md"), "c, staged\n");
        git(root, "add", "c.md");
        writeFileSync(join(root, "u.md"), "untracked\n");
        const h = await harness({ root, open: "u.md", width: 120, height: 50 });
        await h.app.run("git.rebase");
        const asked = {
          kind: "prompt",
          confirm: true,
          label:
            "Stash your changes, rebase agent onto main, put them back? 2 files changed; its 1 commit replayed after main's 1 new.",
        };
        expect(h.app.overlay).toMatchObject(asked);
        // No: nothing happens — no rebase, no stash, the changes where they were.
        await h.keys("n");
        expect(h.app.overlay).toBeNull();
        expect(h.app.messages.some((m) => /rebasing|cannot rebase/.test(m.text))).toBe(false);
        expect(git(root, "rev-parse", "HEAD")).toBe(was);
        expect(git(root, "stash", "list")).toBe("");
        expect(readFileSync(join(root, "a.md"), "utf8")).toBe("a, mine\n");
        // Yes: rebased with them stashed, and they're back.
        await h.app.run("git.rebase");
        expect(h.app.overlay).toMatchObject(asked);
        await h.keys("y");
        expect(await said(h, "rebased agent onto main — this vault isn't trusted, so no hook ran")).toBe(true);
        expect(rebased(root)).toBe(true);
        expect(readFileSync(join(root, "a.md"), "utf8")).toBe("a, mine\n");
        expect(readFileSync(join(root, "c.md"), "utf8")).toBe("c, staged\n");
        expect(readFileSync(join(root, "u.md"), "utf8")).toBe("untracked\n");
        expect(git(root, "stash", "list")).toBe("");
      });
    });

    test("shift+r on a clean tree, a note unsaved: saving it changes a file, so the stash is asked about then", async () => {
      await isolated(async () => {
        const root = apart();
        const h = await harness({ root, open: "a.md", width: 120, height: 50 });
        const buf = h.app.view!.buf;
        buf.edit(buf.source.indexOf("a"), 1, "A");
        await h.app.run("git.rebase");
        expect(h.app.overlay).toMatchObject({
          kind: "prompt",
          label: "Rebase agent onto main? Its 1 commit replayed after main's 1 new.",
        });
        await h.keys("y");
        expect(list(h).title).toBe("Unsaved: a.md");
        expect(list(h).items[0]!.label).toBe("Save them, then rebase");
        await h.keys("enter");
        expect(h.app.overlay).toMatchObject({
          kind: "prompt",
          label: "Stash your changes, rebase agent onto main, put them back? 1 file changed.",
        });
        await h.keys("y");
        expect(await said(h, "rebased agent onto main — this vault isn't trusted, so no hook ran")).toBe(true);
        expect(rebased(root)).toBe(true);
        expect(readFileSync(join(root, "a.md"), "utf8")).toBe("A\n");
        expect(git(root, "stash", "list")).toBe("");
      });
    });

    test("shift+r: changes that conflict going back are kept in the stash, named, the file in conflict said", async () => {
      await isolated(async () => {
        const root = apart();
        // main changed b.md's line; so did you.
        writeFileSync(join(root, "b.md"), "b, mine\n");
        const h = await harness({ root, open: "a.md", width: 120, height: 50 });
        await h.app.run("git.rebase");
        expect(h.app.overlay).toMatchObject({
          label:
            "Stash your changes, rebase agent onto main, put them back? 1 file changed; its 1 commit replayed after main's 1 new.",
        });
        await h.keys("y");
        expect(
          await said(
            h,
            `rebased agent onto main — your changes conflicted going back, so git kept them in the stash, stash@{0} ("autostash"): 1 file in conflict (b.md) — x in source control settles it (:resolve), then drop the stash (z) — this vault isn't trusted, so no hook ran`,
          ),
        ).toBe(true);
        expect(rebased(root)).toBe(true);
        expect(git(root, "stash", "list", "--format=%gd %gs")).toBe("stash@{0} autostash");
        expect(git(root, "show", "stash@{0}:b.md")).toBe("b, mine");
        expect(git(root, "status", "--porcelain", "--untracked-files=no")).toBe("UU b.md");
      });
    });

    test("shift+r over untracked files alone: asked as ever, and git's to judge — its refusal said where one's in the way", async () => {
      await isolated(async () => {
        const root = apart();
        // main makes n.md; here an untracked n.md is in its way.
        git(root, "switch", "-q", "main");
        commit(root, "n.md", "main's n\n", "Main: n");
        git(root, "switch", "-q", "agent");
        writeFileSync(join(root, "n.md"), "my n\n");
        const h = await harness({ root, open: "a.md", width: 120, height: 50 });
        await h.app.run("git.rebase");
        expect(h.app.overlay).toMatchObject({
          kind: "prompt",
          label: "Rebase agent onto main? Its 1 commit replayed after main's 2 new.",
        });
        await h.keys("y");
        expect(
          await said(h, /^git: The following untracked working tree files would be overwritten by checkout: n\.md/),
        ).toBe(true);
        expect(rebased(root)).toBe(false);
        expect(readFileSync(join(root, "n.md"), "utf8")).toBe("my n\n");
        expect(git(root, "stash", "list")).toBe("");
      });
    });

    test("a pull's rebase with files changed asks to stash them: no, nothing; yes, rebased and put back; clean, not asked", async () => {
      await isolated(async () => {
        const { root, other } = repo({ "a.md": "a\n" }, true);
        commit(other, "b.md", "theirs\n");
        git(other, "push", "-q");
        commit(root, "c.md", "mine\n");
        const h = await harness({ root, open: "a.md", width: 120, height: 40 });
        const rebaseAnswer = async () => {
          await h.app.run("git.pull");
          expect(await until(() => h.app.overlay?.kind === "list")).toBe(true);
          await h.keys("r");
        };
        const done = "pulled: main rebased onto origin/main — this vault isn't trusted, so no hook ran";
        // A clean working tree: rebased at once, as ever.
        await rebaseAnswer();
        expect(h.app.overlay).toBeNull();
        expect(await said(h, done)).toBe(true);
        expect(existsSync(join(root, "b.md"))).toBe(true);
        // Both moved again, and a.md changed here: asked.
        commit(other, "d.md", "theirs again\n");
        git(other, "push", "-q");
        commit(root, "e.md", "mine again\n");
        writeFileSync(join(root, "a.md"), "a, mine\n");
        const head = git(root, "rev-parse", "HEAD");
        await rebaseAnswer();
        expect(h.app.overlay).toMatchObject({
          kind: "prompt",
          confirm: true,
          label: "Stash your changes, rebase main onto origin/main, put them back? 1 file changed.",
        });
        // No: nothing pulled, the change where it was.
        await h.keys("n");
        expect(h.app.overlay).toBeNull();
        expect(git(root, "rev-parse", "HEAD")).toBe(head);
        expect(git(root, "stash", "list")).toBe("");
        expect(readFileSync(join(root, "a.md"), "utf8")).toBe("a, mine\n");
        // Yes: rebased with it stashed, and it's back.
        const from = h.app.messages.length;
        await rebaseAnswer();
        await h.keys("y");
        expect(await saidSince(h, from, done)).toBe(true);
        expect(existsSync(join(root, "d.md"))).toBe(true);
        expect(git(root, "log", "-1", "--format=%s")).toBe("e.md: mine again");
        expect(git(root, "log", "-1", "--format=%P").split(" ").length).toBe(1);
        expect(readFileSync(join(root, "a.md"), "utf8")).toBe("a, mine\n");
        expect(git(root, "stash", "list")).toBe("");
      });
    });
  });
});
