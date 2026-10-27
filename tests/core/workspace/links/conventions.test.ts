import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { DEFAULT_CONFIG, loadConfig } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";

import { elsewhereAt, locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import { cli } from "../../../support/vault-cli.ts";
import { makeVaultSandbox } from "../../../support/vault-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeVaultSandbox();

describe("the links' convention, found (21.4)", () => {
  const notes = (links: [string, string][]) =>
    links.map(([kind, target]) => ({ kind, target, resolvedKind: "note", path: "x.md" }));
  test("the notes' links counted by style, path and extension: only those reaching a note in the root", async () => {
    const { countForms } = await import("../../../../src/core/workspace/links/convention.ts");
    const c = countForms([
      ...notes([
        ["wiki", "Dal"],
        ["embed", "Recipes/Dal"],
        ["wiki", "../up/Dal.md"],
        ["wiki", "/Recipes/Dal"],
      ]),
      ...notes([
        ["markdown", "a.md#top"],
        ["markdown", "../b"],
        ["markdown", "/docs/c.md"],
        ["image", "sub/d e.md?x"],
        ["markdown", "~/x.md"],
        ["markdown", "file:///x.md"],
      ]),
      { kind: "markdown", target: "gone.md", resolvedKind: "unresolved", path: null },
      { kind: "markdown", target: "pic.png", resolvedKind: "file", path: "pic.png" },
      { kind: "markdown", target: "../other/x.md", resolvedKind: "note", path: "/elsewhere/x.md" },
    ]);
    expect(c.style).toEqual({ markdown: 4, wiki: 4 });
    expect(c.path.wiki).toEqual({ relative: 1, root: 2, name: 1 });
    expect(c.path.markdown).toEqual({ relative: 3, root: 1, name: 0 });
    expect(c.extension.wiki).toEqual({ kept: 1, dropped: 3 });
    expect(c.extension.markdown).toEqual({ kept: 3, dropped: 1 });
  });

  test("Obsidian's and zk's settings read, their defaults where a key is unset; a template says nothing", async () => {
    const { toolSays } = await import("../../../../src/core/workspace/links/convention.ts");
    const at = (files: Record<string, string | null>) => {
      const dir = mkdtempSync(join(tmpdir(), "slipbox-tool-"));
      for (const [f, text] of Object.entries(files)) {
        mkdirSync(join(dir, dirname(f)), { recursive: true });
        if (text !== null) writeFileSync(join(dir, f), text);
      }
      const t = toolSays(dir);
      return (
        t && {
          tool: t.tool,
          file: t.file,
          style: t.style,
          wiki: [t.path("wiki"), t.extension("wiki")],
          markdown: [t.path("markdown"), t.extension("markdown")],
        }
      );
    };
    expect(at({ ".obsidian/x": null })).toEqual({
      tool: "obsidian",
      file: ".obsidian/",
      style: "wiki",
      wiki: ["name", "dropped"],
      markdown: [undefined, "kept"],
    });
    expect(at({ ".obsidian/app.json": '{"useMarkdownLinks": true, "newLinkFormat": "relative",}' })).toMatchObject({
      file: ".obsidian/app.json",
      style: "markdown",
      markdown: ["relative", "kept"],
    });
    expect(at({ ".obsidian/app.json": '{"newLinkFormat": "absolute"}' })).toMatchObject({
      style: "wiki",
      wiki: ["root", "dropped"],
    });
    expect(at({ ".obsidian/app.json": "not json" })).toMatchObject({ file: ".obsidian/", style: "wiki" }); // unreadable: Obsidian's defaults
    expect(at({ ".zk/x": null })).toEqual({
      tool: "zk",
      file: ".zk/",
      style: "markdown",
      wiki: ["root", "dropped"],
      markdown: ["relative", "dropped"],
    });
    expect(
      at({ ".zk/config.toml": '[format.markdown]\nlink-format = "wiki"\nlink-drop-extension = false\n' }),
    ).toMatchObject({ file: ".zk/config.toml", style: "wiki", wiki: ["root", "kept"] });
    expect(at({ ".zk/config.toml": '[format.markdown]\nlink-format = "[[{{filename}}]]"\n' })).toMatchObject({
      style: undefined,
      wiki: [undefined, "dropped"],
    });
    expect(at({ ".git/HEAD": "ref" })).toBeNull();
  });

  test("a zk config that doesn't parse (a typo mid-edit): zk's defaults, as an Obsidian app.json that doesn't", async () => {
    const { toolSays } = await import("../../../../src/core/workspace/links/convention.ts");
    const dir = mkdtempSync(join(tmpdir(), "slipbox-tool-zkbad-"));
    mkdirSync(join(dir, ".zk"));
    writeFileSync(
      join(dir, ".zk", "config.toml"),
      '[format.markdown\nlink-format = "wiki"\nlink-drop-extension = false\n',
    );
    const t = toolSays(dir)!;
    expect({
      tool: t.tool,
      file: t.file,
      style: t.style,
      wiki: [t.path("wiki"), t.extension("wiki")],
      markdown: [t.path("markdown"), t.extension("markdown")],
    }).toEqual({
      tool: "zk",
      file: ".zk/",
      style: "markdown",
      wiki: ["root", "dropped"],
      markdown: ["relative", "dropped"],
    });
  });

  test("each part the first that says: your setting, the root's tool, its notes at two-thirds, ours", async () => {
    const { emptyCounts, findConvention } = await import("../../../../src/core/workspace/links/convention.ts");
    const auto = { style: "auto", path: "auto", extension: "auto" } as const;
    const counts = (
      style: [number, number],
      wikiPath: [number, number, number],
      wikiExt: [number, number],
      mdPath: [number, number, number] = [0, 0, 0],
      mdExt: [number, number] = [0, 0],
    ) => {
      const c = emptyCounts();
      [c.style.markdown, c.style.wiki] = style;
      [c.path.wiki.relative, c.path.wiki.root, c.path.wiki.name] = wikiPath;
      [c.extension.wiki.kept, c.extension.wiki.dropped] = wikiExt;
      [c.path.markdown.relative, c.path.markdown.root, c.path.markdown.name] = mdPath;
      [c.extension.markdown.kept, c.extension.markdown.dropped] = mdExt;
      return c;
    };
    const parts = (c: ReturnType<typeof findConvention>) =>
      [c.style, c.path, c.extension].map((p) => `${p.value}:${p.source}`);
    const obsidian = {
      tool: "obsidian" as const,
      file: ".obsidian/app.json",
      style: "wiki" as const,
      path: (s: string) => (s === "wiki" ? ("name" as const) : undefined),
      extension: (s: string) => (s === "wiki" ? ("dropped" as const) : ("kept" as const)),
    };
    // Nothing says: ours.
    expect(parts(findConvention({ links: auto, origins: {}, hasRoot: true, tool: null, counts: null }))).toEqual([
      "markdown:default",
      "relative:default",
      "kept:default",
    ]);
    // The notes, each part within the style they chose: two-thirds is enough.
    expect(
      parts(
        findConvention({
          links: auto,
          origins: {},
          hasRoot: true,
          tool: null,
          counts: counts([1, 2], [0, 2, 1], [1, 2]),
        }),
      ),
    ).toEqual(["wiki:notes", "root:notes", "dropped:notes"]);
    // Under two-thirds: ours for that part (a root mixing forms).
    expect(
      parts(
        findConvention({
          links: auto,
          origins: {},
          hasRoot: true,
          tool: null,
          counts: counts([4, 6], [3, 3, 4], [5, 5]),
        }),
      ),
    ).toEqual(["markdown:default", "relative:default", "kept:default"]);
    // The tool before the notes.
    expect(
      parts(
        findConvention({
          links: auto,
          origins: {},
          hasRoot: true,
          tool: obsidian,
          counts: counts([10, 0], [0, 0, 0], [0, 0], [0, 10, 0], [0, 10]),
        }),
      ),
    ).toEqual(["wiki:tool", "name:tool", "dropped:tool"]);
    // Your setting before the tool; the tool's "shortest" isn't a path for a markdown link: the notes', else ours.
    const md = findConvention({
      links: { ...auto, style: "markdown" },
      origins: { "links.style": ".slipbox/config.toml" },
      hasRoot: true,
      tool: obsidian,
      counts: counts([3, 0], [0, 0, 0], [0, 0], [0, 3, 0], [3, 0]),
    });
    expect(parts(md)).toEqual(["markdown:setting", "root:notes", "kept:tool"]);
    expect(md.style.why).toBe("[links] in .slipbox/config.toml");
    expect(
      parts(
        findConvention({
          links: { ...auto, style: "markdown" },
          origins: {},
          hasRoot: true,
          tool: obsidian,
          counts: null,
        }),
      ),
    ).toEqual(["markdown:setting", "relative:default", "kept:tool"]);
    // A path by name, set, fits only a wikilink.
    expect(
      parts(
        findConvention({
          links: { style: "markdown", path: "name", extension: "drop" },
          origins: {},
          hasRoot: true,
          tool: null,
          counts: null,
        }),
      ),
    ).toEqual(["markdown:setting", "relative:default", "dropped:setting"]);
    expect(
      parts(
        findConvention({
          links: { style: "wiki", path: "name", extension: "keep" },
          origins: {},
          hasRoot: true,
          tool: null,
          counts: null,
        }),
      ),
    ).toEqual(["wiki:setting", "name:setting", "kept:setting"]);
    // No root: your setting, else ours — no tool, no notes.
    expect(
      parts(
        findConvention({
          links: { ...auto, extension: "drop" },
          origins: {},
          hasRoot: false,
          tool: obsidian,
          counts: counts([0, 9], [0, 0, 9], [0, 9]),
        }),
      ),
    ).toEqual(["markdown:default", "relative:default", "dropped:setting"]);
    // …where a folder can read it: no wikilink, no path from a root, no name there.
    const plain = findConvention({
      links: { style: "wiki", path: "root", extension: "drop" },
      origins: {},
      hasRoot: false,
      tool: null,
      counts: null,
    });
    expect(parts(plain)).toEqual(["markdown:default", "relative:default", "dropped:setting"]);
    expect([plain.style.why, plain.path.why]).toEqual([
      "no vault: a wikilink needs one",
      "no vault: `/` and names need one",
    ]);
    expect(
      parts(
        findConvention({
          links: { style: "markdown", path: "root", extension: "auto" },
          origins: {},
          hasRoot: false,
          tool: null,
          counts: null,
        }),
      ),
    ).toEqual(["markdown:setting", "relative:default", "kept:default"]);
    // A wikilink typed stays one, its path relative.
    expect(
      parts(
        findConvention({
          links: { style: "auto", path: "name", extension: "auto" },
          origins: {},
          hasRoot: false,
          tool: null,
          counts: null,
          style: "wiki",
        }),
      ),
    ).toEqual(["wiki:typed", "relative:default", "kept:default"]);
  });

  test("[links] in a config: checked, and which file set each part kept; info says the convention and why", async () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-conv-"));
    mkdirSync(join(dir, ".slipbox"));
    mkdirSync(join(dir, "notes"));
    writeFileSync(join(dir, ".slipbox", "config.toml"), '[links]\nstyle = "wiki"\npath = "sideways"\n');
    const user = join(dir, "..", `${basename(dir)}-user.toml`);
    writeFileSync(user, '[links]\nextension = "drop"\nstyle = "markdown"\n');
    const loaded = loadConfig({ vaultRoot: dir, configFile: user });
    expect(loaded.config.links).toEqual({ style: "wiki", path: "auto", extension: "drop" });
    expect(loaded.origins["links.style"]).toBe(join(dir, ".slipbox", "config.toml")); // the root's, over yours
    expect(loaded.origins["links.extension"]).toBe(user);
    expect(loaded.origins["links.path"]).toBeUndefined(); // a bad value isn't taken
    expect(loaded.warnings.join("\n")).toContain(
      '"links.path" must be one of auto, relative, root, name (got "sideways")',
    );
    // The notes say the path: by name, all of them.
    writeFileSync(join(dir, "a.md"), "[[b]] [[c]] and [b](notes/b.md)\n");
    writeFileSync(join(dir, "notes", "b.md"), "# B\n");
    writeFileSync(join(dir, "c.md"), "# C\n");
    const r = await cli(["--root", dir, "--config", user, "info", "--json"]);
    const links = JSON.parse(r.out).data.links;
    expect(
      [links.style, links.path, links.extension].map(
        (p: { value: string; source: string }) => `${p.value}:${p.source}`,
      ),
    ).toEqual(["wiki:setting", "name:notes", "dropped:setting"]);
    expect(links.path.why).toBe("the notes, 100% of 2 links");
    const human = (await cli(["--root", dir, "--config", user, "info"])).out;
    expect(human).toContain(
      `links     wikilinks, by name, without .md — style: [links] in .slipbox/config.toml; path: the notes, 100% of 2 links; extension: [links] in ${user}`,
    );
  });
});

