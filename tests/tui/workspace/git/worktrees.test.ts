import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { type ListOverlay, App } from "../../../../src/tui/app/runtime/app.ts";
import { stringWidth } from "../../../../src/core/foundation/text/width.ts";
import { makeSandbox, makeVault, harness, onlyRootsUnder, statusRow, topRow } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
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
    const { tildePath } = await import("../../../../src/core/workspace/vaults/names.ts");
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
    const { readFolders, recordFolder } = await import("../../../../src/core/workspace/vaults/folders.ts");
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
    const { readFolders, recordFolder } = await import("../../../../src/core/workspace/vaults/folders.ts");
    const { tildePath } = await import("../../../../src/core/workspace/vaults/names.ts");
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
    const { readFolders, recordFolder } = await import("../../../../src/core/workspace/vaults/folders.ts");
    const { tildePath } = await import("../../../../src/core/workspace/vaults/names.ts");
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
    const { recordFolder } = await import("../../../../src/core/workspace/vaults/folders.ts");
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
    const { recordFolder } = await import("../../../../src/core/workspace/vaults/folders.ts");
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
    expect((h4.app.overlay as import("../../../../src/tui/app/runtime/app.ts").PromptOverlay).text).toBe(
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
    const { PositionStore } = await import("../../../../src/core/workspace/session/position.ts");
    const { locateVault, recordLocation } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const { tildePath } = await import("../../../../src/core/workspace/vaults/names.ts");
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
    const { setTrust, trustOf } = await import("../../../../src/core/workspace/vaults/trust.ts");
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
    const { locateVault, recordLocation } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const { prepare } = await import("../../../../src/tui/shell/terminal/run.ts");
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
    const { prepare } = await import("../../../../src/tui/shell/terminal/run.ts");
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
    const { locateVault, recordLocation } = await import("../../../../src/core/workspace/vaults/vault.ts");
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
    const { elsewhereAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const h = await harness({ loc: elsewhereAt(l.wts), open: null });
    h.app.panels.showSidebar(true);
    const f = h.frame();
    expect(f).toMatch(/feat +⎇ feat/);
    expect(f).toMatch(/fix +⎇ fix/);
  });
});