describe("the reference set's conventions (21.4)", () => {
  // Copied first: opened in place, a root would be written to (its id, its state).
  const at = async (rel: string) => {
    const { conventionOf, describeConvention } = await import("../../../../src/core/workspace/links/convention.ts");
    const dir = join(mkdtempSync(join(tmpdir(), "slipbox-home-conv-")), basename(rel));
    cpSync(join(import.meta.dir, "../../../..", "examples", "home", rel), dir, { recursive: true });
    const loaded = loadConfig({ vaultRoot: dir });
    return describeConvention(
      conventionOf(openGraph(locateVault({ root: dir }), loaded.config, false), loaded.config, loaded.origins),
    );
  };
  test("each root's, as CASES.md says (links/conventions)", async () => {
    expect(await at("hobbies/cooking")).toBe("wikilinks, by name, without .md — Obsidian's .obsidian/app.json");
    expect(await at("hobbies/cycling")).toBe("markdown links, relative, without .md — zk's .zk/config.toml");
    // Its own setting says markdown, over Obsidian's wikilinks; a markdown link is a path, not a name.
    expect(await at("work/product/design")).toMatch(
      /^markdown links, relative, with \.md — style: \[links\] in \.slipbox\/config\.toml; path: the notes, \d+% of \d+ links?; extension: Obsidian's \.obsidian\/app\.json$/,
    );
    expect(await at("work/kestrel")).toMatch(
      /^markdown links, relative, with \.md — style: the notes, 100% of \d+ links; path: the notes, \d+% of \d+ links; extension: the notes, \d+% of \d+ links$/,
    );
  });
});

describe("links written in the convention (21.5)", () => {
  const vault = () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-write-"));
    mkdirSync(join(dir, ".slipbox"));
    for (const d of ["sub", "other", "img", "my notes"]) mkdirSync(join(dir, d));
    for (const f of ["a.md", "sub/b.md", "sub/x.md", "other/b.md", "my notes/c d.md"])
      writeFileSync(join(dir, f), `# ${f}\n`);
    writeFileSync(join(dir, "img", "p.png"), "png");
    return dir;
  };
  test("each path and extension, in each style; a name only where it reaches the note, else the path from the root", async () => {
    const { linkDestination, linkEnds, writeLink } = await import("../../../../src/core/workspace/links/write-link.ts");
    const dir = vault();
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    const conv = (path: string, extension: string) =>
      ({
        path: { value: path, source: "setting", why: "" },
        extension: { value: extension, source: "setting", why: "" },
      }) as never;
    const dest = (from: string, to: string, style: "markdown" | "wiki", path: string, ext: string) =>
      linkDestination(conv(path, ext), style, linkEnds(g, join(dir, from), join(dir, to)));
    // Markdown: relative or from the root; the extension kept or dropped — a note's only; encoded.
    expect(dest("sub/x.md", "other/b.md", "markdown", "relative", "kept")).toBe("../other/b.md");
    expect(dest("sub/x.md", "other/b.md", "markdown", "relative", "dropped")).toBe("../other/b");
    expect(dest("sub/x.md", "other/b.md", "markdown", "root", "dropped")).toBe("/other/b");
    expect(dest("a.md", "my notes/c d.md", "markdown", "relative", "kept")).toBe("my%20notes/c%20d.md");
    expect(dest("a.md", "img/p.png", "markdown", "relative", "dropped")).toBe("img/p.png");
    // Wiki: a name where it reaches the note — beside it, yes; from the top, two b's tie: the path.
    expect(dest("sub/x.md", "sub/b.md", "wiki", "name", "dropped")).toBe("b");
    expect(dest("a.md", "sub/b.md", "wiki", "name", "dropped")).toBe("sub/b");
    expect(dest("a.md", "sub/b.md", "wiki", "name", "kept")).toBe("sub/b.md");
    expect(dest("a.md", "img/p.png", "wiki", "name", "dropped")).toBe("p.png");
    expect(dest("sub/x.md", "other/b.md", "wiki", "root", "dropped")).toBe("other/b");
    expect(dest("sub/x.md", "other/b.md", "wiki", "relative", "dropped")).toBe("../other/b");
    expect(dest("sub/x.md", "sub/b.md", "wiki", "relative", "dropped")).toBe("./b");
    // Out of the root: a relative path, the file as named, whatever the convention.
    const outside = mkdtempSync(join(tmpdir(), "slipbox-write-out-"));
    writeFileSync(join(outside, "far.md"), "# Far\n");
    expect(dest("a.md", relative(dir, join(outside, "far.md")), "wiki", "name", "dropped")).toBe(
      `../${basename(outside)}/far.md`,
    );
    // The whole link: text escaped, an alias only when it says more, an embed.
    const ends = linkEnds(g, join(dir, "sub/x.md"), join(dir, "sub/b.md"));
    expect(writeLink(conv("relative", "kept"), "markdown", ends, "the [b] note")).toBe("[the \\[b\\] note](b.md)");
    expect(writeLink(conv("name", "dropped"), "wiki", ends, "")).toBe("[[b]]");
    expect(writeLink(conv("name", "dropped"), "wiki", ends, "b")).toBe("[[b]]");
    expect(writeLink(conv("name", "dropped"), "wiki", ends, "the b note")).toBe("[[b|the b note]]");
    expect(
      writeLink(conv("name", "dropped"), "wiki", linkEnds(g, join(dir, "a.md"), join(dir, "img/p.png")), "", true),
    ).toBe("![[p.png]]");
  });

  test("a top-level note with a nearer namesake: a relative path, never its name, which lands on the namesake", async () => {
    const { linkEnds, writeLink } = await import("../../../../src/core/workspace/links/write-link.ts");
    const dir = mkdtempSync(join(tmpdir(), "slipbox-write-top-"));
    mkdirSync(join(dir, ".obsidian"));
    mkdirSync(join(dir, "sub"));
    for (const f of ["plan.md", "sub/plan.md", "sub/a.md"]) writeFileSync(join(dir, f), `# ${f}\n`);
    const g = openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false);
    const conv = (path: string, extension: string) =>
      ({
        path: { value: path, source: "setting", why: "" },
        extension: { value: extension, source: "setting", why: "" },
      }) as never;
    const ends = linkEnds(g, join(dir, "sub/a.md"), join(dir, "plan.md"));
    const lands = (link: string) => g.resolveLink({ kind: "wiki", target: link.slice(2, -2) }, "sub/a.md").path;
    for (const [path, ext, want] of [
      ["name", "dropped", "[[../plan]]"],
      ["name", "kept", "[[../plan.md]]"],
      ["root", "dropped", "[[../plan]]"],
    ] as const) {
      const link = writeLink(conv(path, ext), "wiki", ends, "");
      expect(link).toBe(want);
      expect(lands(link)).toBe("plan.md");
    }
    // Where its name does reach it, the name.
    expect(
      writeLink(conv("root", "dropped"), "wiki", linkEnds(g, join(dir, "sub/a.md"), join(dir, "sub/plan.md")), ""),
    ).toBe("[[sub/plan]]");
  });

  test("slipbox link: as the root's convention writes it from --from — the note's title its text; --style, --text, --embed", async () => {
    const dir = vault();
    rmSync(join(dir, ".slipbox"), { recursive: true });
    mkdirSync(join(dir, ".obsidian"));
    writeFileSync(join(dir, "sub", "b.md"), "---\ntitle: The B note\n---\n# B\n");
    const link = async (...args: string[]) =>
      JSON.parse((await cli(["--root", dir, "link", ...args, "--json"])).out).data;
    expect(await link("sub/b.md", "--from", "sub/x.md")).toMatchObject({
      link: "[[b]]",
      path: "sub/b.md",
      from: "sub/x.md",
      style: "wiki",
      pathForm: "name",
      extension: "dropped",
    });
    expect((await link("sub/b.md", "--from", "a.md")).link).toBe("[[sub/b]]");
    expect((await link("sub/b.md")).link).toBe("[[sub/b]]"); // no --from: as from the root
    // Markdown asked for: Obsidian's "shortest" is no path for one — ours, relative; with .md, as Obsidian writes one.
    expect((await link("sub/b.md", "--from", "a.md", "--style", "markdown")).link).toBe("[The B note](sub/b.md)");
    expect((await link("sub/b.md", "--from", "sub/x.md", "--text", "bee")).link).toBe("[[b|bee]]");
    expect((await link(join(dir, "img", "p.png"), "--from", "a.md", "--embed")).link).toBe("![[p.png]]");
    const bad = await cli(["--root", dir, "link", "sub/b.md", "--style", "fancy"]);
    expect(bad.code).toBe(2);
    expect(bad.err).toContain("--style is markdown or wiki (got fancy)");
  });
});

describe("review cycle 3 (core)", () => {
  test("in a folder with no root, a [links] style of wiki or a path from the root writes a link the folder reads", async () => {
    const { conventionOf } = await import("../../../../src/core/workspace/links/convention.ts");
    const { linkEnds, writeLink } = await import("../../../../src/core/workspace/links/write-link.ts");
    const dir = mkdtempSync(join(tmpdir(), "slipbox-c3-plain-"));
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "plan.md"), "# Plan\n");
    writeFileSync(join(dir, "sub", "a.md"), "# A\n");
    const g = openGraph(elsewhereAt(dir), DEFAULT_CONFIG, true);
    for (const [style, path] of [
      ["wiki", "name"],
      ["markdown", "root"],
      ["wiki", "root"],
    ] as const) {
      const c = conventionOf(g, { ...DEFAULT_CONFIG, links: { style, path, extension: "auto" } }, {});
      const written = writeLink(c, c.style.value, linkEnds(g, join(dir, "sub", "a.md"), join(dir, "plan.md")), "");
      expect(written).toBe("[plan](../plan.md)");
      const target = /\]\(([^)]*)\)/.exec(written)![1]!;
      expect(g.resolveLink({ kind: "markdown", target }, "sub/a.md")).toMatchObject({
        resolvedKind: "note",
        path: "plan.md",
      });
    }
  });
});
